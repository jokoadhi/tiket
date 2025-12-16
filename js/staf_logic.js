// js/staf_logic.js

const stafCollection = db.collection("staf");
const stafListBody = document.getElementById("staf-list-body");
const formTambahStaf = document.getElementById("form-tambah-staf");
const editModal = document.getElementById("edit-modal"); // Ambil modal

// ===================================================
// READ: Memuat daftar staf (Realtime Listener)
// ===================================================
stafCollection.orderBy("nama").onSnapshot(
  (snapshot) => {
    stafListBody.innerHTML = "";
    if (snapshot.empty) {
      stafListBody.innerHTML =
        '<tr><td colspan="3" class="px-6 py-4 text-center text-sm text-gray-500">Belum ada data staf.</td></tr>';
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      const stafId = doc.id;

      // Sanitasi nilai sebelum dimasukkan ke dalam onclick (untuk mencegah error string quote)
      const safeNama = data.nama.replace(/'/g, "\\'");
      // Menggunakan data.jabatan (atau fallback ke 'N/A' jika data lama)
      const jabatan = data.jabatan || data.shift_default || "N/A";
      const safeJabatan = jabatan.replace(/'/g, "\\'");

      const row = stafListBody.insertRow();
      row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.nama}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${jabatan}</td>
            <td class="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                <button onclick="openEditModal('${stafId}', '${safeNama}', '${safeJabatan}')" class="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                <button onclick="deleteStaf('${stafId}', '${safeNama}')" class="text-red-600 hover:text-red-900">Hapus</button>
            </td>
        `;
    });
  },
  (err) => {
    console.error("Error memuat staf:", err);
  }
);

// ===================================================
// CREATE: Menambah Staf (Menggunakan SweetAlert)
// ===================================================
formTambahStaf.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nama = document.getElementById("input-nama-staf").value;
  const jabatan = document.getElementById("select-jabatan").value;

  try {
    // Cek duplikasi
    const existingStaf = await stafCollection
      .where("nama", "==", nama.toUpperCase())
      .get();

    if (!existingStaf.empty) {
      // Ganti alert() dengan SweetAlert
      Swal.fire({
        icon: "warning",
        title: "Gagal Menambahkan",
        text: `Staf dengan nama ${nama.toUpperCase()} sudah ada.`,
        confirmButtonText: "OK",
      });
      return;
    }

    await stafCollection.add({
      nama: nama.toUpperCase(),
      jabatan: jabatan,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Ganti alert() dengan SweetAlert sukses
    Swal.fire({
      icon: "success",
      title: "Berhasil",
      text: `Staf ${nama.toUpperCase()} (${jabatan}) berhasil ditambahkan!`,
      timer: 2000,
      showConfirmButton: false,
    });

    formTambahStaf.reset();
  } catch (error) {
    console.error("Error menambahkan staf: ", error);
    // Ganti alert() dengan SweetAlert gagal
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: "Gagal menambahkan staf. Silakan coba lagi.",
      confirmButtonText: "Tutup",
    });
  }
});

// ===================================================
// DELETE: Menghapus Staf (Menggunakan SweetAlert)
// ===================================================
window.deleteStaf = async function (stafId, nama) {
  // Ganti confirm() dengan SweetAlert konfirmasi
  const result = await Swal.fire({
    title: `Hapus Staf ${nama}?`,
    text: "Yakin ingin menghapus staf ini? Data laporan terkait tidak akan terhapus.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "Ya, Hapus!",
    cancelButtonText: "Batal",
  });

  if (result.isConfirmed) {
    try {
      await stafCollection.doc(stafId).delete();
      // Notifikasi sukses setelah delete
      Swal.fire("Terhapus!", `Staf ${nama} berhasil dihapus.`, "success");
    } catch (error) {
      console.error("Error menghapus staf: ", error);
      // Notifikasi gagal
      Swal.fire("Gagal!", "Gagal menghapus staf.", "error");
    }
  }
};

// ===================================================
// UPDATE: Edit Staf (Modal)
// ===================================================
window.openEditModal = function (id, nama, jabatan) {
  document.getElementById("edit-staf-id").value = id;
  document.getElementById("edit-nama").value = nama;
  document.getElementById("edit-jabatan").value = jabatan;
  editModal.classList.remove("hidden");
  editModal.classList.add("flex");
};

document.getElementById("btn-save-edit").addEventListener("click", async () => {
  const id = document.getElementById("edit-staf-id").value;
  const newNama = document.getElementById("edit-nama").value;
  const newJabatan = document.getElementById("edit-jabatan").value;

  try {
    await stafCollection.doc(id).update({
      nama: newNama.toUpperCase(),
      jabatan: newJabatan,
    });

    // Ganti alert() dengan SweetAlert sukses
    Swal.fire({
      icon: "success",
      title: "Berhasil Disimpan",
      text: `Perubahan staf ${newNama.toUpperCase()} berhasil disimpan.`,
      timer: 1500,
      showConfirmButton: false,
    });

    editModal.classList.add("hidden");
    editModal.classList.remove("flex");
  } catch (error) {
    console.error("Error update staf: ", error);

    // Ganti alert() dengan SweetAlert gagal
    Swal.fire({
      icon: "error",
      title: "Gagal",
      text: "Gagal menyimpan perubahan staf.",
      confirmButtonText: "Tutup",
    });
  }
});
