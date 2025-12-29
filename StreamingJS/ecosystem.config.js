// Daftar 59 ID kamera 4K Anda
// const camera4KIds = [
//   "BPW1", "CTWK2", "JBKXVI", "MVLD4", "PT2K", "PRS2", "THA1B", 
//   "BPW2", "ENVR", "JBKXVIIB", "NSN1", "PT2M", "RSAM", "THA2",
//   "BVHLA", "GRDN1", "KLJBK", "NSN2", "PT7K", "RKDJVA", "WTR1",
//   "BVHLB", "GRDN2", "LVGPZ", "PRDSA", "PT7M", "RKDJVB", "WTR2",
//   "BWWA", "GRDN3", "MTTLA", "PRDSB", "PT9AK", "STNG", "DRN01",
//   "BWWB","GRMKA", "MTTLB", "PTGKD", "PT9AM", "SPCT1",
//   "BDGF1", "GRMKB", "MVLD1", "PT1K", "PT9BA", "SPCT2",
//   "BDGF2", "HLJA", "MVLD2", "PT1MA", "PT9BB", "SPCT3",
//   "CTWK1", "HLJB", "MVLD3", "PT1MB", "PRS1", "THA1A"
// ];

// // Hanya gunakan kelompok pertama untuk testing
// const testGroup = camera4KIds.slice(0, 10); // Ambil 7 kamera pertama

// module.exports = {
//   apps: [
//     {
//       name: `4k-camera-test-group`,
//       script: 'src/main.js',
//       args: testGroup.join(' '),
//       instances: 1,
//       exec_mode: 'fork',
//       watch: false,
//       max_memory_restart: '500M',
//       env: {
//         NODE_ENV: 'production',
//         CPU_CORE: 0 // Gunakan core 0 untuk testing
//       }
//     }
//   ]
// };

// Pembagian group: 7,7,7,7,7,7,6,6,6 (total 59 kamera)

// const coreMappings = [
//   ["BPW1", "CTWK2", "JBKXVI", "MVLD4", "PT2K", "PRS2", "THA1B"],    // core1
//   ["BPW2", "ENVR", "JBKXVIIB", "NSN1", "PT2M", "RSAM", "THA2"],     // core2
//   ["BVHLA", "GRDN1", "KLJBK", "NSN2", "PT7K", "RKDJVA", "WTR1"],    // core3
//   ["BVHLB", "GRDN2", "LVGPZ", "PRDSA", "PT7M", "RKDJVB", "WTR2"],   // core4
//   ["BWWA", "GRDN3", "MTTLA", "PRDSB", "PT9AK", "STNG", "DRN01"],    // core5
//   ["BWWB", "GRMKA", "MTTLB", "PTGKD", "PT9AM", "SPCT1"],            // core6
//   ["BDGF1", "GRMKB", "MVLD1", "PT1K", "PT9BA", "SPCT2"],            // core7
//   ["BDGF2", "HLJA", "MVLD2", "PT1MA", "PT9BB", "SPCT3"],            // core8
//   ["CTWK1", "HLJB", "MVLD3", "PT1MB", "PRS1", "THA1A"]              // core9
// ];
// module.exports = {
//   apps: coreMappings.map((group, index) => ({
//     name: `4k-camera-core-${index}`, // Penamaan dimulai dari core-1 bukan core-0
//     script: 'src/main.js',
//     args: group.join(' '),
//     instances: 1,
//     exec_mode: 'fork',
//     watch: false,
//     max_memory_restart: '500M',
//     env: {
//       NODE_ENV: 'production',
//       CPU_CORE: index, // Assign ke core 0-8 (sesuai dengan index array)
//       PORT: 3000 + index // Set port berbeda untuk setiap instance
//     }
//   }))
// };

// Mapping untuk 59 kamera 4K
// const coreMappings4K = [
//   ["BPW1", "CTWK2", "JBKXVI", "MVLD4", "PT2K", "PRS2", "THA1B"],    // core0 (4K)
//   ["BPW2", "ENVR", "JBKXVIIB", "NSN1", "PT2M", "RSAM", "THA2"],     // core1 (4K)
//   ["BVHLA", "GRDN1", "KLJBK", "NSN2", "PT7K", "RKDJVA", "WTR1"],    // core2 (4K)
//   ["BVHLB", "GRDN2", "LVGPZ", "PRDSA", "PT7M", "RKDJVB", "WTR2"],   // core3 (4K)
//   ["BWWA", "GRDN3", "MTTLA", "PRDSB", "PT9AK", "STNG", "DRN01"],    // core4 (4K)
//   ["BWWB", "GRMKA", "MTTLB", "PTGKD", "PT9AM", "SPCT1", "PTZCTWK"],            // core5 (4K)
//   ["BDGF1", "GRMKB", "MVLD1", "PT1K", "PT9BA", "SPCT2", "PCCTWK", ],            // core6 (4K)
//   ["BDGF2", "HLJA", "MVLD2", "PT1MA", "PT9BB", "SPCT3"],            // core7 (4K)
//   ["CTWK1", "HLJB", "MVLD3", "PT1MB", "PRS1", "THA1A"]              // core8 (4K)
// ];

