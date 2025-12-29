const config = require('../../../vms.config.js');
const path = require('path');
const fs = require('fs');
const archiver = require("archiver");
const { ResponseError } = require("../../error/responseError.js");
const {prismaClient} = require("../../helper/database.js");
const { formatDuration, getTimeDifference, extractTimeFromFilename } = require("../../helper/helper.js");
const { validate } = require("../../validation/validation.js");
const { MultipleVideosRequestSchema } = require("../../validation/videoValidation.js");

const isToday = (date) => {
    const today = new Date();
    const inputDate = new Date(date);
    const todayString = today.toISOString().split('T')[0];
    const inputDateString = inputDate.toISOString().split('T')[0];
    
    return todayString === inputDateString;
};


const getVideoStreamData = async (camId, filename, rangeHeader) => {
    let filePath;

    const date = extractTimeFromFilename(filename)

    console.log(date);
    

    if (isToday(date)) {
        filePath = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    } else {
        filePath = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    }

    console.log(filePath);

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

const getVideoList = async (camId, startTime, endTime) => {
    const camera = await prismaClient.camera.findUnique({
        where: { id: camId },
    });

    if (!camera) throw new ResponseError(404, "Camera not found");

    let folderPath;

    if (isToday(startTime) || isToday(endTime)) {
        folderPath = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}`);
    } else {
        folderPath = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}`);
    }

    console.log(folderPath)

    if (!fs.existsSync(folderPath)) throw new ResponseError(404, "Video folder not found");

    const start = new Date(startTime);
    if (isNaN(start)) throw new ResponseError(400, "Invalid start time");

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith(".mp4"));

    let end;
    if (!endTime) {
        const lastFile = files.map(f => f.replace(".mp4", "")).sort().pop();
        if (!lastFile) throw new ResponseError(404, "No video files found in folder");
        end = new Date(lastFile);
    } else {
        end = new Date(endTime);
        if (isNaN(end)) throw new ResponseError(400, "Invalid end time");
    }

    const matchedFiles = files
        .filter(file => {
            const timestamp = file.replace(".mp4", "");
            const fileDate = new Date(timestamp);
            return fileDate >= start && fileDate <= end;
        })
        .sort();

    const matchedVideoDetails = matchedFiles.map((file, idx) => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        const sizeInMB = +(stats.size / (1024 * 1024)).toFixed(2);

        const currentTime = new Date(file.replace(".mp4", ""));
        const nextFile = matchedFiles[idx + 1];
        let durationSec = 60; // default 60 detik

        if (nextFile) {
            const nextTime = new Date(nextFile.replace(".mp4", ""));
            durationSec = Math.round((nextTime - currentTime) / 1000);
        }

        const durationFormatted = formatDuration(durationSec);

        return {
            filename: file,
            sizeMB: sizeInMB,
            duration: durationFormatted
        };
    });

    return {
        msg: "success",
        camId: camera.id,
        camName: camera.name,
        video: matchedVideoDetails,
    };
};


const getVideoDownloadPath = async (camId, filename) => {

    const camera = await prismaClient.camera.findUnique({
        where: {
            id: camId,
        }
    });

    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }

    let filePath;

    const date = extractTimeFromFilename(filename)

    if (isToday(date)) {
        filePath = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    } else {
        filePath = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    }

    if (!filename.endsWith(".mp4")) {
        throw new ResponseError(400, "Invalid file type. Only .mp4 files are allowed");
    }

    if (!fs.existsSync(filePath)) {
        throw new ResponseError(404, "Video file not found");
    }

    return filePath;
};

const MAX_FILES = 100;

