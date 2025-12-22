// js/input_logic.js (Sudah termasuk fitur Mass Edit Modal dan perbaikan filter)

// Pastikan Anda telah menginisialisasi Firebase Firestore di tempat lain,
// misalnya di file firebase.js, dan variabel db telah tersedia.
// Contoh: const db = firebase.firestore();

const stafRef = db.collection("staf");
const laporanRef = db.collection("laporan_harian");
const inputStaf = document.getElementById("input-staf");
const transferInContainer = document.getElementById("transfer-in-container");
const handlingContainer = document.getElementById("handling-container");
const laporanForm = document.getElementById("laporan-form");

let stafDataCache = []; // Cache data staf untuk dropdown dinamis (Diambil dari collection "staf")

// ===================================================
// A. INISIALISASI DAN PENGISIAN DROPDOWN
// ===================================================
async function loadStafDropdown() {
  inputStaf.innerHTML = '<option value="">Pilih Staf Pelaksana</option>';
  stafDataCache = [];
  try {
    // Pastikan koneksi Firestore berjalan
    const snapshot = await stafRef.orderBy("nama").get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Menyimpan nama asli (case normal) ke cache (Digunakan untuk display di Mass Edit)
      stafDataCache.push(data.nama);
      const option = document.createElement("option");
      option.value = data.nama;
      option.textContent = data.nama;
      inputStaf.appendChild(option);
    });
  } catch (error) {
    console.error("Error memuat staf: ", error);
    // Jika gagal memuat, set stafDataCache menjadi array kosong (default)
    stafDataCache = [];
    alert("Gagal memuat data staf dari Firestore.");
  }
}

function generateStafOptions() {
  // Opsi di dropdown memiliki VALUE (disimpan di DB) UPPERCASE, tetapi TAMPILAN (text) case normal
  return stafDataCache
    .map((nama) => `<option value="${nama.toUpperCase()}">${nama}</option>`)
    .join("");
}

// ===================================================
// B. FUNGSI MENAMBAH BARIS INPUT DINAMIS
// ===================================================

/**
 * Menambahkan baris input Transfer In.
 * @param {object} [data] - Data opsional untuk pre-fill (dari copiedReportData).
 */
window.addTransferInRow = function (data = {}) {
  const rowId = `ti-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
  const newRow = document.createElement("div");
  newRow.id = rowId;

  newRow.classList.add(
    "flex",
    "flex-col",
    "md:flex-row",
    "md:items-center",
    "p-3",
    "border",
    "rounded-md",
    "bg-indigo-50",
    "shadow-sm",
    "space-y-2",
    "md:space-y-0",
    "md:space-x-2",
    "mb-2",
    "transition-colors", // Animasi halus saat perubahan warna
    "duration-200"
  );

  // Set nilai default dari data yang disalin
  const tiketValue = data.tiket_id || "";
  const statusValue = data.status || "PROGRESS";
  // Data dari Firestore tersimpan sebagai huruf besar
  const pengirimValue = (data.dari_staf || "").toUpperCase();
  const tujuanDiterimaValue = (data.tujuan_staf || "").toUpperCase();

  // Tentukan apakah select tujuan harus aktif
  const isTargetEnabled = statusValue === "TF";
  const disabledAttr = isTargetEnabled ? "" : "disabled";
  const bgClass = isTargetEnabled ? "bg-white" : "bg-gray-200";
  const requiredAttr = isTargetEnabled ? 'required="required"' : "";

  newRow.innerHTML = `
        <div class="w-full md:w-1/4"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Tiket Diterima</label>
            <input type="text" name="tiket_diterima" placeholder="No. Tiket / Uraian Singkat" required 
                   value="${tiketValue}"
                   class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500">
        </div>

        <div class="w-full md:w-1/6"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Status Awal</label>
            <select name="status_terima" required onchange="toggleTransferTarget(this)"
                    class="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="PROGRESS" ${
                  statusValue === "PROGRESS" ? "selected" : ""
                }>PROGRESS</option>
                <option value="CLOSE" ${
                  statusValue === "CLOSE" ? "selected" : ""
                }>CLOSE</option>
                <option value="TF" ${
                  statusValue === "TF" ? "selected" : ""
                }>TRANSFER (TF)</option>
            </select>
        </div>

        <div class="w-full md:w-1/4"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Dari Staf</label>
            <select name="dari_staf" required 
                    class="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Dari Staf...</option>
                ${generateStafOptions().replace(
                  `value="${pengirimValue}"`,
                  `value="${pengirimValue}" selected`
                )}
            </select>
        </div>

        <div class="flex-grow w-full md:w-auto"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Staf Tujuan (Transfer Ke)</label>
            <select name="staf_tujuan_diterima" ${disabledAttr} ${requiredAttr}
                    class="w-full p-2 border border-gray-300 rounded-md shadow-sm text-sm transfer-target ${bgClass}">
                <option value="">TF = Staf Tujuan</option>
                ${generateStafOptions().replace(
                  `value="${tujuanDiterimaValue}"`,
                  `value="${tujuanDiterimaValue}" selected`
                )}
            </select>
        </div>

        <div class="w-full md:w-auto flex justify-end md:justify-start">
            <button type="button" onclick="document.getElementById('${rowId}').remove()" 
                    class="w-full md:w-auto bg-red-500 text-white p-2 rounded-md hover:bg-red-600 transition duration-150 text-sm flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `;

  transferInContainer.appendChild(newRow);

  // --- INISIALISASI WARNA ---
  // Jalankan toggleTransferTarget segera setelah elemen ditambahkan ke DOM
  // agar status CLOSE langsung merubah background menjadi hijau.
  const selectStatus = newRow.querySelector('select[name="status_terima"]');
  if (selectStatus) {
    window.toggleTransferTarget(selectStatus);
  }
};