const coreMappings4K = [
  ["BPW1", "BDGF2", "GRMKA", "LVGPZ", "NSN1", "PT1MB", "PT9BA", "STNG", "WTR1"],    // core0 (4K)
  ["BPW2", "CTWK1", "GRMKB", "MTTLA", "NSN2", "PT2K", "PT9BB", "SPCT1", "WTR2"],     // core1 (4K)
  ["BVHLA", "CTWK2", "HLJA", "MTTLB", "PRDSA", "PT2M", "PRS1", "SPCT2", "PTZCTWK"],    // core2 (4K)
  ["BVHLB", "ENVR", "HLJB", "MVLD1", "PRDSB", "PT7K", "PRS2", "SPCT3", "PCCTWK"],   // core3 (4K)
  ["BWWA", "GRDN1", "JBKXVI", "MVLD2", "PTGKD", "PT7M", "RSAM", "THA1A", "DRN01"],    // core4 (4K)
  ["BWWB", "GRDN2", "JBKXVIIB", "MVLD3", "PT1K", "PT9AK", "RKDJVA", "THA1B", "PTZLVGPZ"],            // core5 (4K)
  ["BDGF1", "GRDN3", "KLJBK", "MVLD4", "PT1MA", "PT9AM", "RKDJVB", "THA2", "PCLVGPZ"],       // core6 (4K)
];

// Mapping untuk 88 kamera FullHD
const coreMappingsFullHD = [
  ["EPTU1", "ESGNS", "OTWA", "SGLR", "RZAR", "PCGN", "SLABO", "PTU5", "PTU8", "PTAK6", "ICRKEC1", "JMOPM2", "PBKMM", "SGML", "WTP1RN", "MKL1", "PMCC"], // core10
  ["PJBK1", "SCMO", "CKIJI", "SGLRN", "PTU72", "PSKH", "IDCR", "PSN3", "JKIJ5", "RKTRC2", "ICRKEO1", "JMOTL", "PSICT", "SGMLB", "WTP2GP", "PMDL1", "LYL1"], // core11
  ["CSKIJC1", "PRLS", "ASRM", "CKIJS", "RKHO", "RKRY", "CHKR", "BKPW", "TUPR", "PTUKIJ7", "ICRKE02", "JMOL3L", "PJBTNG", "UKMB", "WTP2CCTVPOS", "PMG1"], // core12
  ["PTU9", "RDLF", "PTLNG", "MATL", "PSN1", "TAWN", "PTU10", "BPW3", "JBTNG","GRBP", "ICRKEP", "JMOL3S", "PKDH", "UKMP", "WTP2RM", "MRB1"], // core13
  ["DALM", "SGMZ", "UTMN", "BLKT", "PTU2", "PBLK", "PBRR", "BUMJ", "BDRNS", "C2KIJ9", "JMODG", "JMOSG", "PSNIA", "WTP1", "CCBL2", "MSKI"], // core14
  ["KM29", "YSFU", "ETLERL", "ARPD", "PTKD", "PSBMM", "MCD", "TTKC", "STDN", "C3KIJ9", "JMOPM1", "PAVE", "PSNIB", "WTP1P1", "SL1CC", "CCL2L"] // core15
];

module.exports = {
  apps: [
    // Aplikasi untuk kamera 4K (core 0-8)
    ...coreMappings4K.map((group, index) => ({
      name: `4k-camera-core-${index}`,
      script: 'src/main.js',
      args: group.join(' '),
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        CPU_CORE: index, // Assign ke core 0-8
        PORT: 3000 + index,
        STREAM_TYPE: '4k' // Tambahan untuk identifikasi tipe stream
      }
    })),
    
    // Aplikasi untuk kamera FullHD (core 10-15)
    ...coreMappingsFullHD.map((group, index) => ({
      name: `fullhd-camera-core-${index + 10}`, // core10, core11, dst
      script: 'src/main.js',
      args: group.join(' '),
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        CPU_CORE: index + 10, // Assign ke core 10-15
        PORT: 3100 + index,
        STREAM_TYPE: 'fullhd' // Tambahan untuk identifikasi tipe stream
      }
    }))
  ]
};