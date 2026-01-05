// js/input_logic.js

const stafRef = db.collection("staf");
const laporanRef = db.collection("laporan_harian");
const inputStaf = document.getElementById("input-staf");
const transferInContainer = document.getElementById("transfer-in-container");
const handlingContainer = document.getElementById("handling-container");
const laporanForm = document.getElementById("laporan-form");
const notepadCollection = db.collection("quick_notes");
const chatRef = db.collection("template_chat");

let stafDataCache = [];
let isEditMode = false;
let editDocId = null;
let isFormDirty = false; // Flag untuk mendeteksi perubahan data

// ===================================================
// 1. INITIALIZATION & DROPDOWN
// ===================================================
async function initForm() {
  await loadStafDropdown();

  // Cek apakah mode EDIT (dari URL)
  const urlParams = new URLSearchParams(window.location.search);
  editDocId = urlParams.get("edit");

  if (editDocId) {
    setupEditMode(editDocId);
  } else {
    // Jika bukan edit, cek apakah ada data SALINAN di sessionStorage
    loadCopiedData();

    // OTOMATISASI SHIFT:
    // Jika setelah loadCopiedData (atau form baru) shift masih kosong/default,
    // maka isi otomatis berdasarkan jam saat ini.
    const shiftElem = document.getElementById("input-shift");
    if (shiftElem) {
      shiftElem.value = getAutomaticShift();
    }

    // Opsional: Otomatisasi Tanggal hari ini jika belum terisi
    const tglElem = document.getElementById("input-tanggal");
    if (tglElem && !tglElem.value) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      tglElem.value = `${year}-${month}-${day}`;
    }
  }
}

async function loadStafDropdown() {
  try {
    const snapshot = await stafRef.orderBy("nama").get();
    stafDataCache = [];

    // Pastikan elemen aktif dan bisa diklik oleh SEMUA role
    inputStaf.disabled = false;
    inputStaf.style.cursor = "default";
    inputStaf.classList.remove(
      "bg-gray-200",
      "cursor-not-allowed",
      "opacity-50"
    );
    inputStaf.classList.add("bg-white");

    inputStaf.innerHTML =
      '<option value="" disabled selected>Pilih Staf Pelaksana</option>';

    snapshot.forEach((doc) => {
      const data = doc.data();
      stafDataCache.push(data.nama);
      const option = document.createElement("option");
      option.value = data.nama;
      option.textContent = data.nama.toUpperCase();
      inputStaf.appendChild(option);
    });

    localStorage.setItem(
      "staffCache",
      JSON.stringify(stafDataCache.map((n) => ({ nama: n })))
    );
  } catch (error) {
    console.error("Error memuat staf:", error);
  }
}

function generateStafOptions(selectedValue = "") {
  return stafDataCache
    .map((nama) => {
      const upName = nama.toUpperCase();
      const selected = upName === selectedValue.toUpperCase() ? "selected" : "";
      return `<option value="${upName}" ${selected}>${nama.toUpperCase()}</option>`;
    })
    .join("");
}

// ===================================================
// 2. LOGIKA EDIT MODE (DARI FIRESTORE)
// ===================================================
async function setupEditMode(docId) {
  isEditMode = true;
  const btn = document.getElementById("submit-btn");
  const indicator = document.getElementById("edit-indicator");
  const subtitle = document.getElementById("form-subtitle");

  // AMBIL ELEMEN CATATAN CEPAT
  const quickNoteSection = document.getElementById("quick-note-section");

  if (btn) btn.textContent = "Update Laporan (Mode Edit)";
  if (indicator) indicator.classList.remove("hidden");
  if (subtitle) subtitle.textContent = "Edit Laporan Terdaftar";

  // SEMBUNYIKAN CATATAN CEPAT SAAT MODE EDIT AKTIF
  if (quickNoteSection) {
    quickNoteSection.style.display = "none";
  }

  try {
    const doc = await laporanRef.doc(docId).get();
    if (doc.exists) {
      const data = doc.data();
      fillFormData(data);
    } else {
      Swal.fire("Error", "Data tidak ditemukan", "error");
    }
  } catch (error) {
    console.error("Error setupEditMode:", error);
  }
}

