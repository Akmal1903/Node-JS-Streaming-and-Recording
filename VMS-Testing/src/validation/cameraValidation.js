const { z } = require("zod");

const CreateCameraRequestSchema = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    floor: z.string().optional(),
    input: z.string().url("Invalid URL Input"),
    recordInput: z.string().url("Invalid URL Input"),
    continuous: z.boolean().optional(),
    isActive: z.boolean().optional(),
    inputConfig: z.any().optional(),
    liveConfig: z.any().optional()
});

const CreateCameraPTZRequestSchema = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    floor: z.string().optional(),
    input: z.string().url("Invalid URL Input"),
    recordInput: z.string().url("Invalid URL Input"),
    continuous: z.boolean().optional(),
    isActive: z.boolean().optional(),
    inputConfig: z.any().optional(),
    liveConfig: z.any().optional(),
    host_ip: z.string().ip(),
    onvif_user: z.string().optional(),
    onvif_password: z.string().optional(),
});

const UpdateCameraRequestSchema = z.object({
    name: z.string().min(4).max(50).optional(),
    path: z.string().min(4).max(50).optional(),
    floor: z.string().min(4).max(50).optional(),
});

const UpdateInputRequestSchema = z.object({
    input: z.string().url("Invalid URL Input"),
});

const UpdateRecordInputRequestSchema = z.object({
    recordInput: z.string().url("Invalid URL Input"),
});

const UpdateCameraRecordRequestSchema = z.object({
    id: z.array(z.string().transform(s => s.toUpperCase())),
    continuous: z.boolean(),
})


module.exports = {
    CreateCameraRequestSchema,
    UpdateCameraRequestSchema,
    UpdateCameraRecordRequestSchema,
    CreateCameraPTZRequestSchema,
    UpdateInputRequestSchema,
    UpdateRecordInputRequestSchema
};

