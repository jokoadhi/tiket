// js/dashboard_logic.js
const laporanRef = db.collection("laporan_harian");
const stafRef = db.collection("staf");
const reportContainer = document.getElementById("report-container");
const loadingStatus = document.getElementById("loading-status");
const recapContainer = document.getElementById("recap-container");

let staffCache = {};

// ===================================================
// A. INISIALISASI & CACHING STAFF
// ===================================================
async function loadStaffCache() {
  staffCache = {};
  try {
    const snapshot = await stafRef.get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.nama && data.jabatan) {
        staffCache[data.nama.trim().toUpperCase()] = data.jabatan
          .trim()
          .toUpperCase();
      }
    });
  } catch (error) {
    console.error("Error loading staff cache:", error);
  }
}

const getPrefix = (nama) => {
  if (!nama) return "NOC";
  const cleanName = nama.trim().toUpperCase();
  return staffCache[cleanName] || "NOC";
};

// ===================================================
// B. FUNGSI UTAMA: LOAD & RENDER DATA
// ===================================================
window.loadReports = async function () {
  const rawRole = localStorage.getItem("userRole") || "user";
  const role = rawRole.trim().toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";

  reportContainer.innerHTML = "";
  recapContainer.innerHTML = "";
  loadingStatus.textContent = "Memuat seluruh data laporan...";

  await loadStaffCache();

  const tanggal = document.getElementById("filter-tanggal").value;
  if (!tanggal) {
    loadingStatus.textContent = "Silakan pilih tanggal.";
    return;
  }

  try {
    let query = laporanRef.where("tanggal", "==", tanggal);
    const snapshot = await query.orderBy("timestamp", "desc").get();
    loadingStatus.textContent = "";

    if (snapshot.empty) {
      reportContainer.innerHTML =
        '<p class="text-center text-red-500 font-medium py-10">Tidak ada laporan untuk tanggal ini.</p>';
      return;
    }

    const allDocs = [];
    snapshot.forEach((doc) => {
      const data = { ...doc.data(), id: doc.id };
      allDocs.push(data);
      reportContainer.innerHTML += generateReportCard(data);
    });

    if (isAdmin) {
      const staffRecap = processStaffRecap(allDocs);
      generateRecapCards(staffRecap, tanggal);
    }
  } catch (error) {
    console.error("Error loadReports:", error);
    loadingStatus.textContent = "Gagal memuat data.";
  }
};

// ===================================================
// C. LOGIKA TOMBOL AKSI (SALIN, EDIT, TXT, CSV)
// ===================================================

window.copyReportData = function (reportDataJson) {
  try {
    const reportData = JSON.parse(decodeURIComponent(reportDataJson));
    sessionStorage.setItem("copiedReportData", JSON.stringify(reportData));
    Swal.fire({
      icon: "success",
      title: "Data Disalin!",
      timer: 1500,
      showConfirmButton: false,
    });
    window.location.href = "input_tiket.html";
  } catch (e) {
    console.error(e);
  }
};

window.editReport = function (docId) {
  window.location.href = `input_tiket.html?edit=${docId}`;
};

// 5. HAPUS DATA LAPORAN
window.deleteReport = function (docId) {
  Swal.fire({
    title: "Hapus Laporan?",
    text: "Data yang dihapus tidak dapat dikembalikan!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444", // Merah
    cancelButtonColor: "#6b7280", // Abu-abu
    confirmButtonText: "Ya, Hapus!",
    cancelButtonText: "Batal",
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        // Tampilkan loading
        Swal.fire({
          title: "Menghapus...",
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        // Proses hapus di Firestore
        await laporanRef.doc(docId).delete();

        // Notifikasi sukses
        await Swal.fire({
          icon: "success",
          title: "Terhapus!",
          text: "Laporan telah berhasil dihapus.",
          timer: 1500,
          showConfirmButton: false,
        });

        // Refresh data dashboard
        loadReports();
      } catch (error) {
        console.error("Error deleting report:", error);
        Swal.fire("Gagal", "Terjadi kesalahan saat menghapus data.", "error");
      }
    }
  });
};

