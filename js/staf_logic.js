// js/staf_logic.js

// Pastikan DB sudah terinisialisasi dari firebase_init.js
const stafCollection = db.collection("staf");
const stafListBody = document.getElementById("staf-list-body");
const formTambahStaf = document.getElementById("form-tambah-staf");
const editModal = document.getElementById("edit-modal");

let currentUnsubscribe = null;

/**
 * Fungsi untuk menghitung statistik staf secara real-time
 * Ditambahkan kategori: LOGISTIK dan FAT
 */
function updateStats(snapshot) {
  let total = 0;
  let noc = 0;
  let teknisi = 0;
  let biller = 0;
  let logistik = 0;
  let fat = 0;

  snapshot.forEach((doc) => {
    total++;
    const j = (doc.data().jabatan || "").toUpperCase();
    if (j === "NOC") noc++;
    else if (j === "TEKNISI") teknisi++;
    else if (j === "BILLER") biller++;
    else if (j === "LOGISTIK") logistik++;
    else if (j === "FAT") fat++;
  });

  // Update ke UI berdasarkan ID yang ada di HTML
  if (document.getElementById("stat-total"))
    document.getElementById("stat-total").textContent = total;
  if (document.getElementById("stat-noc"))
    document.getElementById("stat-noc").textContent = noc;
  if (document.getElementById("stat-teknisi"))
    document.getElementById("stat-teknisi").textContent = teknisi;
  if (document.getElementById("stat-biller"))
    document.getElementById("stat-biller").textContent = biller;
  if (document.getElementById("stat-logistik"))
    document.getElementById("stat-logistik").textContent = logistik;
  if (document.getElementById("stat-fat"))
    document.getElementById("stat-fat").textContent = fat;
}

// --- READ & SORT ---
window.loadStaf = function (sortField = "nama") {
  console.log("Memuat staf, urutkan berdasarkan:", sortField);

  if (currentUnsubscribe) currentUnsubscribe();

  const iconNama = document.getElementById("sort-icon-nama");
  const iconJabatan = document.getElementById("sort-icon-jabatan");

  if (iconNama) iconNama.textContent = "↕";
  if (iconJabatan) iconJabatan.textContent = "↕";

  const activeIcon = document.getElementById(`sort-icon-${sortField}`);
  if (activeIcon) {
    activeIcon.textContent = "↓";
    activeIcon.classList.add("text-indigo-800");
  }

  currentUnsubscribe = stafCollection.orderBy(sortField).onSnapshot(
    (snapshot) => {
      updateStats(snapshot);
      stafListBody.innerHTML = "";

      if (snapshot.empty) {
        stafListBody.innerHTML =
          '<tr><td colspan="3" class="px-6 py-8 text-center text-sm text-gray-400 italic bg-white">Belum ada data staf terdaftar.</td></tr>';
        return;
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const stafId = doc.id;
        const safeNama = (data.nama || "").replace(/'/g, "\\'");
        const jabatan = data.jabatan || "N/A";
        const safeJabatan = jabatan.replace(/'/g, "\\'");

        const row = document.createElement("tr");
        row.className =
          "hover:bg-blue-50/50 transition-colors border-b border-gray-100 last:border-0";
        row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <p class="text-sm font-bold text-gray-800">${data.nama}</p>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase border border-indigo-100">
                        ${jabatan}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="openEditModal('${stafId}', '${safeNama}', '${safeJabatan}')" 
                            class="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition mr-2 font-bold">
                        Edit
                    </button>
                    <button onclick="deleteStaf('${stafId}', '${safeNama}')" 
                            class="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition font-bold">
                        Hapus
                    </button>
                </td>
            `;
        stafListBody.appendChild(row);
      });
    },
    (err) => {
      console.error("Firestore Error:", err);
    }
  );
};

// --- CREATE ---
if (formTambahStaf) {
  formTambahStaf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = document.getElementById("input-nama-staf").value;
    const jabatan = document.getElementById("select-jabatan").value;

    try {
      await stafCollection.add({
        nama: nama.toUpperCase(),
        jabatan: jabatan,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Swal.fire({
        icon: "success",
        title: "Berhasil",
        showConfirmButton: false,
        timer: 1500,
      });
      formTambahStaf.reset();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Gagal", text: error.message });
    }
  });
}

// --- DELETE ---
window.deleteStaf = async function (stafId, nama) {
  const result = await Swal.fire({
    title: `Hapus ${nama}?`,
    text: "Data ini akan dihapus permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Ya, Hapus",
  });

  if (result.isConfirmed) {
    try {
      await stafCollection.doc(stafId).delete();
      Swal.fire("Terhapus!", "", "success");
    } catch (error) {
      Swal.fire("Gagal!", "Tidak bisa menghapus data.", "error");
    }
  }
};

// --- UPDATE (MODAL) ---
window.openEditModal = function (id, nama, jabatan) {
  document.getElementById("edit-staf-id").value = id;
  document.getElementById("edit-nama").value = nama;
  document.getElementById("edit-jabatan").value = jabatan;
  editModal.classList.remove("hidden");
  editModal.classList.add("flex");
};

const btnSaveEdit = document.getElementById("btn-save-edit");
if (btnSaveEdit) {
  btnSaveEdit.addEventListener("click", async () => {
    const id = document.getElementById("edit-staf-id").value;
    const newNama = document.getElementById("edit-nama").value;
    const newJabatan = document.getElementById("edit-jabatan").value;

    try {
      await stafCollection.doc(id).update({
        nama: newNama.toUpperCase(),
        jabatan: newJabatan,
      });
      Swal.fire({
        icon: "success",
        title: "Diperbarui",
        showConfirmButton: false,
        timer: 1500,
      });
      editModal.classList.add("hidden");
      editModal.classList.remove("flex");
    } catch (error) {
      Swal.fire({ icon: "error", title: "Gagal Update" });
    }
  });
}

// Jalankan pertama kali
window.loadStaf("nama");
