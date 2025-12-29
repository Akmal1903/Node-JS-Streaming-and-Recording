const path = require("path");
const childprocess = require("child_process");
const fs = require("fs");
const dayjs = require("dayjs");
const customParseFormat = require('dayjs/plugin/customParseFormat');
const { updateVideoMetadata } = require("../../helper/helper.js");
const { UpdateRecordInputRequestSchema, UpdateCameraRecordRequestSchema } = require("../../validation/cameraValidation.js");
const { prismaClient } = require("../../helper/database.js");
const { validate } = require("../../validation/validation.js");
const { ResponseError } = require("../../error/responseError.js");
const { checkRtspUrl } = require("../../helper/helper.js");


dayjs.extend(customParseFormat);

function InitRecordingService(Cam, cameraID, Processors, config, analitik, panic) {
    console.log(`[INIT] === Initializing Recording START for ${cameraID} (${Cam.name}) ===`);

    if (!Cam.isActive) {
        console.log(`[SKIP] Camera ${cameraID} is not active, skipping initialization.`);
        return;
    }

    const Path = path.join(config.system.storageVolume, 'CAMERA_RECORDINGS', cameraID);

    if (!fs.existsSync(Path)) {
        fs.mkdirSync(Path, { recursive: true });
    }

    const OptionsRecord = { detached: false, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }; // detached: false

    let recordSpawn = null;
    let isStopped = false;
    let stopResolve = null;
    let stopPromise = null;

    const startRecording = () => {
        if (isStopped) {
            console.log(`[SKIP] Camera ${cameraID} is stopped, cannot start recording`);
            return;
        }

        if (Cam.continuous && (Cam.recordInput || Cam.input)) {
            console.log(`[RECORD] Recording started for ${Cam.name}`);
            
            let recordArgs;
            if (panic) {
                console.log(`[PANIC] Panic recording mode for ${Cam.name}`);
                recordArgs = buildPanicRecordingArgs(Cam.input, cameraID, config);
            } 
            else if (analitik) {
                const inputSource = Cam.recordInput || Cam.input;
                recordArgs = buildRecordingArgs(inputSource, cameraID, config);
                console.log(`[ANALITIK] Using ${Cam.recordInput ? 'recordInput' : 'input'} for ${cameraID}`);
            }
            else {
                recordArgs = buildRecordingArgs(Cam.input, cameraID, config);
                console.log(`[NON-ANALITIK] Using input for ${cameraID}`);
            }

            console.log(`[INPUT] Camera ${cameraID} using: ${analitik ? (Cam.recordInput || Cam.input) : Cam.input}`);
            
            try {
                recordSpawn = childprocess.spawn(config.system.ffmpegLocation, recordArgs, OptionsRecord);
                console.log(`[SPAWN] FFmpeg process started for ${cameraID} with PID: ${recordSpawn.pid}`);
            } catch (spawnError) {
                console.error(`[SPAWN ERROR] Failed to spawn FFmpeg for ${cameraID}:`, spawnError);
                return;
            }

            recordSpawn.stderr.on('data', (data) => {
                const str = data.toString();
                
                if (str.includes('error') || str.includes('Error') || str.includes('failed')) {
                    console.error(`[FFMPEG ERROR] ${cameraID}: ${str.trim()}`);
                }
            });

            recordSpawn.stdio[4].on('data', (FN) => {
                if (isStopped) return;
                
                const fileName = FN.toString().trim();
                const fullPath = path.join(Path, fileName);
                if(!panic){
                    if (fs.existsSync(fullPath)) {
                        updateVideoMetadata(cameraID, fullPath, config);
                    }
                }     
            });

            recordSpawn.on('close', (code, signal) => {
                console.log(`[CLOSE] Recording process for ${cameraID} exited with code ${code}, signal: ${signal} | isStopped=${isStopped}`);
                
                if (stopResolve) {
                    stopResolve();
                    stopResolve = null;
                    stopPromise = null;
                }

                if (!isStopped && Processors[cameraID]?.CameraInfo?.id === cameraID) {
                    console.log(`[AUTO-RESTART] Recording for ${cameraID} will auto-restart in 5 seconds`);
                    setTimeout(() => {
                        if (!isStopped && Processors[cameraID]?.CameraInfo?.id === cameraID) {
                            console.log(`[AUTO-RESTART] Executing auto-restart for ${cameraID}`);
                            const cameraManager = require("../../manager/CameraManager.js");
                            cameraManager.restartCamera(Cam, true);
                        }
                    }, 5000);
                }
            });

            recordSpawn.on('error', (err) => {
                console.error(`[ERROR] Recording process error for ${Cam.name}:`, err);
                if (stopResolve) {
                    stopResolve();
                    stopResolve = null;
                    stopPromise = null;
                }
            });

            recordSpawn.on('exit', (code, signal) => {
                console.log(`[EXIT] Recording process for ${cameraID} exited with code ${code}, signal: ${signal}`);
            });
        } else {
            console.error(`[ERROR] Camera ${cameraID} missing required inputs: recordInput=${Cam.recordInput}, input=${Cam.input}`);
        }
    };

    const stopRecording = () => {
        if (stopPromise) {
            return stopPromise;
        }

        stopPromise = new Promise((resolve) => {
            if (isStopped) {
                resolve();
                return;
            }

            console.log(`[STOP] Stopping recording for ${cameraID}`);
            isStopped = true;
            stopResolve = resolve;

            if (!recordSpawn) {
                console.log(`[STOP] No recording process for ${cameraID}`);
                resolve();
                return;
            }

            console.log(`[STOP] Killing FFmpeg process for ${cameraID} (PID: ${recordSpawn.pid})`);

            // Coba terminate dengan SIGTERM dulu
            recordSpawn.kill('SIGTERM');

            // Timeout force kill setelah 5 detik
            const forceKillTimer = setTimeout(() => {
                if (recordSpawn && recordSpawn.killed === false) {
                    console.log(`[FORCE KILL] Force killing FFmpeg for ${cameraID}`);
                    try {
                        recordSpawn.kill('SIGKILL');
                    } catch (killError) {
                        console.error(`[FORCE KILL ERROR] ${cameraID}:`, killError);
                    }
                }
            }, 5000);

            // Cleanup timer ketika process sudah close
            recordSpawn.once('close', () => {
                clearTimeout(forceKillTimer);
            });
        });

        return stopPromise;
    };

    startRecording();

    Processors[cameraID] = {
        CameraInfo: Cam,
        stop: stopRecording,
        getProcessId: () => recordSpawn ? recordSpawn.pid : null,
        isStopped: () => isStopped
    };

    return Processors[cameraID];
}