// --- FUNGSI TXT SESUAI GAMBAR CONTOH ---
window.exportSingleReportTXT = function (reportDataJson) {
  try {
    const data = JSON.parse(decodeURIComponent(reportDataJson));
    const formatS = (n) => `${getPrefix(n)} ${n.toUpperCase()}`;

    // Header sesuai gambar
    let txt = `NAMA STAFF : ${formatS(data.staf_pelaksana)}\n`;
    txt += `SHIFT : ${data.shift?.toUpperCase()}\n\n`;

    // Bagian Menerima Tiket sesuai format gambar: TKT = NAMA PENGIRIM = STATUS (DAN TUJUAN JIKA TF)
    txt += `MENERIMA TIKET:\n`;
    (data.diterima || []).forEach((item) => {
      let statusText =
        item.status === "TF" ? `TF ${formatS(item.tujuan_staf)}` : item.status;
      txt += `${item.tiket_id} = ${formatS(item.dari_staf)} = ${statusText}\n`;
    });

    // Bagian Menangani Tiket sesuai format gambar: TKT = STATUS (DAN TUJUAN JIKA TF)
    txt += `\nMENANGANI TIKET:\n`;
    (data.ditangani || []).forEach((item) => {
      let aksiText =
        item.aksi === "TF" ? `TF ${formatS(item.tujuan_staf)}` : item.aksi;
      txt += `${item.tiket_id} = ${aksiText}\n`;
    });

    Swal.fire({
      title: "Opsi Export TXT",
      text: "Pilih metode pratinjau atau unduh file",
      icon: "info",
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "Lihat Teks",
      denyButtonText: "Download TXT",
      confirmButtonColor: "#4f46e5",
      denyButtonColor: "#1f2937",
    }).then((res) => {
      if (res.isConfirmed) {
        const w = window.open("", "_blank");
        w.document.write(
          `<pre style="padding:20px; font-family:monospace; line-height:1.5;">${txt}</pre>`
        );
      } else if (res.isDenied) {
        downloadFile(txt, `Laporan_${data.staf_pelaksana}.txt`, "text/plain");
      }
    });
  } catch (e) {
    console.error(e);
  }
};

