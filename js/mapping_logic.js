/**
 * js/mapping_logic.js
 */

const odpCollection = db.collection("odp_list");
const catCollection = db.collection("mapping_categories");
let map;
let markersLayer = L.layerGroup();
let tempMarker = null; // Menyimpan marker sementara saat peta diklik

/**
 * Inisialisasi Peta Leaflet
 */
window.initMap = function () {
  const defaultLocation = [-7.848, 112.017]; // Kediri
  map = L.map("map").setView(defaultLocation, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  markersLayer.addTo(map);

  // EVENT: Klik peta untuk menentukan lokasi ODP
  map.on("click", function (e) {
    const { lat, lng } = e.latlng;
    if (tempMarker) map.removeLayer(tempMarker);

    tempMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl:
          "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    }).addTo(map);

    tempMarker
      .bindPopup(
        `
      <div class="p-1 text-center">
        <p class="font-bold text-red-600 text-[11px] mb-2">Lokasi Terpilih</p>
        <button onclick="tambahTitikODP()" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black shadow-sm">TAMBAH ODP DISINI</button>
      </div>
    `,
      )
      .openPopup();
  });

  loadCategories();
};

/**
 * Memuat daftar kategori ke dropdown
 */
async function loadCategories() {
  const select = document.getElementById("select-kategori");
  catCollection.orderBy("nama", "asc").onSnapshot((snapshot) => {
    select.innerHTML = '<option value="">-- Pilih Cluster --</option>';
    snapshot.forEach((doc) => {
      const data = doc.data();
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = data.nama;
      select.appendChild(opt);
    });
  });
}

/**
 * Menampilkan Marker dengan Label Nama yang Muncul Terus (Permanent Tooltip)
 */
window.loadMarkersByCategory = async function () {
  const catId = document.getElementById("select-kategori").value;
  markersLayer.clearLayers();

  if (!catId) return;

  try {
    const snapshot = await odpCollection.where("categoryId", "==", catId).get();
    const bounds = [];

    // 1. Definisi Icon Custom dengan Anchor yang tepat (Titik tumpu di ujung bawah pin)
    const blueIcon = L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41], // Mengunci posisi agar ujung lancip pin tepat di koordinat
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    snapshot.forEach((doc) => {
      const data = doc.data();
      const id = doc.id;

      if (data.lat && data.lng) {
        // 2. Buat Marker dengan Icon yang sudah diperbaiki
        const marker = L.marker([data.lat, data.lng], {
          draggable: true,
          icon: blueIcon,
        });

        // 3. Pasang Tooltip (Label Nama) yang muncul terus
        marker.bindTooltip(data.nama_odp, {
          permanent: true,
          direction: "top",
          offset: [0, -42], // Jarak label tepat di atas kepala pin
          className: "odp-label", // Pastikan class ini ada di CSS Anda
        });

        // 4. Pasang Popup dengan tampilan yang rapi dan simetris
        const popupContent = `
          <div style="min-width: 180px; padding: 5px; font-family: sans-serif;">
            <div style="margin-bottom: 12px; text-align: left;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 900; color: #4338ca; text-transform: uppercase; line-height: 1.2;">
                  ${data.nama_odp}
                </h3>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #6b7280; font-weight: 500;">
                  ${data.wilayah || "Tanpa keterangan wilayah"}
                </p>
            </div>
            <div style="display: flex; gap: 8px; border-top: 1px solid #f3f4f6; padding-top: 12px;">
              <button onclick="editODP('${id}')" 
                style="flex: 1; background: #eef2ff; color: #4338ca; border: none; padding: 8px 0; border-radius: 10px; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s;">
                EDIT
              </button>
              <button onclick="hapusODP('${id}', '${data.nama_odp}')" 
                style="flex: 1; background: #fef2f2; color: #ef4444; border: none; padding: 8px 0; border-radius: 10px; font-size: 10px; font-weight: 800; cursor: pointer; transition: 0.2s;">
                HAPUS
              </button>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 250,
          className: "custom-popup-wrapper",
        });

        // 5. Logika Dragend (Update posisi)
        marker.on("dragend", async function (event) {
          const newPos = event.target.getLatLng();
          const confirmUpdate = await Swal.fire({
            title: "Update Lokasi?",
            text: `Pindahkan ${data.nama_odp} ke koordinat baru?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Ya, Pindahkan",
            cancelButtonText: "Batal",
            customClass: { popup: "rounded-3xl" },
          });

          if (confirmUpdate.isConfirmed) {
            try {
              await odpCollection.doc(id).update({
                lat: newPos.lat,
                lng: newPos.lng,
              });
              Swal.fire({
                icon: "success",
                title: "Lokasi Terupdate",
                timer: 800,
                showConfirmButton: false,
              });
            } catch (err) {
              console.error(err);
              loadMarkersByCategory(); // Revert jika gagal
            }
          } else {
            loadMarkersByCategory(); // Reset posisi marker jika batal
          }
        });

        markersLayer.addLayer(marker);
        bounds.push([data.lat, data.lng]);
      }
    });

    // Otomatis zoom ke area marker
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  } catch (error) {
    console.error("Gagal memuat ODP:", error);
    Swal.fire("Error", "Gagal mengambil data dari database", "error");
  }
};

