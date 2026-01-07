/**
 * js/jadwal_logic.js
 * Fitur: Konfirmasi Simpan, Pilar Hari Ini, & Proteksi Input Bulan (RBAC)
 */

const dbStaf = db.collection("staf");
const dbJadwal = db.collection("jadwal_staf");

// ==========================================
// 1. STYLE & ANIMASI (Pilar Vertikal)
// ==========================================
const styleFix = document.createElement("style");
styleFix.innerHTML = `
  @keyframes neon-pillar {
    0% { border-color: #fbbf24; box-shadow: inset 0 0 8px rgba(251, 191, 36, 0.2); }
    50% { border-color: #f59e0b; box-shadow: inset 0 0 18px rgba(251, 191, 36, 0.4); }
    100% { border-color: #fbbf24; box-shadow: inset 0 0 8px rgba(251, 191, 36, 0.2); }
  }
  
  .animate-pillar {
    animation: neon-pillar 1.5s infinite ease-in-out;
    border-left: 4px solid #fbbf24 !important;
    border-right: 4px solid #fbbf24 !important;
    position: relative;
    z-index: 5 !important; 
  }

  .sticky-col {
    position: sticky !important;
    left: 0;
    z-index: 40 !important; 
    background-color: white !important;
    border-right: 2px solid #e2e8f0 !important;
  }

  thead th.sticky-col { z-index: 50 !important; }
  .table-schedule { border-collapse: separate !important; border-spacing: 0 !important; }
  .animate-pillar { border-bottom: none !important; }
`;
document.head.appendChild(styleFix);

// ==========================================
// 2. FUNGSI UTILITAS & AKSES (RBAC)
// ==========================================
function getAdminStatus() {
  const rawRole = localStorage.getItem("userRole") || "user";
  return (
    rawRole.trim().toLowerCase() === "admin" ||
    rawRole.trim().toLowerCase() === "administrator"
  );
}

function initAccessControl() {
  const isAdmin = getAdminStatus();

  // 1. Kontrol elemen tombol khusus admin
  document.querySelectorAll(".admin-only").forEach((el) => {
    if (isAdmin) {
      el.classList.remove("hidden");
      if (el.tagName === "DIV") el.style.display = "flex";
    } else {
      el.style.setProperty("display", "none", "important");
    }
  });

  // 2. Kontrol Input Bulan (Proteksi)
  const inputBulan = document.getElementById("pilih-bulan");
  if (inputBulan) {
    if (isAdmin) {
      inputBulan.disabled = false;
      inputBulan.classList.remove("bg-gray-50", "cursor-not-allowed");
    } else {
      inputBulan.disabled = true;
      inputBulan.classList.add("bg-gray-50", "cursor-not-allowed");
      // Opsional: Hilangkan icon panah select pada user biasa agar terlihat statis
      inputBulan.style.appearance = "none";
    }
  }
}

window.updateCellColor = function (select) {
  const val = select.value;
  const parent = select.parentElement;
  const isPillar = parent.classList.contains("animate-pillar");

  parent.className =
    "p-0 transition-all duration-300 cell-container " +
    (isPillar ? "animate-pillar bg-amber-50/30 " : "border-r border-gray-100 ");

  const colors = {
    P: "bg-blue-100 text-blue-700",
    S: "bg-yellow-100 text-yellow-700",
    M: "bg-purple-100 text-purple-700",
    L: "bg-red-100 text-red-700",
  };
  if (colors[val]) parent.classList.add(...colors[val].split(" "));
};

// ==========================================
// 3. FUNGSI DATABASE (SAVE & RESET)
// ==========================================