// function InitRecordingService(Cam, cameraID, Processors, config, analitik, panic) {
//     console.log(`[INIT] === Initializing Recording START for ${cameraID} (${Cam.name}) ===`);

//     if (!Cam.isActive) {
//         console.log(`[SKIP] Camera ${cameraID} is not active, skipping initialization.`);
//         return;
//     }

//     const Path = path.join(config.system.storageVolume, 'CAMERA_RECORDINGS', cameraID);

//     if (!fs.existsSync(Path)) {
//         fs.mkdirSync(Path, { recursive: true });
//     }

//     // Opsi proses dengan stdio khusus untuk FFmpeg
//     const OptionsRecord = { 
//         detached: true, 
//         stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] 
//     };

//     let recordSpawn;
//     let isStopped = false;
//     let shouldRestartRecord = false;
//     let stderrBuffer = '';
//     let recordArgs;

//     const startRecording = () => {
//         if (Cam.continuous && (Cam.recordInput || Cam.input)) {
//             console.log(`[RECORD] Recording started for ${Cam.name}`);
//             console.log(`[CPU AFFINITY] FFmpeg for ${cameraID} will use cores 16-19`);
            
//             if (panic) {
//                 console.log(`[PANIC] Panic recording mode for ${Cam.name}`);
//                 recordArgs = buildPanicRecordingArgs(Cam.input, cameraID, config);
//             } 
//             else if (analitik) {
//                 const inputSource = Cam.recordInput || Cam.input;
//                 recordArgs = buildRecordingArgs(inputSource, cameraID, config);
//                 console.log(`[ANALITIK] Using ${Cam.recordInput ? 'recordInput' : 'input'} for ${cameraID}`);
//             }
//             else {
//                 recordArgs = buildRecordingArgs(Cam.input, cameraID, config);
//                 console.log(`[NON-ANALITIK] Using input for ${cameraID}`);
//             }

