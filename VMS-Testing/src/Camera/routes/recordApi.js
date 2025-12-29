const express = require("express");
const cameraController = require("../controller/cameraController");
const videoController = require("../controller/videoController");
const onvifController = require("../controller/onvifController");
const panicButtonController = require("../controller/panicButtonController");
const recordController = require("../controller/recordController");

const routerRecord = express.Router();

routerRecord.post('/api/create/camera', cameraController.createCamera);
routerRecord.get('/api/cameras', cameraController.getAllCamera);
routerRecord.get('/api/camera/:id', cameraController.getCameraById);
routerRecord.put('/api/update/camera/:id', cameraController.updateCamera);
routerRecord.delete('/api/delete/camera/:id', cameraController.deleteCamera);
routerRecord.put('/api/record/update/cameras', recordController.updateMultipleCameraRecord);
routerRecord.post('/api/record/restart/camera/:id', recordController.restartRecord);
routerRecord.post('/api/record/stop/camera/:id', recordController.stopRecord);
routerRecord.post('/api/record/start/camera/:id', recordController.startRecord);
routerRecord.put('/api/record/update/camera/:id', recordController.updateCameraRecordInput);
routerRecord.get('/api/video/:camId/:filename', videoController.getVideo); 
routerRecord.get('/api/videos/:camId', videoController.getVideoList);
routerRecord.get('/api/download/video/:camId/:filename', videoController.downloadVideo);
routerRecord.post('/api/download/videos/:camId', videoController.downloadVideoZip);
routerRecord.get("/api/timeline/:camId", videoController.getTimeline);
routerRecord.get("/api/videos/:locID/:filename", videoController.getVideoSequence);
routerRecord.delete("/api/video/delete/:camId/:filename", videoController.deleteVideoFile);
routerRecord.post("/api/videos/delete/:camId", videoController.deleteMultipleVideos);
routerRecord.get("/api/camera/status/:id", cameraController.getStatusCamera);
routerRecord.get("/api/cameras/status", cameraController.getAllCamerasStatus);
routerRecord.get("/api/ptz/cameras", cameraController.getAllPTZ);
routerRecord.post("/api/create/ptz/camera", cameraController.createCameraPTZ);
routerRecord.get("/api/onvif/discover/:id", onvifController.discoverCameras);
routerRecord.post("/api/onvif/ptz/move/:id", onvifController.ptzMove);
routerRecord.post("/api/start/panic/:camId", panicButtonController.startPanicRecording);
routerRecord.post("/api/stop/panic/:camId", panicButtonController.stopPanicRecording);
routerRecord.get("/api/panic/video/:camId/:filename", panicButtonController.getPanicVideo);


module.exports = {
    routerRecord
};