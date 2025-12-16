// js/dashboard_logic.js (Sudah disesuaikan dengan tombol Salin Data Laporan, Export CSV per Kartu, dan path input_tiket.html)

const laporanRef = db.collection("laporan_harian");
const stafRef = db.collection("staf");
const reportContainer = document.getElementById("report-container");
const loadingStatus = document.getElementById("loading-status");
const recapContainer = document.getElementById("recap-container");

let staffCache = {};

// ===================================================
// A. INISIALISASI: LOAD STAFF CACHE
// ===================================================
async function loadStaffCache() {
  staffCache = {};
  try {
    const snapshot = await stafRef.get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      staffCache[data.nama.toUpperCase()] = data.jabatan || "N/A";
    });
  } catch (error) {
    console.error("Error loading staff cache:", error);
  }
}

// ===================================================
// B. FUNGSI UTAMA: LOAD DATA, KALKULASI, DAN RENDER
// ===================================================
window.loadReports = async function () {
  reportContainer.innerHTML = "";
  recapContainer.innerHTML =
    '<p class="text-center text-gray-500 italic md:col-span-3">Memuat data rekapitulasi...</p>';
  loadingStatus.textContent = "Memuat data laporan...";

  await loadStaffCache();

  const tanggal = document.getElementById("filter-tanggal").value;

  if (!tanggal) {
    recapContainer.innerHTML =
      '<p class="text-center text-gray-500 italic md:col-span-3">Pilih tanggal untuk melihat rekapitulasi.</p>';
    loadingStatus.textContent =
      "Silakan pilih Tanggal Laporan terlebih dahulu.";
    return;
  }

  let query = laporanRef
    .where("tanggal", "==", tanggal)
    .orderBy("timestamp", "desc");

  const staffRecap = {};

  try {
    const snapshot = await query.get();
    loadingStatus.textContent = "";
    reportContainer.innerHTML = "";

    if (snapshot.empty) {
      recapContainer.innerHTML =
        '<p class="text-center text-red-500 font-medium md:col-span-3">Tidak ada data rekapitulasi ditemukan.</p>';
      reportContainer.innerHTML =
        '<p class="text-center text-red-500 font-medium">Tidak ditemukan laporan untuk tanggal tersebut.</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      const stafNama = data.staf_pelaksana;

      const stafJabatan = staffCache[stafNama.toUpperCase()] || "N/A";
      data.jabatan = stafJabatan;

      if (!staffRecap[stafNama]) {
        staffRecap[stafNama] = { total: 0, closed: 0, transferred: 0 };
      }

      if (data.ditangani && Array.isArray(data.ditangani)) {
        staffRecap[stafNama].total += data.ditangani.length;

        data.ditangani.forEach((item) => {
          if (item.aksi === "CLOSE") {
            staffRecap[stafNama].closed++;
          } else if (item.aksi === "TF") {
            staffRecap[stafNama].transferred++;
          }
        });
      }

      reportContainer.innerHTML += generateReportCard(data);
    });

    generateRecapCards(staffRecap, tanggal);
  } catch (error) {
    console.error("Error memuat laporan: ", error);
    loadingStatus.textContent = "Gagal memuat data laporan.";
    recapContainer.innerHTML =
      '<p class="text-center text-red-500 font-medium md:col-span-3">Gagal memuat rekapitulasi.</p>';
  }
};

// ===================================================
// C. FUNGSI UNTUK GENERATE KARTU REKAPITULASI
// ===================================================
function generateRecapCards(staffRecap, tanggal) {
  recapContainer.innerHTML = "";

  const stafNames = Object.keys(staffRecap).sort();

  if (stafNames.length === 0) {
    recapContainer.innerHTML =
      '<p class="text-center text-gray-500 italic md:col-span-3">Tidak ada aksi penanganan tiket oleh staf pada tanggal ini.</p>';
    return;
  }

  stafNames.forEach((stafNama) => {
    const stats = staffRecap[stafNama];

    const cardHTML = `
            <div class="bg-white p-6 rounded-xl shadow-lg border-l-4 border-indigo-500 transition duration-300 hover:shadow-xl">
                <p class="text-lg font-bold text-gray-800">${stafNama}</p>
                <p class="text-xs font-medium text-indigo-500 mb-2">Kinerja Tanggal ${tanggal}</p>
                <div class="space-y-1">
                    <div class="flex justify-between items-center border-t pt-2">
                        <span class="text-sm text-gray-600">Total Tiket Ditangani:</span>
                        <span class="text-xl font-extrabold text-gray-900">${stats.total}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Tiket Berhasil di-CLOSE:</span>
                        <span class="text-xl font-extrabold text-green-600">${stats.closed}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Tiket Ditransfer (TF):</span>
                        <span class="text-xl font-extrabold text-yellow-600">${stats.transferred}</span>
                    </div>
                </div>
            </div>
        `;
    recapContainer.innerHTML += cardHTML;
  });
}