/**
 * Tambah Titik ODP (Otomatis dari Klik Peta)
 */
window.tambahTitikODP = async function () {
  const currentCatId = document.getElementById("select-kategori").value;
  if (!currentCatId) {
    return Swal.fire({
      icon: "warning",
      title: "Pilih Cluster!",
      text: "Pilih cluster di dropdown dahulu.",
      confirmButtonColor: "#4f46e5",
      customClass: { popup: "rounded-3xl" },
    });
  }

  if (!tempMarker) {
    return Swal.fire({
      icon: "info",
      title: "Klik Peta!",
      text: "Klik pada peta terlebih dahulu untuk mengambil koordinat.",
      confirmButtonColor: "#4f46e5",
      customClass: { popup: "rounded-3xl" },
    });
  }

  const lat = tempMarker.getLatLng().lat.toFixed(6);
  const lng = tempMarker.getLatLng().lng.toFixed(6);

  const { value: formValues } = await Swal.fire({
    title:
      '<div class="text-2xl font-black text-gray-800 pt-4">Tambah ODP Baru</div>',
    html: `
      <div class="text-left px-1 mt-4 space-y-5">
        <div>
          <label class="text-[10px] font-black text-indigo-500 uppercase tracking-[2px] mb-2 block">Nama ODP</label>
          <input id="swal-odp" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 font-bold text-gray-700" placeholder="ODP-XXX-01">
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2 block">Latitude</label>
                <input class="w-full p-4 bg-gray-100 border-2 border-gray-100 rounded-2xl font-bold text-gray-400 cursor-not-allowed" value="${lat}" readonly>
            </div>
            <div>
                <label class="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2 block">Longitude</label>
                <input class="w-full p-4 bg-gray-100 border-2 border-gray-100 rounded-2xl font-bold text-gray-400 cursor-not-allowed" value="${lng}" readonly>
            </div>
        </div>
        <div>
          <label class="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2 block">Wilayah</label>
          <input id="swal-wil" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 font-bold text-gray-700" placeholder="Keterangan wilayah...">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Simpan ODP",
    cancelButtonText: "Batal",
    buttonsStyling: false,
    customClass: {
      confirmButton:
        "px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-lg ml-3",
      cancelButton:
        "px-8 py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-sm",
      popup: "rounded-[2rem] p-8",
    },
    preConfirm: () => {
      const nama = document.getElementById("swal-odp").value.trim();
      if (!nama) return Swal.showValidationMessage("Nama ODP wajib diisi!");
      return {
        nama_odp: nama,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        wilayah: document.getElementById("swal-wil").value.trim(),
        categoryId: currentCatId,
      };
    },
  });

  if (formValues) {
    await odpCollection.add({
      ...formValues,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = null;
    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      showConfirmButton: false,
      timer: 1500,
      customClass: { popup: "rounded-3xl" },
    });
    loadMarkersByCategory();
  }
};

/**
 * Edit ODP
 */
window.editODP = async function (id) {
  const doc = await odpCollection.doc(id).get();
  const data = doc.data();

  const { value: formValues } = await Swal.fire({
    title:
      '<div class="text-xl font-black text-gray-800 pt-4">Edit Data ODP</div>',
    html: `
      <div class="text-left px-1 mt-4 space-y-4">
        <div>
          <label class="text-[10px] font-black text-indigo-500 uppercase tracking-[2px] mb-2 block">Nama ODP</label>
          <input id="edit-odp-nama" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700" value="${data.nama_odp}">
        </div>
        <div>
          <label class="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-2 block">Wilayah</label>
          <input id="edit-odp-wil" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700" value="${data.wilayah || ""}">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Update",
    buttonsStyling: false,
    customClass: {
      confirmButton:
        "px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-lg ml-3",
      cancelButton:
        "px-8 py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-sm",
      popup: "rounded-[2rem] p-8",
    },
    preConfirm: () => {
      return {
        nama_odp: document.getElementById("edit-odp-nama").value.trim(),
        wilayah: document.getElementById("edit-odp-wil").value.trim(),
      };
    },
  });

  if (formValues) {
    await odpCollection.doc(id).update(formValues);
    Swal.fire({
      icon: "success",
      title: "Diperbarui!",
      showConfirmButton: false,
      timer: 1500,
      customClass: { popup: "rounded-3xl" },
    });
    loadMarkersByCategory();
  }
};

