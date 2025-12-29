const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { prismaClient } = require('../../helper/database.js');
const config = require('../../../vms.config.js');



// Konfigurasi
const CAMERA_BASE_DIR = '/mnt/nas01/vms-data/CAMERA_RECORDINGS';
const CACHE_DIR = '/mnt/nas01/vms-data/CACHE';
const STORAGE_THRESHOLD_PERCENT = 98; // Persentase batas maksimal penggunaan disk
// const DAYS_TO_KEEP = 30; // Hapus file yang lebih dari 30 hari

// // Fungsi hitung tanggal N hari lalu
// function getDateNDaysAgo(days) {
//     const date = new Date();
//     date.setDate(date.getDate() - days);

//     const yyyy = date.getFullYear();
//     const mm = String(date.getMonth() + 1).padStart(2, '0');
//     const dd = String(date.getDate()).padStart(2, '0');

//     return `${yyyy}-${mm}-${dd}`;
// }

// // Ambil file mp4 sesuai tanggal
// function getVideoFilesInFolder(folderPath, searchedDate) {
//     let videoFiles = [];

//     const files = fs.readdirSync(folderPath);
//     for (const file of files) {
//         const filePath = path.join(folderPath, file);
//         const stats = fs.statSync(filePath);

//         if (
//             stats.isFile() &&
//             file.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.mp4/) &&
//             file.includes(searchedDate)
//         ) {
//             videoFiles.push(file);
//         }
//     }

//     return videoFiles;
// }

// Bersihkan metadata dan file video
function deleteFilesAndCleanMetadata(fileData, searchedDate) {
    const folderList = Object.keys(fileData);

    folderList.forEach(folder => {
        const cameraID = path.basename(folder);
        const cachePath = path.join(CACHE_DIR, cameraID, `${searchedDate}.json`);

        // Hapus file video
        fileData[folder].forEach(file => {
            const fullPath = path.join(folder, file);
            try {
                fs.unlinkSync(fullPath);
                console.log(`Deleted video: ${fullPath}`);
            } catch (err) {
                console.warn(`Failed to delete ${fullPath}`, err.message);
            }
        });

        // Update atau hapus metadata
        if (fs.existsSync(cachePath)) {
            try {
                const oldMetadata = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                const filtered = oldMetadata.filter(m => !fileData[folder].includes(m.filename));

                if (filtered.length === 0) {
                    fs.unlinkSync(cachePath);
                    console.log(`Deleted empty metadata: ${cachePath}`);
                } else {
                    fs.writeFileSync(cachePath, JSON.stringify(filtered, null, 2));
                    console.log(`Updated metadata: ${cachePath}`);
                }
            } catch (err) {
                console.warn(`Failed handling metadata: ${cachePath}`, err.message);
            }
        }
    });
}