// ===================================================
// 3. LOGIKA SALIN DATA (DARI SESSION STORAGE)
// ===================================================
async function loadCopiedData() {
  const copiedDataJson = sessionStorage.getItem("copiedReportData");
  if (!copiedDataJson) {
    if (transferInContainer) transferInContainer.innerHTML = "";
    if (handlingContainer) handlingContainer.innerHTML = "";
    addTransferInRow();
    addHandlingRow();
    return;
  }

  try {
    const data = JSON.parse(copiedDataJson);
    // Ambil nama staf pelaksana dari laporan yang disalin untuk mengisi kolom "Dari Staf"
    const stafLaporanLama = data.staf_pelaksana;

    // --- LANGKAH 1: Ambil Referensi Jabatan Staf dari Firestore ---
    const stafSnapshot = await db.collection("staf").get();
    const mapJabatan = {};

    stafSnapshot.forEach((doc) => {
      const d = doc.data();
      if (d.nama && d.jabatan) {
        mapJabatan[d.nama.toUpperCase()] = d.jabatan.toUpperCase();
      }
    });

    // --- LANGKAH 2: Proses Data "Menerima Tiket" (Data Lama di Atas) ---
    let listMenerimaBaru = [];
    const oldDiterima = data.diterima || [];

    oldDiterima.forEach((item) => {
      const status = (item.status || "").toUpperCase();
      const namaTujuan = (item.tujuan_staf || "").toUpperCase();
      const jabatanTujuan = mapJabatan[namaTujuan] || "";

      // A. Jika status CLOSE -> Hapus (abaikan)
      if (status === "CLOSE") return;

      // B. Jika status TF, cek jabatan tujuannya
      if (status === "TF") {
        // Jika TF ke selain NOC (Teknisi, Biller, FAT, Logistik) -> Hapus (abaikan)
        if (jabatanTujuan !== "NOC") {
          console.log(
            `❌ Tiket ${item.tiket_id} dihapus (TF ke ${jabatanTujuan}: ${namaTujuan})`
          );
          return;
        }
      }

      // Selain kondisi di atas (misal masih PROGRESS atau TF ke NOC), masukkan ke list baru
      // Kolom 'dari_staf' otomatis diisi dengan nama staf dari laporan yang disalin
      listMenerimaBaru.push({
        tiket_id: item.tiket_id,
        dari_staf: stafLaporanLama,
        status: "PROGRESS",
        tujuan_staf: null,
      });
    });

    // --- LANGKAH 3: Proses Data "Menangani Tiket" (Data Operan ke Atas) ---
    const listMenanganiLama = data.ditangani || [];

    listMenanganiLama.forEach((item) => {
      const aksi = (item.aksi || "").toUpperCase();
      const namaTujuan = (item.tujuan_staf || "").toUpperCase();
      const jabatanTujuan = mapJabatan[namaTujuan] || "";

      const isTransfer = aksi === "TF" || aksi === "TRANSFER";

      if (isTransfer) {
        // Cek: Hanya jika jabatan tujuannya adalah NOC, maka pindah ke bagian Menerima
        if (jabatanTujuan === "NOC") {
          listMenerimaBaru.push({
            tiket_id: item.tiket_id,
            // Tiket ini operan dari staf sebelumnya, maka 'dari_staf' adalah pemilik laporan tersebut
            dari_staf: stafLaporanLama,
            status: "PROGRESS",
            tujuan_staf: null,
          });
          console.log(
            `✅ ${item.tiket_id} Pindah ke Menerima (Operan ke NOC: ${namaTujuan})`
          );
        } else {
          // Jika TF ke Teknisi, FAT, Biller, atau Logistik -> Hapus (abaikan)
          console.log(
            `❌ ${item.tiket_id} Dihilangkan (Transfer keluar ke ${jabatanTujuan})`
          );
        }
      }
    });

    // --- LANGKAH 4: Pasang ke Form & Bersihkan Kontainer ---
    const dataSiapInput = {
      ...data,
      diterima: listMenerimaBaru,
      ditangani: [], // Selalu kosongkan bagian menangani untuk input baru
    };

    if (transferInContainer) transferInContainer.innerHTML = "";
    if (handlingContainer) handlingContainer.innerHTML = "";

    fillFormData(dataSiapInput);

    // Hapus data mentah dari session agar tidak ter-load ulang saat refresh
    sessionStorage.removeItem("copiedReportData");

    Swal.fire({
      icon: "success",
      title: "Sinkronisasi Berhasil",
      text: `Tiket operan dari ${stafLaporanLama} telah disusun otomatis.`,
      timer: 2500,
    });
  } catch (e) {
    console.error("Gagal sinkronisasi data:", e);
  }
}

function getAutomaticShift() {
  const hour = new Date().getHours(); // Mengambil jam saat ini (0-23)

  if (hour >= 8 && hour < 16) {
    return "PAGI";
  } else if (hour >= 16 && hour < 23) {
    return "SORE";
  } else {
    // Jam 23.00 sampai 07.59
    return "MALAM";
  }
}