//             console.log(`[INPUT] Camera ${cameraID} using: ${analitik ? (Cam.recordInput || Cam.input) : Cam.input}`);
            
//             if (process.platform === 'linux') {
//                 const ffmpegCommand = config.system.ffmpegLocation;
//                 const tasksetArgs = ['-c', '16-19', ffmpegCommand, ...recordArgs];
//                 console.log(`[CPU AFFINITY] Starting FFmpeg with taskset for cores 16-19`);
//                 recordSpawn = childprocess.spawn('taskset', tasksetArgs, OptionsRecord);
//             } else {
//                 recordSpawn = childprocess.spawn(config.system.ffmpegLocation, recordArgs, OptionsRecord);
//             }
//             recordSpawn.on('spawn', () => {
//                 console.log(`[FFMPEG PID] ${cameraID} FFmpeg process started with PID: ${recordSpawn.pid}`);
                
//                 // Konfirmasi CPU affinity untuk proses FFmpeg
//                 if (process.platform === 'linux' && recordSpawn.pid) {
//                     const { exec } = require('child_process');
//                     exec(`taskset -cp ${recordSpawn.pid}`, (error, stdout) => {
//                         if (!error) {
//                             console.log(`[CPU AFFINITY CONFIRMED] ${cameraID}: ${stdout.trim()}`);
//                         }
//                     });
//                 }
//             });

//             recordSpawn.stderr.on('data', (data) => {
//                 const str = data.toString();
//                 stderrBuffer += str;
                
//                 if (str.includes('error') || str.includes('Error') || str.includes('failed')) {
//                     console.error(`[FFMPEG ERROR] ${cameraID}: ${str.trim()}`);
//                 }
                
//                 // Log resolusi untuk debugging
//                 if (str.includes('Stream') && str.includes('Video')) {
//                     console.log(`[RESOLUTION] ${cameraID}: ${str.trim()}`);
//                 }
//             });

//             recordSpawn.stdio[4].on('data', (FN) => {
//                 const fileName = FN.toString().trim();
//                 const fullPath = path.join(Path, fileName);
//                 if(!panic){ // Hanya update metadata untuk analitik non-panic
//                     if (fs.existsSync(fullPath)) {
//                         updateVideoMetadata(cameraID, fullPath, config);
//                     }
//                 }     
//             });

//             recordSpawn.on('close', (code) => {
//                 console.log(`[CLOSE] Recording process for ${cameraID} exited with code ${code} | isStopped=${isStopped}`);
//                 if (!isStopped && Processors[cameraID]?.CameraInfo?.id === cameraID) {
//                     console.log(`[AUTO-RESTART] Recording for ${cameraID} will auto-restart`);
//                     shouldRestartRecord = true;
//                     stopRecording();
//                 } else {
//                     console.log(`[STOP] Recording for ${cameraID} stopped manually. No auto-restart.`);
//                 }
//                 stderrBuffer = '';
//             });

//             recordSpawn.on('error', (err) => {
//                 console.error(`[ERROR] Recording error for ${Cam.name}:`, err);
//             });
//         } else {
//             console.error(`[ERROR] Camera ${cameraID} missing required inputs: recordInput=${Cam.recordInput}, input=${Cam.input}`);
//         }
//     };

//     const stopRecording = () => {
//         return new Promise((resolve) => {
//             if (isStopped) return resolve();

//             console.log(`[STOP] Stopping processes Recording for ${cameraID}`);
//             isStopped = true;

//             const killProcess = (proc, type) => {
//                 return new Promise(r => {
//                     if (!proc || proc.killed) return r();
                    
