module.exports = {
	/* System Settings */
	system: {
		/* Username */
		username: "admin",
		/* bcrypt password (default: admin) */
		password: '$2a$10$CnOx/6vFY2ehRDf68yqd..aLlv0UM.zeBLKnRjuU8YykCsC2Ap3iG',
		/* bcrypt API Key (default: x7Te9m38JHQq6ddv) */
		apiKey: '$2a$10$N53ci.EIQ7JCu6u1HlOjoO//W0Bmp3GrRruyK1Jysr01CQ1rDrVQK',
		/* Any random string */
		cookieKey: 'f3gi6FLhIPVV31d1TBQUPEAngrI3wAoP',
		interfacePort: 7878,
		interfaceRecordPort: 7885,
		/* location used for 24/7 recording and database generation */
		/* This should be the root of a mount point i.e a dedicated HDD for 24/7 recordings */
		storageVolume: '/home/user/VMS/VMSV5/VMS-Testing/Volumes/CCTV',
		storageNASVolume: "/mnt/nas01/vms-data",
		storagePanicButton: '/home/user/VMS/VMSV4/VMS-Testing/Volumes/Panic',
		cacheVolume: '/home/user/VMS/VMSV4/VMS-Testing/Volumes/CACHE',
		/* Continuous recording settings */
		ffmpegLocation: '/usr/local/bin/ffmpeg',
		continuousSegTimeMinutes: 1,
		continuousDays: 14,
		continuousPurgeIntervalHours: 24,
		/* event throttle per sensorId */
		eventSensorIdCoolOffSeconds: 60
	},
};
