const { InitRecordingService } = require('../Camera/service/recordService.js');
const { prismaClient } = require('../helper/database.js');
const config = require('../../vms.config.js');

class CameraManager {
    constructor() {
        this.processorsRecord = {}; 
        this.processorsRecordNonAnalitik = {};
        this.queues = {};
        this.cameraIdListSub = ['BPW1', 'BPW2', 'BVHLA', 'BVHLB', 'BWWA', 'BWWB', 'BDGF1',
                                'BDGF2', 'CTWK1', 'CTWK2', 'ENVR', 'GRDN1', 'GRDN2', 'GRDN3',
                                'GRMKA', 'GRMKB', 'JBKXVI', 'JBKXVIIB', 'KLJBK', 'LVGPZ', 'MTTLA', 
                                'MTTLB', 'MVLD1',  'MVLD4', 'NSN1', 'NSN2', 'PRDSA', 'PRDSB', 
                                'PTGKD', 'PT1K', 'PT1MA', 'PT1MB','PT2K', 'PT2M', 'PT7K', 
                                'PT7M', 'PT9AK', 'PT9AM', 'PT9BA', 'PT9BB', 'PRS1', 'PRS2', 
                                'RSAM','RKDJVA', 'RKDJVB', 'STNG', 'SPCT1', 'SPCT2', 'SPCT3', 
                                'THA1A', 'THA1B', 'THA2', 'WTR1', 'WTR2', 'HLJA', 'HLJB', 
                                'MVLD2', 'MVLD3', 'DRN01',
                                "PJBK1", "EPTU1", "CSKIJC1", "PTU9", "DALM", "KM29", "SCMO", "ESGNS", "PRLS", "SGMZ", "OTWA",
                                "CKIJI", "PTLNG", "UTMN", "SGLR", "CKIJS", "MATL", "BLKT", "ARPD", "RZAR", "RKHO", "PTKD",
                                "PCGN", "PTU10", "PTUKIJ7",
                                "PSKH", "PKDH", "PBKMM", "BKPW", "JBTNG", "PJBTNG", "PSICT"
                                //"MVLD3", "RSAM", "CTWK1", "MVLD2", "MVLD4", "PT9AK", "JBKXVIIB", "PT7M", "PT1K", "PT2M" 
                                ];
        this.cameraIdListMain = ["PTU5", "PTU8", "PTAK6", "ICRKEC1", "JMOPM2", "SGML", "WTP1RN", "IDCR", "JKIJ5", "RKTRC2", "ICRKEO1", 
                                // "SGMLB", "WTP2GP", "RKRY", "CHKR", "TUPR", "ICRKE02", "JMOL3L", "UKMB", "WTP2CCTVPOS", "TAWN", 
                                // "BPW3", "GRBP", "ICRKEP", "JMOL3S", "UKMP", "WTP2RM", "PBRR", "BUMJ", "BDRNS", "C2KIJ9", 
                                //"JMODG", "JMOSG", "WTP1", "MCD", "TTKC", "STDN", "C3KIJ9", "JMOPM1", "WTP1P1", "JMOTL",
                                "PCCTWK",
                                "RDLF", "YSFU", "ASRM", "ETLERL", "SGLRN", "PTU72", "PTU2",
                                "PSNIA", "PSNIB", "PBLK", "SLABO", "PSBMM", "PSN3", "PSN1", "PAVE"
                                ]
    }

    async initAllCameras(record) {
        const cameras = await prismaClient.camera.findMany();
        const ptzCameras = await prismaClient.pTZCamera.findMany();
        const allCameras = [
            ...cameras.map(c => ({ ...c, isPTZ: false })), 
            ...ptzCameras.map(c => ({ ...c, isPTZ: true }))
        ];

        for (const cam of allCameras) {
            console.log(`[INIT] Processing ${cam.isPTZ ? "PTZ Camera" : "Camera"} ${cam.id} | Active=${cam.isActive}`);

            if (cam.isActive && (this.cameraIdListSub.includes(cam.id) || this.cameraIdListMain.includes(cam.id))) {
                this.initCamera(cam, record);
            } else {
                console.log(`[SKIP] Camera ${cam.id} is not in today's list or inactive.`);
            }
        }
    }