function fillFormData(data) {
  const shiftElem = document.getElementById("input-shift");
  const tglElem = document.getElementById("input-tanggal");

  // 1. Pastikan semua elemen aktif & kursor normal untuk SEMUA user
  [inputStaf, shiftElem, tglElem].forEach((el) => {
    if (el) {
      el.disabled = false;
      el.readOnly = false; // Memastikan tidak hanya baca
      el.style.cursor = "default";
      el.classList.remove("bg-gray-200", "cursor-not-allowed", "opacity-50");
      el.classList.add("bg-white");
    }
  });

  // 2. LOGIKA STAF PELAKSANA (Kondisional)
  if (isEditMode) {
    inputStaf.value = data.staf_pelaksana || "";
  } else {
    // Mode Salin: dikosongkan agar user pilih sendiri, tapi dipastikan BISA dipilih
    inputStaf.value = "";
  }

  // 3. LOGIKA SHIFT (Kondisional)
  if (isEditMode) {
    if (shiftElem) shiftElem.value = data.shift || "";
  } else {
    if (shiftElem) shiftElem.value = getAutomaticShift();
  }

  // 4. LOGIKA TANGGAL
  if (data.tanggal && tglElem) {
    tglElem.value = data.tanggal;
  }

  // 5. Reset dan isi kontainer tiket
  transferInContainer.innerHTML = "";
  handlingContainer.innerHTML = "";

  if (data.diterima && data.diterima.length > 0) {
    data.diterima.forEach((item) => addTransferInRow(item));
  } else {
    addTransferInRow();
  }

  if (data.ditangani && data.ditangani.length > 0) {
    data.ditangani.forEach((item) => addHandlingRow(item));
  } else {
    addHandlingRow();
  }

  // 6. AKTIFKAN PROTEKSI TUTUP TAB
  isFormDirty = true;
}

// ===================================================
// 4. GENERATOR BARIS (UI)
// ===================================================
window.addTransferInRow = function (data = {}) {
  const rowId = `ti-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const div = document.createElement("div");
  div.id = rowId;
  div.className =
    "flex flex-col md:flex-row md:items-center p-3 border rounded-md bg-indigo-50 shadow-sm space-y-2 md:space-y-0 md:space-x-2 mb-2 transition-all";

  const tiket = data.tiket_id || "";
  const status = data.status || "PROGRESS";
  const dari = data.dari_staf || "";
  const tujuan = data.tujuan_staf || "";

  div.innerHTML = `
        <div class="w-full md:w-1/4">
            <input type="text" name="tiket_diterima" placeholder="ID Tiket" required value="${tiket}" 
                oninput="this.value = this.value.replace(/\\s+/g, '').toUpperCase()" 
                onchange="window.checkDuplicateRealTime(this)"
                class="w-full p-2 border rounded-md text-sm bg-white font-mono transition-all focus:ring-2 focus:ring-indigo-400">
        </div>
        <div class="w-full md:w-1/6">
            <select name="status_terima" onchange="toggleTransferTarget(this)" class="w-full p-2 border rounded-md text-sm bg-white">
                <option value="PROGRESS" ${
                  status === "PROGRESS" ? "selected" : ""
                }>PROGRESS</option>
                <option value="CLOSE" ${
                  status === "CLOSE" ? "selected" : ""
                }>CLOSE</option>
                <option value="TF" ${
                  status === "TF" ? "selected" : ""
                }>TF</option>
            </select>
        </div>
        <div class="w-full md:w-1/4">
            <select name="dari_staf" required class="w-full p-2 border rounded-md text-sm bg-white">
                <option value="">Dari Staf...</option>
                ${generateStafOptions(dari)}
            </select>
        </div>
        <div class="flex-grow">
            <select name="staf_tujuan_diterima" class="w-full p-2 border rounded-md text-sm transfer-target bg-gray-200" disabled>
                <option value="">TF ke...</option>
                ${generateStafOptions(tujuan)}
            </select>
        </div>
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="bg-red-500 text-white p-2 rounded-md hover:bg-red-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-width="2"></path></svg>
        </button>
    `;
  transferInContainer.appendChild(div);
  toggleTransferTarget(div.querySelector('[name="status_terima"]'));
};

window.addHandlingRow = function (data = {}) {
  const rowId = `hd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const div = document.createElement("div");
  div.id = rowId;
  div.className =
    "flex flex-col md:flex-row md:items-center p-3 border rounded-md bg-indigo-50 shadow-sm space-y-2 md:space-y-0 md:space-x-2 mb-2 transition-all";

  const tiket = data.tiket_id || "";
  const aksi = data.aksi || "PROGRESS";
  const tujuan = data.tujuan_staf || "";

  div.innerHTML = `
        <div class="w-full md:w-1/2">
            <input type="text" name="tiket_ditangani" placeholder="ID Tiket" required value="${tiket}" 
                oninput="this.value = this.value.replace(/\\s+/g, '').toUpperCase()" 
                onchange="window.checkDuplicateRealTime(this)"
                class="w-full p-2 border rounded-md text-sm bg-white font-mono transition-all focus:ring-2 focus:ring-indigo-400">
        </div>
        <div class="w-full md:w-1/6">
            <select name="aksi_handling" onchange="toggleTransferTarget(this)" class="w-full p-2 border rounded-md text-sm bg-white">
                <option value="PROGRESS" ${
                  aksi === "PROGRESS" ? "selected" : ""
                }>PROGRESS</option>
                <option value="CLOSE" ${
                  aksi === "CLOSE" ? "selected" : ""
                }>CLOSE</option>
                <option value="TF" ${
                  aksi === "TF" ? "selected" : ""
                }>TF</option>
            </select>
        </div>
        <div class="flex-grow">
            <select name="staf_tujuan" class="w-full p-2 border rounded-md text-sm transfer-target bg-gray-200" disabled>
                <option value="">TF ke...</option>
                ${generateStafOptions(tujuan)}
            </select>
        </div>
        <button type="button" onclick="document.getElementById('${rowId}').remove()" class="bg-red-500 text-white p-2 rounded-md hover:bg-red-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-width="2"></path></svg>
        </button>
    `;
  handlingContainer.appendChild(div);
  toggleTransferTarget(div.querySelector('[name="aksi_handling"]'));
};