window.simpanJadwal = function () {
  const bulan = document.getElementById("pilih-bulan").value;
  if (!bulan) return Swal.fire("Error", "Pilih bulan terlebih dahulu", "error");

  Swal.fire({
    title: "Simpan Jadwal?",
    text: `Konfirmasi publikasi jadwal bulan ${bulan}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: "#6b7280",
    confirmButtonText: "Ya, Simpan!",
    cancelButtonText: "Batal",
  }).then((result) => {
    if (result.isConfirmed) {
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
          Swal.fire("Berhasil", "Jadwal telah diperbarui.", "success")
        )
        .catch(() => Swal.fire("Gagal", "Akses ditolak.", "error"));
    }
  });
};

window.resetJadwalLokal = function () {
  const pilihBulan = document.getElementById("pilih-bulan").value;
  if (!pilihBulan) return;

  Swal.fire({
    title: "Hapus Data?",
    text: "Tindakan ini tidak dapat dibatalkan!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Ya, Hapus!",
    confirmButtonColor: "#ef4444",
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        await dbJadwal.doc(pilihBulan).delete();
        document.querySelectorAll(".cell-shift").forEach((s) => {
          s.value = "";
          window.updateCellColor(s);
        });
        Swal.fire("Terhapus", "Data berhasil dibersihkan.", "success");
      } catch (e) {
        Swal.fire("Error", e.message, "error");
      }
    }
  });
};

// ==========================================
// 4. RENDER & LOGIKA TABEL
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
    console.error("Load Error:", error);
  }
};

window.renderTable = async function () {
  const inputBulan = document.getElementById("pilih-bulan").value;
  if (!inputBulan) return;
  const [tahun, bulan] = inputBulan.split("-");
  const jumlahHari = new Date(tahun, bulan, 0).getDate();

  initAccessControl(); // Jalankan proteksi RBAC

  try {
    const snapshot = await dbStaf.get();
    const listNoc = [];
    const listTeknisi = [];
    snapshot.forEach((doc) => {
      const d = doc.data();
      const jab = (d.jabatan || "").toUpperCase();
      if (jab === "NOC") listNoc.push(d.nama);
      if (jab === "TEKNISI") listTeknisi.push(d.nama);
    });

    renderStrukturTabel(listNoc, jumlahHari, "container-tabel-noc", "NOC");
    renderStrukturTabel(
      listTeknisi,
      jumlahHari,
      "container-tabel-teknisi",
      "Teknisi"
    );
    window.loadDataTersimpan(inputBulan);
  } catch (error) {
    console.error("Firebase Error:", error);
  }
};

function renderStrukturTabel(daftarNama, jumlahHari, containerId, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isAdmin = getAdminStatus();
  const disabledAttr = isAdmin ? "" : "disabled";

  const skrg = new Date();
  const tToday = skrg.getDate();
  const bToday = skrg.getMonth() + 1;
  const thToday = skrg.getFullYear();
  const [thPilih, blPilih] = document
    .getElementById("pilih-bulan")
    .value.split("-")
    .map(Number);

  let html = `
    <div class="mb-10 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center gap-3 mb-4">
            <div class="w-1 h-6 bg-indigo-600 rounded-full"></div>
            <h3 class="font-black text-slate-800 tracking-tight uppercase text-sm">Tabel Jadwal Tim ${label}</h3>
        </div>
        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="table-schedule w-full text-sm text-center">
                <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                    <tr>
                        <th class="p-4 sticky-col w-40 text-left">Nama ${label}</th>`;

  for (let i = 1; i <= jumlahHari; i++) {
    const isToday = i === tToday && blPilih === bToday && thPilih === thToday;
    const hClass = isToday
      ? "bg-indigo-700 text-white animate-pillar shadow-lg"
      : "border-r border-b border-gray-200";
    html += `<th class="p-2 min-w-[45px] ${hClass}">${i}</th>`;
  }

  html += `</tr></thead><tbody class="divide-y divide-gray-100">`;

  daftarNama.forEach((nama) => {
    html += `<tr>
        <td class="p-3 sticky-col font-bold text-[11px] text-slate-700 uppercase">${nama}</td>`;

    for (let i = 1; i <= jumlahHari; i++) {
      const isToday = i === tToday && blPilih === bToday && thPilih === thToday;
      const bClass = isToday
        ? "animate-pillar bg-amber-50/30"
        : "border-r border-gray-100";
      html += `<td class="p-0 cell-container ${bClass}">
                <select ${disabledAttr} onchange="window.updateCellColor(this)" 
                        class="cell-shift w-full h-11 text-center bg-transparent border-none appearance-none font-bold text-[11px]" 
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

  html += `</tbody></table></div></div>`;
  container.innerHTML = html;
}

window.generatePolaOtomatis = function () {
  const pilihBulan = document.getElementById("pilih-bulan").value;
  if (!pilihBulan) return;
  const [tahun, bulan] = pilihBulan.split("-");
  const jumlahHari = new Date(tahun, bulan, 0).getDate();
  ["container-tabel-noc", "container-tabel-teknisi"].forEach((id) => {
    const tableSelects = document.querySelectorAll(`#${id} .cell-shift`);
    const stafInTable = [
      ...new Set(Array.from(tableSelects).map((s) => s.dataset.staf)),
    ];
    if (stafInTable.length === 0) return;
    let polaInduk =
      id === "container-tabel-teknisi"
        ? ["P", "P", "P", "P", "S", "M", "L", "L"]
        : ["P", "P", "S", "S", "M", "M", "L", "L"];
    stafInTable.forEach((nama, sIdx) => {
      for (let tgl = 1; tgl <= jumlahHari; tgl++) {
        const cell = document.querySelector(
          `#${id} .cell-shift[data-staf="${nama}"][data-tgl="${tgl}"]`
        );
        if (cell) {
          const idx = Math.floor(
            (tgl - 1 + sIdx * (polaInduk.length / stafInTable.length)) %
              polaInduk.length
          );
          cell.value = polaInduk[idx];
          window.updateCellColor(cell);
        }
      }
    });
  });
};

// ==========================================
// 5. STARTUP
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const inputBulan = document.getElementById("pilih-bulan");

  if (inputBulan) {
    inputBulan.value = yearMonth;
    // Panggil akses kontrol segera agar input langsung terkunci jika user biasa
    initAccessControl();
  }

  setTimeout(() => {
    window.renderTable();
  }, 1000);
});
