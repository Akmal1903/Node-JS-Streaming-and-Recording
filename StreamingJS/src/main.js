const express = require("express");
const cors = require("cors");
const io = require('socket.io');
const childprocess = require('child_process');
const MP4Frag = require('./core/MP4Frag.js');
const { errorMiddleware } = require('./error/errorMiddleware.js');
const { prismaClient } = require('./helper/database.js');
const { validate } = require('./validation/validation.js');
const { UpdateInputRequestSchema } = require('./validation/streamValidation.js');
const config = require('../vms.config.js');
const Processors = {};
const Processors4k = {};


if (process.env.CPU_CORE !== undefined) {
    const coreIndex = parseInt(process.env.CPU_CORE);
    try {
        const { execSync } = require('child_process');
        execSync(`taskset -cp ${coreIndex} ${process.pid}`);
        console.log(`[CPU-AFFINITY] Node.js process ${process.pid} bound to CPU core ${coreIndex}`);
    } catch (error) {
        console.error('[CPU-AFFINITY] Failed to set CPU affinity for Node.js:', error);
    }
}

// Terima argument kamera IDs
const cameraIds = process.argv.slice(2);
console.log(`[INIT] Processing cameras: ${cameraIds.join(', ')}`);


const app = express();
const http = require("http");
const HTTP = http.createServer(app);

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'], 
    exposedHeaders: ['Content-Length', 'Content-Range'],
}));

app.use(express.json());
app.use(errorMiddleware);

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.get("/cameras", async (req, res, next) => {
    try {
        const cameras = await prismaClient.camera.findMany();
        res.json(cameras);
    } catch (err) {
        next(err);
    }
});

app.put("/api/stream/update/input/:camId", async (req, res, next) => {
    const updateCamera = validate(UpdateInputRequestSchema, req.body);
    const oldCamera = await prismaClient.camera.findUnique({
        where: { id: req.params.camId }
    });
    if (!oldCamera) {
        return res.status(404).json({ msg: "Camera not found" });
    }

    try {
        const result = await prismaClient.camera.update({
            where: { id: req.params.camId },
            data: updateCamera,
            select: {
                id: true,
                name: true,
                path: true,
                input: true,
                recordInput: true,
                continuous: true,
                isActive: true,
                inputConfig: true,
                liveConfig: true
            }
        });

        if (Processors[req.params.camId]) {
            Processors[req.params.camId].CameraInfo = { ...oldCamera, ...updateCamera };
            console.log(`[UPDATE] Camera ${req.params.camId} updated, restarting stream...`);
            if (Processors[req.params.camId].stop()) {
                await Processors[req.params.camId].stop();
                await Processors4k[req.params.camId]?.stop();
                delete Processors[req.params.camId];
                delete Processors4k[req.params.camId];
                await new Promise(resolve => setTimeout(resolve, 2000));
                InitStreamingService(result, req.params.camId);
                initStreaming4kService(result, req.params.camId);
            }
        }
        res.status(200).json({ msg: "success", data: result });
    } 
    catch (e) {
        console.error(e);
        res.status(500).json({ msg: "Internal server error", error: e.message });
    }
});


