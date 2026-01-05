/**
 * js/jadwal_logic.js
 * Sistem Jadwal Terpisah (NOC & Teknisi)
 * Fitur: RBAC (Role-Based Access Control), Card UI, Auto-Color, & Persistence
 */

const dbStaf = db.collection("staf");
const dbJadwal = db.collection("jadwal_staf");

// ==========================================
// 1. FUNGSI UTILITAS & AKSES
// ==========================================

// Cek apakah user memiliki role admin
function getAdminStatus() {
  const rawRole = localStorage.getItem("userRole") || "user";
  const role = rawRole.trim().toLowerCase();
  return role === "admin" || role === "administrator";
}

// Mengatur tampilan tombol admin di halaman
function initAccessControl() {
  const isAdmin = getAdminStatus();
  const adminElements = document.querySelectorAll(".admin-only");

  adminElements.forEach((el) => {
    if (isAdmin) {
      el.classList.remove("hidden");
      // Jika elemen adalah pembungkus tombol (div), gunakan flex
      if (el.tagName === "DIV") el.style.display = "flex";
    } else {
      // Sembunyikan paksa jika bukan admin
      el.style.setProperty("display", "none", "important");
    }
  });
}

// Update warna background sel berdasarkan nilai shift
window.updateCellColor = function (select) {
  const val = select.value;
  const parent = select.parentElement;

  // Reset class tapi pertahankan layout
  parent.className = "border-r p-0 transition-all duration-300 cell-container";

  const colors = {
    P: "bg-blue-100 text-blue-700",
    S: "bg-yellow-100 text-yellow-700",
    M: "bg-purple-100 text-purple-700",
    L: "bg-red-100 text-red-700",
  };

  if (colors[val]) {
    parent.classList.add(...colors[val].split(" "));
  }
};

// ==========================================
// 2. FUNGSI DATABASE (LOAD & SAVE)
// ==========================================

window.loadDataTersimpan = async function (bulan) {
  try {
    const doc = await dbJadwal.doc(bulan).get();
    if (doc.exists) {
      const data = doc.data().shifts;
      Object.keys(data).forEach((staf) => {
        Object.keys(data[staf]).forEach((tgl) => {
          const cell = document.querySelector(
            `.cell-shift[data-staf="${staf}"][data-tgl="${tgl}"]`
          );
          if (cell) {
            cell.value = data[staf][tgl];
            window.updateCellColor(cell);
          }
        });
      });
    }
  } catch (error) {
    console.error("Gagal memuat data:", error);
  }
};

