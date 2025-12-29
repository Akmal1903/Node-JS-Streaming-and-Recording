const cron = require('node-cron');
const { logger } = require('./helper/logging.js');
const cameraManager = require('./manager/CameraManager.js');
const MetricsService = require('./Camera/service/metricsService.js');
const { runCleanupIfNeeded, copyVideotoNAS } = require('./Camera/service/cronService.js');
const { HTTP, SocketIO } = require('./helper/web.js');



const metricsService = new MetricsService(SocketIO);


async function start() {


    await cameraManager.initAllCameras(true);

    HTTP.listen(7885, "0.0.0.0", () => {
        logger.info(`Record server running on port ${process.env.PORT}`);
        metricsService.start(1000); 
    });
    HTTP.on("error", (err) => {
        logger.error(err);
    });
}

start();

async function gracefulShutdown() {
    console.log('Received shutdown signal, stopping all cameras gracefully...');
    await cameraManager.stopAllCameras(true);
    metricsService.stop();
    console.log('Shutdown completed');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGQUIT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// cron.schedule('* * * * *', () => {
//     console.log('Running storage cleanup cron...');
//     runCleanupIfNeeded();
// });

cron.schedule('0 0 * * *', () => {
    console.log('Running copy cron...');
    copyVideotoNAS();
});