window.exportSingleReportCSV = function (reportDataJson) {
  try {
    const data = JSON.parse(decodeURIComponent(reportDataJson));
    const headers = [
      "Tanggal",
      "Shift",
      "Staf",
      "Tipe",
      "ID Tiket",
      "Status",
      "Rute",
    ];
    let csv = headers.join(";") + "\n";

    const rows = [];
    (data.diterima || []).forEach((i) =>
      rows.push([
        data.tanggal,
        data.shift,
        data.staf_pelaksana,
        "DITERIMA",
        i.tiket_id,
        i.status,
        i.dari_staf,
      ])
    );
    (data.ditangani || []).forEach((i) =>
      rows.push([
        data.tanggal,
        data.shift,
        data.staf_pelaksana,
        "DITANGANI",
        i.tiket_id,
        i.aksi,
        i.tujuan_staf || "-",
      ])
    );

    csv += rows.map((r) => r.map((f) => `"${f}"`).join(";")).join("\n");
    downloadFile(csv, `Laporan_${data.staf_pelaksana}.csv`, "text/csv");
  } catch (e) {
    console.error(e);
  }
};

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8;` });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ===================================================
// D. UI COMPONENT GENERATOR
// ===================================================
function generateReportCard(data) {
  const role = (localStorage.getItem("userRole") || "user").toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";
  const time = data.timestamp?.toDate
    ? data.timestamp
        .toDate()
        .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const encoded = encodeURIComponent(JSON.stringify(data));

  return `
    <div class="border border-gray-200 rounded-xl shadow-md bg-white overflow-hidden border-l-8 border-indigo-600 mb-8">
        <div class="p-5 bg-white border-b border-gray-100 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <h4 class="text-lg font-black text-gray-800 tracking-tight">
                Laporan Shift <span class="text-indigo-600 uppercase">${
                  data.shift
                }</span> - <span class="text-indigo-600 uppercase">${
    data.staf_pelaksana
  }</span>
                <span class="text-xs font-black text-pink-500 ml-1 bg-pink-50 px-2 py-1 rounded-md border border-pink-100">${getPrefix(
                  data.staf_pelaksana
                )}</span>
            </h4>
            <div class="flex flex-wrap items-center gap-2">
                <button onclick="copyReportData('${encoded}')" class="text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md transition shadow-sm">Salin</button>
                
                <button onclick="exportSingleReportTXT('${encoded}')" class="text-[12px] font-bold text-white bg-gray-700 hover:bg-black px-4 py-2 rounded-md transition shadow-sm">TXT</button>
                
                ${
                  isAdmin
                    ? `
                    <button onclick="editReport('${data.id}')" class="text-[12px] font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-md transition shadow-sm">Edit</button>
                    
                    <button onclick="deleteReport('${data.id}')" class="text-[12px] font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md transition shadow-sm">Hapus</button>
                    
                    <button onclick="exportSingleReportCSV('${encoded}')" class="text-[12px] font-bold text-white bg-green-500 hover:bg-green-600 px-4 py-2 rounded-md transition shadow-sm">CSV</button>
                    `
                    : ""
                }
                
                <span class="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-3 py-2 rounded-md font-bold">${
                  data.tanggal
                } | ${time} WIB</span>
            </div>
        </div>
        <div class="p-6 space-y-8">
            ${renderList("MENERIMA TIKET", data.diterima, "terima")}
            ${renderList("MENANGANI TIKET", data.ditangani, "tangani")}
        </div>
    </div>`;
}

function renderList(title, items, type) {
  const list = (items || [])
    .map((item, i) => {
      const isTF = item.status === "TF" || item.aksi === "TF";
      const status = item.status || item.aksi || "PROGRESS";
      const badge =
        status === "CLOSE"
          ? "bg-green-600"
          : isTF
          ? "bg-blue-500"
          : "bg-yellow-400 text-gray-800";

      // Penyesuaian ikon panah: Warna biru (text-blue-500) dan margin horizontal (mx-2)
      const arrowIcon = `<span class="text-blue-500 font-bold mx-2">➜</span>`;

      let info = "";
      if (type === "terima") {
        info = `dari ${getPrefix(item.dari_staf)} ${item.dari_staf}`;
        if (isTF && item.tujuan_staf) {
          info += `${arrowIcon} ke ${getPrefix(item.tujuan_staf)} ${
            item.tujuan_staf
          }`;
        }
      } else {
        // Untuk bagian MENANGANI TIKET
        info = isTF
          ? `ke ${getPrefix(item.tujuan_staf)} ${item.tujuan_staf}`
          : "Selesai ditangani";
      }

      return `<div class="flex justify-between items-center py-3 px-4 border-b border-gray-100 min-w-[600px] ${
        i % 2 !== 0 ? "bg-gray-50" : ""
      }">
            <span class="text-gray-800 font-mono text-sm font-black w-1/3">${
              item.tiket_id
            }</span>
            <div class="flex-grow text-left text-xs text-gray-500 font-medium">${info}</div>
            <div class="flex-shrink-0 ml-2"><span class="text-[11px] font-bold text-white ${badge} px-3 py-1 rounded min-w-[85px] text-center uppercase inline-block shadow-sm">${
        status === "TF" ? "TRANSFER" : status
      }</span></div>
        </div>`;
    })
    .join("");

  return `<div><p class="text-xs font-black text-indigo-900 mb-4 uppercase tracking-widest flex items-center"><span class="w-2 h-2 bg-indigo-600 rounded-full mr-2"></span> ${title} (${
    (items || []).length
  } ITEM)</p>
    <div class="border rounded-xl overflow-x-auto shadow-sm">${
      list ||
      '<p class="text-gray-400 italic text-sm text-center py-8">Kosong</p>'
    }</div></div>`;
}

// ===================================================
// E. REKAPITULASI
// ===================================================
function processStaffRecap(allReports) {
  const recap = {};
  allReports.forEach((d) => {
    const s = d.staf_pelaksana;
    if (!s) return;
    if (!recap[s])
      recap[s] = { r: { t: 0, c: 0, tf: 0 }, h: { t: 0, c: 0, tf: 0 } };
    if (d.diterima) {
      recap[s].r.t += d.diterima.length;
      d.diterima.forEach((i) => {
        if (i.status === "CLOSE") recap[s].r.c++;
        else if (i.status === "TF") recap[s].r.tf++;
      });
    }
    if (d.ditangani) {
      recap[s].h.t += d.ditangani.length;
      d.ditangani.forEach((i) => {
        if (i.aksi === "CLOSE") recap[s].h.c++;
        else if (i.aksi === "TF") recap[s].h.tf++;
      });
    }
  });
  return recap;
}

function generateRecapCards(recap, tgl) {
  const names = Object.keys(recap).sort();
  if (names.length === 0) return;
  let h = `<div class="col-span-full overflow-x-auto bg-white rounded-xl shadow-md border border-gray-200"><table class="w-full text-left border-collapse">
    <thead><tr class="bg-gray-50 border-b-2 border-gray-200">
      <th class="px-6 py-4 text-xs font-black text-gray-500 uppercase">Staf</th>
      <th class="px-6 py-4 text-xs font-black text-blue-600 uppercase text-center">Menerima</th>
      <th class="px-6 py-4 text-xs font-black text-indigo-600 uppercase text-center">Menangani</th>
      <th class="px-6 py-4 text-xs font-black text-green-600 uppercase text-center">Efektivitas</th>
    </tr></thead><tbody class="divide-y divide-gray-100">`;
  names.forEach((n) => {
    const st = recap[n];
    const total = st.r.t + st.h.t;
    const rate = total > 0 ? Math.round(((st.r.c + st.h.c) / total) * 100) : 0;
    h += `<tr class="hover:bg-blue-50/30 transition-colors text-center">
        <td class="px-6 py-4 text-left"><p class="text-base font-bold text-gray-800">${n}</p><p class="text-[11px] text-pink-500 font-extrabold uppercase">${getPrefix(
      n
    )}</p></td>
        <td class="px-6 py-4"><p class="text-xl font-black">${
          st.r.t
        }</p><div class="flex justify-center gap-2 text-[10px]"><span class="text-green-600">C:${
      st.r.c
    }</span><span class="text-blue-500">T:${st.r.tf}</span></div></td>
        <td class="px-6 py-4"><p class="text-xl font-black">${
          st.h.t
        }</p><div class="flex justify-center gap-2 text-[10px]"><span class="text-green-600">C:${
      st.h.c
    }</span><span class="text-blue-500">T:${st.h.tf}</span></div></td>
        <td class="px-6 py-4"><span class="text-base font-black text-gray-800">${rate}%</span></td></tr>`;
  });
  recapContainer.innerHTML = h + `</tbody></table></div>`;
}

// ===================================================
// F. EVENT LISTENER
// ===================================================
document.addEventListener("DOMContentLoaded", function () {
  const f = document.getElementById("filter-tanggal");
  if (f) f.value = new Date().toISOString().split("T")[0];
});
