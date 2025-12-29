// const si = require('systeminformation');

// class MetricsService {
//   constructor(io) {
//     this.io = io.of('/metrics');  // Gunakan namespace /metrics
//     this.interval = null;
//   }

//     async start(intervalMs = 1000) {
//         this.interval = setInterval(async () => {
//         try {
//             const metrics = await this._getMetrics();
//             this.io.emit('update', metrics);
//         } catch (err) {
//             console.error('Error getting system metrics:', err);
//         }
//         }, intervalMs);
//     }

//     stop() {
//         clearInterval(this.interval); 
//     }

//     async _getMetrics() {
//         const [load, mem, disks, cpuInfo] = await Promise.all([
//         si.currentLoad(),
//         si.mem(),
//         si.fsSize(),
//         si.cpu()
//         ]);

//         const mainDisk = disks.find(d => d.mount === '/mnt/vms-data') || disks[0];

//         //console.log(mainDisk);  // Tambah log ini

//         //console.log(" load.currentload = ", load.currentLoad);  // Tambah log ini

//         return {
//             cpu: {
//                 percent: load.currentLoad,   // penggunaan CPU saat ini (%)
//                 cores: cpuInfo.cores         // jumlah core
//             },
//             memory: {
//                 total: mem.total,            // total RAM (bytes)
//                 used: mem.used,
//                 available : mem.available,              // RAM terpakai (bytes)
//                 percent: Math.round((mem.used / mem.total) * 100)
//             },
//             storage: {
//                 fs: mainDisk.fs,
//                 mount: mainDisk.mount,
//                 total: mainDisk.size,
//                 used: mainDisk.used,
//                 available: mainDisk.available,
//                 percent: Math.round((mainDisk.used / mainDisk.size) * 100)
//             }
//         };
//     }
// }

// module.exports = MetricsService;

const si = require('systeminformation');
const { execSync } = require('child_process');

class MetricsService {
  constructor(io) {
    this.io = io.of('/metrics');
    this.interval = null;
    this.cachedStorage = null;
    this.storageTimeout = null;
  }

  async start(intervalMs = 1000) {
    // Update CPU/memory setiap intervalMs
    this.interval = setInterval(async () => {
      try {
        const metrics = await this._getMetrics();
        this.io.emit('update', metrics);
      } catch (err) {
        console.error('Error getting system metrics:', err);
      }
    }, intervalMs);

    // Update storage setiap 60 detik
    const updateStorage = () => {
      this.cachedStorage = this._getNASUsage('/mnt/nas01');
      this.storageTimeout = setTimeout(updateStorage, 60000);
    };
    updateStorage();
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.storageTimeout);
  }

  _getNASUsage(mount) {
    try {
      const output = execSync(`df -k --output=size,used,avail ${mount} | tail -1`)
        .toString()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (output.length < 3)
        throw new Error(`df output tidak valid: ${output}`);

      let [totalKB, usedKB, availKB] = output.map(v => parseInt(v, 10) || 0);

      // Fallback jika total 0 → hitung dari used + available
      if (!totalKB) {
        totalKB = usedKB + availKB;
      }

      // Logging KB ke console
      console.log(
        `[NAS Storage] mount=${mount}, used=${usedKB} KB, available=${availKB} KB, total=${totalKB} KB`
      );

      return {
        fs: mount,
        mount,
        used: usedKB,
        available: availKB,
        percent: totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0,
      };
    } catch (err) {
      console.error('Gagal baca storage NAS:', err.message);
      return {
        fs: mount,
        mount,
        used: 0,
        available: 0,
        percent: 0,
      };
    }
  }

  async _getMetrics() {
    const [load, mem, cpuInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.cpu(),
    ]);

    return {
      cpu: {
        percent: load.currentLoad,
        cores: cpuInfo.cores,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        available: mem.available,
        percent: Math.round((mem.used / mem.total) * 100),
      },
      storage:
        this.cachedStorage || {
          fs: '/mnt/nas01',
          mount: '/mnt/nas01',
          usedKB: 0,
          availableKB: 0,
          percent: 0,
        },
    };
  }
}

module.exports = MetricsService;

