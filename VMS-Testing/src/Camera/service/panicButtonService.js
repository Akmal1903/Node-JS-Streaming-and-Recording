const { prismaClient } = require("../../helper/database");
const { ResponseError } = require("../../error/responseError");
const path = require("path");
const fs = require("fs");
const config = require("../../../vms.config");
const cameraManager = require("../../manager/CameraManager");

// const cameraProcesses = new Map();

// // Fungsi untuk mendapatkan timestamp Jakarta (UTC+7)
// function getJakartaTimestamp() {
//     const now = new Date();
//     // Tambah 7 jam untuk UTC+7 (Jakarta)
//     const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
//     return jakartaTime.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
// }

// const startRecord = async (cameraId) => {
//     try {
//         // Cek jika camera sudah sedang direkam dan proses masih aktif
//         if (cameraProcesses.has(cameraId)) {
//             const existingProcess = cameraProcesses.get(cameraId);
            
//             // Periksa status proses dengan lebih akurat
//             const isProcessActive = existingProcess.process && 
//                                   !existingProcess.process.killed && 
//                                   !existingProcess.isStopped;
            
//             if (isProcessActive) {
//                 console.log(`[SKIP] Camera ${cameraId} is already recording.`);
//                 return {
//                     status: "success",
//                     message: `Recording already running for camera ${cameraId}`,
//                     cameraId: cameraId,
//                     path: existingProcess.path,
//                 };
//             } else {
//                 // Proses sudah mati atau dihentikan, hapus dari map
//                 console.log(`[CLEANUP] Removing dead/stopped process for camera ${cameraId}`);
//                 cameraProcesses.delete(cameraId);
//             }
//         }

//         const camera = await prismaClient.pTZCamera.findUnique({
//             where: { id: cameraId },
//         });

//         if (!camera) {
//             throw new ResponseError(404, `Camera with id ${cameraId} not found`);
//         }

//         if (!camera.isActive) {
//             console.log(`[SKIP] Camera ${camera.id} is not active, skipping initialization.`);
//             return;
//         }

//         // Gunakan path yang konsisten
//         const recPath = path.join(config.system.storagePanicButton, 'CAMERA_RECORDINGS', camera.id);
//         if (!fs.existsSync(recPath)) {
//             fs.mkdirSync(recPath, { recursive: true });
//         }

//         // Pastikan tidak ada proses yang masih berjalan untuk camera ini
//         if (cameraProcesses.has(cameraId)) {
//             console.log(`[WARN] Process still exists for camera ${cameraId}, cleaning up...`);
//             cameraProcesses.delete(cameraId);
//         }

//         const OptionsRecord = { 
//             detached: false, // Set ke false untuk memudahkan debugging
//             stdio: ['ignore', 'ignore', 'pipe']
//         };

//         if (camera.continuous && camera.recordInput) {
//             console.log(`[RECORD] Recording started for ${camera.name}`);
//             const recordArgs = buildRecordingArgs(camera, camera.id, config);
            
//             // Debug: Tampilkan command yang akan dijalankan
//             console.log(`[FFMPEG CMD] ${config.system.ffmpegLocation} ${recordArgs.join(' ')}`);
            
//             try {
//                 const recordSpawn = childprocess.spawn(config.system.ffmpegLocation, recordArgs, OptionsRecord);

//                 // Simpan process ke map
//                 cameraProcesses.set(cameraId, {
//                     process: recordSpawn,
//                     shouldRestart: false,
//                     isStopped: false,
//                     path: recPath,
//                     cameraName: camera.name,
//                     startTime: Date.now()
//                 });

//                 // Tangani output stderr (biasanya ffmpeg menulis log ke stderr)
//                 recordSpawn.stderr.on('data', (data) => {
//                     const output = data.toString().trim();
//                     if (output) {
//                         console.log(`[FFMPEG ${camera.name}] ${output}`);
                        
//                         // Cek jika ada pesan error
//                         if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
//                             console.error(`[FFMPEG ERROR ${camera.name}] ${output}`);
//                         }
//                     }
//                 });

//                 recordSpawn.on('close', (code, signal) => {
//                     const cameraProcess = cameraProcesses.get(cameraId);
//                     console.log(`[CLOSE ${camera.name}] Recording process exited with code ${code}, signal ${signal} | isStopped=${cameraProcess?.isStopped}`);
                    
