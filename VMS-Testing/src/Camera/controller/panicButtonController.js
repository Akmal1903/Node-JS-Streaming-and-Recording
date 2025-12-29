const { logger } = require("../../helper/logging");
const panicButtonService = require("../service/panicButtonService");

const startPanicRecording = async (req, res, next) => {
    try {
        const result = await panicButtonService.startRecord(req.params.camId);
        res.status(200).json(result);
    } catch (e) {
        next(e);
        logger.error(e);
    }
}

const stopPanicRecording = async (req, res, next) => {
    try {
        const result = await panicButtonService.stopRecord(req.params.camId);
        res.status(200).json(result);
    } catch (e) {
        next(e);
        logger.error(e);
    }
}

const getPanicVideo = async (req, res, next) => {
    try {
        const { statusCode, headers, stream } = await panicButtonService.getVideoStreamData(
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

module.exports = {
    startPanicRecording,
    stopPanicRecording,
    getPanicVideo
};