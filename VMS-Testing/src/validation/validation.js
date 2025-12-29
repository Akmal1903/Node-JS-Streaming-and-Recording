const { ResponseError } = require('../error/responseError.js');

const validate = (schema, request) => {
    const result = schema.safeParse(request);

    if (!result.success) {
        const errorMessage = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new ResponseError(400, errorMessage);
    }

    return result.data;
};

module.exports = {
    validate
};