/**
 * Menambahkan baris input Handling.
 * @param {object} [data] - Data opsional untuk pre-fill (dari copiedReportData).
 */
window.addHandlingRow = function (data = {}) {
  const rowId = `h-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const newRow = document.createElement("div");
  newRow.id = rowId;

  newRow.classList.add(
    "flex",
    "flex-col",
    "md:flex-row",
    "md:items-center",
    "p-3",
    "border",
    "rounded-md",
    "bg-indigo-50",
    "shadow-sm",
    "space-y-2",
    "md:space-y-0",
    "md:space-x-2",
    "mb-2",
    "transition-colors", // Efek transisi halus
    "duration-200"
  );

  // Set nilai default dari data yang disalin
  const tiketValue = data.tiket_id || "";
  const aksiValue = data.aksi || "PROGRESS";
  // Data dari Firestore tersimpan sebagai huruf besar
  const tujuanValue = (data.tujuan_staf || "").toUpperCase();

  // Tentukan apakah select tujuan harus aktif
  const isTargetEnabled = aksiValue === "TF";
  const disabledAttr = isTargetEnabled ? "" : "disabled";
  const bgClass = isTargetEnabled ? "bg-white" : "bg-gray-200";
  const requiredAttr = isTargetEnabled ? 'required="required"' : "";

  newRow.innerHTML = `
        <div class="w-full md:w-1/2"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Tiket Ditangani</label>
            <input type="text" name="tiket_ditangani" placeholder="No. Tiket / Uraian Singkat" required 
                   value="${tiketValue}"
                   class="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500">
        </div>
        <div class="w-full md:w-1/6"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Aksi</label>
            <select name="aksi_handling" onchange="toggleTransferTarget(this)" required 
                    class="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="PROGRESS" ${
                  aksiValue === "PROGRESS" ? "selected" : ""
                }>PROGRESS</option>
                <option value="CLOSE" ${
                  aksiValue === "CLOSE" ? "selected" : ""
                }>CLOSE</option>
                <option value="TF" ${
                  aksiValue === "TF" ? "selected" : ""
                }>TRANSFER (TF)</option>
            </select>
        </div>
        <div class="flex-grow w-full md:w-auto"> 
            <label class="block text-xs font-medium text-gray-500 mb-1 md:hidden">Staf Tujuan (Transfer)</label>
            <select name="staf_tujuan" ${disabledAttr} ${requiredAttr}
                    class="w-full p-2 border border-gray-300 rounded-md shadow-sm text-sm transfer-target ${bgClass}">
                <option value="">TF = Staf Tujuan</option>
                ${generateStafOptions().replace(
                  `value="${tujuanValue}"`,
                  `value="${tujuanValue}" selected`
                )}
            </select>
        </div>
        <div class="w-full md:w-auto flex justify-end md:justify-start">
            <button type="button" onclick="document.getElementById('${rowId}').remove()" 
                    class="w-full md:w-auto bg-red-500 text-white p-2 rounded-md hover:bg-red-600 transition duration-150 text-sm flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `;

  handlingContainer.appendChild(newRow);

  // Jalankan toggle untuk menyesuaikan warna saat baris dibuat
  const selectAksi = newRow.querySelector('select[name="aksi_handling"]');
  if (selectAksi) {
    window.toggleTransferTarget(selectAksi);
  }
};