const createVideoZipStream = async (camId, request) => {
    const { filenames } = validate(MultipleVideosRequestSchema, request);

    let folderPath;

    const date = extractTimeFromFilename(filenames[0])

    if (isToday(date)) {
        folderPath = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}`);
    } else {
        folderPath = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}`);
    }

    const camera = await prismaClient.camera.findUnique({
        where: { id: camId },
    });

    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }

    if (!fs.existsSync(folderPath)) {
        throw new ResponseError(404, "Video folder not found");
    }

    if (!filenames.length) {
        throw new ResponseError(400, "No filenames provided");
    }

    if (filenames.length > MAX_FILES) {
        throw new ResponseError(413, `Too many files to zip. Max allowed is ${MAX_FILES}`);
    }

    const archive = archiver("zip", { zlib: { level: 9 } });

    filenames.forEach(filename => {
        const filePath = path.join(folderPath, filename);

        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath} - skipping`);
            return; // skip file if doesn't exist
        }

        archive.file(filePath, { name: filename });
    });

    return {
        zipStream: archive,
        filename: `${camId}_selected_files.zip`,
    };
};


const getTimelineMetadata = async (camId, dateString) => {
    const cachePath = path.join(config.system.cacheVolume, camId, `${dateString}.json`);

    const camera = await prismaClient.camera.findUnique({
        where: { id: camId },
    });

    if (!camera) throw new ResponseError(404, "Camera not found");
    if (!fs.existsSync(cachePath)) throw new ResponseError(404, "Timeline metadata not found");

    const raw = fs.readFileSync(cachePath, 'utf-8');
    const metadataList = JSON.parse(raw);

    return {
        camId: camera.id,
        camName: camera.name,
        timeline: metadataList.sort((a, b) => new Date(a.start) - new Date(b.start))
    };
};



async function getVideoNeighbors(locID, requestedFile) {
    let videosDir;
    const requestedFileTime = extractTimeFromFilename(requestedFile);

    if (isToday(requestedFileTime)) {
        videosDir = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${locID}`);
    } else {
        videosDir = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${locID}`);
    }

    console.log(isToday(requestedFileTime));

    console.log(videosDir);

    return new Promise((resolve, reject) => {
        fs.readdir(videosDir, (err, files) => {
        if (err) {
            return reject(new Error(`Error reading directory: ${err.message}`));
        }

        const realFiles = files.sort();
        const videoFiles = realFiles.filter(file => file.endsWith('.mp4'));

        if (videoFiles.length === 0) {
            return resolve({ previous: null, current: null, next: null });
        }

        const sortedFiles = videoFiles.sort((a, b) => {
            const aTime = extractTimeFromFilename(a);
            const bTime = extractTimeFromFilename(b);
            const diffA = getTimeDifference(aTime, requestedFileTime);
            const diffB = getTimeDifference(bTime, requestedFileTime);
            return diffA - diffB;
        });

        let currentIndex = sortedFiles.findIndex(file => file === requestedFile);
        let currentVideo = currentIndex === -1 ? sortedFiles[0] : requestedFile;

        currentIndex = realFiles.indexOf(currentVideo);

        const previous = realFiles[currentIndex - 1] || null;
        const next = realFiles[currentIndex + 1] || null;

        resolve({
            previous,
            current: currentVideo,
            next
        });
        });
    });
}

const deleteVideoFile = async (camId, filename) => {
    let videoPath;

    // Ambil tanggal dari filename, lalu tentukan nama file metadata-nya
    const date = extractTimeFromFilename(filename).toISOString().split('T')[0];
    const metadataPath = path.join(`${config.system.cacheVolume}/${camId}/${date}.json`);

    const fileDate = extractTimeFromFilename(filename);

    if (isToday(fileDate)) {
        videoPath = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    } else {
        videoPath = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}/${filename}`);
    }

    // Cek apakah file video ada
    if (!fs.existsSync(videoPath)) {
        throw new ResponseError(404, "Video file not found");
    }

    if (!fs.existsSync(metadataPath)) {
        console.warn(`Metadata file not found: ${metadataPath}. Skipping metadata deletion.`);
        throw new ResponseError(404, "Metadata file not found");
    }

    // Hapus file video
    try {
        await fs.promises.unlink(videoPath);
        console.log(`Video deleted: ${videoPath}`);
    } catch (err) {
        console.error(`Failed to delete video: ${err.message}`);
        throw new ResponseError(500, "Failed to delete video");
    }

    // Hapus entri metadata jika ada
    if (fs.existsSync(metadataPath)) {
        try {
            const metadataRaw = await fs.promises.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataRaw);

            const filteredMetadata = metadata.filter(item => item.filename !== filename);

            // Tulis ulang metadata jika ada perubahan
            if (filteredMetadata.length !== metadata.length) {
                await fs.promises.writeFile(metadataPath, JSON.stringify(filteredMetadata, null, 2));
                console.log(`Metadata updated: ${metadataPath}`);
            }
        } catch (err) {
            console.warn(`Failed to update metadata: ${err.message}`);
            // Tidak dilempar error karena file video sudah berhasil dihapus
        }
    }
    return videoPath;
};

const deleteMultipleVideos = async (camId, request) => {
    const { filenames } = validate(MultipleVideosRequestSchema, request);

    if (!filenames || filenames.length === 0) {
        throw new ResponseError(400, "No filenames provided");
    }

    let videoDir;

    const date = extractTimeFromFilename(filenames[0])

    if (isToday(date)) {
        videoDir = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camId}`);
    } else {
        videoDir = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camId}`);
    }

    console.log(videoDir)

    const metadataDir = path.join(`${config.system.cacheVolume}/${camId}`);

    if (!fs.existsSync(videoDir)) {
        throw new ResponseError(404, "Video directory not found");
    }

    if (!fs.existsSync(metadataDir)) {
        throw new ResponseError(404, "Metadata directory not found");
    }

    const deletedVideos = [];

    for (const filename of filenames) {

        const videoPath = path.join(videoDir, filename);

        // Cek apakah file video ada
        if (!fs.existsSync(videoPath)) {
            throw new ResponseError(404, `Video file not found: ${filename}`);
        }

        // Hapus file video
        try {
            await fs.promises.unlink(videoPath);
            console.log(`Video deleted: ${filename}`);
            deletedVideos.push(filename);
        } catch (err) {
            console.error(`Failed to delete video: ${err.message}`);
            throw new ResponseError(500, "Failed to delete video");
        }

        const date = extractTimeFromFilename(filename).toISOString().split('T')[0];

        const metadataPath = path.join(metadataDir, `${date}.json`);

        // Hapus entri metadata jika ada
        if (fs.existsSync(metadataPath)) {
            try {
                const metadataRaw = await fs.promises.readFile(metadataPath, 'utf8');
                const metadata = JSON.parse(metadataRaw);

                const filteredMetadata = metadata.filter(item => item.filename !== filename);

                // Tulis ulang metadata jika ada perubahan
                if (filteredMetadata.length !== metadata.length) {
                    await fs.promises.writeFile(metadataPath, JSON.stringify(filteredMetadata, null, 2));
                    console.log(`Metadata updated: ${metadataPath}`);
                }
            } catch (err) {
                console.warn(`Failed to update metadata: ${err.message}`);
                // Tidak dilempar error karena file video sudah berhasil dihapus
            }
        }
    }

    return deletedVideos;

};



module.exports = {
    getVideoStreamData,
    getVideoList,
    getVideoDownloadPath,
    createVideoZipStream,
    getTimelineMetadata,
    getVideoNeighbors,
    deleteVideoFile,
    deleteMultipleVideos
};