const { z } = require("zod");

// Schema validasi PTZ
const OnvifCameraSchema = z.object({
  x: z.number().min(-1).max(1),   // range -1 sampai 1
  y: z.number().min(-1).max(1),   // range -1 sampai 1
  zoom: z.number().min(-1).max(1).optional()
});

module.exports = {
  OnvifCameraSchema
};