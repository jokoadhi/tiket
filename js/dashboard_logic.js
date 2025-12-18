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
// Perbarui fungsi ini agar lebih kuat terhadap spasi tambahan
async function loadStaffCache() {
  staffCache = {};
  try {
    const snapshot = await stafRef.get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.nama && data.jabatan) {
        // Gunakan trim() untuk menghapus spasi di awal/akhir nama dan jabatan
        staffCache[data.nama.trim().toUpperCase()] = data.jabatan
          .trim()
          .toUpperCase();
      }
    });
    console.log("Staff Cache Berhasil Dimuat:", staffCache); // Untuk cek di console browser
  } catch (error) {
    console.error("Error loading staff cache:", error);
  }
}

// Helper function untuk mengambil prefix secara dinamis
const getPrefix = (nama) => {
  if (!nama) return "NOC";
  const cleanName = nama.trim().toUpperCase();
  return staffCache[cleanName] || "NOC";
};

async function loginUser(username, password) {
  const emailFormat = `${username.toLowerCase().trim()}@sistem.com`;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(
      emailFormat,
      password
    );
    const user = userCredential.user;
    const userDoc = await db.collection("users").doc(user.uid).get();

    if (userDoc.exists) {
      const userData = userDoc.data();

      // PERBAIKAN: Gunakan .trim().toLowerCase() agar tidak ada error typo kapital/spasi
      const sanitizedRole = userData.role
        ? userData.role.trim().toLowerCase()
        : "user";

      localStorage.setItem("userRole", sanitizedRole);
      localStorage.setItem("userName", userData.name);
      localStorage.setItem("username", userData.username);

      Swal.fire({
        icon: "success",
        title: "Login Berhasil",
        text: `Selamat datang, ${userData.name}!`,
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        // Pastikan nama file dashboard Anda benar (index.html atau dashboard.html)
        window.location.href = "index.html";
      });
    }
  } catch (error) {
    Swal.fire("Login Gagal", "Username atau Password salah.", "error");
  }
}

// ===================================================
// B. FUNGSI UTAMA: LOAD DATA, KALKULASI, DAN RENDER
// ===================================================
window.loadReports = async function () {
  // 1. Ambil data session untuk menentukan hak akses fitur tambahan (seperti Rekap/CSV)
  const rawRole = localStorage.getItem("userRole") || "user";
  const role = rawRole.trim().toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";

  // Reset tampilan UI
  reportContainer.innerHTML = "";
  recapContainer.innerHTML = "";
  loadingStatus.textContent = "Memuat seluruh data laporan...";

  await loadStaffCache();

  const tanggal = document.getElementById("filter-tanggal").value;
  if (!tanggal) {
    loadingStatus.textContent = "Silakan pilih tanggal.";
    return;
  }

  // 2. LOGIKA QUERY GLOBAL (Tanpa filter nama)
  // Query ini sekarang hanya memfilter berdasarkan TANGGAL agar semua staf muncul
  let query = laporanRef.where("tanggal", "==", tanggal);

  try {
    // Mengurutkan dari yang terbaru diinput
    const snapshot = await query.orderBy("timestamp", "desc").get();
    loadingStatus.textContent = "";

    if (snapshot.empty) {
      reportContainer.innerHTML =
        '<p class="text-center text-red-500 font-medium py-10">Tidak ada laporan untuk tanggal ini.</p>';
      return;
    }

    const allDocs = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      allDocs.push(data);
      // Setiap user sekarang bisa melihat kartu laporan milik staf lain
      reportContainer.innerHTML += generateReportCard(data);
    });

    // 3. LOGIKA REKAPITULASI (Tetap hanya untuk Admin agar tidak penuh di layar User)
    if (isAdmin) {
      const staffRecap = processStaffRecap(allDocs);
      generateRecapCards(staffRecap, tanggal);
    }
  } catch (error) {
    console.error("Error loadReports:", error);
    loadingStatus.textContent =
      "Gagal memuat data. Pastikan koneksi internet stabil.";
  }
};
// ===================================================
// C. FUNGSI UNTUK GENERATE KARTU REKAPITULASI (DINAMIS)
// ===================================================