window.toggleTransferTarget = function (select) {
  const row = select.closest(".flex-col"); // Mengambil container baris
  const target = row.querySelector(".transfer-target");

  // 1. Bersihkan semua class warna latar belakang sebelumnya
  row.classList.remove(
    "bg-red-100",
    "bg-green-100",
    "bg-yellow-100",
    "bg-indigo-50"
  );

  // 2. Logika Perubahan Warna Baris sesuai permintaan baru
  if (select.value === "CLOSE") {
    row.classList.add("bg-red-100"); // MERAH
  } else if (select.value === "PROGRESS") {
    row.classList.add("bg-green-100"); // HIJAU
  } else if (select.value === "TF") {
    row.classList.add("bg-yellow-100"); // KUNING
  } else {
    row.classList.add("bg-indigo-50"); // Default
  }

  // 3. Logika Aktif/Nonaktif Select Tujuan (TF)
  if (select.value === "TF") {
    target.disabled = false;
    target.classList.remove("bg-gray-200");
    target.classList.add("bg-white");
    target.required = true;
  } else {
    target.disabled = true;
    target.classList.remove("bg-white");
    target.classList.add("bg-gray-200");
    target.value = "";
    target.required = false;
  }
};

// ===================================================
// 5. PROTEKSI DATA (BEFORE UNLOAD)
// ===================================================
laporanForm.addEventListener("input", () => {
  isFormDirty = true;
});