function InitStreamingService(Cam, cameraID) {
    console.log(`[INIT] === Initializing Streaming START for ${cameraID} (${Cam.name}) ===`);

    if (!Cam.isActive) {
        console.log(`[SKIP] Camera ${cameraID} is not active, skipping initialization.`);
        return;
    }

    const OptionsStream = { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe'] };

    let isStopped = false;
    let isStopping = false;
    let shouldRestartStream = false;
    let streamSpawn = null;
    let clients = new Map(); // Gunakan Map untuk melacak klien
    let MP4F = null;
    let initializationSent = false;
    let stopTimer = null; // Timer untuk menunda stop stream

    const IOptions = {
        cors: { origin: '*' },
        path: '/streams/' + cameraID
    };

    const SocketIO = io(HTTP, IOptions);

    const startStreaming = () => {
        if (isStopping) {
            setTimeout(() => startStreaming(), 100);
            return;
        }

        if (streamSpawn !== null) {
            console.log(`[SKIP] FFmpeg already running for ${cameraID}`);
            return;
        }

        console.log(`[SPAWN] Starting FFmpeg stream for ${cameraID}`);
        
        isStopped = false;
        shouldRestartStream = false;
        initializationSent = false;
        MP4F = new MP4Frag(); 
        
        const streamArgs = buildStreamArgs(Cam.recordInput);

        const coreIndex = process.env.CPU_CORE;
    
        // Jika coreIndex tersedia, gunakan taskset untuk membatasi ke core tertentu
        if (coreIndex !== undefined) {
            // Gunakan taskset untuk membatasi FFmpeg ke core yang sama dengan Node.js
            const tasksetArgs = ['-c', coreIndex, config.system.ffmpegLocation, ...streamArgs];
            streamSpawn = childprocess.spawn('taskset', tasksetArgs, OptionsStream);
            console.log(`[CPU-AFFINITY] FFmpeg for ${cameraID} bound to CPU core ${coreIndex}`);
        } else {
            // Fallback tanpa taskset
            streamSpawn = childprocess.spawn(config.system.ffmpegLocation, streamArgs, OptionsStream);
        }
        //streamSpawn = childprocess.spawn(config.system.ffmpegLocation, streamArgs, OptionsStream);

        MP4F.on('segment', (data) => {
            // Kirim hanya ke klien yang masih terhubung
            clients.forEach((clientInfo, clientSocket) => {
                if (clientSocket.connected) {
                    clientSocket.emit('segment', data);
                } else {
                    clients.delete(clientSocket); // Bersihkan klien yang tidak terhubung
                }
            });
        });

        MP4F.on('initialized', () => {
            if (MP4F.initialization && !initializationSent) {
                console.log(`[INIT-SEGMENT] Sending initialization segment for ${cameraID}`);
                initializationSent = true;
                
                clients.forEach((clientInfo, clientSocket) => {
                    if (clientSocket.connected) {
                        clientSocket.emit('segment', MP4F.initialization);
                    } else {
                        clients.delete(clientSocket);
                    }
                });
            }
        });

        MP4F.on('error', (err) => {
            console.error(`[ERROR] MP4Frag error on camera ID: ${cameraID}, Name: ${Cam.name}`);
            console.error(err);
            stopStreaming();
        });

        streamSpawn.stdio[3].on('data', (data) => {
            MP4F?.write(data, 'binary');
        });

        streamSpawn.on('close', (code) => {
            console.log(`[CLOSE] Streaming process for ${cameraID} exited with code ${code} | isStopped=${isStopped}`);
            
            if (!isStopped && Processors[cameraID]?.CameraInfo?.id === cameraID) {
                console.log(`[AUTO-RESTART] Stream for ${cameraID} will auto-restart`);
                shouldRestartStream = true;
                stopStreaming();
            }
            
            streamSpawn = null;
        });
    };

    const stopStreaming = () => {
        return new Promise((resolve) => {
            if (isStopped || isStopping) return resolve();

            console.log(`[STOP] Stopping processes Streaming for ${cameraID}`);
            isStopping = true;
            isStopped = true;
            
            if (MP4F) {
                MP4F.removeAllListeners();
                MP4F.destroy();
                MP4F = null;
            }

            const killProcess = (proc, type) => {
                return new Promise(r => {
                    if (!proc || proc.killed) {
                        console.log(`[SKIP] ${type} process already killed for ${cameraID}`);
                        return r();
                    }
                    
                    const timer = setTimeout(() => {
                        console.log(`[FORCE KILL] ${type} process not responding for ${cameraID}`);
                        try {
                            proc.pid && !proc.killed && process.kill(proc.pid, 'SIGKILL');
                        } catch (e) {
                            if (e.code !== 'ESRCH') console.error(`Force kill failed:`, e);
                        }
                        r();
                    }, 5000);
                    
                    proc.once('close', () => {
                        clearTimeout(timer);
                        r();
                    });
                    
                    try {
                        proc.stdio[3]?.destroy();
                        proc.kill('SIGTERM');
                    } catch (e) {
                        if (e.code !== 'ESRCH') console.error(`SIGTERM failed:`, e);
                    }        
                });
            };

            Promise.allSettled([
                killProcess(streamSpawn, 'stream')
            ]).then(() => {
                console.log(`[STOP] All processes streaming for ${cameraID} stopped`);
                streamSpawn = null;
                isStopping = false;
                initializationSent = false;

                if (shouldRestartStream) {
                    console.log(`[RESTART] Restarting stream for ${cameraID}`);
                    startStreaming();
                }            
                resolve();
            });
        });
    };

    // SOCKET STREAM
    SocketIO.on('connection', (ClientSocket) => {
        console.log(`[CONNECT] New client connected to /streams/${cameraID}`);
        clients.set(ClientSocket, { connectedAt: Date.now() });

        // Kirim initialization segment jika sudah ada
        if (MP4F && MP4F.initialization && initializationSent) {
            console.log(`[INIT-SEGMENT] Sending initialization to new client for ${cameraID}`);
            ClientSocket.emit('segment', MP4F.initialization);
        }

        // Batalkan timer stop jika ada
        if (stopTimer) {
            clearTimeout(stopTimer);
            stopTimer = null;
        }

        // Start stream jika ini adalah klien pertama
        if (clients.size === 1) {
            console.log(`[START] First client, starting stream for ${cameraID}`);
            startStreaming();
        }

        ClientSocket.on('disconnect', () => {
            console.log(`[DISCONNECT] Client disconnected from ${cameraID}`);
            clients.delete(ClientSocket);

            // Tunggu 5 detik sebelum cek jumlah klien
            if (clients.size === 0) {
                stopTimer = setTimeout(() => {
                    if (clients.size === 0) {
                        console.log(`[STOP] No clients connected, stopping FFmpeg for ${cameraID}`);
                        stopStreaming();
                    }
                }, 5000); // Delay 5 detik
            }
        });
    });

    Processors[cameraID] = {
        CameraInfo: Cam,
        stop: stopStreaming,
        getClientCount: () => clients.size,
    };

    return Processors[cameraID];
}

function initStreaming4kService(Cam, cameraID) {
    console.log(`[INIT] === Initializing 4K Streaming START for ${cameraID} (${Cam.name}) ===`);

        if (!Cam.isActive) {
        console.log(`[SKIP] Camera ${cameraID} is not active, skipping initialization.`);
        return;
    }

    const OptionsStream = { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe'] };

    let isStopped = false;
    let isStopping = false;
    let shouldRestartStream = false;
    let streamSpawn = null;
    let clients = new Map(); // Gunakan Map untuk melacak klien
    let MP4F = null;
    let initializationSent = false;
    let stopTimer = null; // Timer untuk menunda stop stream

    const IOptions4k = {
        cors: { origin: '*' },
        path: '/streams4k/' + cameraID
    };

    const SocketIO4k = io(HTTP, IOptions4k);

    const startStreaming = () => {
        if (isStopping) {
            setTimeout(() => startStreaming(), 100);
            return;
        }

        if (streamSpawn !== null) {
            console.log(`[SKIP] FFmpeg already running for ${cameraID}`);
            return;
        }

        console.log(`[SPAWN] Starting FFmpeg stream for ${cameraID}`);
        
        isStopped = false;
        shouldRestartStream = false;
        initializationSent = false;
        MP4F = new MP4Frag(); 
        
        const streamArgs = buildStreamArgs(Cam.input);

        const coreIndex = process.env.CPU_CORE;
    
        // Jika coreIndex tersedia, gunakan taskset untuk membatasi ke core tertentu
        if (coreIndex !== undefined) {
            // Gunakan taskset untuk membatasi FFmpeg ke core yang sama dengan Node.js
            const tasksetArgs = ['-c', coreIndex, config.system.ffmpegLocation, ...streamArgs];
            streamSpawn = childprocess.spawn('taskset', tasksetArgs, OptionsStream);
            console.log(`[CPU-AFFINITY] FFmpeg for ${cameraID} bound to CPU core ${coreIndex}`);
        } else {
            // Fallback tanpa taskset
            streamSpawn = childprocess.spawn(config.system.ffmpegLocation, streamArgs, OptionsStream);
        }

        MP4F.on('segment', (data) => {
            // Kirim hanya ke klien yang masih terhubung
            clients.forEach((clientInfo, clientSocket) => {
                if (clientSocket.connected) {
                    clientSocket.emit('segment', data);
                } else {
                    clients.delete(clientSocket); // Bersihkan klien yang tidak terhubung
                }
            });
        });

        MP4F.on('initialized', () => {
            if (MP4F.initialization && !initializationSent) {
                console.log(`[INIT-SEGMENT] Sending initialization segment for ${cameraID}`);
                initializationSent = true;
                
                clients.forEach((clientInfo, clientSocket) => {
                    if (clientSocket.connected) {
                        clientSocket.emit('segment', MP4F.initialization);
                    } else {
                        clients.delete(clientSocket);
                    }
                });
            }
        });

        MP4F.on('error', (err) => {
            console.error(`[ERROR] MP4Frag error on camera ID: ${cameraID}, Name: ${Cam.name}`);
            console.error(err);
            stopStreaming();
        });

        streamSpawn.stdio[3].on('data', (data) => {
            MP4F?.write(data, 'binary');
        });

        streamSpawn.on('close', (code) => {
            console.log(`[CLOSE] Streaming process for ${cameraID} exited with code ${code} | isStopped=${isStopped}`);
            
            if (!isStopped && Processors4k[cameraID]?.CameraInfo?.id === cameraID) {
                console.log(`[AUTO-RESTART] Stream for ${cameraID} will auto-restart`);
                shouldRestartStream = true;
                stopStreaming();
            }
            
            streamSpawn = null;
        });
    };

    const stopStreaming = () => {
        return new Promise((resolve) => {
            if (isStopped || isStopping) return resolve();

            console.log(`[STOP] Stopping processes Streaming for ${cameraID}`);
            isStopping = true;
            isStopped = true;
            
            if (MP4F) {
                MP4F.removeAllListeners();
                MP4F.destroy();
                MP4F = null;
            }

            const killProcess = (proc, type) => {
                return new Promise(r => {
                    if (!proc || proc.killed) {
                        console.log(`[SKIP] ${type} process already killed for ${cameraID}`);
                        return r();
                    }
                    
                    const timer = setTimeout(() => {
                        console.log(`[FORCE KILL] ${type} process not responding for ${cameraID}`);
                        try {
                            proc.pid && !proc.killed && process.kill(proc.pid, 'SIGKILL');
                        } catch (e) {
                            if (e.code !== 'ESRCH') console.error(`Force kill failed:`, e);
                        }
                        r();
                    }, 5000);
                    
                    proc.once('close', () => {
                        clearTimeout(timer);
                        r();
                    });
                    
                    try {
                        proc.stdio[3]?.destroy();
                        proc.kill('SIGTERM');
                    } catch (e) {
                        if (e.code !== 'ESRCH') console.error(`SIGTERM failed:`, e);
                    }        
                });
            };

            Promise.allSettled([
                killProcess(streamSpawn, 'stream')
            ]).then(() => {
                console.log(`[STOP] All processes streaming for ${cameraID} stopped`);
                streamSpawn = null;
                isStopping = false;
                initializationSent = false;

                if (shouldRestartStream) {
                    console.log(`[RESTART] Restarting stream for ${cameraID}`);
                    startStreaming();
                }            
                resolve();
            });
        });
    };

        // SOCKET STREAM
    SocketIO4k.on('connection', (ClientSocket) => {
        console.log(`[CONNECT] New client connected to /streams4k/${cameraID}`);
        clients.set(ClientSocket, { connectedAt: Date.now() });

        // Kirim initialization segment jika sudah ada
        if (MP4F && MP4F.initialization && initializationSent) {
            console.log(`[INIT-SEGMENT] Sending initialization to new client for ${cameraID}`);
            ClientSocket.emit('segment', MP4F.initialization);
        }

        // Batalkan timer stop jika ada
        if (stopTimer) {
            clearTimeout(stopTimer);
            stopTimer = null;
        }

        // Start stream jika ini adalah klien pertama
        if (clients.size === 1) {
            console.log(`[START] First client, starting stream4k for ${cameraID}`);
            startStreaming();
        }

        ClientSocket.on('disconnect', () => {
            console.log(`[DISCONNECT] Client disconnected from streams4k ${cameraID}`);
            clients.delete(ClientSocket);

            // Tunggu 5 detik sebelum cek jumlah klien
            if (clients.size === 0) {
                stopTimer = setTimeout(() => {
                    if (clients.size === 0) {
                        console.log(`[STOP] No clients connected, stopping FFmpeg for streams4k ${cameraID}`);
                        stopStreaming();
                    }
                }, 5000); // Delay 5 detik
            }
        });
    });

    Processors4k[cameraID] = {
        CameraInfo: Cam,
        stop: stopStreaming,
        getClientCount: () => clients.size,
    };

    return Processors4k[cameraID];

}




function buildStreamArgs(input) {
    return [
        // ==== INPUT OPTIONS ====
        '-rtsp_transport', 'tcp',                // Stabil untuk RTSP
        '-timeout', '30000000',                  // Timeout jaringan (30 detik)
        '-fflags', '+genpts+discardcorrupt',      // Perbaiki pts + skip frame corrupt
        '-err_detect', 'ignore_err',              // Abaikan error decode ringan
        '-probesize', '1000000',                   // Kurangi ukuran probing
        '-analyzeduration', '1000000',             // Kurangi waktu analisa
        '-max_delay', '500000',                    // Maks delay packet reorder
        '-i', input,                           // RTSP source

        // ==== OUTPUT OPTIONS ====
        '-c:v', 'copy',                            // Tanpa re-encode
        '-an',                                     // Hapus audio
        '-sc_threshold', '0',                      // Matikan scene cut
        '-flags', '+low_delay',                    // Low latency
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof', // Fragmentasi MP4
        '-reset_timestamps', '1',                  // Reset timestamps

        // ==== OUTPUT TARGET ====
        '-f', 'mp4', 'pipe:3'
    ];
}

// async function init() {
//     const cameras = await prismaClient.camera.findMany();
//     const ptzCameras = await prismaClient.pTZCamera.findMany();

//     const allCameras = [
//     ...cameras.map(c => ({ ...c, isPTZ: false })), 
//     ...ptzCameras.map(c => ({ ...c, isPTZ: true }))
//     ];

//     // Filter kamera berdasarkan input arguments
//     const targetCameras = cameraIds.length > 0 
//     ? allCameras.filter(cam => cameraIds.includes(cam.id))
//     : allCameras;

//     targetCameras.forEach(cam => {
//     InitStreamingService(cam, cam.id);
//     });
// }

// Di awal file, tambahkan
const STREAM_TYPE = process.env.STREAM_TYPE || 'regular';
const cameraIds4k = ["BPW1", "CTWK2", "JBKXVI", "MVLD4", "PT2K", "PRS2", "THA1B", 
    "BPW2", "ENVR", "JBKXVIIB", "NSN1", "PT2M", "RSAM", "THA2",
    "BVHLA", "GRDN1", "KLJBK", "NSN2", "PT7K", "RKDJVA", "WTR1",
    "BVHLB", "GRDN2", "LVGPZ", "PRDSA", "PT7M", "RKDJVB", "WTR2",
    "BWWA", "GRDN3", "MTTLA", "PRDSB", "PT9AK", "STNG", "DRN01",
    "BWWB","GRMKA", "MTTLB", "PTGKD", "PT9AM", "SPCT1",
    "BDGF1", "GRMKB", "MVLD1", "PT1K", "PT9BA", "SPCT2",
    "BDGF2", "HLJA", "MVLD2", "PT1MA", "PT9BB", "SPCT3",
    "CTWK1", "HLJB", "MVLD3", "PT1MB", "PRS1", "THA1A"
];

async function init() {
    const cameras = await prismaClient.camera.findMany();
    const ptzCameras = await prismaClient.pTZCamera.findMany();

    const allCameras = [
        ...cameras.map(c => ({ ...c, isPTZ: false })), 
        ...ptzCameras.map(c => ({ ...c, isPTZ: true }))
    ];

    // Filter kamera berdasarkan input arguments
    const targetCameras = cameraIds.length > 0 
        ? allCameras.filter(cam => cameraIds.includes(cam.id))
        : allCameras;

    console.log(`[INIT] Initializing ${targetCameras.length} cameras`);
    
    // Untuk semua instance, jalankan stream regular
    targetCameras.forEach(cam => {
        InitStreamingService(cam, cam.id);
    });

    targetCameras.forEach(cam => {
        initStreaming4kService(cam, cam.id);
    });

    // Hanya untuk instance 4K, jalankan juga stream 4K
    // if (STREAM_TYPE === '4k') {
    //     // Filter hanya kamera 4K
    //     const targetCameras4k = targetCameras.filter(cam => 
    //         cameraIds4k.includes(cam.id)
    //     );
        
    //     console.log(`[INIT] Initializing ${targetCameras4k.length} 4K cameras`);
        
    //     targetCameras4k.forEach(cam => {
    //         initStreaming4kService(cam, cam.id);
    //     });
    // }
}


init().catch(err => {
    console.error("Init failed:", err);
});

const PORT = process.env.PORT || 3000;

HTTP.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});