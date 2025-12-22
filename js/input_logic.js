// js/input_logic.js

const stafRef = db.collection("staf");
const laporanRef = db.collection("laporan_harian");
const inputStaf = document.getElementById("input-staf");
const transferInContainer = document.getElementById("transfer-in-container");
const handlingContainer = document.getElementById("handling-container");
const laporanForm = document.getElementById("laporan-form");

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

  if (btn) btn.textContent = "Update Laporan (Mode Edit)";
  if (indicator) indicator.classList.remove("hidden");
  if (subtitle) subtitle.textContent = "Edit Laporan Terdaftar";

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
function loadCopiedData() {
  const copiedDataJson = sessionStorage.getItem("copiedReportData");
  if (!copiedDataJson) {
    addTransferInRow();
    addHandlingRow();
    return;
  }
  try {
    const data = JSON.parse(copiedDataJson);
    fillFormData(data);
    sessionStorage.removeItem("copiedReportData");
    Swal.fire({
      icon: "info",
      title: "Data Berhasil Ditempel",
      text: "Silakan sesuaikan jika ada perubahan.",
      timer: 2000,
    });
  } catch (e) {
    console.error("Gagal parse data salinan", e);
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

  // 1. Pastikan semua elemen aktif & kursor normal
  [inputStaf, shiftElem, tglElem].forEach((el) => {
    if (el) {
      el.disabled = false;
      el.style.cursor = "default";
      el.classList.remove("bg-gray-200", "cursor-not-allowed");
      el.classList.add("bg-white");
    }
  });

  // 2. LOGIKA STAF PELAKSANA (Kondisional)
  if (isEditMode) {
    // Jika MODE EDIT: Isi sesuai data asli laporan
    inputStaf.value = data.staf_pelaksana || "";
  } else {
    // Jika MODE SALIN: Kosongkan agar user pilih sendiri
    inputStaf.value = "";
  }

  // 3. LOGIKA SHIFT (Kondisional)
  if (isEditMode) {
    // Jika MODE EDIT: Pakai shift asli laporan
    if (shiftElem) shiftElem.value = data.shift || "";
  } else {
    // Jika MODE SALIN: Pakai deteksi jam otomatis terbaru
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
            <input type="text" name="tiket_diterima" placeholder="ID Tiket" required value="${tiket}" class="w-full p-2 border rounded-md text-sm bg-white">
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
            <input type="text" name="tiket_ditangani" placeholder="ID Tiket" required value="${tiket}" class="w-full p-2 border rounded-md text-sm bg-white">
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
  const row = select.closest(".flex-col");
  const target = row.querySelector(".transfer-target");

  row.classList.remove("bg-green-100", "bg-indigo-50");
  if (select.value === "CLOSE") row.classList.add("bg-green-100");
  else row.classList.add("bg-indigo-50");

  if (select.value === "TF") {
    target.disabled = false;
    target.classList.replace("bg-gray-200", "bg-white");
    target.required = true;
  } else {
    target.disabled = true;
    target.classList.replace("bg-white", "bg-gray-200");
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

document.addEventListener("DOMContentLoaded", initForm);
