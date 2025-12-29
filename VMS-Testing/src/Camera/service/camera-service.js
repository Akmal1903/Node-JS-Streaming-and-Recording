const { CreateCameraRequestSchema, UpdateCameraRequestSchema, UpdateCameraRecordRequestSchema, CreateCameraPTZRequestSchema  } = require("../../validation/cameraValidation");
const { prismaClient } = require("../../helper/database");
const { validate } = require("../../validation/validation");
const { ResponseError } = require("../../error/responseError");
const { checkRtspUrl } = require("../../helper/helper");

const create = async (request) => {
    const createCamera = validate(CreateCameraRequestSchema, request);

    await checkRtspUrl(createCamera.input);

    if (createCamera.continuous && createCamera.recordInput) {
        await checkRtspUrl(createCamera.recordInput);
    }

    const totalCameraWithSameCamera = await prismaClient.camera.count({
        where: {
            id: createCamera.id,
            input: createCamera.input,
            name: createCamera.name,
            path: createCamera.path
        }
    });

    createCamera.inputConfig = {
        use_wallclock_as_timestamps: "1",
        fflags: "+igndts",
        analyzeduration: "1000000",
        probesize: "1000000",
        rtsp_transport: "tcp",
        stimeout : "30000000"
    };
    
    createCamera.liveConfig = {
        codecString: 'video/mp4; codecs="avc1.64001f"',
        streamConfig: {
            an: "",
            vcodec: "copy",
            f: "mp4",
            movflags: "+frag_keyframe+empty_moov+default_base_moof",
            reset_timestamps: "1"
        }
    };

    if (totalCameraWithSameCamera !== 0) {
        throw new ResponseError(400, "Camera already exists");
    }

    return prismaClient.camera.create({
        data: createCamera,
        select: {
            id: true,
            name: true,
            path: true,
            input: true,
            recordInput: true,
            continuous: true,
            inputConfig: true,
            liveConfig: true 
        }
    });
};

const createPTZ = async (request) => {
    const createCamera = validate(CreateCameraPTZRequestSchema, request);

    // await checkRtspUrl(createCamera.input);

    // if (createCamera.continuous && createCamera.recordInput) {
    //     await checkRtspUrl(createCamera.recordInput);
    // }

    const totalCameraWithSameCamera = await prismaClient.pTZCamera.count({
        where: {
            id: createCamera.id,
            input: createCamera.input,
            name: createCamera.name,
            path: createCamera.path
        }
    });

    createCamera.inputConfig = {
        use_wallclock_as_timestamps: "1",
        fflags: "+igndts",
        analyzeduration: "1000000",
        probesize: "1000000",
        rtsp_transport: "tcp",
        stimeout : "30000000"
    };
    
    createCamera.liveConfig = {
        codecString: 'video/mp4; codecs="avc1.64001f"',
        streamConfig: {
            an: "",
            vcodec: "copy",
            f: "mp4",
            movflags: "+frag_keyframe+empty_moov+default_base_moof",
            reset_timestamps: "1"
        }
    };

    if (totalCameraWithSameCamera !== 0) {
        throw new ResponseError(400, "Camera already exists");
    }

    return prismaClient.pTZCamera.create({
        data: createCamera,
        select: {
            id: true,
            name: true,
            path: true,
            input: true,
            recordInput: true,
            continuous: true,
            inputConfig: true,
            liveConfig: true,
            host_ip: true,
            onvif_user: true,
            onvif_password: true
        }
    });
};

const getAllPTZ = async () => {
    const cameras = await prismaClient.pTZCamera.findMany();
    return cameras;
};

const getAll = async () => {
    const cameras = await prismaClient.camera.findMany();
    return cameras;
};

const getCameraById = async (id) => {
    const camera = await prismaClient.camera.findUnique({
        where: {
            id: id
        }
    });
    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }
    return camera;
};
const updateCamera = async (id, request) => {
    const updateCamera = validate(UpdateCameraRequestSchema, request);

    const camera = await prismaClient.camera.findUnique({
        where: {
            id: id
        }
    });
    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }
    return prismaClient.camera.update({
        where: {
            id: id
        },
        data: updateCamera,
        select: {
            id: true,
            name: true,
            path: true,
            input: true,
            recordInput: true,
            continuous: true,
            inputConfig: true,
            liveConfig: true 
        }
    });    
};

const deleteCamera = async (id) => {
    const camera = await prismaClient.camera.findUnique({
        where: {
            id: id
        }
    });
    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }
    return prismaClient.camera.delete({
        where: {
            id: id
        }
    });
};

const getStatusCamera = async (id) => {
    if (!id) {
        throw new ResponseError(400, "Camera ID is required");
    }

    const camera = await prismaClient.camera.findUnique({
        where: {
            id: id
        }
    });

    if (!camera) {
        throw new ResponseError(404, "Camera not found");
    }

    return {
        id: camera.id,
        name: camera.name,
        isActive: camera.isActive,
        is_online: camera.is_online,
        continuous: camera.continuous
    };
};
const getAllCamerasStatus = async () => {
    const cameras = await prismaClient.camera.findMany({
        select: {
            id: true,
            name: true,
            isActive: true,
            is_online: true,
            continuous: true
        }   
    });
    return cameras.map(camera => ({
        id: camera.id,
        name: camera.name,
        isActive: camera.isActive,
        IsOnline: camera.is_online,
        continuous: camera.continuous
    }));
};



module.exports = {
    create,
    getAll,
    getCameraById,
    updateCamera,
    deleteCamera,
    getStatusCamera,
    getAllCamerasStatus,
    createPTZ,
    getAllPTZ,
};