window.toggleTransferTarget = function (selectElement) {
  // 1. Mencari container utama baris (div dengan class bg-indigo-50)
  const rowContainer = selectElement.closest(".flex.flex-col");
  // 2. Mencari target select staf tujuan
  const targetSelect = rowContainer
    ? rowContainer.querySelector(".transfer-target")
    : null;

  if (!rowContainer) return;

  // --- LOGIKA PERUBAHAN BACKGROUND ---
  // Hapus class warna dasar (indigo) dan warna sukses (green) agar tidak bentrok
  rowContainer.classList.remove(
    "bg-indigo-50",
    "bg-green-100",
    "border-green-300"
  );

  if (selectElement.value === "CLOSE") {
    // Jika status CLOSE, ubah ke Hijau
    rowContainer.classList.add("bg-green-100", "border-green-300");
  } else {
    // Jika PROGRESS atau TF, kembalikan ke warna standar (Indigo)
    rowContainer.classList.add("bg-indigo-50");
  }

  // --- LOGIKA AKTIVASI STAF TUJUAN (Fungsi Lama Anda) ---
  if (!targetSelect) return;

  if (selectElement.value === "TF") {
    targetSelect.removeAttribute("disabled");
    targetSelect.classList.remove("bg-gray-200");
    targetSelect.classList.add("bg-white");
    targetSelect.setAttribute("required", "required");
  } else {
    targetSelect.setAttribute("disabled", "disabled");
    targetSelect.value = "";
    targetSelect.removeAttribute("required");
    targetSelect.classList.remove("bg-white");
    targetSelect.classList.add("bg-gray-200");
  }
};

// ===================================================
// D. FUNGSI MUAT DATA SALINAN (PRE-FILL)
// ===================================================
function loadCopiedData() {
  const copiedDataJson = sessionStorage.getItem("copiedReportData");

  if (!copiedDataJson) {
    // Tidak ada data salinan, biarkan form default
    return;
  }

  try {
    const data = JSON.parse(copiedDataJson);

    // 1. Pre-fill Tanggal dan Shift (jika ada)
    if (data.tanggal) {
      document.getElementById("input-tanggal").value = data.tanggal;
    }
    if (data.shift) {
      document.getElementById("input-shift").value = data.shift;
    }

    // 2. Bersihkan baris default yang kosong
    transferInContainer.innerHTML = "";
    handlingContainer.innerHTML = "";

    // 3. Muat dan isi data DITERIMA
    if (data.diterima && data.diterima.length > 0) {
      data.diterima.forEach((item) => {
        window.addTransferInRow(item);
      });
    } else {
      // Jika tidak ada data, tetap sediakan satu baris kosong
      window.addTransferInRow();
    }

    // 4. Muat dan isi data DITANGANI
    if (data.ditangani && data.ditangani.length > 0) {
      data.ditangani.forEach((item) => {
        window.addHandlingRow(item);
      });
    } else {
      // Jika tidak ada data, tetap sediakan satu baris kosong
      window.addHandlingRow();
    }
  } catch (error) {
    console.error(
      "Gagal memproses data yang disalin dari sessionStorage:",
      error
    );
    alert("Terjadi kesalahan saat memuat data laporan yang disalin.");
  } finally {
    // 5. Hapus data dari sessionStorage agar tidak muncul lagi pada refresh normal
    sessionStorage.removeItem("copiedReportData");
  }
}