//                     const timer = setTimeout(() => {
//                         console.log(`[FORCE KILL] ${type} process not responding`);
//                         try {
//                             proc.kill('SIGKILL');
//                         } catch (e) {
//                             console.error(`Force kill failed:`, e);
//                         }
//                         r();
//                     }, 10000);
                    
//                     proc.once('close', () => {
//                         console.log(`[STOP] ${type} process closed gracefully`);
//                         clearTimeout(timer);
//                         r();
//                     });
                    
//                     try {
//                         proc.stdio[3]?.destroy();
//                         proc.stdio[4]?.destroy();
//                         proc.kill('SIGTERM');
//                     } catch (e) {
//                         console.error(`SIGTERM failed:`, e);
//                     }                            
//                 });
//             };

//             Promise.allSettled([
//                 killProcess(recordSpawn, 'record')
//             ]).then(() => {
//                 console.log(`[STOP] Processes Recording for ${cameraID} stopped`);
//                 if (shouldRestartRecord) {
//                     const cameraManager = require("../../manager/CameraManager.js");
//                     cameraManager.restartCamera(Cam, true);
//                 }
//                 resolve();
//             });
//         });
//     };

//     startRecording();

//     Processors[cameraID] = {
//         CameraInfo: Cam,
//         stop: stopRecording,
//     };

//     return Processors[cameraID];
// }

function buildRecordingArgs(input, cameraID, config) {
    const recPath = path.join(config.system.storageVolume, 'CAMERA_RECORDINGS', cameraID);
    if (!fs.existsSync(recPath)) fs.mkdirSync(recPath, { recursive: true });

    const args = [];

    // Input config
    // Object.keys(Cam.inputConfig).forEach((key) => {
    //     if (key !== 'i') {
    //         args.push('-' + key);
    //         if (Cam.inputConfig[key].length > 0) {
    //             args.push(Cam.inputConfig[key]);
    //         }
    //     }
    // });

    args.push('-rtsp_transport', 'tcp');
    args.push('-fflags', '+igndts');
    args.push('-timeout', '30000000');
    args.push('-probesize', '1000000');
    args.push('-analyzeduration', '1000000');
    args.push('-use_wallclock_as_timestamps', '1');
    args.push('-i', input);

    args.push('-c:v', 'copy');
    args.push('-an');  // Abaikan stream audio
    args.push('-f');
    args.push('segment');
    args.push('-movflags');
    args.push('+faststart');
    args.push('-segment_atclocktime');
    args.push('1');
    args.push('-reset_timestamps');
    args.push('1');
    args.push('-strftime');
    args.push('1');
    args.push('-segment_list');
    args.push('pipe:4');
    args.push('-segment_time');
    args.push(60 * config.system.continuousSegTimeMinutes);
    args.push(path.join(recPath, '%Y-%m-%dT%H:%M:%S.mp4'));

    return args;
}

function buildPanicRecordingArgs(input, cameraID, config) {
    const recPath = path.join(config.system.storagePanicButton, 'CAMERA_RECORDINGS', cameraID);
    if (!fs.existsSync(recPath)) fs.mkdirSync(recPath, { recursive: true });

    const args = [];

    // Input config
    // if (Cam.inputConfig) {
    //     Object.keys(Cam.inputConfig).forEach((key) => {
    //         if (key !== 'i') {
    //             args.push('-' + key);
    //             if (Cam.inputConfig[key] && Cam.inputConfig[key].length > 0) {
    //                 args.push(Cam.inputConfig[key]);
    //             }
    //         }
    //     });
    // }

    args.push('-rtsp_transport', 'tcp');
    args.push('-fflags', '+igndts');
    args.push('-timeout', '30000000');
    args.push('-probesize', '1000000');
    args.push('-analyzeduration', '1000000');
    args.push('-use_wallclock_as_timestamps', '1');

    args.push('-i', input);

    // copy stream tanpa re-encode
    args.push('-c:v', 'copy');
    args.push('-c:a', 'copy');

    // supaya file playable meskipun masih recording
    args.push('-movflags', 'faststart+frag_keyframe+empty_moov');

    // Output filename dengan timestamp Jakarta
    const timestamp = getJakartaTimestamp();
    const filename = `${timestamp}.mp4`;
    args.push(path.join(recPath, filename));
    
    return args;
}

