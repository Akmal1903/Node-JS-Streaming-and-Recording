const { set } = require("zod");
const { prismaClient } = require("../helper/database");
//const fs = require('fs').promises;
const path = require('path');
const config = require('../../vms.config.js');

// const { copyVideotoNAS } = require("../service/cronService");
// async function copyInputToRecordInput() {
//   try {
//     // Ambil semua kamera yang recordInput-nya kosong/null
//     const camerasToFix = await prismaClient.camera.findMany({
//       where: {
//         recordInput: null
//       }
//     });

//     console.log(`Ditemukan ${camerasToFix.length} kamera tanpa recordInput.`);

//     for (const cam of camerasToFix) {
//       await prismaClient.camera.update({
//         where: { id: cam.id },
//         data: { recordInput: cam.input }
//       });
//       console.log(`✔️ Kamera ${cam.id} - '${cam.name}' telah diupdate.`);
//     }

//     console.log("✅ Semua kamera berhasil diperbarui!");
//   } catch (err) {
//     console.error("❌ Error saat mengupdate kamera:", err);
//   } finally {
//     await prismaClient.$disconnect();
//   }
// }

// copyInputToRecordInput();

// async function setOfflineIfInactive() {
//     try {
//         const result = await prismaClient.camera.updateMany({
//             where: {
//                 isActive: true
//             },
//             data: {
//                 continuous : true
//             }
//         });
        
//         console.log(`✅ ${result.count} kamera di-set offline karena tidak aktif`);
//     } catch (error) {
//         console.error('❌ Gagal update status kamera:', error);
//     }
// }

//  setOfflineIfInactive();

// async function copyVideotoNAS() {
//     try {
//         // Dapatkan semua kamera dari database
//         const cameras = await prismaClient.camera.findMany();
        
//         // Loop melalui setiap kamera
//         for (const camera of cameras) {
//             const sourceDir = path.join(`${config.system.storageVolume}/CAMERA_RECORDINGS/${camera.id}`);
//             const destDir = path.join(`${config.system.storageNASVolume}/CAMERA_RECORDINGS/${camera.id}`);

//             try {
//                 // Periksa apakah direktori sumber ada
//                 try {
//                     await fs.access(sourceDir);
//                 } catch {
//                     console.log(`Directory not found, skipping: ${sourceDir}`);
//                     continue;
//                 }

//                 // Buat direktori tujuan jika belum ada
//                 await fs.mkdir(destDir, { recursive: true });

//                 // Baca semua file di direktori sumber
//                 const files = await fs.readdir(sourceDir);

//                 // Salin setiap file ke NAS
//                 for (const file of files) {
//                     const sourcePath = path.join(sourceDir, file);
//                     const destPath = path.join(destDir, file);
                    
//                     // Periksa apakah file sudah ada di NAS
//                     try {
//                         await fs.access(destPath);
//                         console.log(`File already exists, skipping: ${file}`);
//                         continue;
//                     } catch {
//                         // File tidak ada, lanjutkan dengan penyalinan
//                     }
                    
//                     await fs.copyFile(sourcePath, destPath);
//                     console.log(`Copied: ${file}`);
//                 }

//                 // Hapus semua file dari direktori sumber setelah penyalinan berhasil
//                 for (const file of files) {
//                     const sourcePath = path.join(sourceDir, file);
//                     await fs.unlink(sourcePath);
//                     console.log(`Deleted: ${file}`);
//                 }

//                 console.log(`All files moved successfully for camera ${camera.id}`);
//             } catch (error) {
//                 console.error(`Error processing camera ${camera.id}:`, error);
//                 // Lanjutkan ke kamera berikutnya meskipun ada error
//             }
//         }

//         console.log('All cameras processed successfully');
//     } catch (error) {
//         console.error('Error during operation:', error);
//         throw error;
//     }
// }

// copyVideotoNAS();


async function updateRecordInput() {
  // ambil semua kamera
  const cameras = await prismaClient.camera.findMany();

  for (const cam of cameras) {
    if (cam.recordInput) {
      // regex replace hanya angka di akhir URL
      const newRecordInput = cam.recordInput.replace(/\/(\d+)$/, "/102");

      // update ke database
      await prismaClient.camera.update({
        where: { id: cam.id },
        data: { recordInput: newRecordInput },
      });

      console.log(`Updated camera ${cam.id} → ${newRecordInput}`);
    }
  }
}

updateRecordInput()
  .catch(console.error)
  .finally(() => prismaClient.$disconnect());

