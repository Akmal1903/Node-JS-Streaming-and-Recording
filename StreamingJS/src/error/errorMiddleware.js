const { ResponseError } = require("./responseError");

// Di error middleware
const errorMiddleware = (err, req, res, next) => {
    const status = err.status || 500;
    console.error(`[${new Date().toISOString()}] Error:`, {
        path: req.path,
        method: req.method,
        body: req.body,
        error: err.stack
    });
    
    res.status(status).json({
        error: {
            //code: err.code || 'UNKNOWN_ERROR',
            message: err.message,
            //details: err.details || [],
            //timestamp: new Date().toISOString()
        }
    });
};

module.exports = {
    errorMiddleware
};
