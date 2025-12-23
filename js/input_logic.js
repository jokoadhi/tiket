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

    // --- LANGKAH 1: Ambil Referensi Jabatan Staf dari Firestore ---
    const stafSnapshot = await db.collection("staf").get();
    const mapJabatan = {};

    stafSnapshot.forEach((doc) => {
      const d = doc.data();
      if (d.nama && d.jabatan) {
        mapJabatan[d.nama.toUpperCase()] = d.jabatan.toUpperCase();
      }
    });

    // --- LANGKAH 2: Proses Data "Menerima Tiket" ---
    let listMenerimaBaru = [];
    const oldDiterima = data.diterima || [];

    oldDiterima.forEach((item) => {
      const status = (item.status || "").toUpperCase();
      const namaTujuan = (item.tujuan_staf || "").toUpperCase();
      const jabatanTujuan = mapJabatan[namaTujuan] || "";

      // A. Jika status CLOSE -> Hapus
      if (status === "CLOSE") return;

      // B. Jika status TF dan tujuannya adalah TEKNISI -> Hapus
      if (status === "TF" && jabatanTujuan === "TEKNISI") {
        console.log(
          `❌ Tiket ${item.tiket_id} dihapus dari Menerima (TF ke Teknisi: ${namaTujuan})`
        );
        return;
      }

      // Selain itu, tetap masukkan ke list Menerima dengan reset status
      listMenerimaBaru.push({
        tiket_id: item.tiket_id,
        dari_staf: item.dari_staf,
        status: "PROGRESS",
        tujuan_staf: null,
      });
    });

    // --- LANGKAH 3: Proses Data "Menangani Tiket" ---
    const listMenanganiLama = data.ditangani || [];

    listMenanganiLama.forEach((item) => {
      const aksi = (item.aksi || "").toUpperCase();
      const namaTujuan = (item.tujuan_staf || "").toUpperCase();
      const jabatanTujuan = mapJabatan[namaTujuan] || "";

      const isTransfer = aksi === "TF" || aksi === "TRANSFER";

      if (isTransfer) {
        // A. Jika jabatan adalah NOC -> Pindah ke Menerima
        if (jabatanTujuan === "NOC") {
          listMenerimaBaru.push({
            tiket_id: item.tiket_id,
            dari_staf: data.staf_pelaksana,
            status: "PROGRESS",
            tujuan_staf: null,
          });
          console.log(
            `✅ ${item.tiket_id} Pindah ke Menerima (Tujuan: ${namaTujuan} adalah NOC)`
          );
        }
        // B. Jika jabatan adalah TEKNISI -> Hapus
        else if (jabatanTujuan === "TEKNISI") {
          console.log(
            `❌ ${item.tiket_id} Dihilangkan (Tujuan: ${namaTujuan} adalah TEKNISI)`
          );
        }
      }
    });

    // --- LANGKAH 4: Update UI ---
    const dataSiapInput = {
      ...data,
      diterima: listMenerimaBaru,
      ditangani: [], // Menangani selalu dikosongkan
    };

    if (transferInContainer) transferInContainer.innerHTML = "";
    if (handlingContainer) handlingContainer.innerHTML = "";

    fillFormData(dataSiapInput);
    sessionStorage.removeItem("copiedReportData");

    Swal.fire({
      icon: "success",
      title: "Sinkronisasi Selesai",
      text: "Tiket ke Teknisi & Close telah dibersihkan otomatis.",
      timer: 2000,
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