// ===================================================
// E. FUNGSI LOGIKA: SALIN DATA DAN REDIRECT (SWEETALERT)
// ===================================================
window.copyReportData = function (reportDataJson) {
  try {
    const reportData = JSON.parse(decodeURIComponent(reportDataJson));

    // 1. Simpan data ke sessionStorage
    sessionStorage.setItem("copiedReportData", JSON.stringify(reportData));

    // 2. Tampilkan SweetAlert sukses
    Swal.fire({
      icon: "success",
      title: "Data Berhasil Disalin!",
      text: "Anda akan dialihkan ke halaman Input Laporan untuk menempel data.",
      timer: 2500, // Notif akan hilang dalam 2.5 detik
      timerProgressBar: true,
      showConfirmButton: false,
    }).then(() => {
      // 3. Redirect setelah SweetAlert hilang
      window.location.href = "/tiket/input_tiket.html";
    });
  } catch (error) {
    console.error("Gagal menyalin data laporan:", error);

    // 4. Tampilkan SweetAlert gagal
    Swal.fire({
      icon: "error",
      title: "Gagal Menyalin Data",
      text: "Terjadi kesalahan. Silakan coba lagi atau hubungi administrator.",
      confirmButtonText: "OK",
    });
  }
};

// ===================================================
// G. FUNGSI LOGIKA: EXPORT LAPORAN TUNGGAL KE CSV
// ===================================================
window.exportSingleReportCSV = function (reportDataJson) {
  try {
    const data = JSON.parse(decodeURIComponent(reportDataJson));

    // Panggil fungsi konversi untuk laporan tunggal
    const csvContent = generateSingleCSVContent(data);

    // Format nama file: Laporan_STAF_YYYY-MM-DD_SHIFT.csv
    const filename = `Laporan_${(data.staf_pelaksana || "Unknown").replace(
      /\s/g,
      "_"
    )}_${data.tanggal || "NoDate"}_${data.shift || "NoShift"}.csv`;

    // Memicu unduhan file
    downloadCSV(csvContent, filename);

    Swal.fire({
      icon: "success",
      title: "Export Berhasil!",
      text: `Laporan staf ${
        data.staf_pelaksana || "Unknown"
      } berhasil diunduh.`,
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error("Error saat export CSV laporan tunggal: ", error);
    Swal.fire({
      icon: "error",
      title: "Gagal Export",
      text: "Terjadi kesalahan saat memproses data laporan.",
      confirmButtonText: "Tutup",
    });
  }
};

/**
 * Mengubah data laporan tunggal menjadi String CSV yang siap diunduh
 */
function generateSingleCSVContent(data) {
  // 1. Tentukan Header CSV
  const headers = [
    "Tanggal",
    "Waktu Input",
    "Shift",
    "Staf Pelaksana",
    "Jabatan",
    "Tipe Tiket", // Diterima/Ditangani
    "ID Tiket",
    "Aksi", // CLOSE/TF/PROGRESS
    "Dari Staf", // Hanya untuk DITERIMA
    "Tujuan Staf", // Hanya untuk TF
  ];

  let csv = headers.join(";") + "\n";

  const stafNama = data.staf_pelaksana || "";
  const stafJabatan = data.jabatan || "N/A";

  // Format waktu
  let date;

  // PERBAIKAN DI SINI: Menangani objek timestamp yang sudah di-serialize/parse
  if (data.timestamp && typeof data.timestamp.toDate === "function") {
    // Objek Timestamp asli dari Firestore
    date = data.timestamp.toDate();
  } else if (data.timestamp && data.timestamp.seconds) {
    // Objek yang sudah di-serialize dan di-parse
    date = new Date(data.timestamp.seconds * 1000);
  } else {
    // Fallback
    date = new Date();
  }

  const timeString = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // --- A. Proses Tiket DITERIMA ---
  if (data.diterima && Array.isArray(data.diterima)) {
    data.diterima.forEach((item) => {
      const row = [
        data.tanggal || "",
        timeString,
        data.shift || "",
        stafNama,
        stafJabatan,
        "DITERIMA (Transfer Masuk)",
        item.tiket_id || "",
        item.status || "PROGRESS",
        item.dari_staf || "",
        item.tujuan_staf || "",
      ];
      // Tambahkan quote ganda di sekitar setiap field dan gabungkan dengan delimiter ';'
      csv += row.map((field) => `"${field}"`).join(";") + "\n";
    });
  }

  // --- B. Proses Tiket DITANGANI ---
  if (data.ditangani && Array.isArray(data.ditangani)) {
    data.ditangani.forEach((item) => {
      const row = [
        data.tanggal || "",
        timeString,
        data.shift || "",
        stafNama,
        stafJabatan,
        "DITANGANI (Aksi Staf)",
        item.tiket_id || "",
        item.aksi || "PROGRESS",
        stafNama, // Staf Pelaksana
        item.tujuan_staf || "",
      ];
      // Tambahkan quote ganda di sekitar setiap field dan gabungkan dengan delimiter ';'
      csv += row.map((field) => `"${field}"`).join(";") + "\n";
    });
  }

  return csv;
}

/**
 * Memicu unduhan file CSV
 */
function downloadCSV(csv, filename) {
  const csvFile = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const downloadLink = document.createElement("a");

  // Membuat URL object
  downloadLink.href = URL.createObjectURL(csvFile);
  downloadLink.download = filename;

  // Memicu klik untuk memulai unduhan
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// ===================================================
// D. FUNGSI UNTUK GENERATE TAMPILAN (FORMAT PROFESSIONAL)
// ===================================================
function generateReportCard(data) {
  // 1. Format Tanggal dan Waktu
  const date = new Date(data.timestamp.toDate());
  const timeString = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Data yang akan disalin (hanya fokus pada tiket)
  const dataToCopy = {
    diterima: data.diterima,
    ditangani: data.ditangani,
    // Tambahkan data lain yang mungkin relevan untuk form input
    shift: data.shift || "",
    tanggal: data.tanggal || "",
  };
  // Encode data agar aman dimasukkan ke dalam atribut onClick
  const encodedData = encodeURIComponent(JSON.stringify(dataToCopy));

  // ------------------------------------------------------------------
  // Data Laporan LENGKAP untuk Export CSV
  const fullDataJson = encodeURIComponent(JSON.stringify(data));
  // ------------------------------------------------------------------

  // 2. Konten Menerima Tiket (Transfer Masuk) - DENGAN TIGA KOLOM RAPI & STRIPING
  let terimaContent = (data.diterima || []) // Tambahkan fallback array kosong
    .map((item, index) => {
      let statusBadge = "";
      let infoTengah = `<span class="text-xs text-gray-500">dari NOC ${item.dari_staf}</span>`;

      if (item.status === "CLOSE") {
        statusBadge =
          '<span class="text-xs font-semibold text-white bg-green-500 px-2 py-0.5 rounded-full min-w-[70px] text-center">CLOSE</span>';
      } else if (item.status === "TF" || item.aksi === "TF") {
        // Gunakan status/aksi untuk badge
        statusBadge =
          '<span class="text-xs font-semibold text-white bg-blue-500 px-2 py-0.5 rounded-full min-w-[70px] text-center">TRANSFER</span>';

        if (item.tujuan_staf) {
          infoTengah += `<span class="text-xs text-gray-500 ml-2">(ke NOC ${item.tujuan_staf})</span>`;
        }
      } else {
        statusBadge =
          '<span class="text-xs font-semibold text-gray-800 bg-yellow-300 px-2 py-0.5 rounded-full min-w-[70px] text-center">PROGRESS</span>';
      }

      const bgColorClass = index % 2 !== 0 ? "bg-gray-100" : "bg-white";

      return `<div class="flex justify-between items-center py-1 px-1 border-b border-gray-100 last:border-b-0 min-w-[600px] ${bgColorClass}">
                  <span class="text-gray-900 font-mono text-sm w-1/4">${item.tiket_id}</span>
                  
                  <div class="flex-grow text-left">${infoTengah}</div> 

                  <div class="flex-shrink-0">${statusBadge}</div>
              </div>`;
    })
    .join("");

  // 3. Konten Menangani Tiket (Dibuat Sendiri/Aksi Staf) - DENGAN TIGA KOLOM RAPI & STRIPING
  let tanganiContent = (data.ditangani || []) // Tambahkan fallback array kosong
    .map((item, index) => {
      let actionInfo = "";
      let actionBadge = "";

      if (item.aksi === "CLOSE") {
        actionBadge =
          '<span class="text-xs font-semibold text-white bg-green-500 px-2 py-0.5 rounded-full min-w-[70px] text-center">CLOSE</span>';
        actionInfo = "";
      } else if (item.aksi === "TF") {
        actionBadge =
          '<span class="text-xs font-semibold text-white bg-blue-500 px-2 py-0.5 rounded-full min-w-[70px] text-center">TRANSFER</span>';
        actionInfo = `<span class="text-xs text-gray-500">ke NOC ${item.tujuan_staf}</span>`;
      } else {
        actionBadge =
          '<span class="text-xs font-semibold text-gray-800 bg-gray-300 px-2 py-0.5 rounded-full min-w-[70px] text-center">PROGRESS</span>';
        actionInfo = "";
      }

      const bgColorClass = index % 2 !== 0 ? "bg-gray-100" : "bg-white";

      return `<div class="flex justify-between items-center py-1 px-1 border-b border-gray-100 last:border-b-0 min-w-[600px] ${bgColorClass}">
                  <span class="text-gray-900 font-mono text-sm w-1/4">${item.tiket_id}</span>
                  
                  <div class="flex-grow text-left">${actionInfo}</div>

                  <div class="flex-shrink-0">${actionBadge}</div>
              </div>`;
    })
    .join("");

  // 4. Struktur Card (MODIFIED LAYOUT FINAL: Tombol/Waktu HORIZONTAL & JUSTIFIED)
  return `
        <div class="border border-gray-200 p-5 rounded-xl shadow-lg bg-white transition duration-300 hover:shadow-xl border-l-4 border-indigo-500">
            
            <div class="pb-3 mb-4 border-b border-indigo-100 flex flex-col sm:flex-row sm:justify-between sm:items-start">
                
                <h4 class="text-lg font-extrabold text-gray-800 mb-2 sm:mb-0 w-full sm:w-auto">
                    Laporan Shift <span class="text-indigo-600">${
                      data.shift
                    }</span> - <span class="text-indigo-600">${
    data.staf_pelaksana
  }</span>
                    <span class="text-sm font-semibold text-pink-600">(${
                      data.jabatan
                    })</span> 
                </h4>
                
                <div class="flex items-center justify-between w-full mt-2 sm:mt-0 sm:w-auto sm:space-x-2">
                    
                    <button onclick="copyReportData('${encodedData}')" class="flex items-center justify-center text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded-full transition duration-150 shadow-md">
                        <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v4m0 0v4m0-4h4m-4 0H4m8 8H4a2 2 0 01-2-2V4a2 2 0 012-2h12a2 2 0 012 2v4m-8 8v4m0-4h4m-4 0H4"></path></svg>
                        Salin Data
                    </button>

                    <button onclick="exportSingleReportCSV('${fullDataJson}')" class="flex items-center justify-center text-xs font-semibold text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full transition duration-150 shadow-md">
                        <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h4m-4 0v-4m4 4v-4m-4 4h4"></path></svg>
                        CSV
                    </button>
                    
                    <span class="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full text-right">
                        ${data.tanggal} | ${timeString} WIB
                    </span>
                </div>
            </div>
            
            <div class="mb-4">
                <p class="font-bold text-indigo-700 mb-2 flex items-center">
                    <svg class="w-5 h-5 mr-1 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m-6-1h.01M10 2a8 8 0 00-8 8c0 2.05 1 4.2 2.64 5.96L10 20l5.36-4.04C17 14.2 18 12.05 18 10a8 8 0 00-8-8z"></path></svg>
                    TIKET DITERIMA (Transfer Masuk) (${
                      (data.diterima || []).length
                    } Item):
                </p>
                <div class="pl-2 pr-2 border rounded-lg bg-gray-50/70 p-3 overflow-x-auto">
                    ${
                      terimaContent ||
                      '<p class="text-gray-500 italic text-sm text-center py-2 min-w-[280px]">Tidak ada tiket yang diterima (transfer masuk) pada shift ini.</p>'
                    }
                </div>
            </div>
            
            <div>
                <p class="font-bold text-indigo-700 mb-2 flex items-center">
                    <svg class="w-5 h-5 mr-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 00-8 8c0 4.41 3.59 8 8 8s8-3.59 8-8a8 8 0 00-8-8zm-1 12l-3-3 1.41-1.41L9 12.17l4.59-4.58L15 9l-6 6z"></path></svg>
                    AKSI & PENANGANAN TIKET (Dibuat Sendiri) (${
                      (data.ditangani || []).length
                    } Item):
                </p>
                <div class="pl-2 pr-2 border rounded-lg bg-gray-50/70 p-3 overflow-x-auto">
                    ${
                      tanganiContent ||
                      '<p class="text-gray-500 italic text-sm text-center py-2 min-w-[280px]">Tidak ada aksi penanganan tiket (dibuat sendiri) pada shift ini.</p>'
                    }
                </div>
            </div>
        </div>
    `;
}

// ===================================================
// F. INISIALISASI
// ===================================================
document.addEventListener("DOMContentLoaded", function () {
  const filterTanggal = document.getElementById("filter-tanggal");

  const today = new Date().toISOString().split("T")[0];
  if (filterTanggal) {
    filterTanggal.value = today;
  }

  // loadReports();
});