//                     // Hapus dari map terlepas dari keadaan
//                     cameraProcesses.delete(cameraId);
                    
//                     if (cameraProcess && !cameraProcess.isStopped) {
//                         console.log(`[AUTO-RESTART ${camera.name}] Recording will auto-restart`);
//                         // Gunakan setTimeout untuk menghindari call stack overflow
//                         setTimeout(() => {
//                             startRecord(cameraId).catch(err => {
//                                 console.error(`[RESTART ERROR ${camera.name}] Failed to restart:`, err);
//                             });
//                         }, 2000);
//                     } else {
//                         console.log(`[STOP ${camera.name}] Recording stopped manually. No auto-restart.`);
//                     }
//                 });

//                 recordSpawn.on('error', (err) => {
//                     console.error(`[ERROR ${camera.name}] Recording error:`, err);
//                     // Hapus dari map jika error
//                     cameraProcesses.delete(cameraId);
//                 });

//                 // Tunggu sebentar untuk memastikan proses tidak langsung error
//                 await new Promise(resolve => setTimeout(resolve, 1000));
                
//                 // Periksa apakah proses masih berjalan setelah 1 detik
//                 if (recordSpawn.killed) {
//                     console.error(`[ERROR ${camera.name}] FFmpeg process died immediately`);
//                     cameraProcesses.delete(cameraId);
//                     throw new ResponseError(500, `FFmpeg process died immediately for camera ${camera.name}`);
//                 }

//             } catch (error) {
//                 console.error(`[ERROR ${camera.name}] Failed to spawn FFmpeg process:`, error);
//                 cameraProcesses.delete(cameraId);
//                 throw new ResponseError(500, `Failed to start recording for camera ${camera.name}`);
//             }
//         }

//         await prismaClient.pTZCamera.update({
//             where: { id: camera.id },
//             data: { continuous: true },
//         });

//         return {
//             status: "success",
//             message: `Recording started for ${camera.name}`,
//             cameraId: camera.id,
//             path: recPath,
//         };
//     } catch (error) {
//         console.error(`[ERROR] Failed to start recording for camera ${cameraId}:`, error);
//         throw error;
//     }
//}

const startRecord = async (cameraId) => {
    const camera = await prismaClient.pTZCamera.findUnique({
        where: { id: cameraId },
    });

    if (!camera) {
        throw new ResponseError(404, `Camera with id ${cameraId} not found`);
    }

    if (!camera.isActive) {
        console.log(`[SKIP] Camera ${camera.id} is not active, skipping initialization.`);
        return;
    }

    const updateCamera = await prismaClient.pTZCamera.update({
        where: { id: camera.id },
        data: { continuous: true },
        select : {
            id: true,
            name: true,
            path: true,
            floor : true,
            input: true,
            recordInput: true,
            continuous: true,
            isActive: true,
            inputConfig: true,
            liveConfig: true
        }
    });

    await cameraManager.restartCamera(updateCamera, true);

    return {
        status: "success",
        message: `Recording started for ${camera.name}`,
        cameraId: camera.id,
    }
}


// const stopRecording = (cameraId) => {
//     return new Promise((resolve) => {
//         const cameraProcess = cameraProcesses.get(cameraId);
//         if (!cameraProcess) {
//             console.log(`[STOP SKIP] No recording process found for ${cameraId}`);
//             return resolve();
//         }

//         if (cameraProcess.isStopped) {
//             console.log(`[STOP SKIP] Recording process for ${cameraId} is already stopped`);
//             return resolve();
//         }

//         console.log(`[STOP] Stopping recording process for ${cameraId}`);
//         cameraProcess.isStopped = true;

//         const killProcess = (proc, cameraName) => {
//             return new Promise(r => {
//                 if (!proc || proc.killed) {
//                     console.log(`[STOP SKIP ${cameraName}] Process already dead or killed`);
//                     return r();
//                 }
                
//                 const timer = setTimeout(() => {
//                     console.log(`[FORCE KILL ${cameraName}] Process not responding`);
//                     try {
//                         proc.kill('SIGKILL');
//                     } catch (e) {
//                         console.error(`[FORCE KILL ERROR ${cameraName}]`, e);
//                     }
//                     r();
//                 }, 3000); // Timeout 3 detik

//                 proc.once('close', () => {
//                     console.log(`[STOP ${cameraName}] Process closed gracefully`);
//                     clearTimeout(timer);
//                     r();
//                 });