window.addEventListener("beforeunload", (e) => {
  if (isFormDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ===================================================
// 6. SIMPAN / UPDATE KE FIRESTORE
// ===================================================
laporanForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const result = await Swal.fire({
    title: "Simpan Laporan?",
    text: "Pastikan semua data tiket dan rute transfer sudah benar.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#4f46e5",
    cancelButtonColor: "#ef4444",
    confirmButtonText: "Ya, Simpan",
    cancelButtonText: "Cek Kembali",
  });

  if (!result.isConfirmed) return;

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  Swal.fire({
    title: "Sedang Menyimpan...",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  const reportData = {
    staf_pelaksana: inputStaf.value,
    shift: document.getElementById("input-shift").value,
    tanggal: document.getElementById("input-tanggal").value,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    diterima: Array.from(transferInContainer.children).map((row) => ({
      tiket_id: row
        .querySelector('[name="tiket_diterima"]')
        .value.toUpperCase(),
      status: row.querySelector('[name="status_terima"]').value,
      dari_staf: row.querySelector('[name="dari_staf"]').value,
      tujuan_staf: row.querySelector(".transfer-target").value || null,
    })),
    ditangani: Array.from(handlingContainer.children).map((row) => ({
      tiket_id: row
        .querySelector('[name="tiket_ditangani"]')
        .value.toUpperCase(),
      aksi: row.querySelector('[name="aksi_handling"]').value,
      tujuan_staf: row.querySelector(".transfer-target").value || null,
    })),
  };

  try {
    if (isEditMode && editDocId) {
      await laporanRef.doc(editDocId).update(reportData);
      isFormDirty = false; // Reset flag dirty
      Swal.fire({
        icon: "success",
        title: "Berhasil",
        text: "Laporan diperbarui!",
        timer: 1500,
        showConfirmButton: false,
      }).then(() => (window.location.href = "index.html"));
    } else {
      await laporanRef.add(reportData);
      isFormDirty = false; // Reset flag dirty
      Swal.fire({
        icon: "success",
        title: "Berhasil",
        text: "Laporan disimpan!",
        timer: 1500,
        showConfirmButton: false,
      }).then(() => window.location.reload());
    }
  } catch (err) {
    console.error(err);
    Swal.fire("Gagal", "Terjadi kesalahan sistem.", "error");
    btn.disabled = false;
    btn.textContent = "Simpan Laporan";
  }
});

// ===================================================
// LOGIKA UBAH MASSAL (MASS EDIT)
// ===================================================

/**
 * Membuka modal SweetAlert2 untuk mengubah status dan staf tujuan
 * pada banyak baris sekaligus.
 */
window.openMassEditModal = async function () {
  if (typeof Swal === "undefined") return;

  const { value: formValues } = await Swal.fire({
    title: "Ubah Massal Data Tiket",
    html: `
            <div class="text-left space-y-4">
                <div class="mb-3">
                    <label class="block text-sm font-bold mb-1 text-gray-700">Target Perubahan:</label>
                    <select id="swal-target" class="swal2-input !m-0 !w-full !text-sm bg-gray-50">
                        <option value="terima">Hanya Baris "Menerima Tiket"</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold mb-1 text-gray-700">Set "Menerima Dari" Menjadi:</label>
                    <select id="swal-asal" class="swal2-input !m-0 !w-full !text-sm">
                        <option value="">-- Jangan Ubah Asal Staf --</option>
                        ${generateStafOptions("")}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold mb-1 text-gray-700">Set Status Menjadi:</label>
                    <select id="swal-status" class="swal2-input !m-0 !w-full !text-sm">
                        <option value="">-- Jangan Ubah Status --</option>
                        <option value="PROGRESS">PROGRESS</option>
                        <option value="CLOSE">CLOSE</option>
                        <option value="TF">TF (Transfer)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1 text-gray-700">Set Staf Tujuan (Jika TF):</label>
                    <select id="swal-staf" class="swal2-input !m-0 !w-full !text-sm" disabled>
                        <option value="">-- Pilih Staf (Hanya untuk TF) --</option>
                        ${generateStafOptions("")}
                    </select>
                </div>
            </div>
        `,
    didOpen: () => {
      const statusSelect = document.getElementById("swal-status");
      const stafSelect = document.getElementById("swal-staf");

      statusSelect.addEventListener("change", () => {
        if (statusSelect.value === "TF") {
          stafSelect.disabled = false;
          stafSelect.classList.remove("bg-gray-100", "cursor-not-allowed");
        } else {
          stafSelect.disabled = true;
          stafSelect.value = "";
          stafSelect.classList.add("bg-gray-100", "cursor-not-allowed");
        }
      });
    },
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Terapkan Perubahan",
    cancelButtonText: "Batal",
    confirmButtonColor: "#ec4899",
    preConfirm: () => {
      return {
        target: document.getElementById("swal-target").value,
        asal: document.getElementById("swal-asal").value,
        status: document.getElementById("swal-status").value,
        staf: document.getElementById("swal-staf").value,
      };
    },
  });

  if (formValues) {
    applyMassEdit(formValues);
  }
};

/**
 * Mengeksekusi perubahan pada elemen DOM berdasarkan input dari modal
 */
function applyMassEdit(config) {
  // Hanya targetkan kontainer "Menerima Tiket"
  const container = transferInContainer;
  if (!container) return;

  const rows = container.querySelectorAll(".flex-col");
  let affectedRows = 0;

  rows.forEach((row) => {
    // 1. UPDATE "MENERIMA DARI"
    if (config.asal) {
      const asalSelect = row.querySelector('select[name="dari_staf"]');
      if (asalSelect) {
        asalSelect.value = config.asal;
      }
    }

    // 2. UPDATE STATUS
    if (config.status) {
      const statusSelect = row.querySelector('select[name="status_terima"]');
      if (statusSelect) {
        statusSelect.value = config.status;
        // Pastikan fungsi toggleTransferTarget tersedia secara global
        if (window.toggleTransferTarget) {
          window.toggleTransferTarget(statusSelect);
        }
      }
    }

    // 3. UPDATE STAF TUJUAN (Hanya jika baris tersebut statusnya TF)
    const targetSelect = row.querySelector(".transfer-target");
    if (targetSelect && config.staf && !targetSelect.disabled) {
      targetSelect.value = config.staf;
    }

    affectedRows++;
  });

  if (affectedRows > 0) {
    isFormDirty = true;
    Swal.fire({
      icon: "success",
      title: "Berhasil",
      text: `${affectedRows} baris "Menerima Tiket" diperbarui secara massal.`,
      timer: 1500,
      showConfirmButton: false,
    });
  } else {
    Swal.fire("Info", "Tidak ada baris tiket untuk diubah.", "info");
  }
}

document.addEventListener("DOMContentLoaded", initForm);

// ===================================================
// 7. LOGIKA NOTEPAD (QUICK NOTES 2 KOLOM)
// ===================================================

/**
 * Menyimpan catatan cepat ke Firestore (Real-time)
 * Tidak terpengaruh oleh tombol simpan laporan utama
 */
window.saveQuickNote = async function () {
  const tiketInput = document.getElementById("note-tiket-id");
  const ketInput = document.getElementById("note-keterangan");

  const tiketVal = tiketInput ? tiketInput.value.trim().toUpperCase() : "";
  const ketVal = ketInput ? ketInput.value.trim() : "";
  const author = localStorage.getItem("userName") || "Unknown";

  if (!tiketVal || !ketVal) {
    Swal.fire({
      icon: "warning",
      title: "Data Tidak Lengkap",
      text: "ID Tiket dan Keterangan wajib diisi!",
      confirmButtonColor: "#f59e0b",
    });
    return;
  }

  try {
    await notepadCollection.add({
      tiket_id: tiketVal,
      keterangan: ketVal,
      created_by: author,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Reset input dan fokus kembali ke ID Tiket
    tiketInput.value = "";
    ketInput.value = "";
    tiketInput.focus();
  } catch (error) {
    console.error("Notepad Save Error:", error);
    Swal.fire("Gagal", "Catatan gagal terkirim ke server.", "error");
  }
};

/**
 * Mendengarkan perubahan data di Firestore secara Real-time
 */
function listenToNotepad() {
  const tbody = document.getElementById("notepad-body");
  if (!tbody) return;

  notepadCollection
    .orderBy("timestamp", "desc")
    .limit(15)
    .onSnapshot((snapshot) => {
      tbody.innerHTML = "";

      if (snapshot.empty) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400 italic">Belum ada log catatan...</td></tr>';
        return;
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const dateTime = data.timestamp
          ? new Date(data.timestamp.toDate())
              .toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
              .replace(".", ":")
          : "--:--";

        const tr = document.createElement("tr");

        // MODIFIKASI DISINI:
        // Tambahkan 'even:bg-gray-50' untuk warna abu-abu pada baris genap
        tr.className = "hover:bg-amber-50/50 transition-colors even:bg-gray-50";

        tr.innerHTML = `
        <td class="px-6 py-3 font-mono text-indigo-600 font-bold">${data.tiket_id}</td>
        <td class="px-6 py-3 text-gray-700">${data.keterangan}</td>
        <td class="px-6 py-3 text-gray-400 text-[11px] font-medium tabular-nums">${dateTime}</td>
        <td class="px-6 py-3 text-center space-x-3">
            <button onclick="editQuickNote('${doc.id}', '${data.tiket_id}', '${data.keterangan}')" 
                class="text-indigo-600 hover:text-indigo-900 font-bold text-xs uppercase">Edit</button>
            <button onclick="deleteQuickNote('${doc.id}')" 
                class="text-red-500 hover:text-red-700 font-bold text-xs uppercase">Hapus</button>
        </td>
    `;
        tbody.appendChild(tr);
      });
    });
}

/**
 * Mengedit catatan yang sudah ada di Firestore
 */
window.editQuickNote = async function (id, curTiket, curKet) {
  const { value: formValues } = await Swal.fire({
    title:
      '<span class="text-xl font-bold text-gray-800">Update Log Catatan</span>',
    html: `
            <div class="text-left mt-4 px-2">
                <div class="mb-4">
                    <label class="block text-xs font-extrabold text-indigo-600 uppercase tracking-wider mb-1">ID Tiket</label>
                    <input id="swal-tiket" class="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-indigo-500 focus:outline-none text-sm font-mono transition-all" 
                        placeholder="Contoh: TKT12345" value="${curTiket}">
                </div>
                <div class="mb-2">
                    <label class="block text-xs font-extrabold text-indigo-600 uppercase tracking-wider mb-1">Keterangan</label>
                    <textarea id="swal-ket" class="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-indigo-500 focus:outline-none text-sm transition-all min-h-[100px]" 
                        placeholder="Tulis detail progress...">${curKet}</textarea>
                </div>
            </div>
        `,
    showCancelButton: true,
    confirmButtonText: "Simpan Perubahan",
    cancelButtonText: "Batal",
    confirmButtonColor: "#4f46e5", // Indigo 600
    cancelButtonColor: "#9ca3af", // Gray 400
    reverseButtons: true,
    focusConfirm: false,
    customClass: {
      popup: "rounded-xl shadow-2xl",
      confirmButton: "px-6 py-2.5 rounded-lg text-sm font-bold",
      cancelButton: "px-6 py-2.5 rounded-lg text-sm font-bold",
    },
    preConfirm: () => {
      const t = document
        .getElementById("swal-tiket")
        .value.trim()
        .toUpperCase();
      const k = document.getElementById("swal-ket").value.trim();
      if (!t || !k) {
        Swal.showValidationMessage("Semua kolom wajib diisi!");
      }
      return { tiket_id: t, keterangan: k };
    },
  });

  if (formValues) {
    try {
      await notepadCollection.doc(id).update({
        ...formValues,
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      });
      // Toast notifikasi sukses (opsional)
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
      });
      Toast.fire({ icon: "success", title: "Catatan diperbarui" });
    } catch (e) {
      Swal.fire("Error", "Gagal memperbarui data.", "error");
    }
  }
};

/**
 * Menghapus catatan dari Firestore
 */
window.deleteQuickNote = async function (id) {
  const result = await Swal.fire({
    title: "Hapus Log?",
    text: "Data yang dihapus tidak bisa dikembalikan.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
  });

  if (result.isConfirmed) {
    try {
      await notepadCollection.doc(id).delete();
    } catch (e) {
      Swal.fire("Error", "Gagal menghapus data.", "error");
    }
  }
};

// Pastikan listenToNotepad dipanggil saat halaman siap
document.addEventListener("DOMContentLoaded", () => {
  listenToNotepad();
});

/**
 * Fungsi Validasi Real-time untuk ID Tiket Ganda
 */
let isValidating = false; // Flag untuk mencegah looping notifikasi

window.checkDuplicateRealTime = function (inputElement) {
  const val = inputElement.value.trim().toUpperCase();
  if (!val || isValidating) return;

  const allInputs = Array.from(
    document.querySelectorAll(
      '[name="tiket_diterima"], [name="tiket_ditangani"]'
    )
  );
  const count = allInputs.filter(
    (input) => input.value.trim().toUpperCase() === val
  ).length;

  if (count > 1) {
    isValidating = true; // Kunci agar tidak muncul lagi saat OK diklik

    Swal.fire({
      icon: "warning",
      title: "ID Tiket Duplikat!",
      text: `ID Tiket [ ${val} ] sudah dimasukkan sebelumnya.`,
      confirmButtonColor: "#f59e0b",
      allowOutsideClick: false, // Memaksa klik OK
    }).then(() => {
      // Reset nilai agar tidak dianggap duplikat lagi atau biarkan user mengubahnya
      inputElement.classList.add("border-red-500", "bg-red-50");
      isValidating = false; // Buka kunci setelah klik OK
    });
  } else {
    inputElement.classList.remove("border-red-500", "bg-red-50");
  }
};

// 1. Fungsi Buka Tutup Panel
window.toggleChatPanel = function () {
  const panel = document.getElementById("chat-panel");
  const overlay = document.getElementById("chat-overlay");

  if (!panel || !overlay) {
    console.error("Elemen chat-panel atau chat-overlay tidak ditemukan");
    return;
  }
  panel.classList.toggle("translate-x-full");
  overlay.classList.toggle("hidden");
};

// 2. Fungsi Copy Chat (Daftarkan ke window agar terdeteksi onclick)
window.copyChat = function (text) {
  if (!text) return;

  // Gunakan API Clipboard Modern
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showCopySuccess();
      })
      .catch((err) => {
        copyFallback(text);
      });
  } else {
    // Gunakan cara lama jika tidak didukung (HTTP biasa)
    copyFallback(text);
  }
};