// function getJakartaTimestamp() {
//     const now = new Date();
//     // Tambah 7 jam untuk UTC+7 (Jakarta)
//     const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
//     return jakartaTime.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
// }

function getJakartaTimestamp() {
    const now = new Date();
    // Tambah 7 jam untuk UTC+7 (Jakarta)
    const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return jakartaTime.toISOString().replace(/\.\d{3}Z$/, '');
}

const updateCameraRecordInput = async (id, request) => {
    const cameraManager = require("../../manager/CameraManager.js");
    const updateCamera = validate(UpdateRecordInputRequestSchema, request);

    const oldCamera = await prismaClient.camera.findUnique({
        where: { id }
    });
    if (!oldCamera) {
        throw new ResponseError(404, "Camera not found");
    }

    // Update DB
    const result = await prismaClient.camera.update({
        where: { id },
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

    // Update memory CameraInfo
    if (cameraManager.processorsRecord[id]) {
        cameraManager.processorsRecord[id].CameraInfo = { ...oldCamera, ...updateCamera };
    } else if (cameraManager.processorsRecordNonAnalitik[id]) {
        cameraManager.processorsRecordNonAnalitik[id].CameraInfo = { ...oldCamera, ...updateCamera };
    }

    // Restart kamera (kalau perlu)
    setTimeout(async () => {
        await cameraManager.restartCamera(result, true);
    }, 1000);

    return result;  
};

const startRecord = async (id) => {
    const cameraManager = require("../../manager/CameraManager.js");
    if (!id) {
        throw new ResponseError(400, "Camera ID is required");
    }

    // Query kedua tabel secara paralel untuk mengurangi latency
    const [camera, cameraPTZ] = await Promise.all([
        prismaClient.camera.findUnique({ where: { id } }),
        prismaClient.pTZCamera.findUnique({ where: { id } })
    ]);

    const cameraToStart = camera || cameraPTZ;

    if (!cameraToStart) {
        throw new ResponseError(404, `Camera ${id} not found`);
    }

    if (cameraToStart.continuous) {
        throw new ResponseError(400, `Camera ${cameraToStart.name} is already running`);
    }

    if (cameraToStart.input) {
        await checkRtspUrl(cameraToStart.input);
    }

    if (cameraToStart.recordInput) {
        await checkRtspUrl(cameraToStart.recordInput);
    }

    console.log(`[START] Starting camera ${id}...`);

    // Update hanya jika kamera ada di tabel yang sesuai
    const updateData = {
        continuous : true
    };

    let updatedCamera;
    if (camera) {
        updatedCamera = await prismaClient.camera.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                path: true,
                input: true,
                recordInput: true,
                isActive: true,
                continuous: true,
                inputConfig: true,
                liveConfig: true
            }
        });
    } else if (cameraPTZ) {
        // Asumsi: PTZCamera memiliki field yang sama
        updatedCamera = await prismaClient.pTZCamera.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                path: true,
                input: true,
                recordInput: true,
                isActive: true,
                continuous: true,
                inputConfig: true,
                liveConfig: true
            }
        });
    }

    // Jadwal restart dengan setTimeout
    setTimeout(() => {
        console.log(updatedCamera)
        cameraManager.restartCamera(updatedCamera, true);
    }, 1000);

    console.log(`[START] Camera ${id} started successfully.`);

    return updatedCamera;
};