function processStaffRecap(allReports) {
  const staffRecap = {};

  allReports.forEach((data) => {
    const stafNama = data.staf_pelaksana;
    if (!stafNama) return;

    if (!staffRecap[stafNama]) {
      staffRecap[stafNama] = {
        received: { total: 0, closed: 0, tf: 0 },
        handled: { total: 0, closed: 0, tf: 0 },
      };
    }

    // 1. Rekap Tiket Diterima (Menggunakan field 'status')
    if (data.diterima && Array.isArray(data.diterima)) {
      staffRecap[stafNama].received.total += data.diterima.length;
      data.diterima.forEach((item) => {
        if (item.status === "CLOSE") {
          staffRecap[stafNama].received.closed++;
        } else if (item.status === "TF") {
          staffRecap[stafNama].received.tf++; // Menghitung 'TF' dari field status
        }
      });
    }

    // 2. Rekap Tiket Ditangani (Menggunakan field 'aksi')
    if (data.ditangani && Array.isArray(data.ditangani)) {
      staffRecap[stafNama].handled.total += data.ditangani.length;
      data.ditangani.forEach((item) => {
        if (item.aksi === "CLOSE") {
          staffRecap[stafNama].handled.closed++;
        } else if (item.aksi === "TF") {
          staffRecap[stafNama].handled.tf++; // Menghitung 'TF' dari field aksi
        }
      });
    }
  });

  return staffRecap;
}