//                 try {
//                     proc.kill('SIGTERM');
//                 } catch (e) {
//                     console.error(`[SIGTERM ERROR ${cameraName}]`, e);
//                     try {
//                         proc.kill('SIGKILL'); // Force kill if SIGTERM fails
//                     } catch (killError) {
//                         console.error(`[SIGKILL ERROR ${cameraName}]`, killError);
//                     }
//                 }                            
//             });
//         };

//         killProcess(cameraProcess.process, cameraProcess.cameraName).then(() => {
//             console.log(`[STOP COMPLETE] Recording process for ${cameraId} stopped`);
//             // Pastikan proses dihapus dari map
//             cameraProcesses.delete(cameraId);
//             resolve();
//         }).catch(error => {
//             console.error(`[STOP ERROR] Error stopping process for ${cameraId}:`, error);
//             // Tetap hapus dari map bahkan jika ada error
//             cameraProcesses.delete(cameraId);
//             resolve();
//         });
//     });
// };

const stopRecord = async (cameraId) => {
    try {
        const camera = await prismaClient.pTZCamera.findUnique({
            where: { id: cameraId },
        });

        if (!camera) {
            throw new ResponseError(404, `Camera with id ${cameraId} not found`);
        }

        // Update database first
        const updateCamera = await prismaClient.pTZCamera.update({
            where: { id: camera.id },
            data: { continuous: false },
            select : {
                id: true,
                name: true,
                path: true,
                floor : true,
                input: true,
                recordInput: true,
                continuous: true,
                isActive: true,
                inputConfig: true,
                liveConfig: true
            }
        });

        // Then stop recording
        await cameraManager.restartCamera(updateCamera, true);

        // Gunakan path yang benar
        const recPath = path.join(config.system.storagePanicButton, 'CAMERA_RECORDINGS', cameraId);
        const latestFile = getLastRecordedFile(recPath);

        return {
            status: "success",
            message: `Recording stopped for ${camera.name}`,
            cameraId: camera.id,
            video: latestFile
                ? `http://10.11.1.56:7885/api/panic/video/${camera.id}/${latestFile}`
                : null,
        };
    } catch (error) {
        console.error(`[ERROR] Failed to stop recording for camera ${cameraId}:`, error);
        throw error;
    }
}

function getLastRecordedFile(dir) {
    if (!fs.existsSync(dir)) return null;
    
    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".mp4"));
        if (files.length === 0) return null;
        
        return files
            .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtime }))
            .sort((a, b) => b.t - a.t)[0].f; // ambil terbaru
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
        return null;
    }
}

const getVideoStreamData = async (camId, filename, rangeHeader) => {
    const filePath = path.join(config.system.storagePanicButton, 'CAMERA_RECORDINGS', camId, filename);

    if (!fs.existsSync(filePath)) {
        throw new ResponseError(404, "Video not found");
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
            throw new ResponseError(416, "Requested range not satisfiable");
        }

        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        return {
            statusCode: 206,
            headers: {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": "video/mp4",
                "Cache-Control": "public, max-age=3600",
                "Connection" : "keep-alive",
            },
            stream,
        };
    }

    return {
        statusCode: 200,
        headers: {
            "Content-Length": fileSize,
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes", 
            "Cache-Control": "public, max-age=3600",
            "Connection" : "keep-alive"
        },
        stream: fs.createReadStream(filePath),
    };
};

// Fungsi untuk mendapatkan status semua camera
const getRecordingStatus = () => {
    const status = {};
    cameraProcesses.forEach((process, cameraId) => {
        status[cameraId] = {
            isRecording: !process.isStopped && process.process && !process.process.killed,
            shouldRestart: process.shouldRestart,
            path: process.path,
            cameraName: process.cameraName
        };
    });
    return status;
};

// Fungsi untuk memeriksa dan membersihkan proses yang mati
const cleanupDeadProcesses = () => {
    cameraProcesses.forEach((process, cameraId) => {
        if (process.process && process.process.killed) {
            console.log(`[CLEANUP] Removing dead process for camera ${cameraId}`);
            cameraProcesses.delete(cameraId);
        }
    });
};

module.exports = {
    startRecord,
    stopRecord,
    getVideoStreamData,
    getRecordingStatus,
    cleanupDeadProcesses
};