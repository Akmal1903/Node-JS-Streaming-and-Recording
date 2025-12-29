const express = require('express');
const cookieparser = require('cookie-parser');
const bcrypt = require('bcrypt');
const http = require('http');
const io = require('socket.io');
const handlebars = require('handlebars');
const childprocess = require('child_process');
const MP4Frag = require('./src/core/MP4Frag');
const fs = require('fs');
var cors = require('cors')
const os = require('os');
const path = require('path');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
const RateLimiter = require('express-rate-limit');
const Mp4Frag = require('./src/core/MP4Frag');

console.log(' - Checking config.');
// pembuatan dan pembacaan file konfigurasi ---------------------------------------------------------
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
// pembuatan dan pembacaan file konfigurasi ---------------------------------------------------------


console.log(' - Checking volumes and ffmpeg.');
// pembuatan dan pembacaan direktori penyimpanan video ---------------------------------------------------------
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
// pembuatan dan pembacaan direktori penyimpanan video ---------------------------------------------------------


// pembacaan ffmpeg ---------------------------------------------------------
if (!fs.existsSync(config.system.ffmpegLocation)) {
	console.log(
		'ffmpeg not found in specifed location: ' + config.system.ffmpegLocation
	);
	process.exit(0);
}
// pembacaan ffmpeg ---------------------------------------------------------


const IOLimiter = RateLimiter({
	windowMs: 2000,
	max: 100
});

console.log(' - Creating express application.');
const App = new express();
App.use(IOLimiter);
App.use(cors())
App.use(express.json());
App.use(cookieparser(config.system.cookieKey));
const HTTP = new http.Server(App);

// Menampilkan list video dalam suatu direktori -------------------------------------------- (built in NVRJS)
App.get('/getVideo/:path', (req, res) => {
	const directoryPath = `./web/static/video/CAMERA_RECORDINGS/${req.params.path}`;
	const files = fs.readdirSync(directoryPath);
	const videoFiles = files.filter(file => file.endsWith('.mp4'));
	res.json({message: "Success", data: videoFiles.map(filename => `/static/video/CAMERA_RECORDINGS/${req.params.path}/${filename}`)});
})
// Menampilkan list video dalam suatu direktori --------------------------------------------


// Static
App.use('/static', express.static(path.join(__dirname, 'web', 'static')));

// get Cameras
App.get('/api/cameras', (req, res) => {
	const Cams = [];

	Object.keys(config.cameras).forEach((ID) => {
		const Cam = config.cameras[ID];
		Cams.push({ id: ID, name: Cam.name, continuous: Cam.continuous });
	});

	res.type('application/json');
	res.status(200);
	res.end(JSON.stringify(Cams));
});

// Endpoint untuk mengirim video (TESTING)
// App.get('/api/video/:filename', (req, res) => {
//     const videoPath = path.join(__dirname, 'web/static/video/CAMERA_RECORDINGS/ENVR', req.params.filename);
//     // Periksa apakah file ada sebelum mengirimkan
//     res.sendFile(videoPath, (err) => {
//         if (err) {
//             console.error('Error sending file:', err.message);
//             if (!res.headersSent) {
//                 res.status(404).json({ error: 'Video not found' });
//             }
//         }
//     });
// });

// --------------------------------------------------------------------------------------------------------
// Fungsi untuk mengonversi nama file menjadi objek Date
const extractTimeFromFilename = (filename) => {
	const timeStr = filename.split('.')[0]; // Mengambil bagian waktu dari nama file, misalnya "2025-01-06T13-01-05"
	return new Date(`${timeStr}Z`);
};

// Fungsi untuk menghitung perbedaan waktu (dalam milidetik) antara dua waktu
const getTimeDifference = (time1, time2) => {
	return Math.abs(time1 - time2);
};

// Endpoint untuk daftar video terkait
App.get('/api/videos/:locID/:filename', (req, res) => {
	const videosDir = path.join(`/mnt/vms-data/CAMERA_RECORDINGS/${req.params.locID}`);
	const requestedFile = req.params.filename;
	const requestedFileTime = extractTimeFromFilename(requestedFile); // Ambil waktu dari nama file yang diminta

	fs.readdir(videosDir, (err, files) => {
		if (err) {
			console.error('Error reading directory:', err.message);
			return res.status(500).json({ error: 'Internal Server Error' });
		}

		// Urutkan files aslinya
		const realFiles = files.sort();

		// Filter file yang memiliki ekstensi .mp4 (atau file video lainnya yang Anda gunakan)
		const videoFiles = files.filter(file => file.endsWith('.mp4'));

		if (videoFiles.length === 0) {
			return res.status(404).json({ error: 'No video files found' });
		}

		// Urutkan file berdasarkan kedekatan waktu dengan file yang diminta
		const sortedFiles = videoFiles.sort((a, b) => {
			const aTime = extractTimeFromFilename(a);
			const bTime = extractTimeFromFilename(b);
		
			const diffA = getTimeDifference(aTime, requestedFileTime);
			const diffB = getTimeDifference(bTime, requestedFileTime);
		
			return diffA - diffB; // Urutkan berdasarkan perbedaan waktu yang terkecil
		});
		
		// Temukan video sebelumnya, saat ini, dan setelahnya
		let currentIndex = sortedFiles.findIndex(file => file === requestedFile);
		
		let currentVideo;
		if (currentIndex === -1) {
			// Jika tidak ada file yang persis dengan requestedFile, pilih file yang paling mendekati
			currentVideo = sortedFiles[0]; // File yang paling mendekati waktu yang diminta
		} else {
			// Jika ditemukan file yang persis, gunakan itu sebagai current
			currentVideo = requestedFile;
		}

		currentIndex = realFiles.indexOf(currentVideo);

		// const previous = realFiles[currentIndex - 1] || null;
		// const next = realFiles[currentIndex + 1] || null;
		const previous = null;
		const next = null;

		res.json({
			previous,
			current: currentVideo,
			next
		});
	});
});