// Fungsi utama
async function runCleanupIfNeeded() {
    try {
        const stdout = execSync('df -k').toString(); // output dalam KB
        const lines = stdout.trim().split('\n');

        let rootDisk = null;

        for (const line of lines.slice(1)) {
            const parts = line.split(/\s+/);
            const mount = parts[5];

            if (mount === '/mnt/nas01') {
                const size = parseInt(parts[1]);
                const used = parseInt(parts[2]);
                rootDisk = { mount, size, used };
                break;
            }
        }

        if (!rootDisk) {
            console.log('NAS mount point "/mnt/nas01" not found in df output.');
            return;
        }

        const getUsedPercent = () => (rootDisk.used / rootDisk.size) * 100;
        let usedPercent = getUsedPercent();

        console.log(`Disk used: ${usedPercent.toFixed(2)}%`);

        if (usedPercent < STORAGE_THRESHOLD_PERCENT) {
            console.log(`Storage is under ${STORAGE_THRESHOLD_PERCENT}%. Cleanup not needed.`);
            return;
        }

        console.log(`Storage exceeds ${STORAGE_THRESHOLD_PERCENT}%. Running cleanup...`);

        // Ambil cameraId dari database
        const cameras = await prismaClient.camera.findMany();

        let filesByDate = {}; // { '2025-07-01': { '/path/to/camera': ['file1.mp4', ...] }, ... }

        for (const cam of cameras) {
            const camPath = path.join(CAMERA_BASE_DIR, cam.id);
            if (!fs.existsSync(camPath)) continue;

            const files = fs.readdirSync(camPath);
            for (const file of files) {
                if (!file.endsWith('.mp4')) continue;

                const match = file.match(/^(\d{4}-\d{2}-\d{2})T/); // ambil tanggal dari nama file
                if (!match) continue;

                const dateKey = match[1]; // contoh: 2025-07-01

                if (!filesByDate[dateKey]) filesByDate[dateKey] = {};
                if (!filesByDate[dateKey][camPath]) filesByDate[dateKey][camPath] = [];

                filesByDate[dateKey][camPath].push(file);
            }
        }

        const sortedDates = Object.keys(filesByDate).sort(); // urutkan dari tanggal terlama

        for (const date of sortedDates) {
            console.log(`Deleting all files from: ${date}`);
            deleteFilesAndCleanMetadata(filesByDate[date], date);

            // Update disk usage
            const updated = execSync('df -k').toString();
            const updatedLines = updated.trim().split('\n');
            for (const line of updatedLines.slice(1)) {
                const parts = line.split(/\s+/);
                if (parts[5] === '/mnt/nas01') {
                    rootDisk.used = parseInt(parts[2]);
                    break;
                }
            }

            usedPercent = getUsedPercent();
            console.log(`Updated disk usage: ${usedPercent.toFixed(2)}%`);

            if (usedPercent < STORAGE_THRESHOLD_PERCENT) {
                console.log(`Storage is now under ${STORAGE_THRESHOLD_PERCENT}%. Stopping cleanup.`);
                break;
            }
        }

    } catch (err) {
        console.error('Cleanup error:', err);
    }
}

async function copyVideotoNAS() {
    try {
        // Dapatkan semua kamera dari database
        const cameras = await prismaClient.camera.findMany();
        
        // Loop melalui setiap kamera
        for (const camera of cameras) {
            const sourceDir = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camera.id}`);
            const destDir = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camera.id}`);

            try {
                // Periksa apakah direktori sumber ada
                try {
                    await fsp.access(sourceDir);
                } catch {
                    console.log(`Directory not found, skipping: ${sourceDir}`);
                    continue;
                }

                // Buat direktori tujuan jika belum ada
                await fsp.mkdir(destDir, { recursive: true });

                // Baca semua file di direktori sumber
                const files = await fsp.readdir(sourceDir);

                // Salin setiap file ke NAS
                for (const file of files) {
                    const sourcePath = path.join(sourceDir, file);
                    const destPath = path.join(destDir, file);
                    
                    // Periksa apakah file sudah ada di NAS
                    try {
                        await fsp.access(destPath);
                        console.log(`File already exists, skipping: ${file}`);
                        continue;
                    } catch {
                        // File tidak ada, lanjutkan dengan penyalinan
                    }
                    
                    await fsp.copyFile(sourcePath, destPath);
                    console.log(`Copied: ${file}`);
                }

                // Hapus semua file dari direktori sumber setelah penyalinan berhasil
                for (const file of files) {
                    const sourcePath = path.join(sourceDir, file);
                    await fsp.unlink(sourcePath);
                    console.log(`Deleted: ${file}`);
                }

                console.log(`All files moved successfully for camera ${camera.id}`);
            } catch (error) {
                console.error(`Error processing camera ${camera.id}:`, error);
                // Lanjutkan ke kamera berikutnya meskipun ada error
            }
        }

        console.log('All cameras processed successfully');
    } catch (error) {
        console.error('Error during operation:', error);
        throw error;
    }
}


// // Schedule setiap hari jam 02:00
// cron.schedule('* * * * *', () => {
//     console.log('Running storage cleanup cron...');
//     runCleanupIfNeeded();
// });

module.exports = {
    runCleanupIfNeeded,
    copyVideotoNAS
};
