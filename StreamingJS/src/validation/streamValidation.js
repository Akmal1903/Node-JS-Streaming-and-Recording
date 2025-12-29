const { z } = require("zod");

const UpdateInputRequestSchema = z.object({
    input: z.string().url("Invalid URL Input"),
});