// Endpoint untuk mengirim video
App.get('/api/video/:locID/:filename', (req, res) => {
	const videoPath = path.join(`/mnt/vms-data/CAMERA_RECORDINGS/${req.params.locID}/${req.params.filename}`);
	res.sendFile(videoPath, (err) => {
		if (err) {
			console.error('Error sending file:', err.message);
			if (!res.headersSent) {
				res.status(404).json({ error: 'Video not found' });
			}
		}
	});
});
// --------------------------------------------------------------------------------------------------------

const Processors = {};
const Cameras = Object.keys(config.cameras);
Cameras.forEach((cameraID) => {
	const Cam = config.cameras[cameraID];
	InitCamera(Cam, cameraID);

});

function InitCamera(Cam, cameraID) {
	console.log(' - Configuring camera: ' + Cam.name);

	const CommandArgs = [];

	Object.keys(Cam.inputConfig).forEach((inputConfigKey) => {
		if (inputConfigKey !== 'i') {
			CommandArgs.push('-' + inputConfigKey);
			if (Cam.inputConfig[inputConfigKey].length > 0) {
				CommandArgs.push(Cam.inputConfig[inputConfigKey]);
			}
		}
	});

	CommandArgs.push('-i');
	CommandArgs.push(Cam.input);

	App.use(
		'/segments/' + cameraID,
		express.static(
			path.join(
				config.system.storageVolume,
				'CAMERA_RECORDINGS',
				cameraID
			),
			{ acceptRanges: true }
		)
	);

	const Path = path.join(
		config.system.storageVolume,
		'CAMERA_RECORDINGS',
		cameraID
	);
	if (!fs.existsSync(Path)) {
		fs.mkdirSync(Path);
	}

	if (Cam.continuous !== undefined && Cam.continuous) {
		CommandArgs.push('-c:v');
		CommandArgs.push('copy');
		CommandArgs.push('-c:a');
		CommandArgs.push('copy');
		CommandArgs.push('-f');
		CommandArgs.push('segment');
		CommandArgs.push('-movflags');
		CommandArgs.push('+faststart');
		CommandArgs.push('-segment_atclocktime');
		CommandArgs.push('1');
		CommandArgs.push('-reset_timestamps');
		CommandArgs.push('1');
		CommandArgs.push('-strftime');
		CommandArgs.push('1');
		CommandArgs.push('-segment_list');
		CommandArgs.push('pipe:4');
		CommandArgs.push('-segment_time');
		CommandArgs.push(60 * config.system.continuousSegTimeMinutes);
		CommandArgs.push(path.join(Path, '%Y-%m-%dT%H:%M:%S.mp4'));
	}

	Object.keys(Cam.liveConfig.streamConfig).forEach((streamingConfigKey) => {
		CommandArgs.push('-' + streamingConfigKey);
		if (Cam.liveConfig.streamConfig[streamingConfigKey].length > 0) {
			CommandArgs.push(Cam.liveConfig.streamConfig[streamingConfigKey]);
		}
	});

	CommandArgs.push('-metadata');
	CommandArgs.push('title="Stream"');
	CommandArgs.push('pipe:3');

	const Options = {
		detached: true,
		stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']
	};
	const respawn = (Spawned) => {
		const MP4F = new MP4Frag();

		const IOptions = {
			path: '/streams/' + cameraID,
			cors: {
				origin: "*"
			}
		};
		const Socket = io(HTTP, IOptions);
		Socket.on('connection', (ClientSocket) => {
			console.log(`New connection: Total listeners on 'error': ${ClientSocket.listenerCount('error')}`);
			ClientSocket.emit('segment', MP4F.initialization);
			ClientSocket.on('disconnect', () => {
				console.log('Client disconnected');
				ClientSocket.removeAllListeners();
			});
		});

		MP4F.on('segment', (data) => {
			Socket.sockets.sockets.forEach((ClientSocket) => {
				ClientSocket.emit('segment', data);
			});
		});

		Spawned.on('close', () => {
			console.log(
				' - Camera: ' +
					Cam.name +
					' was terminated, respawning after 10 seconds...'
			);
			Spawned.kill();
			MP4F.destroy();
			setTimeout(() => {
				respawn(
					childprocess.spawn(config.system.ffmpegLocation, CommandArgs, Options)
				);
			}, 10000);
		});

		Spawned.stdio[3].on('data', (data) => {
			MP4F.write(data, 'binary');
		});
		Spawned.stdio[4].on('data', (FN) => {
			if (Processors[cameraID] !== undefined) {
				const FileName = FN.toString().trim().replace(/\n/g, '');
				const Start = dayjs(
					FileName.replace(/.mp4/g, ''),
					'YYYY-MM-DDTHH-mm-ss'
				).unix();
				const End = dayjs().unix();
			}
		});
	};

	respawn(
		childprocess.spawn(config.system.ffmpegLocation, CommandArgs, Options)
	);

	Processors[cameraID] = {
		CameraInfo: Cam
	};
}

HTTP.listen(config.system.interfacePort);
console.log(' - VMS is Ready!');