function generateRecapCards(staffRecap, tanggal) {
  recapContainer.innerHTML = "";
  const stafNames = Object.keys(staffRecap).sort();

  if (stafNames.length === 0) {
    recapContainer.innerHTML = `<p class="text-center text-gray-500 italic p-10 text-base">Tidak ada data rekap untuk tanggal ini.</p>`;
    return;
  }

  let html = `
    <div class="col-span-full overflow-x-auto bg-white rounded-xl shadow-md border border-gray-200">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-gray-50 border-b-2 border-gray-200">
            <th class="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">Staf</th>
            <th class="px-6 py-4 text-xs font-black text-blue-600 uppercase tracking-wider text-center">Menerima</th>
            <th class="px-6 py-4 text-xs font-black text-indigo-600 uppercase tracking-wider text-center">Menangani</th>
            <th class="px-6 py-4 text-xs font-black text-green-600 uppercase tracking-wider text-center">Efektivitas</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
  `;

  stafNames.forEach((stafNama) => {
    const stats = staffRecap[stafNama];

    // Rumus Efektivitas: (Total Closed) / (Total Tiket)
    const totalSemua = stats.received.total + stats.handled.total;
    const totalClosedSemua = stats.received.closed + stats.handled.closed;
    const completionRate =
      totalSemua > 0 ? Math.round((totalClosedSemua / totalSemua) * 100) : 0;

    const jabatan =
      typeof getPrefix === "function" ? getPrefix(stafNama) : "NOC";

    html += `
      <tr class="hover:bg-blue-50/30 transition-colors text-center">
        <td class="px-6 py-4 text-left">
          <p class="text-base font-bold text-gray-800 tracking-tight">${stafNama}</p>
          <p class="text-[11px] text-pink-500 font-extrabold mt-1 uppercase tracking-widest">${jabatan}</p>
        </td>
        <td class="px-6 py-4">
          <p class="text-xl font-black text-gray-800">${stats.received.total}</p>
          <div class="flex justify-center gap-2 text-[11px] font-bold mt-1">
            <span class="text-green-600 bg-green-50 px-1.5 rounded border border-green-100">C:${stats.received.closed}</span>
            <span class="text-blue-500 bg-blue-50 px-1.5 rounded border border-blue-100">T:${stats.received.tf}</span>
          </div>
        </td>
        <td class="px-6 py-4">
          <p class="text-xl font-black text-gray-800">${stats.handled.total}</p>
          <div class="flex justify-center gap-2 text-[11px] font-bold mt-1">
            <span class="text-green-600 bg-green-50 px-1.5 rounded border border-green-100">C:${stats.handled.closed}</span>
            <span class="text-blue-500 bg-blue-50 px-1.5 rounded border border-blue-100">T:${stats.handled.tf}</span>
          </div>
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-4 justify-center md:justify-start">
            <div class="flex-grow bg-gray-200 h-3 rounded-full overflow-hidden hidden md:block border border-gray-100 min-w-[100px]">
              <div class="bg-green-500 h-full shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all duration-500" style="width: ${completionRate}%"></div>
            </div>
            <span class="text-base font-black text-gray-800 min-w-[45px] text-right">${completionRate}%</span>
          </div>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  recapContainer.innerHTML = html;
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
  const rawRole = localStorage.getItem("userRole") || "user";
  const role = rawRole.trim().toLowerCase();

  const date =
    data.timestamp && data.timestamp.toDate
      ? data.timestamp.toDate()
      : new Date();
  const timeString = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const dataToCopy = {
    diterima: data.diterima,
    ditangani: data.ditangani,
    shift: data.shift || "",
    tanggal: data.tanggal || "",
  };
  const encodedData = encodeURIComponent(JSON.stringify(dataToCopy));
  const fullDataJson = encodeURIComponent(JSON.stringify(data));

  // --- Logic Tombol (Font tombol sedikit diperbesar agar mudah ditekan) ---
  let actionButtons = `
      <button onclick="copyReportData('${encodedData}')" class="text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md transition shadow-sm">
          Salin Data
      </button>
      <button onclick="exportSingleReportTXT('${fullDataJson}')" class="text-[12px] font-bold text-white bg-gray-700 hover:bg-black px-4 py-2 rounded-md transition shadow-sm">
          TXT
      </button>
  `;

  if (role === "admin" || role === "administrator") {
    actionButtons += `
      <button onclick="exportSingleReportCSV('${fullDataJson}')" class="text-[12px] font-bold text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded-md transition shadow-sm">
          CSV
      </button>
    `;
  }

  // --- Render Konten Tiket Diterima (Font diperbesar) ---
  let terimaContent = (data.diterima || [])
    .map((item, index) => {
      let statusBadge = "";
      // Keterangan 'dari siapa' diperbesar ke text-xs (12px)
      let infoTengah = `<span class="text-xs text-gray-500 font-medium">dari ${getPrefix(
        item.dari_staf
      )} ${item.dari_staf}</span>`;

      if (item.status === "CLOSE")
        statusBadge =
          '<span class="text-[11px] font-bold text-white bg-green-600 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">CLOSE</span>';
      else if (item.status === "TF")
        statusBadge =
          '<span class="text-[11px] font-bold text-white bg-blue-500 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">TRANSFER</span>';
      else
        statusBadge =
          '<span class="text-[11px] font-bold text-gray-800 bg-yellow-300 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">PROGRESS</span>';

      const bgColorClass = index % 2 !== 0 ? "bg-gray-50" : "bg-white";
      return `<div class="flex justify-between items-center py-3 px-4 border-b border-gray-100 last:border-b-0 min-w-[600px] ${bgColorClass}">
            <span class="text-gray-800 font-mono text-sm font-black w-1/3 tracking-tight">${item.tiket_id}</span>
            <div class="flex-grow text-left">${infoTengah}</div> 
            <div class="flex-shrink-0 ml-2">${statusBadge}</div>
        </div>`;
    })
    .join("");

  // --- Render Konten Tiket Ditangani (Font diperbesar) ---
  let tanganiContent = (data.ditangani || [])
    .map((item, index) => {
      let actionBadge = "";
      if (item.aksi === "CLOSE")
        actionBadge =
          '<span class="text-[11px] font-bold text-white bg-green-600 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">CLOSE</span>';
      else if (item.aksi === "TF")
        actionBadge =
          '<span class="text-[11px] font-bold text-white bg-blue-500 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">TRANSFER</span>';
      else
        actionBadge =
          '<span class="text-[11px] font-bold text-gray-700 bg-gray-200 px-3 py-1 rounded shadow-sm min-w-[85px] text-center uppercase">PROGRESS</span>';

      const bgColorClass = index % 2 !== 0 ? "bg-gray-50" : "bg-white";
      return `<div class="flex justify-between items-center py-3 px-4 border-b border-gray-100 last:border-b-0 min-w-[600px] ${bgColorClass}">
            <span class="text-gray-800 font-mono text-sm font-black w-1/3 tracking-tight">${
              item.tiket_id
            }</span>
            <div class="flex-grow text-left">
              <span class="text-xs text-gray-500 font-medium">${
                item.aksi === "TF"
                  ? "ke " + getPrefix(item.tujuan_staf) + " " + item.tujuan_staf
                  : "Selesai ditangani"
              }</span>
            </div>
            <div class="flex-shrink-0 ml-2">${actionBadge}</div>
        </div>`;
    })
    .join("");

  const jabatanUtama = getPrefix(data.staf_pelaksana);

  return `
    <div class="border border-gray-200 rounded-xl shadow-md bg-white overflow-hidden transition duration-300 hover:shadow-lg border-l-8 border-indigo-600 mb-8">
        <div class="p-5 bg-white border-b border-gray-100 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <div>
                <h4 class="text-lg font-black text-gray-800 tracking-tight">
                    Laporan Shift <span class="text-indigo-600 uppercase">${
                      data.shift
                    }</span> - 
                    <span class="text-indigo-600 uppercase">${
                      data.staf_pelaksana
                    }</span>
                    <span class="text-xs font-black text-pink-500 ml-1 bg-pink-50 px-2 py-1 rounded-md border border-pink-100">${jabatanUtama}</span> 
                </h4>
            </div>
            <div class="flex flex-wrap items-center gap-3">
                ${actionButtons}
                <span class="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-3 py-2 rounded-md font-bold">
                    ${data.tanggal} | ${timeString} WIB
                </span>
            </div>
        </div>
        <div class="p-6 space-y-8">
            <div>
                <p class="text-xs font-black text-indigo-900 mb-4 tracking-[0.15em] uppercase flex items-center">
                   <span class="w-2 h-2 bg-indigo-600 rounded-full mr-2"></span> MENERIMA TIKET (${
                     (data.diterima || []).length
                   } ITEM)
                </p>
                <div class="border border-gray-200 rounded-xl overflow-x-auto shadow-sm bg-gray-50/30">${
                  terimaContent ||
                  '<p class="text-gray-400 italic text-sm text-center py-10">Tidak ada tiket diterima.</p>'
                }</div>
            </div>
            <div>
                <p class="text-xs font-black text-indigo-900 mb-4 tracking-[0.15em] uppercase flex items-center">
                   <span class="w-2 h-2 bg-indigo-600 rounded-full mr-2"></span> MENANGANI TIKET (${
                     (data.ditangani || []).length
                   } ITEM)
                </p>
                <div class="border border-gray-200 rounded-xl overflow-x-auto shadow-sm bg-gray-50/30">${
                  tanganiContent ||
                  '<p class="text-gray-400 italic text-sm text-center py-10">Tidak ada aksi penanganan.</p>'
                }</div>
            </div>
        </div>
    </div>`;
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

  // ===================================================
  // H. FUNGSI LOGIKA: EXPORT LAPORAN KE TXT
  // ===================================================
  window.exportSingleReportTXT = function (reportDataJson) {
    try {
      const data = JSON.parse(decodeURIComponent(reportDataJson));

      // Fungsi pembantu untuk prefix
      const formatStaffWithPrefix = (name) => {
        if (!name) return "";
        const prefix = typeof getPrefix === "function" ? getPrefix(name) : "";
        return prefix ? `${prefix} ${name.toUpperCase()}` : name.toUpperCase();
      };

      // --- MENYUSUN KONTEN TEKS ---
      let txtContent = `NAMA STAFF : ${formatStaffWithPrefix(
        data.staf_pelaksana
      )}\n`;
      txtContent += `SHIFT : ${data.shift?.toUpperCase() || "N/A"}\n\n`;

      txtContent += `MENERIMA TIKET:\n`;
      if (data.diterima && data.diterima.length > 0) {
        data.diterima.forEach((item) => {
          const dari = item.dari_staf
            ? ` = ${formatStaffWithPrefix(item.dari_staf)}`
            : "";
          const status = item.status ? ` = ${item.status}` : "";
          const tujuan = item.tujuan_staf
            ? ` ${formatStaffWithPrefix(item.tujuan_staf)}`
            : "";
          txtContent += `${item.tiket_id}${dari}${status}${tujuan}\n`;
        });
      } else {
        txtContent += `(Tidak ada tiket diterima)\n`;
      }

      txtContent += `\nMENANGANI TIKET:\n`;
      if (data.ditangani && data.ditangani.length > 0) {
        data.ditangani.forEach((item) => {
          const aksi = item.aksi ? ` = ${item.aksi}` : "";
          const tujuan = item.tujuan_staf
            ? ` ${formatStaffWithPrefix(item.tujuan_staf)}`
            : "";
          txtContent += `${item.tiket_id}${aksi}${tujuan}\n`;
        });
      } else {
        txtContent += `(Tidak ada aksi penanganan)\n`;
      }

      // --- MODAL PILIHAN ---
      Swal.fire({
        title: "Opsi Laporan Teks",
        text: "Pilih cara untuk melihat hasil export:",
        icon: "question",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fas fa-eye"></i> Lihat Teks',
        denyButtonText: '<i class="fas fa-download"></i> Download File',
        cancelButtonText: "Batal",
        confirmButtonColor: "#4f46e5", // Indigo
        denyButtonColor: "#1f2937", // Gray-800
      }).then((result) => {
        if (result.isConfirmed) {
          // JIKA PILIH VIEW
          const newWindow = window.open("", "_blank");
          newWindow.document.write(
            `<pre style="font-family: monospace; white-space: pre-wrap; padding: 20px;">${txtContent}</pre>`
          );
          newWindow.document.title = `View Laporan - ${data.staf_pelaksana}`;
        } else if (result.isDenied) {
          // JIKA PILIH DOWNLOAD
          const blob = new Blob([txtContent], { type: "text/plain" });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          const fileName =
            `Laporan_${data.staf_pelaksana}_${data.tanggal}_${data.shift}.txt`.replace(
              /\s+/g,
              "_"
            );
          a.href = url;
          a.download = fileName;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      });
    } catch (error) {
      console.error("Gagal memproses teks:", error);
      Swal.fire({
        icon: "error",
        title: "Gagal",
        text: "Terjadi kesalahan saat memproses data.",
      });
    }
  };

  // loadReports();
});