    initCamera(camera, record) {
        try {
            if (!camera?.id) {
                console.error('Invalid camera data for InitCamera.');
                return;
            }

            // Hentikan proses recording lama jika ada
            if (record && this.processorsRecord[camera.id]) {
                console.log(`[CLEANUP] Stopping existing analitik record processor for ${camera.id}`);
                const oldProcessorRecord = this.processorsRecord[camera.id];
                delete this.processorsRecord[camera.id];
                oldProcessorRecord.stop().catch(console.error);
            }

            if (record && this.processorsRecordNonAnalitik[camera.id]) {
                console.log(`[CLEANUP] Stopping existing non-analitik record processor for ${camera.id}`);
                const oldProcessorRecord = this.processorsRecordNonAnalitik[camera.id];
                delete this.processorsRecordNonAnalitik[camera.id];
                oldProcessorRecord.stop().catch(console.error);
            }

            // Inisialisasi recording baru berdasarkan tipe
            if (record && this.cameraIdListSub.includes(camera.id)) {
                const recordProcessor = InitRecordingService(
                    camera, 
                    camera.id, 
                    this.processorsRecord,
                    config,
                    true,   // analitik = true
                    false   // panic = false
                );
                this.processorsRecord[camera.id] = recordProcessor;
                console.log(`[INIT] Camera ${camera.id} Analitik recording initialized successfully`);
            }

            if (record && this.cameraIdListMain.includes(camera.id)) {
                const panicMode = (camera.id === "PCCTWK" || camera.id === "PCLVGPZ");
                const recordProcessorNonAnalitik = InitRecordingService(
                    camera,
                    camera.id,
                    this.processorsRecordNonAnalitik,
                    config,
                    false,  // analitik = false
                    panicMode
                );
                this.processorsRecordNonAnalitik[camera.id] = recordProcessorNonAnalitik;
                console.log(`[INIT] Camera ${camera.id} Non Analitik recording initialized successfully (panic: ${panicMode})`);
            }
        } catch (error) {
            console.error(`[INIT] Failed to initialize camera ${camera.id}:`, error);
        }
    }

    async enqueue(cameraId, task) {
        if (!this.queues[cameraId]) {
            this.queues[cameraId] = Promise.resolve();
        }
        const chain = this.queues[cameraId]
            .then(async () => {
                await task();
            })
            .catch(err => {
                console.error(`[QUEUE] Task failed for ${cameraId}:`, err);
            })
            .finally(() => {
                if (this.queues[cameraId] === chain) {
                    delete this.queues[cameraId];
                }
            });

        this.queues[cameraId] = chain;
        return chain;
    }

    async restartCamera(camera, record) {
        return this.enqueue(camera.id, async () => {
            console.log(`[RESTART] Starting restart for ${camera.id}`);
            
            await this.stopCamera(camera.id, record);
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (record && this.processorsRecord[camera.id]) {
                console.log(`[CLEANUP] Removing stale record processor for ${camera.id}`);
                delete this.processorsRecord[camera.id];
            }

            if (record && this.processorsRecordNonAnalitik[camera.id]) {
                console.log(`[CLEANUP] Removing stale record processor for ${camera.id}`);
                delete this.processorsRecordNonAnalitik[camera.id];
            }
            
            this.initCamera(camera, record);
        });
    }
    

    async stopCamera(cameraId, record) {
        const processorRecord = this.processorsRecord[cameraId];
        const processorRecordNonAnalitik = this.processorsRecordNonAnalitik[cameraId];

        if (!processorRecord && !processorRecordNonAnalitik) {
            console.warn(`[STOP] Processor for camera ${cameraId} not found.`);
            return;
        }

        console.log(`[STOP] Stopping camera ${cameraId}...`);

        if (record && processorRecord?.stop) {
            await processorRecord.stop();
            delete this.processorsRecord[cameraId];
        }

        if (record && processorRecordNonAnalitik?.stop) {
            await processorRecordNonAnalitik.stop();
            delete this.processorsRecordNonAnalitik[cameraId];
        }

        console.log(`[STOP] Camera ${cameraId} stopped.`);
    }

    async stopAllCameras(record) {
        const cameraIdsAnalitik = Object.keys(this.processorsRecord);
        const cameraIdsNonAnalitik = Object.keys(this.processorsRecordNonAnalitik);
        
        console.log(`[STOP ALL] Stopping all cameras: 
            Analitik: ${cameraIdsAnalitik.join(', ')} 
            Non-Analitik: ${cameraIdsNonAnalitik.join(', ')}`);

        for (const cameraId of cameraIdsAnalitik) {
            await this.stopCamera(cameraId, record);
        }
        
        for (const cameraId of cameraIdsNonAnalitik) {
            await this.stopCamera(cameraId, record);
        }
        
        console.log(`[STOP ALL] All cameras stopped.`);
    }
}

module.exports = new CameraManager();