// ===================================================
// E. FUNGSI MASS EDIT TIKET DITERIMA (MASS SELECTIVE ACTION)
// ===================================================

const massEditModal = document.getElementById("massEditModal");
const massEditModalContent = document.getElementById("massEditModalContent");
// --- Variabel untuk Filter Selektif ---
const filterColumnSelect = document.getElementById("filter-column");
const filterValueContainer = document.getElementById("filter-value-container");
const filterValueSelect = document.getElementById("filter-value");
// -------------------------------------
const newValueContainer = document.getElementById("new-value-container");
const newValueSelect = document.getElementById("new-value");
const applyMassEditBtn = document.getElementById("apply-mass-edit-btn");
const rowsAffectedCount = document.getElementById("rows-affected-count");
const matchedCountSpan = document.getElementById("matched-count");

const statusOptionsHTML = `
    <option value="PROGRESS">PROGRESS</option>
    <option value="CLOSE">CLOSE</option>
    <option value="TF">TRANSFER (TF)</option>
`;

// Fungsi Buka/Tutup Modal
window.openMassEditModal = function () {
  const rowCount =
    transferInContainer.querySelectorAll(".flex.flex-col").length;
  if (rowCount === 0) {
    alert(
      "Tidak ada baris Tiket Diterima untuk diubah massal. Silakan tambahkan minimal satu baris."
    );
    return;
  }

  massEditModal.classList.remove("hidden");
  massEditModal.classList.add("flex");
  setTimeout(() => {
    massEditModalContent.classList.remove("scale-95", "opacity-0");
    massEditModalContent.classList.add("scale-100", "opacity-100");
  }, 10);

  // Reset modal state ke langkah 1
  filterColumnSelect.value = "none";
  filterValueContainer.classList.add("hidden");
  newValueContainer.classList.add("hidden");
  rowsAffectedCount.classList.add("hidden");
  applyMassEditBtn.disabled = true;
};

window.closeMassEditModal = function () {
  massEditModalContent.classList.remove("scale-100", "opacity-100");
  massEditModalContent.classList.add("scale-95", "opacity-0");

  // Hapus dropdown spesifik yang mungkin tersisa
  const existingSpecific = document.getElementById("new-value-specific");
  if (existingSpecific) existingSpecific.remove();

  setTimeout(() => {
    massEditModal.classList.add("hidden");
    massEditModal.classList.remove("flex");
  }, 300);
};

/**
 * Mendapatkan nilai unik dari kolom yang dipilih di semua baris Transfer In.
 * @description: Diperbaiki agar hanya memproses baris dengan Tiket ID yang terisi dan nilai yang valid.
 */
function getUniqueFilterValues(columnName) {
  // AWAL: Semua opsi status yang mungkin harus disertakan jika status_terima
  const values = new Set();

  if (columnName === "status_terima") {
    // Pastikan semua status utama selalu ada sebagai opsi filter,
    // terlepas dari apakah status tersebut sudah ada di baris input atau belum.
    values.add("PROGRESS");
    values.add("CLOSE");
    values.add("TF");
  }

  const rows = transferInContainer.querySelectorAll(".flex.flex-col");

  // Menggunakan nama select yang benar untuk staf di baris input: 'dari_staf'
  const targetColumnName =
    columnName === "dari_staf" ? "dari_staf" : "status_terima";

  rows.forEach((row) => {
    const tiketInput = row.querySelector('input[name="tiket_diterima"]');
    const select = row.querySelector(`select[name="${targetColumnName}"]`);

    // Hanya proses baris yang memiliki Tiket ID dan elemen select ada
    if (tiketInput && tiketInput.value.trim() && select) {
      let value = select.value.toUpperCase().trim();
      // Pastikan nilai tidak kosong sebelum ditambahkan ke Set
      if (value) {
        values.add(value);
      }
    }
  });
  // Filter final untuk menghilangkan kemungkinan nilai kosong yang lolos
  return Array.from(values).filter((v) => v);
}

