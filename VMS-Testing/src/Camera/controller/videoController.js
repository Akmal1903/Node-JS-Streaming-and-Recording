const videoService = require("../service/videoService");

const getVideo = async (req, res, next) => {
    try {
        const { statusCode, headers, stream } = await videoService.getVideoStreamData(
            req.params.camId,
            req.params.filename,
            req.headers.range
        );
        res.writeHead(statusCode, headers);
        stream.on("error", err => {
            console.error("Stream error:", err);
            res.end();
        });

        res.on("close", () => {
            stream.destroy();
        });
        stream.pipe(res);

        req.setTimeout(10000, () => {
            console.warn("Request timeout, terminating stream");
            stream.destroy();
        });

        //logger.info(`Streaming video: ${req.params.filename} from cam ${req.params.camId}`);
    } catch (err) {
        next(err);
    }
};

const getVideoList = async (req, res, next) => {
    try {
        const camId = req.params.camId;
        const { start, end } = req.query;

        const result = await videoService.getVideoList(camId, start, end);

        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

const downloadVideo = async (req, res, next) => {
    try {
        const { camId, filename } = req.params;
        const filePath = await videoService.getVideoDownloadPath(camId, filename);

        res.download(filePath, filename, err => {
            if (err) {
                next(err);
            }
        });
    } catch (err) {
        next(err);
    }
};

const downloadVideoZip = async (req, res, next) => {
    try {
        const { camId } = req.params;

        const { zipStream, filename } = await videoService.createVideoZipStream(camId, req.body);

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        zipStream.on("error", err => next(err));

        zipStream.pipe(res);
        zipStream.finalize();
    } catch (err) {
        next(err);
    }
};

const getTimeline = async (req, res, next) => {
    try {
        const { camId } = req.params;
        const { date } = req.query;
        const timeline = await videoService.getTimelineMetadata(camId, date);
        res.json(timeline);
    } catch (err) {
        next(err);
    }
};

async function getVideoSequence(req, res) {
    const { locID, filename } = req.params;

    try {
        const result = await videoService.getVideoNeighbors(locID, filename);

        if (!result.current) {
            return res.status(404).json({ error: 'No video files found' });
        }

        res.json(result);
    } catch (err) {
        console.error('Error in getVideoSequence:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

const deleteVideoFile = async (req, res, next) => {
    try {
        const { camId, filename } = req.params;
        const result = await videoService.deleteVideoFile(camId, filename);
        res.status(200).json({
            msg : "success",
            data:  result
        });
    } catch (err) {
        next(err);
    }
};

const deleteMultipleVideos = async (req, res, next) => {
    try {
        const { camId } = req.params;
        //const { filenames } = req.body;

        const result = await videoService.deleteMultipleVideos(camId, req.body);
        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (err) {
        next(err);
    }
};



module.exports = {
    getVideo,
    getVideoList,
    downloadVideo,
    downloadVideoZip,
    getTimeline,
    getVideoSequence,
    deleteVideoFile,
    deleteMultipleVideos
};