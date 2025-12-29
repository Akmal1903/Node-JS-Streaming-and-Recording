const { exec } = require("child_process");
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { prismaClient } = require('../helper/database.js');
dayjs.extend(utc);
dayjs.extend(timezone);

const formatDuration = (seconds) => {
    if (typeof seconds !== "number" || isNaN(seconds)) return null;

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

// Fungsi untuk mengonversi nama file menjadi objek Date by DEVA
const extractTimeFromFilename = (filename) => {
	const timeStr = filename.split('.')[0]; // Mengambil bagian waktu dari nama file, misalnya "2025-01-06T13-01-05"
	return new Date(`${timeStr}Z`);
};

// Fungsi untuk menghitung perbedaan waktu (dalam milidetik) antara dua waktu
const getTimeDifference = (time1, time2) => {
	return Math.abs(time1 - time2);
};



const localTimeZone = 'Asia/Jakarta';

// function updateVideoMetadata(cameraID, fullPath, config) {
//     const folder = path.dirname(fullPath);
//     const cacheDir = path.join(config.system.cacheVolume, cameraID);
//     const jsonPath = path.join(cacheDir, 'videoMetadata.json');

//     const files = fs.readdirSync(folder)
//         .filter(name => name.endsWith('.mp4'))
//         .map(name => {
//             const nameNoExt = name.replace(/\.mp4$/, '');
//             return {
//                 filename: name,
//                 unixTime: Date.parse(nameNoExt),
//                 sizeMB: +(fs.statSync(path.join(folder, name)).size / 1024 / 1024).toFixed(2)
//             };
//         })
//         .sort((a, b) => a.unixTime - b.unixTime);

//     const metadataList = [];

//     for (let i = 0; i < files.length; i++) {
//         const current = files[i];
//         const next = files[i + 1];

//         const startUnix = current.unixTime;
//         const endUnix = next ? next.unixTime : startUnix + 60_000;
//         const duration = Math.floor((endUnix - startUnix) / 1000);

//         metadataList.push({
//             filename: current.filename,
//             start: dayjs(startUnix).tz(localTimeZone).format(), // Lokal time
//             end: dayjs(endUnix).tz(localTimeZone).format(),     // Lokal time
//             duration,
//             sizeMB: current.sizeMB
//         });
//     }

//     if (!fs.existsSync(cacheDir)) {
//         fs.mkdirSync(cacheDir, { recursive: true });
//     }

//     fs.writeFileSync(jsonPath, JSON.stringify(metadataList, null, 2));
// }

function updateVideoMetadata(cameraID, fullPath, config) {
    const folder = path.dirname(fullPath);
    const cacheDir = path.join(config.system.cacheVolume, cameraID);

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileName = path.basename(fullPath);
    const nameNoExt = fileName.replace(/\.mp4$/, '');
    const currentTime = dayjs(nameNoExt);
    const currentDateStr = currentTime.tz(localTimeZone).format('YYYY-MM-DD');
    const jsonPath = path.join(cacheDir, `${currentDateStr}.json`);

    let metadataList = [];

    if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        metadataList = JSON.parse(raw);
    }

    // Hitung end & duration dari metadata sebelumnya (jika ada)
    const startUnix = currentTime.valueOf();
    const fileStats = fs.statSync(fullPath);
    const sizeMB = +(fileStats.size / 1024 / 1024).toFixed(2);

    if (metadataList.length > 0) {
        const last = metadataList[metadataList.length - 1];
        const lastStart = dayjs(last.start).valueOf();
        last.end = currentTime.tz(localTimeZone).format();
        last.duration = Math.floor((startUnix - lastStart) / 1000);
    }

    // Tambahkan entry baru (dengan end/duration null sementara)
    metadataList.push({
        filename: fileName,
        start: currentTime.tz(localTimeZone).format(),
        end: null,
        duration: null,
        sizeMB
    });

    fs.writeFileSync(jsonPath, JSON.stringify(metadataList, null, 2));
}

async function updateCameraOnlineStatus( cameraId, status) {
    try {
        // Ambil status terakhir langsung dari DB
        const camera = await prismaClient.camera.findUnique({
            where: { id: cameraId },
            select: { is_online: true }
        });

        // Kalau status sama → skip
        if (camera && camera.is_online === status) {
            return;
        }

        // Update DB kalau beda
        await prismaClient.camera.update({
            where: { id: cameraId },
            data: { is_online: status }
        });

        console.log(`[DB] Camera ${cameraId} is_online -> ${status}`);
    } catch (err) {
        console.error(`[DB] Failed to update is_online for ${cameraId}:`, err.message);
    }
}


// async function updateCameraOnlineStatus(cameraId, rtsp) {

//     const cmd = `ffprobe -v error -show_streams -show_format -print_format json "${rtsp}"`;

//     exec(cmd, async (error) => {
//         const newStatus = !error; // true kalau ffprobe berhasil

//         try {
//             // Ambil status lama dari DB
//             const camera = await prismaClient.camera.findUnique({
//                 where: { id: cameraId },
//                 select: { is_online: true }
//             });

//             if (camera && camera.is_online === newStatus) {
//                 console.log(`[DB] Camera ${cameraId} status unchanged (${newStatus}), no update.`);
//                 return;
//             }

//             // Update hanya jika status berubah
//             await prismaClient.camera.updateMany({
//                 where: { id: cameraId },
//                 data: { is_online: newStatus }
//             });
//             console.log(`[DB] Camera ${cameraId} is_online updated to ${newStatus}`);

//         } catch (err) {
//             console.error(`[DB] Failed to update is_online for ${cameraId}:`, err.message);
//         }
//     });
// }

const checkRtspUrl = (url) => {
    return new Promise((resolve, reject) => {
        const cmd = `ffprobe -v error -show_streams -show_format "${url}"`;
        exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
            if (err) {
                return reject(new ResponseError(400, `RTSP URL cannot be reached: ${err.message}`));
            }
            resolve(); // cuma resolve kosong, artinya sukses
        });
    });
};



module.exports = {
    checkRtspUrl,
    formatDuration,
    extractTimeFromFilename,
    getTimeDifference,
    updateVideoMetadata,
    updateCameraOnlineStatus
};