// FUNGSI BARU: Memuat Nilai Filter (Dropdown #2) berdasarkan Kolom Filter (#1)
window.loadFilterValues = function () {
  const filterColumn = filterColumnSelect.value;
  filterValueContainer.classList.add("hidden");
  newValueContainer.classList.add("hidden");
  applyMassEditBtn.disabled = true;
  matchedCountSpan.textContent = "0";
  rowsAffectedCount.classList.add("hidden");

  // Hapus dropdown spesifik yang mungkin tersisa
  const existingSpecific = document.getElementById("new-value-specific");
  if (existingSpecific) existingSpecific.remove();

  filterValueSelect.innerHTML = '<option value="">Pilih Nilai...</option>';
  filterValueSelect.setAttribute("disabled", "disabled");
  filterValueSelect.classList.remove("bg-white");
  filterValueSelect.classList.add("bg-gray-100", "text-gray-500");

  if (filterColumn === "dari_staf" || filterColumn === "status_terima") {
    let valuesToDisplay = [];

    if (filterColumn === "dari_staf") {
      // Jika kolom Staf Pengirim dipilih, gunakan SEMUA staf dari cache (Firestore)
      // Nilai harus UPPERCASE untuk dicocokkan dengan data di baris input
      valuesToDisplay = stafDataCache.map((n) => n.toUpperCase());
    } else {
      // Jika kolom Status dipilih, gunakan nilai unik DARI BARIS INPUT + PROGRESS, CLOSE, TF
      valuesToDisplay = getUniqueFilterValues(filterColumn);
    }

    if (valuesToDisplay.length === 0) {
      alert("Tidak ada data valid di kolom ini yang dapat difilter.");
      filterColumnSelect.value = "none";
      return;
    }

    valuesToDisplay.forEach((value) => {
      // Tampilkan nama staf aslinya (non-uppercase) untuk tampilan yang lebih ramah
      let displayValue = value;
      if (filterColumn === "dari_staf") {
        // Cari nama staf di stafDataCache (format case normal) yang dimuat dari collection 'staf'
        const originalStafName = stafDataCache.find(
          (n) => n.toUpperCase() === value
        );
        if (originalStafName) {
          displayValue = originalStafName; // MENGGUNAKAN NAMA CASE NORMAL
        }
      } else if (filterColumn === "status_terima") {
        // Format tampilan status
        displayValue = value.replace("TF", "TRANSFER (TF)");
      }

      // value: (UPPERCASE - nilai filter/DB), displayValue: (Case Normal - yang dilihat user)
      filterValueSelect.innerHTML += `<option value="${value}">${displayValue}</option>`;
    });

    filterValueSelect.removeAttribute("disabled");
    filterValueSelect.classList.remove("bg-gray-100", "text-gray-500");
    filterValueSelect.classList.add("bg-white");
    filterValueContainer.classList.remove("hidden");

    updateMassEditOptions(); // Reset Aksi/Nilai Baru
  }
};

