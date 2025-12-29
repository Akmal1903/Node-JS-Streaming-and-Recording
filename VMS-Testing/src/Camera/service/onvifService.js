const {Cam} = require("onvif");
const { prismaClient } = require("../../helper/database");
const { validate } = require("../../validation/validation");
const { OnvifCameraSchema } = require("../../validation/onvifValidation");
const { ResponseError } = require("../../error/responseError");

const camera = async (id) => {

  const ptzCamera = await prismaClient.pTZCamera.findUnique({
    where: { id: id },
  });

  if (!ptzCamera) {
    throw new ResponseError(404, `Camera with id ${id} not found`);
  }

  return new Promise((resolve, reject) => {

    const cam = new Cam(
      {
        hostname: ptzCamera.host_ip,   // contoh: "192.168.1.100"
        username: ptzCamera.onvif_user,   // "admin"
        password: ptzCamera.onvif_password,   // "12345"
        port: 80
      },
      function (err) {
        if (err) {
          return reject(err);
        }

        const result = {
          hostname: this.hostname,
          name: this.name,
          time: this.time,
        };

        // ambil info device
        this.getDeviceInformation((err, info) => {
          if (!err) {
            result.deviceInfo = info;
          }

          // ambil RTSP URL
          this.getStreamUri({ protocol: "RTSP" }, (err, stream) => {
            if (!err) {
              result.rtspUrl = stream.uri;
            }

            resolve(result);
          });
        });
      }
    );
  });
};

const ptzMove = async (id, request) => {

  const ptzCamera = await prismaClient.pTZCamera.findUnique({
    where: { id: id },
  });

  if (!ptzCamera) {
    throw new ResponseError(404, `Camera with id ${id} not found`);
  }

  return new Promise((resolve, reject) => {
    let cam;

    cam = new Cam({
      hostname: ptzCamera.host_ip,  
      username: ptzCamera.onvif_user,   
      password: ptzCamera.onvif_password,   
      port: 80
    }, function (err) {
      if (err) {
        return reject("Koneksi kamera gagal: " + err.message);
      }

      console.log("Terhubung ke kamera:", this.hostname);

      // Validasi request dengan zod
      const onvifCameraSchema = OnvifCameraSchema.parse(request);

      // Gerakkan kamera
      this.continuousMove(onvifCameraSchema, (err) => {
        if (err) return reject("Gagal gerakkan kamera: " + err.message);

        // Hentikan gerakan setelah 1 detik
        setTimeout(() => {
          this.stop({ panTilt: true, zoom: true }, (err) => {
            if (err) return reject("Gagal stop PTZ: " + err.message);
            resolve("Gerakan PTZ selesai");
          });
        }, 1000);
      });
    });
  });
};

module.exports = {
  camera,
  ptzMove
};