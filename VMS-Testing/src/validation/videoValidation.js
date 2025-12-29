const { z } = require("zod");

const MultipleVideosRequestSchema = z.object({
    filenames: z.array(z.string().min(1, "Filename is required"))
});

module.exports = {  MultipleVideosRequestSchema };