// FUNGSI MODIFIED: Memuat Opsi Aksi / Nilai Baru (Dropdown #3)
window.updateMassEditOptions = function () {
  const filterColumn = filterColumnSelect.value;
  const filterValue = filterValueSelect.value;
  const instruction = document.getElementById("mass-edit-instruction");

  newValueContainer.classList.add("hidden");
  applyMassEditBtn.disabled = true;
  newValueSelect.innerHTML =
    '<option value="">Pilih Aksi / Nilai Baru...</option>';
  instruction.classList.add("hidden");

  // Hapus dropdown spesifik yang mungkin tersisa
  const existingSpecific = document.getElementById("new-value-specific");
  if (existingSpecific) existingSpecific.remove();

  // Hitung baris yang cocok
  const rowsToProcess = Array.from(
    transferInContainer.querySelectorAll(".flex.flex-col")
  );
  const matchedRows = rowsToProcess.filter((row) => {
    const select = row.querySelector(`select[name="${filterColumn}"]`);
    const tiketInput = row.querySelector('input[name="tiket_diterima"]');
    return (
      tiketInput &&
      tiketInput.value.trim() &&
      select &&
      select.value.toUpperCase() === filterValue
    );
  });

  matchedCountSpan.textContent = matchedRows.length;
  rowsAffectedCount.classList.remove("hidden");

  // Reset tombol aksi ke default
  applyMassEditBtn.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.278A1.99 1.99 0 0013.882 2H10a2 2 0 00-2 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-3.118a1.99 1.99 0 00-.882-.278z"></path></svg>Terapkan Aksi Selektif`;
  applyMassEditBtn.classList.remove("bg-red-600", "hover:bg-red-700");
  applyMassEditBtn.classList.add("bg-green-500", "hover:bg-green-600");

  if (filterValue && matchedRows.length > 0) {
    // Hanya tampilkan aksi yang relevan
    newValueSelect.innerHTML =
      '<option value="">Pilih Aksi / Nilai Baru...</option>';
    if (filterColumn === "dari_staf") {
      newValueSelect.innerHTML +=
        '<option value="change_staf">Ubah Staf Pengirim...</option>';
    } else if (filterColumn === "status_terima") {
      newValueSelect.innerHTML +=
        '<option value="change_status">Ubah Status Tiket...</option>';
    }
    // Opsi Hapus selalu tersedia jika ada baris yang cocok
    newValueSelect.innerHTML +=
      '<option value="DELETE_ROWS" class="text-red-600 font-bold">HAPUS Baris Terfilter</option>';

    newValueSelect.removeAttribute("disabled");
    newValueSelect.classList.remove("bg-gray-100", "text-gray-500");
    newValueSelect.classList.add("bg-white");
    newValueContainer.classList.remove("hidden");
    applyMassEditBtn.disabled = false;
  } else {
    rowsAffectedCount.classList.add("hidden");
    newValueSelect.setAttribute("disabled", "disabled");
    newValueSelect.classList.add("bg-gray-100", "text-gray-500");
  }

  // Listener untuk memuat dropdown nilai spesifik (Staf/Status)
  newValueSelect.onchange = function () {
    const selectedAction = newValueSelect.value;

    const existingSpecific = document.getElementById("new-value-specific");
    if (existingSpecific) existingSpecific.remove();

    instruction.classList.add("hidden");
    instruction.classList.remove("text-red-500", "font-bold");

    // Reset tombol jika aksi berubah
    applyMassEditBtn.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.278A1.99 1.99 0 0013.882 2H10a2 2 0 00-2 2v2H4a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-3.118a1.99 1.99 0 00-.882-.278z"></path></svg>Terapkan Aksi Selektif`;
    applyMassEditBtn.classList.remove("bg-red-600", "hover:bg-red-700");
    applyMassEditBtn.classList.add("bg-green-500", "hover:bg-green-600");

    if (
      selectedAction === "change_staf" ||
      selectedAction === "change_status"
    ) {
      const newSelect = document.createElement("select");
      newSelect.id = "new-value-specific";
      newSelect.name = "new_value_specific";
      newSelect.className =
        "w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-indigo-500 focus:border-indigo-500 mt-2";

      if (filterColumn === "dari_staf" && selectedAction === "change_staf") {
        // Menggunakan generateStafOptions() yang diambil dari collection 'staf'
        newSelect.innerHTML = generateStafOptions();
        instruction.textContent = `Semua Staf Pengirim dengan nilai "${filterValue}" (${matchedRows.length} baris) akan diubah menjadi staf ini.`;
      } else if (
        filterColumn === "status_terima" &&
        selectedAction === "change_status"
      ) {
        newSelect.innerHTML = statusOptionsHTML;
        instruction.textContent = `Semua Status Tiket dengan nilai "${filterValue}" (${matchedRows.length} baris) akan diubah menjadi status ini.`;
      }

      newValueSelect.parentNode.insertBefore(newSelect, instruction);
      instruction.classList.remove("hidden");
    } else if (selectedAction === "DELETE_ROWS") {
      instruction.textContent = `PERINGATAN: ${matchedRows.length} baris dengan nilai "${filterValue}" akan dihapus. Aksi tidak dapat dibatalkan.`;
      instruction.classList.remove("hidden");
      instruction.classList.add("text-red-500", "font-bold");

      // Ubah tampilan tombol menjadi Merah (Hapus)
      applyMassEditBtn.innerHTML = `<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>HAPUS ${matchedRows.length} BARIS INI`;
      applyMassEditBtn.classList.remove("bg-green-500", "hover:bg-green-600");
      applyMassEditBtn.classList.add("bg-red-600", "hover:bg-red-700");
    }
  };
};

