const { logger } = require("../../helper/logging");
const cameraService = require("../service/camera-service");
const cameraManager = require("../../manager/CameraManager");

const createCamera = async (req, res, next) => {
    try {
        const result = await cameraService.create(req.body);

        // if (result?.id) {
        //     cameraManager.initCamera(result, true, true);
        // }

        res.status(200).json({
            msg : "success",
            data: result
        });
    } catch (e) {
        next(e);
    }
};

const createCameraPTZ = async (req, res, next) => {
    try {
        const result = await cameraService.createPTZ(req.body);
        res.status(200).json({
            msg : "success",
            data: result
        });
    } catch (e) {
        next(e);
    }
};

const getAllPTZ = async (req, res, next) => {
    try {
        const result = await cameraService.getAllPTZ();
        res.status(200).json({
            msg : "success",
            data: result
        });
        logger.info(result);
    } catch (e) {
        next(e);
        logger.info(e);
    }
};

const getAllCamera = async (req, res, next) => {
    try {
        const result = await cameraService.getAll();
        res.status(200).json({
            msg : "success",
            data: result
        });
        logger.info(result);
    } catch (e) {
        next(e);
        logger.info(e);
    }
};

const getCameraById = async (req, res, next) => {
    try {
        const result = await cameraService.getCameraById(req.params.id);
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

const updateCamera = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { body } = req;

        const result = await cameraService.updateCamera(id, body);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
};

const deleteCamera = async (req, res, next) => {
    try {
        const result = await cameraService.deleteCamera(req.params.id);
        await cameraManager.stopCamera(req.params.id);
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


const getStatusCamera = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await cameraService.getStatusCamera(id);

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        next(e);
    }
};

const getAllCamerasStatus = async (req, res, next) => {
    try {
        const result = await cameraService.getAllCamerasStatus();

        res.status(200).json({
            msg: "success",
            data: result
        });
    } catch (e) {
        next(e);
    }
};


module.exports = {
    createCamera,
    getAllCamera,
    getCameraById,
    updateCamera,
    deleteCamera,
    getStatusCamera,
    getAllCamerasStatus,
    getAllPTZ,
    createCameraPTZ
};