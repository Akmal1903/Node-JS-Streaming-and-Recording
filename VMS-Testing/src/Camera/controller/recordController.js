const { logger } = require("../../helper/logging");

const recordingService = require("../service/recordService");

const updateCameraRecordInput = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { body } = req;

        const result = await recordingService.updateCameraRecordInput(id, body);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

const startRecord = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await recordingService.startRecord(id);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

const restartRecord = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await recordingService.restartRecord(id);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

const stopRecord = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await recordingService.stopRecord(id);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

const updateMultipleCameraRecord = async (req, res, next) => {
    try {
        console.log('Raw Request Body:', JSON.stringify(req.body));
        console.log('Request Headers:', req.headers);
        
        const result = await recordingService.updateMultipleCameraRecord(req.body);
        
        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        console.error('Full Error Stack:', e.stack);
        console.error('Error Details:', {
            message: e.message,
            code: e.code,
            metadata: e.meta
        });
        next(e);
    }
};

module.exports = {
    updateCameraRecordInput,
    startRecord,
    stopRecord,
    restartRecord,
    updateMultipleCameraRecord
};