const restartRecord = async (id) => {
    const cameraManager = require("../../manager/CameraManager.js");
    if (!id) {
        throw new ResponseError(400, "Camera ID is required");
    }

    // Query kedua tabel secara paralel untuk mengurangi latency
    const [camera, cameraPTZ] = await Promise.all([
        prismaClient.camera.findUnique({ where: { id } }),
        prismaClient.pTZCamera.findUnique({ where: { id } })
    ]);

    const cameraToStart = camera || cameraPTZ;

    if (!cameraToStart) {
        throw new ResponseError(404, `Camera ${id} not found`);
    }

    if (!cameraToStart.continuous) {
        throw new ResponseError(400, `Camera ${cameraToStart.name} is not running`);
    }

    if (cameraToStart.input) {
        await checkRtspUrl(cameraToStart.input);
    }

    if (cameraToStart.recordInput) {
        await checkRtspUrl(cameraToStart.recordInput);
    }

    console.log(`[RESTART] Restarting camera ${id}...`);

    setTimeout(async () => {
        await cameraManager.restartCamera(cameraToStart, true);
    }, 1000); 

    console.log(`[RESTART] Camera ${id} restarted successfully.`);

    return cameraToStart;
};

const stopRecord = async (id) => {
    const cameraManager = require("../../manager/CameraManager.js");
    if (!id) {
        throw new ResponseError(400, "Camera ID is required");
    }

    // Query kedua tabel secara paralel untuk mengurangi latency
    const [camera, cameraPTZ] = await Promise.all([
        prismaClient.camera.findUnique({ where: { id } }),
        prismaClient.pTZCamera.findUnique({ where: { id } })
    ]);

    const cameraToStart = camera || cameraPTZ;

    if (!cameraToStart) {
        throw new ResponseError(404, `Camera ${id} not found`);
    }

    if (!cameraToStart.continuous) {
        throw new ResponseError(400, `Camera ${cameraToStart.name} is not running`);
    }

    console.log(`[START] Stopping camera ${id}...`);

    // Update hanya jika kamera ada di tabel yang sesuai
    const updateData = {
        continuous : false
    };

    let updatedCamera;
    if (camera) {
        updatedCamera = await prismaClient.camera.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                path: true,
                input: true,
                recordInput: true,
                isActive: true,
                continuous: true,
                inputConfig: true,
                liveConfig: true
            }
        });
    } else if (cameraPTZ) {
        // Asumsi: PTZCamera memiliki field yang sama
        updatedCamera = await prismaClient.pTZCamera.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                path: true,
                input: true,
                recordInput: true,
                isActive: true,
                continuous: true,
                inputConfig: true,
                liveConfig: true
            }
        });
    }

    setTimeout(async () => {
        await cameraManager.stopCamera(updatedCamera.id, true);
    }, 1000); 

    console.log(`[RESTART] Camera ${id} stopping successfully.`);

    return updatedCamera;
};

const updateMultipleCameraRecord = async (request) => {
    const cameraManager = require("../../manager/CameraManager.js");
    const { id, continuous } = validate(UpdateCameraRecordRequestSchema, request);

    if (!id || id.length === 0) {
        throw new ResponseError(400, "camId tidak boleh kosong");
    }

    const existingCameras = await prismaClient.camera.findMany({
        where: {
            id: { in: id },
        },
        select: { id: true, name: true, path: true, floor: true, input: true, inputConfig: true, liveConfig: true, continuous: true },
    });

    console.log(existingCameras);

    const existingIds = existingCameras.map(cam => cam.id);
    const missingIds = id.filter(id => !existingIds.includes(id));

    console.log("Missing IDs:", missingIds);
    console.log("Existing IDs:", existingIds);

    if (missingIds.length > 0) {
        throw new ResponseError(404, `Camera not found: ${missingIds.join(", ")}`);
    }

    await prismaClient.camera.updateMany({
        where: {
            id: { in: id },
        },
        data: { continuous },
    });
        // Ambil ulang data yang sudah diupdate
    const updatedCameraRecords = await prismaClient.camera.findMany({
        where: {
            id: { in: id },
        },
        select: { id: true, name: true, continuous: true, input: true, recordInput: true, inputConfig: true, liveConfig: true, isActive: true, path: true, floor: true },
    });

    for (const cam of updatedCameraRecords) {
        console.log(`Restarting camera ${id} after record status update...`);
        await cameraManager.restartCamera(cam, true);
    }

    return updatedCameraRecords;
};


module.exports = { 
    InitRecordingService,
    updateCameraRecordInput,
    startRecord,
    stopRecord,
    restartRecord,
    updateMultipleCameraRecord
 };
// 