// Fungsi Internal untuk Notifikasi Success
function showCopySuccess() {
  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
  });
  Toast.fire({
    icon: "success",
    title: "Teks disalin ke clipboard!",
  });
  if (window.innerWidth < 768) window.toggleChatPanel();
}

// Fungsi Internal untuk Fallback Copy
function copyFallback(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    showCopySuccess();
  } catch (err) {
    console.error("Fallback copy gagal", err);
  }
  document.body.removeChild(textArea);
}

// 3. Tab Switcher
window.switchChatTab = function (tab) {
  const list = document.getElementById("chat-content-list");
  const admin = document.getElementById("chat-content-admin");
  const tList = document.getElementById("tab-list");
  const tAdmin = document.getElementById("tab-admin");

  if (tab === "list") {
    list.classList.remove("hidden");
    admin.classList.add("hidden");
    tList.className =
      "flex-1 py-3 text-green-600 border-b-2 border-green-600 bg-white";
    tAdmin.className = "flex-1 py-3 text-gray-500 hover:bg-gray-200";
  } else {
    list.classList.add("hidden");
    admin.classList.remove("hidden");
    tAdmin.className =
      "flex-1 py-3 text-green-600 border-b-2 border-green-600 bg-white";
    tList.className = "flex-1 py-3 text-gray-500 hover:bg-gray-200";
  }
};