window.simpanJadwal = function () {
  const bulan = document.getElementById("pilih-bulan").value;
  if (!bulan) return Swal.fire("Error", "Pilih bulan terlebih dahulu", "error");

  const shifts = {};
  document.querySelectorAll(".cell-shift").forEach((s) => {
    if (!shifts[s.dataset.staf]) shifts[s.dataset.staf] = {};
    shifts[s.dataset.staf][s.dataset.tgl] = s.value;
  });

  dbJadwal
    .doc(bulan)
    .set({
      shifts,
      last_updated: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() =>
      Swal.fire("Tersimpan", "Jadwal berhasil dipublikasikan.", "success")
    )
    .catch((err) =>
      Swal.fire("Gagal", "Anda tidak memiliki izin akses.", "error")
    );
};

// ==========================================
// 3. FUNGSI RENDER TABEL
// ==========================================

window.renderTable = async function () {
  const pilihBulan = document.getElementById("pilih-bulan").value;
  if (!pilihBulan) return;

  const [tahun, bulan] = pilihBulan.split("-");
  const jumlahHari = new Date(tahun, bulan, 0).getDate();

  // Pastikan tombol admin menyesuaikan role setiap kali render
  initAccessControl();

  try {
    const snapshot = await dbStaf.get();
    const listNoc = [];
    const listTeknisi = [];

    snapshot.forEach((doc) => {
      const d = doc.data();
      const nama = d.nama || "Tanpa Nama";
      const jab = (d.jabatan || "").toUpperCase();
      if (jab === "NOC") listNoc.push(nama);
      if (jab === "TEKNISI") listTeknisi.push(nama);
    });

    renderStrukturTabel(listNoc, jumlahHari, "container-tabel-noc", "NOC");
    renderStrukturTabel(
      listTeknisi,
      jumlahHari,
      "container-tabel-teknisi",
      "Teknisi"
    );

    window.loadDataTersimpan(pilihBulan);
  } catch (error) {
    console.error("Firebase Error:", error);
  }
};

function renderStrukturTabel(daftarNama, jumlahHari, containerId, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isAdmin = getAdminStatus();
  const disabledAttr = isAdmin ? "" : "disabled";
  const cursorClass = isAdmin ? "cursor-pointer" : "cursor-default opacity-90";

  if (daftarNama.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-gray-400 italic bg-white rounded-xl shadow-sm border border-gray-100">Belum ada data staf ${label}.</div>`;
    return;
  }

  let html = `
    <div class="mb-10 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center gap-3 mb-4">
            <div class="w-1 h-6 bg-indigo-600 rounded-full"></div>
            <h3 class="font-black text-slate-800 tracking-tight uppercase text-sm">Tabel Jadwal Tim ${label}</h3>
        </div>
        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-sm text-center border-collapse">
                <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                    <tr>
                        <th class="p-4 sticky-col bg-slate-50 z-20 border-r w-40 text-left shadow-[4px_0_10px_rgba(0,0,0,0.03)]">Nama ${label}</th>`;

  for (let i = 1; i <= jumlahHari; i++) {
    html += `<th class="p-2 border-r min-w-[45px]">${i}</th>`;
  }

  html += `</tr></thead><tbody class="divide-y divide-gray-100">`;

  daftarNama.forEach((nama) => {
    html += `<tr>
        <td class="p-3 border-r sticky-col font-bold text-[11px] text-slate-700 bg-white shadow-[4px_0_10px_rgba(0,0,0,0.02)] text-left uppercase">${nama}</td>`;
    for (let i = 1; i <= jumlahHari; i++) {
      html += `<td class="border-r p-0 cell-container">
                <select ${disabledAttr} onchange="window.updateCellColor(this)" 
                        class="cell-shift w-full h-11 text-center bg-transparent border-none appearance-none ${cursorClass} font-bold text-[11px] transition-all focus:ring-2 focus:ring-indigo-500/20" 
                        data-staf="${nama}" data-tgl="${i}">
                    <option value="">-</option>
                    <option value="P">P</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                </select>
            </td>`;
    }
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  html += renderLegendaHTML();
  html += `</div>`;

  container.innerHTML = html;
}

function renderLegendaHTML() {
  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 px-1">
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-blue-100 bg-blue-50/40">
            <div class="w-7 h-7 flex items-center justify-center bg-blue-500 text-white rounded-lg shadow-sm font-black text-xs">P</div>
            <div class="flex flex-col"><span class="text-[10px] font-bold text-blue-600 uppercase">Shift Pagi</span><span class="text-[9px] text-slate-500">08:00 - 16:00</span></div>
        </div>
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-yellow-200 bg-yellow-50/40">
            <div class="w-7 h-7 flex items-center justify-center bg-yellow-400 text-white rounded-lg shadow-sm font-black text-xs">S</div>
            <div class="flex flex-col"><span class="text-[10px] font-bold text-yellow-700 uppercase">Shift Sore</span><span class="text-[9px] text-slate-500">15:00 - 23:00</span></div>
        </div>
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-purple-100 bg-purple-50/40">
            <div class="w-7 h-7 flex items-center justify-center bg-purple-500 text-white rounded-lg shadow-sm font-black text-xs">M</div>
            <div class="flex flex-col"><span class="text-[10px] font-bold text-purple-600 uppercase">Shift Malam</span><span class="text-[9px] text-slate-500">23:00 - 08:00</span></div>
        </div>
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-red-100 bg-red-50/40">
            <div class="w-7 h-7 flex items-center justify-center bg-red-500 text-white rounded-lg shadow-sm font-black text-xs">L</div>
            <div class="flex flex-col"><span class="text-[10px] font-bold text-red-600 uppercase">Libur</span><span class="text-[9px] text-slate-500">Off Day</span></div>
        </div>
    </div>`;
}

// ==========================================
// 4. FUNGSI LOGIKA JADWAL (ADMIN ONLY)
// ==========================================

window.generatePolaOtomatis = function () {
  const pilihBulan = document.getElementById("pilih-bulan").value;
  if (!pilihBulan) return Swal.fire("Pilih Bulan", "", "warning");

  const [tahun, bulan] = pilihBulan.split("-");
  const jumlahHari = new Date(tahun, bulan, 0).getDate();

  ["container-tabel-noc", "container-tabel-teknisi"].forEach((id) => {
    const tableSelects = document.querySelectorAll(`#${id} .cell-shift`);
    if (tableSelects.length === 0) return;

    const stafInTable = [
      ...new Set(Array.from(tableSelects).map((s) => s.dataset.staf)),
    ];
    const n = stafInTable.length;

    let polaInduk =
      id === "container-tabel-teknisi"
        ? ["P", "P", "P", "P", "S", "M", "L", "L"]
        : ["P", "P", "S", "S", "M", "M", "L", "L"];

    const totalLen = polaInduk.length;
    const jeda = totalLen / n;

    stafInTable.forEach((nama, sIdx) => {
      for (let tgl = 1; tgl <= jumlahHari; tgl++) {
        const cell = document.querySelector(
          `#${id} .cell-shift[data-staf="${nama}"][data-tgl="${tgl}"]`
        );
        if (cell) {
          const idx = Math.floor((tgl - 1 + sIdx * jeda) % totalLen);
          cell.value = polaInduk[idx];
          window.updateCellColor(cell);
        }
      }
    });
  });
  Swal.fire("Selesai", "Pola rotasi berhasil dibuat secara merata.", "success");
};

window.resetJadwalLokal = function () {
  const pilihBulan = document.getElementById("pilih-bulan").value;
  if (!pilihBulan) return;

  Swal.fire({
    title: "Hapus Permanen?",
    text: "Tabel akan dikosongkan dan data di database akan dihapus!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Ya, Reset!",
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#6b7280",
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        await dbJadwal.doc(pilihBulan).delete();
        document.querySelectorAll(".cell-shift").forEach((s) => {
          s.value = "";
          window.updateCellColor(s);
        });
        Swal.fire("Berhasil", "Jadwal telah dibersihkan.", "success");
      } catch (e) {
        Swal.fire("Error", e.message, "error");
      }
    }
  });
};

// ==========================================
// 5. STARTUP
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  // Set default ke bulan sekarang
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const inputBulan = document.getElementById("pilih-bulan");
  if (inputBulan) inputBulan.value = yearMonth;

  setTimeout(() => {
    window.renderTable();
  }, 1000);
});
