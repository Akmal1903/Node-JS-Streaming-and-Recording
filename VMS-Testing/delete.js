
const fs = require('fs');
const os = require('os');
const path = require('path');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
const cron = require('node-cron');

console.log(' - Checking config.');
if (!fs.existsSync(path.join(os.homedir(), 'vms.config.js'))) {
    fs.copyFileSync(
        path.join(__dirname, 'example.config.js'),
        path.join(os.homedir(), 'vms.config.js')
    );
    console.log(
        ' - New config created: ' + path.join(os.homedir(), 'vms.config.js')
    );
    console.log(' - Edit config to suite and restart!');
    process.exit(0);
}
const config = require(path.join(os.homedir(), 'vms.config.js'));
console.log(' - Config loaded: ' + path.join(os.homedir(), 'vms.config.js'));

console.log(' - Checking volumes and ffmpeg.');

if (!fs.existsSync(config.system.storageVolume)) {
    console.log(' - Storage volume does not exist');
    process.exit();
} else {
    try {
        if (
            !fs.existsSync(
                path.join(config.system.storageVolume, 'CAMERA_RECORDINGS')
            )
        ) {
            fs.mkdirSync(
                path.join(config.system.storageVolume, 'CAMERA_RECORDINGS')
            );
        }
    } catch (e) {
        console.log('Error creating system directories.');
        console.log(e.message);
        process.exit(0);
    }
}

if (!fs.existsSync(config.system.ffmpegLocation)) {
    console.log(
        'ffmpeg not found in specifed location: ' + config.system.ffmpegLocation
    );
    process.exit(0);
}


const cameraIDs = Object.keys(config.cameras);

cron.schedule('* * * * *', () => {
    console.log('Mulai bersihin file di PLAYBACK...');

    cameraIDs.forEach(cameraID => {
        const playbackPath = path.join(config.system.storageVolume, 'CAMERA_RECORDINGS', cameraID);

        // Cek direktori
        if (fs.existsSync(playbackPath)) {
            fs.readdir(playbackPath, (err, files) => {
                if (err) {
                    console.error(`Error baca folder ${cameraID}:`, err.message);
                    return;
                }

                // Hapus semua file dalam folder
                files.forEach(file => {
                    const filePath = path.join(playbackPath, file);
                    fs.unlink(filePath, err => {
                        if (err) console.error(`Gagal hapus ${file}:`, err.message);
                    });
                });

                console.log(`Berhasil hapus semua file di ${cameraID}`);
            });
        } else {
            console.log(`Folder ${cameraID} nggak ada, lewati...`);
        }
    });
}, {
    timezone: 'Asia/Jakarta'  
});