// 4. CRUD Functions (Daftarkan ke window)
window.saveChatTemplate = async function () {
  const id = document.getElementById("chat-id-edit").value;
  const kategori = document.getElementById("chat-kategori").value;
  const pesan = document.getElementById("chat-pesan").value.trim();

  if (!pesan) return;

  try {
    if (id) {
      await chatRef.doc(id).update({ kategori, pesan });
    } else {
      await chatRef.add({
        kategori,
        pesan,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    window.resetChatForm();
    window.switchChatTab("list");
  } catch (error) {
    console.error("Error saving chat:", error);
  }
};

window.editChat = function (id, kat, pesan) {
  document.getElementById("chat-id-edit").value = id;
  document.getElementById("chat-kategori").value = kat;
  document.getElementById("chat-pesan").value = pesan;
  document.getElementById("btn-save-chat").innerText = "Update";
  window.switchChatTab("admin");
};

window.deleteChat = async function (id) {
  const res = await Swal.fire({
    title: "Hapus template?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Ya, Hapus",
  });
  if (res.isConfirmed) await chatRef.doc(id).delete();
};

window.resetChatForm = function () {
  document.getElementById("chat-id-edit").value = "";
  document.getElementById("chat-pesan").value = "";
  document.getElementById("btn-save-chat").innerText = "Simpan";
};

// 5. Listener Firestore
function initChatListener() {
  chatRef.orderBy("kategori").onSnapshot((snapshot) => {
    const listDiv = document.getElementById("render-chat-list");
    const manageDiv = document.getElementById("render-chat-manage");
    if (!listDiv || !manageDiv) return;

    listDiv.innerHTML = "";
    manageDiv.innerHTML = "";

    const groups = {};
    snapshot.forEach((doc) => {
      const d = doc.data();
      if (!groups[d.kategori]) groups[d.kategori] = [];
      groups[d.kategori].push({ id: doc.id, ...d });
    });

    for (const kat in groups) {
      let section = `<p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2 border-l-2 border-green-500 pl-2">${kat}</p>`;
      groups[kat].forEach((item) => {
        // Render Daftar Copy (Tanpa Tanda Petik)
        section += `
    <div onclick="window.copyChat(\`${item.pesan
      .replace(/`/g, "\\`")
      .replace(/\n/g, "\\n")}\`)" 
         class="bg-white p-3 border rounded-lg cursor-pointer hover:border-green-500 shadow-sm group mt-2 transition-all">
        <p class="text-xs text-gray-600 chat-text-format">${item.pesan}</p>
        <span class="text-[9px] text-green-500 font-bold hidden group-hover:block mt-1 uppercase">Klik untuk Copy</span>
    </div>`;

        // Render Manage (Juga tanpa tanda petik pada preview)
        manageDiv.innerHTML += `
    <div class="p-2 border rounded bg-gray-50 text-[11px] flex justify-between items-center mb-2 shadow-sm">
        <span class="truncate w-44 font-medium cursor-help" 
              title="${item.pesan.replace(/"/g, "&quot;")}">
            ${item.pesan}
        </span>
        <div class="flex space-x-2 shrink-0 ml-2">
            <button onclick="window.editChat('${item.id}', '${
          item.kategori
        }', \`${item.pesan.replace(/`/g, "\\`").replace(/\n/g, "\\n")}\`)" 
                    class="text-blue-500 hover:text-blue-700 font-bold uppercase transition-colors">
                Edit
            </button>
            <button onclick="window.deleteChat('${item.id}')" 
                    class="text-red-500 hover:text-red-700 font-bold uppercase transition-colors">
                Hapus
            </button>
        </div>
    </div>`;
      });
      listDiv.innerHTML += section;
    }
  });
}

// Inisialisasi saat halaman siap
document.addEventListener("DOMContentLoaded", initChatListener);

// ===================================================
// ANIMASI PENYAMBUTAN TOMBOL CHAT (SETIAP MASUK)
// ===================================================

function runChatWelcomeAnimation() {
  // Cari tombol chat berdasarkan selector onclick
  const chatBtn = document.querySelector('button[onclick="toggleChatPanel()"]');

  if (chatBtn) {
    // 1. Tambahkan class animasi denyut
    chatBtn.classList.add("animate-chat-welcome");

    // 2. Hapus animasi otomatis setelah 5 detik
    const timer = setTimeout(() => {
      chatBtn.classList.remove("animate-chat-welcome");
    }, 10000);

    // 3. Jika user klik tombol sebelum 5 detik, langsung matikan animasi
    chatBtn.addEventListener(
      "click",
      () => {
        clearTimeout(timer);
        chatBtn.classList.remove("animate-chat-welcome");
      },
      { once: true }
    );
  }
}

document.addEventListener("DOMContentLoaded", runChatWelcomeAnimation);
