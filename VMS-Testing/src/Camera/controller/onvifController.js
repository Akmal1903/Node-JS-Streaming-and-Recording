const onvifService = require("../service/onvifService");
const { logger } = require("../../helper/logging");

const discoverCameras = async (req, res, next) => {
    try {
        const result = await onvifService.camera(req.params.id);
        res.status(200).json({
            msg : "success",
            data: result
        });
        logger.info(result);
    } catch (e) {
        next(e);
        logger.info(e);
    }
}

const ptzMove = async (req, res, next) => {
    try {
        const result = await onvifService.ptzMove(req.params.id, req.body);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        next(e);
        logger.info(e);
    }
};

module.exports = {
    discoverCameras
    , ptzMove
};