// FUNGSI MODIFIED: Terapkan Mass Edit
window.applyMassEdit = function () {
  const filterColumn = filterColumnSelect.value;
  const filterValue = filterValueSelect.value;
  const action = newValueSelect.value;
  const rows = transferInContainer.querySelectorAll(".flex.flex-col");

  // Dapatkan Nilai Baru Spesifik jika ada
  let specificNewValue = null;
  if (action === "change_staf" || action === "change_status") {
    const specificSelect = document.getElementById("new-value-specific");
    if (!specificSelect || !specificSelect.value) {
      alert("Mohon pilih nilai baru yang spesifik.");
      return;
    }
    // Pastikan nilai baru diubah ke uppercase untuk konsistensi penyimpanan
    specificNewValue = specificSelect.value.toUpperCase();
  }

  if (filterColumn === "none" || !filterValue || !action) {
    alert("Mohon lengkapi semua langkah filter dan aksi.");
    return;
  }

  const matchedCount = document.getElementById("matched-count").textContent;
  const confirmationText =
    action === "DELETE_ROWS"
      ? `Anda yakin ingin HAPUS ${matchedCount} baris di kolom ${filterColumn
          .toUpperCase()
          .replace(
            "_",
            " "
          )} yang bernilai "${filterValue}"? Aksi ini tidak dapat dibatalkan.`
      : `Anda yakin ingin MENGUBAH ${matchedCount} baris di kolom ${filterColumn
          .toUpperCase()
          .replace(
            "_",
            " "
          )} (nilai lama: "${filterValue}") menjadi nilai baru: "${specificNewValue}"? Aksi ini tidak dapat dibatalkan.`;

  if (!confirm(confirmationText)) {
    return;
  }

  let changedCount = 0;
  let deletedCount = 0;

  // Dapatkan baris yang cocok
  const rowsToProcess = Array.from(rows).filter((row) => {
    const select = row.querySelector(`select[name="${filterColumn}"]`);
    const tiketInput = row.querySelector('input[name="tiket_diterima"]');
    return (
      tiketInput &&
      tiketInput.value.trim() &&
      select &&
      select.value.toUpperCase() === filterValue
    );
  });

  rowsToProcess.forEach((row) => {
    if (action === "DELETE_ROWS") {
      // Aksi Hapus
      row.remove();
      deletedCount++;
    } else if (specificNewValue) {
      // Aksi Ubah
      const targetSelect = row.querySelector(`select[name="${filterColumn}"]`);
      if (targetSelect) {
        targetSelect.value = specificNewValue;
        changedCount++;

        // Jika kolom yang diubah adalah status, panggil toggleTransferTarget untuk mengupdate dropdown tujuan
        if (filterColumn === "status_terima") {
          window.toggleTransferTarget(targetSelect);
        }
      }
    }
  });

  // Setelah menghapus, pastikan ada minimal satu baris kosong
  if (deletedCount > 0 && transferInContainer.children.length === 0) {
    addTransferInRow();
  }

  if (action === "DELETE_ROWS") {
    alert(`Berhasil! ${deletedCount} baris telah dihapus.`);
  } else {
    alert(`Berhasil! ${changedCount} baris telah diubah massal.`);
  }
  closeMassEditModal();
};