/**
 * Hapus ODP
 */
window.hapusODP = async function (id, nama) {
  const result = await Swal.fire({
    title: `<span class="text-lg">Hapus ${nama}?</span>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Hapus",
    buttonsStyling: false,
    customClass: {
      confirmButton:
        "px-6 py-3 rounded-xl bg-red-600 text-white font-bold text-sm ml-3",
      cancelButton:
        "px-6 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold text-sm",
      popup: "rounded-3xl",
    },
  });

  if (result.isConfirmed) {
    await odpCollection.doc(id).delete();
    Swal.fire({
      icon: "success",
      title: "Terhapus!",
      showConfirmButton: false,
      timer: 1000,
      customClass: { popup: "rounded-3xl" },
    });
    loadMarkersByCategory();
  }
};

/**
 * Kelola Cluster (Sama seperti sebelumnya)
 */
window.kelolaKategori = async function () {
  const snapshot = await catCollection.orderBy("nama", "asc").get();
  let listHtml =
    '<div class="mt-6 space-y-3 max-h-64 overflow-y-auto pr-2 custom-scroll">';
  if (snapshot.empty) {
    listHtml += `<div class="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200"><p class="text-gray-400 text-sm">Belum ada cluster</p></div>`;
  } else {
    snapshot.forEach((doc) => {
      const data = doc.data();
      listHtml += `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm group">
          <span class="font-bold text-gray-700">${data.nama}</span>
          <div class="flex gap-2">
            <button onclick="editKategori('${doc.id}', '${data.nama}')" class="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">EDIT</button>
            <button onclick="hapusKategori('${doc.id}', '${data.nama}')" class="px-3 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black">HAPUS</button>
          </div>
        </div>`;
    });
  }
  listHtml += "</div>";

  Swal.fire({
    title:
      '<div class="text-2xl font-black text-gray-800 pt-4">Kelola Cluster</div>',
    html: `<div class="text-left px-1 mb-4"><label class="text-[10px] font-black text-indigo-500 uppercase tracking-[2px] mb-2 block">Tambah Cluster</label><input id="new-cat-name" class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold" placeholder="Nama Cluster...">${listHtml}</div>`,
    showCancelButton: true,
    confirmButtonText: "Tambah",
    buttonsStyling: false,
    customClass: {
      confirmButton:
        "px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold ml-3",
      cancelButton: "px-6 py-3 rounded-xl bg-gray-100 text-gray-500 font-bold",
      popup: "rounded-3xl p-6",
    },
    preConfirm: () => {
      const nama = document.getElementById("new-cat-name").value.trim();
      if (!nama) return Swal.showValidationMessage("Nama wajib diisi");
      return nama;
    },
  }).then(async (result) => {
    if (result.isConfirmed) {
      await catCollection.add({
        nama: result.value,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
      });
      kelolaKategori();
    }
  });
};

window.editKategori = async function (id, namaLama) {
  const { value: namaBaru } = await Swal.fire({
    title: "Edit Cluster",
    input: "text",
    inputValue: namaLama,
    showCancelButton: true,
    confirmButtonText: "Update",
    confirmButtonColor: "#4f46e5",
    customClass: { popup: "rounded-3xl" },
  });
  if (namaBaru && namaBaru !== namaLama) {
    await catCollection.doc(id).update({ nama: namaBaru });
    kelolaKategori();
  }
};

window.hapusKategori = async function (id, nama) {
  const res = await Swal.fire({
    title: `Hapus Cluster ${nama}?`,
    text: "ODP di dalamnya tidak terhapus tapi akan tersembunyi.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    customClass: { popup: "rounded-3xl" },
  });
  if (res.isConfirmed) {
    await catCollection.doc(id).delete();
    kelolaKategori();
  }
};