// ===================================================
// C. LOGIKA SUBMIT FORM KE FIRESTORE (CREATE)
// ===================================================
laporanForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  document.getElementById("submit-btn").textContent = "Memproses...";
  document.getElementById("submit-btn").disabled = true;

  const staf_pelaksana = inputStaf.value;
  const shift = document.getElementById("input-shift").value;
  const tanggal = document.getElementById("input-tanggal").value;

  if (!staf_pelaksana) {
    alert("Mohon pilih Staf Pelaksana.");
    document.getElementById("submit-btn").textContent = "Simpan Laporan Shift";
    document.getElementById("submit-btn").disabled = false;
    return;
  }

  const diterima = Array.from(
    transferInContainer.querySelectorAll(".flex.flex-col")
  )
    .map((row) => {
      const tiket = row.querySelector('input[name="tiket_diterima"]');
      // Perbaikan: Mengambil select dengan nama 'dari_staf'
      const pengirim = row.querySelector('select[name="dari_staf"]');
      const status = row.querySelector('select[name="status_terima"]');
      const tujuanDiterima = row.querySelector(
        'select[name="staf_tujuan_diterima"]'
      );

      // Pastikan tiket terisi dan bukan baris kosong
      if (!tiket || !tiket.value.trim()) return null;

      return {
        tiket_id: tiket.value.toUpperCase().trim(),
        dari_staf: pengirim ? pengirim.value.toUpperCase() : "",
        status: status ? status.value : "PROGRESS",
        // Simpan staf tujuan diterima hanya jika statusnya TF dan dropdown tujuan tidak disabled
        tujuan_staf:
          status &&
          status.value === "TF" &&
          tujuanDiterima &&
          !tujuanDiterima.disabled
            ? tujuanDiterima.value.toUpperCase()
            : null,
      };
    })
    .filter((item) => item !== null);

  const ditangani = Array.from(
    handlingContainer.querySelectorAll(".flex.flex-col")
  )
    .map((row) => {
      const tiket = row.querySelector('input[name="tiket_ditangani"]');
      const aksi = row.querySelector('select[name="aksi_handling"]');
      const tujuan = row.querySelector('select[name="staf_tujuan"]');

      // Pastikan tiket terisi dan bukan baris kosong
      if (!tiket || !tiket.value.trim()) return null;

      return {
        tiket_id: tiket.value.toUpperCase().trim(),
        aksi: aksi ? aksi.value : "PROGRESS",
        // Simpan staf tujuan hanya jika aksi TF dan dropdown tujuan tidak disabled
        tujuan_staf:
          aksi && aksi.value === "TF" && tujuan && !tujuan.disabled
            ? tujuan.value.toUpperCase()
            : null,
      };
    })
    .filter((item) => item !== null);

  // Pencegahan submit data kosong total
  if (diterima.length === 0 && ditangani.length === 0) {
    alert(
      "Anda mencoba menyimpan laporan kosong. Harap isi minimal satu Tiket Diterima atau Tiket Ditangani."
    );
    document.getElementById("submit-btn").textContent = "Simpan Laporan Shift";
    document.getElementById("submit-btn").disabled = false;
    return;
  }

  try {
    await laporanRef.add({
      staf_pelaksana: staf_pelaksana.toUpperCase(),
      shift,
      tanggal,
      diterima,
      ditangani,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    alert("Laporan berhasil disimpan!");
    laporanForm.reset();
    document.getElementById("input-tanggal").valueAsDate = new Date();
    transferInContainer.innerHTML = "";
    handlingContainer.innerHTML = "";
    addTransferInRow();
    addHandlingRow();
  } catch (error) {
    console.error("Error menyimpan laporan:", error);
    alert(
      "Gagal menyimpan laporan. Pastikan semua field terisi dan koneksi Anda baik."
    );
  } finally {
    document.getElementById("submit-btn").textContent = "Simpan Laporan Shift";
    document.getElementById("submit-btn").disabled = false;
  }
});

// Panggil fungsi inisialisasi saat DOM siap
document.addEventListener("DOMContentLoaded", () => {
  loadStafDropdown().then(() => {
    // Panggil loadCopiedData setelah staf dropdown dimuat, karena ia perlu generateStafOptions()
    loadCopiedData();

    // Pastikan setidaknya ada satu baris jika loadCopiedData tidak mengisi apa-apa
    if (transferInContainer.children.length === 0) {
      addTransferInRow();
    }
    if (handlingContainer.children.length === 0) {
      addHandlingRow();
    }
  });
  document.getElementById("input-tanggal").valueAsDate = new Date();
});
