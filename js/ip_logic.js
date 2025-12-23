const ipCollection = db.collection("management_ip");
// Koleksi baru untuk menyimpan deskripsi per nomor IP host
const ipDetailsCollection = db.collection("ip_details");

// --- 1. LOGIKA KEAMANAN & AKSES ---
function checkAccessTimeout() {
  const role = (localStorage.getItem("userRole") || "user")
    .trim()
    .toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";
  const lastAccess = sessionStorage.getItem("lastNocAccess");
  const now = Date.now();
  const TIMEOUT = 10 * 60 * 1000;

  if (!isAdmin) {
    if (!lastAccess || now - parseInt(lastAccess) > TIMEOUT) {
      sessionStorage.removeItem("lastNocAccess");
      window.location.href = "index.html";
      return;
    }
    sessionStorage.setItem("lastNocAccess", Date.now().toString());
  }
}

function loadUserHeader() {
  const name = localStorage.getItem("userName") || "Staf NOC";
  const username = localStorage.getItem("userUsername") || "user";
  const nameElement = document.getElementById("user-display-name");
  const usernameElement = document.getElementById("user-display-username");
  if (nameElement) nameElement.textContent = name;
  if (usernameElement) usernameElement.textContent = `@${username}`;
}

function applyPermissions() {
  const role = (localStorage.getItem("userRole") || "user")
    .trim()
    .toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";
  const adminElements = document.querySelectorAll(".admin-only");
  adminElements.forEach((el) => {
    el.style.display = !isAdmin ? "none" : "flex";
  });
}

// --- 2. LOGIKA VALIDASI & KALKULASI SUBNET ---

/**
 * Mengecek apakah IP yang diinput benar-benar sebuah Network Address
 * (Bukan IP Host yang dipasangkan dengan prefix)
 */
function isStrictNetworkAddress(cidr) {
  const [address, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr);
  const octets = address.split(".").map(Number);

  // IP ke 32-bit integer
  const ipInt =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
    0;

  // Hitung Mask
  const mask = prefix === 0 ? 0 : ~(Math.pow(2, 32 - prefix) - 1) >>> 0;

  // Network Address yang seharusnya (Hasil AND antara IP dan Mask)
  const calculatedNetwork = (ipInt & mask) >>> 0;

  // Jika IP yang diinput tidak sama dengan hasil kalkulasi, berarti tidak valid
  if (ipInt !== calculatedNetwork) {
    const correctIP = [
      (calculatedNetwork >>> 24) & 0xff,
      (calculatedNetwork >>> 16) & 0xff,
      (calculatedNetwork >>> 8) & 0xff,
      calculatedNetwork & 0xff,
    ].join(".");

    return { valid: false, suggest: `${correctIP}/${prefix}` };
  }

  return { valid: true };
}

/**
 * Mengubah CIDR menjadi rentang integer [start, end] untuk perbandingan overlap
 */
function getIPRangeInt(cidr) {
  const [address, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr);
  const octets = address.split(".").map(Number);

  // Convert IP ke 32-bit unsigned integer
  const ipInt =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
    0;

  // Hitung Mask dan Network/Broadcast
  const mask = prefix === 0 ? 0 : ~(Math.pow(2, 32 - prefix) - 1) >>> 0;
  const networkInt = (ipInt & mask) >>> 0;
  const broadcastInt = (networkInt | ~mask) >>> 0;

  return { start: networkInt, end: broadcastInt };
}

/**
 * Mengecek apakah dua rentang IP tumpang tindih
 */
function isOverlapping(range1, range2) {
  return range1.start <= range2.end && range2.start <= range1.end;
}

function isValidIPPrefix(ip) {
  const regex = /^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/;
  if (!regex.test(ip)) return false;
  const [address, prefix] = ip.split("/");
  const octets = address.split(".");
  const isOctetsValid = octets.every((num) => parseInt(num) <= 255);
  const isPrefixValid = parseInt(prefix) <= 32;
  return isOctetsValid && isPrefixValid;
}

/**
 * Memecah CIDR menjadi Array berisi semua IP (Network s/d Broadcast)
 */
function getIPList(cidr) {
  const [address, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr);
  const octets = address.split(".").map(Number);
  let startInt =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
    0;

  const mask = prefix === 0 ? 0 : ~(Math.pow(2, 32 - prefix) - 1) >>> 0;
  const networkInt = (startInt & mask) >>> 0;
  const broadcastInt = (networkInt | ~mask) >>> 0;

  let ips = [];
  // Batasi loop untuk keamanan (maksimal /24 atau 256 host agar browser tidak freeze)
  const rangeSize = broadcastInt - networkInt;
  if (rangeSize > 512)
    return ["Subnet terlalu besar untuk ditampilkan detailnya."];

  for (let i = networkInt; i <= broadcastInt; i++) {
    const ipStr = [
      (i >>> 24) & 0xff,
      (i >>> 16) & 0xff,
      (i >>> 8) & 0xff,
      i & 0xff,
    ].join(".");
    ips.push(ipStr);
  }
  return ips;
}

function calculateIPRange(cidr) {
  try {
    const [address, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr);
    const octets = address.split(".").map(Number);

    // IP ke 32-bit integer
    const ipInt =
      ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
      0;

    // Hitung Mask
    const mask = prefix === 0 ? 0 : ~(Math.pow(2, 32 - prefix) - 1) >>> 0;

    // Hitung Network dan Broadcast
    const networkInt = (ipInt & mask) >>> 0;
    const broadcastInt = (networkInt | ~mask) >>> 0;

    // Helper untuk ubah integer kembali ke string IP
    const intToIP = (i) =>
      [(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff].join(
        "."
      );

    return `${intToIP(networkInt)} - ${intToIP(broadcastInt)}`;
  } catch (e) {
    return "Format tidak valid";
  }
}

// --- 3. LOGIKA RENDER ---

function renderRow(data, isChild, isLastChild = false) {
  const tbody = document.getElementById("ip-list-body");
  const lastChildClass = isLastChild ? "last-child-row" : "";
  const trClass = isChild ? "child-row hover-row" : "bg-white hover-row";

  // LOGIKA HIRARKI FONT
  // Parent: text-base (16px) & font-bold
  // Child: text-[13px] & font-semibold
  const ipFontClass = isChild
    ? "text-indigo-500 font-semibold text-[13px]"
    : "text-indigo-900 font-bold text-base";

  const ipRange = calculateIPRange(data.ip_address);

  // Tombol Info diperkecil agar tidak mendominasi
  const infoButton = isChild
    ? `<button onclick="openInfoModal('${data.id}', '${data.ip_address}')" class="text-emerald-500 hover:text-emerald-700 font-bold text-[10px] uppercase transition">Info</button>`
    : "";

  const row = `
    <tr class="${trClass} transition-all border-b border-gray-50">
        <td class="py-4 ${
          isChild ? `hierarchy-cell ${lastChildClass}` : "px-6"
        }">
            <div class="flex items-center">
                <span class="font-mono ${ipFontClass} cursor-help border-b border-dotted border-gray-300" title="Rentang IP: ${ipRange}">
                    ${data.ip_address}
                </span>
            </div>
        </td>

        <td class="px-6 py-4 text-[14px] font-medium text-gray-600">
            ${data.nama_perangkat}
        </td>
        
        <td class="px-6 py-4 text-center">
            <div class="flex justify-center">
                <span class="inline-flex justify-center items-center w-24 py-1 rounded text-[10px] font-bold uppercase border shadow-sm tracking-widest ${
                  isChild
                    ? "bg-white text-gray-400 border-gray-100"
                    : "bg-indigo-50 text-indigo-700 border-indigo-100"
                }">
                    ${data.kategori}
                </span>
            </div>
        </td>

        <td class="px-6 py-4 text-center">
            <span class="text-[11px] text-gray-400 font-bold tabular-nums">
                ${
                  data.updated_at
                    ? new Date(data.updated_at.toDate()).toLocaleDateString(
                        "id-ID"
                      )
                    : "-"
                }
            </span>
        </td>

        <td class="px-6 py-4 text-center">
            <div class="flex justify-center items-center gap-3">
                ${infoButton}
                <button onclick="openEditModal('${data.id}', '${
    data.ip_address
  }', '${data.nama_perangkat}', '${data.kategori}', '${data.parent_id || ""}')" 
                        class="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] uppercase transition">Edit</button>
                <button onclick="deleteIP('${
                  data.id
                }')" class="text-red-400 hover:text-red-600 text-[10px] font-bold uppercase transition">Hapus</button>
            </div>
        </td>
    </tr>`;
  tbody.insertAdjacentHTML("beforeend", row);
}

// --- 4. MODAL INFO LOGIC (DETAIL PER IP) ---

window.openInfoModal = async (childId, cidr) => {
  const listContainer = document.getElementById("info-device-list");
  const parentNameEl = document.getElementById("info-parent-name");
  parentNameEl.textContent = cidr;

  listContainer.innerHTML =
    '<tr><td colspan="3" class="p-6 text-center text-gray-400 italic">Menganalisis Subnet...</td></tr>';

  try {
    const ips = getIPList(cidr);
    if (ips.length === 1 && ips[0].includes("besar")) {
      listContainer.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-red-500 font-bold">${ips[0]}</td></tr>`;
      document
        .getElementById("info-ip-modal")
        .classList.replace("hidden", "flex");
      return;
    }

    const detailsSnapshot = await ipDetailsCollection
      .where("child_id", "==", childId)
      .get();
    let savedDetails = {};
    detailsSnapshot.forEach((doc) => {
      savedDetails[doc.data().ip] = doc.data().description;
    });

    listContainer.innerHTML = "";
    ips.forEach((ip, index) => {
      // LOGIKA DEFAULT: Cek apakah IP pertama atau terakhir
      let defaultLabel = "-";
      let isSystemIp = false;

      if (index === 0) {
        defaultLabel = "NETWORK ADDRESS";
        isSystemIp = true;
      } else if (index === ips.length - 1) {
        defaultLabel = "BROADCAST ADDRESS";
        isSystemIp = true;
      }

      // Gunakan deskripsi dari database jika ada, jika tidak gunakan label default
      const desc = savedDetails[ip] || defaultLabel;

      // Jika Network/Broadcast, kita beri warna teks berbeda agar terlihat spesial
      const descClass = isSystemIp ? "text-gray-500" : "text-gray-500";

      const row = `
        <tr class="hover:bg-emerald-50 transition-colors border-b border-gray-100">
          <td class="px-6 py-3 font-mono font-bold text-gray-700">${ip}</td>
          <td class="px-6 py-3 ${descClass} text-sm">${desc}</td>
          <td class="px-6 py-3 text-right">
            <button onclick="editHostDescription('${childId}', '${ip}', '${desc}', '${cidr}')" 
                    class="bg-emerald-100 text-emerald-600 px-3 py-1 rounded text-[10px] font-bold uppercase hover:bg-emerald-200 transition">
                Edit
            </button>
          </td>
        </tr>`;
      listContainer.insertAdjacentHTML("beforeend", row);
    });

    document
      .getElementById("info-ip-modal")
      .classList.replace("hidden", "flex");
  } catch (err) {
    console.error("Gagal memuat info detail:", err);
    Swal.fire("Error", "Gagal memproses detail subnet", "error");
  }
};

window.editHostDescription = async (childId, ip, currentDesc, cidr) => {
  const { value: newDesc } = await Swal.fire({
    title: `Deskripsi IP ${ip}`,
    input: "text",
    inputLabel: "Nama Perangkat / Kegunaan",
    inputValue: currentDesc === "-" ? "" : currentDesc,
    showCancelButton: true,
    confirmButtonColor: "#059669",
    cancelButtonColor: "#d33",
  });

  if (newDesc !== undefined) {
    try {
      // Cari apakah sudah ada record untuk IP ini di child_id ini
      const snapshot = await ipDetailsCollection
        .where("child_id", "==", childId)
        .where("ip", "==", ip)
        .get();

      if (!snapshot.empty) {
        // Update record lama
        await ipDetailsCollection.doc(snapshot.docs[0].id).update({
          description: newDesc || "-",
          updated_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Buat record baru
        await ipDetailsCollection.add({
          child_id: childId,
          ip: ip,
          description: newDesc || "-",
          updated_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      Swal.fire("Berhasil", "Deskripsi diperbarui", "success");
      // Refresh modal
      openInfoModal(childId, cidr);
    } catch (err) {
      console.error(err);
      Swal.fire("Gagal", "Gagal menyimpan data", "error");
    }
  }
};

window.closeInfoModal = () => {
  document.getElementById("info-ip-modal").classList.replace("flex", "hidden");
};

// --- 5. INITIALIZATION & CRUD ---
// (Tetap sama seperti kode sebelumnya untuk updateParentDropdowns, loadIPData, dsb)

function updateParentDropdowns(allDocs, editingId = null) {
  const parents = allDocs.filter((d) => !d.parent_id && d.id !== editingId);
  const selects = [{ id: "select-parent" }, { id: "edit-parent-ip" }];
  selects.forEach((item) => {
    const select = document.getElementById(item.id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Tanpa Induk --</option>';
    parents.forEach((p) => {
      select.innerHTML += `<option value="${p.id}">${p.ip_address} - ${p.nama_perangkat}</option>`;
    });
    select.value = currentVal;
  });
}

function loadIPData() {
  ipCollection.orderBy("ip_address").onSnapshot((snapshot) => {
    const tbody = document.getElementById("ip-list-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const allDocs = [];
    snapshot.forEach((doc) => allDocs.push({ id: doc.id, ...doc.data() }));

    updateParentDropdowns(allDocs);

    // 1. Pisahkan Parent dan Child
    const parents = allDocs.filter((d) => !d.parent_id);
    const children = allDocs.filter((d) => d.parent_id);

    // 2. Fungsi pembantu untuk mengubah IP String ke Angka agar sortir akurat
    const ipToNumber = (ip) => {
      return (
        ip
          .split("/")[0]
          .split(".")
          .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0
      );
    };

    // 3. Render Parent
    parents.forEach((parent) => {
      renderRow(parent, false);

      // 4. Sortir Child milik parent ini berdasarkan nilai IP-nya
      const myChildren = children
        .filter((c) => c.parent_id === parent.id)
        .sort((a, b) => ipToNumber(a.ip_address) - ipToNumber(b.ip_address));

      // 5. Render Child yang sudah urut
      myChildren.forEach((child, index) => {
        renderRow(child, true, index === myChildren.length - 1);
      });
    });
  });
}

// Logika Tambah & Update tetap sama
document
  .getElementById("form-tambah-ip")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ip = document.getElementById("ip-address").value.trim();
    const nama = document.getElementById("nama-perangkat").value;
    const kategori = document.getElementById("kategori-ip").value;
    const parentId = document.getElementById("select-parent").value;

    if (!isValidIPPrefix(ip)) {
      Swal.fire("Format Salah", "Contoh: 192.168.1.0/24", "warning");
      return;
    }

    try {
      // 1. VALIDASI OVERLAP & DUPLIKASI
      const newRange = getIPRangeInt(ip);
      const snapshot = await ipCollection
        .where("parent_id", "==", parentId)
        .get();

      let overlapFound = false;
      let existingIp = "";

      if (!isValidIPPrefix(ip)) {
        Swal.fire("Format Salah", "Contoh: 192.168.1.0/24", "warning");
        return;
      }

      const networkCheck = isStrictNetworkAddress(ip);
      if (!networkCheck.valid) {
        Swal.fire({
          title: "Network Address Tidak Valid",
          html: `IP <b>${ip}</b> bukan alamat network yang sah.<br><br>Mungkin maksud Anda: <br><b class="text-emerald-600 text-lg">${networkCheck.suggest}</b>`,
          icon: "error",
        });
        return;
      }

      snapshot.forEach((doc) => {
        const existingRange = getIPRangeInt(doc.data().ip_address);
        if (isOverlapping(newRange, existingRange)) {
          overlapFound = true;
          existingIp = doc.data().ip_address;
        }
      });

      if (overlapFound) {
        Swal.fire({
          title: "IP Tabrakan!",
          text: `Rentang IP ${ip} tumpang tindih dengan ${existingIp} yang sudah ada di level ini.`,
          icon: "error",
        });
        return;
      }

      // 2. Simpan jika lolos validasi
      await ipCollection.add({
        ip_address: ip,
        nama_perangkat: nama.toUpperCase(),
        kategori: kategori,
        parent_id: parentId,
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      });

      Swal.fire("Berhasil", "Data tersimpan", "success");
      e.target.reset();
    } catch (err) {
      console.error("Error Tambah:", err);
      Swal.fire("Gagal", err.message, "error");
    }
  });

document.getElementById("btn-update-ip").onclick = async () => {
  const id = document.getElementById("edit-ip-id").value;
  const ip = document.getElementById("edit-ip-address").value.trim();
  const nama = document.getElementById("edit-nama-perangkat").value;
  const kategori = document.getElementById("edit-kategori-ip").value;
  const parentId = document.getElementById("edit-parent-ip").value;

  if (!isValidIPPrefix(ip)) {
    Swal.fire("Format Salah", "Format IP/Prefix tidak valid.", "warning");
    return;
  }

  try {
    // 1. VALIDASI OVERLAP SAAT EDIT
    const newRange = getIPRangeInt(ip);
    const snapshot = await ipCollection
      .where("parent_id", "==", parentId)
      .get();

    if (!isValidIPPrefix(ip)) {
      Swal.fire("Format Salah", "Format IP/Prefix tidak valid.", "warning");
      return;
    }

    const networkCheck = isStrictNetworkAddress(ip);
    if (!networkCheck.valid) {
      Swal.fire({
        title: "Network Address Tidak Valid",
        html: `IP <b>${ip}</b> bukan alamat network yang sah.<br><br>Saran perbaikan: <br><b class="text-emerald-600 text-lg">${networkCheck.suggest}</b>`,
        icon: "error",
      });
      return;
    }

    let overlapFound = false;
    snapshot.forEach((doc) => {
      if (doc.id === id) return; // Lewati dokumen yang sedang diedit

      const existingRange = getIPRangeInt(doc.data().ip_address);
      if (isOverlapping(newRange, existingRange)) {
        overlapFound = true;
      }
    });

    if (overlapFound) {
      Swal.fire({
        title: "Gagal Update",
        text: `Rentang IP ${ip} tumpang tindih dengan alokasi lain di level ini.`,
        icon: "error",
      });
      return;
    }

    // 2. Lakukan Update
    await ipCollection.doc(id).update({
      ip_address: ip,
      nama_perangkat: nama.toUpperCase(),
      kategori: kategori,
      parent_id: parentId,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });

    closeEditModal();
    Swal.fire("Updated", "Data diperbarui", "success");
  } catch (err) {
    console.error("Error Update:", err);
    Swal.fire("Gagal", err.message, "error");
  }
};

window.openEditModal = async (id, ip, nama, kategori, parentId) => {
  document.getElementById("edit-ip-id").value = id;
  document.getElementById("edit-ip-address").value = ip;
  document.getElementById("edit-nama-perangkat").value = nama;
  document.getElementById("edit-kategori-ip").value = kategori;
  try {
    const snapshot = await ipCollection.get();
    const allDocs = [];
    snapshot.forEach((doc) => allDocs.push({ id: doc.id, ...doc.data() }));
    updateParentDropdowns(allDocs, id);
    document.getElementById("edit-parent-ip").value = parentId;
    document
      .getElementById("edit-ip-modal")
      .classList.replace("hidden", "flex");
  } catch (err) {
    console.error("Error modal:", err);
  }
};

window.closeEditModal = () => {
  document.getElementById("edit-ip-modal").classList.replace("flex", "hidden");
};

window.deleteIP = async (id) => {
  const res = await Swal.fire({
    title: "Hapus Data IP?",
    text: "Peringatan: Jika ini adalah Parent, maka seluruh Child dan Detail Host di dalamnya akan dihapus permanen!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    confirmButtonText: "Ya, Hapus Semua!",
    cancelButtonText: "Batal",
  });

  if (res.isConfirmed) {
    try {
      const batch = db.batch();

      // 1. Cek apakah ini Parent yang punya Child
      const childrenSnapshot = await ipCollection
        .where("parent_id", "==", id)
        .get();

      // 2. Jika ada Child, kita harus hapus detail_ip milik setiap child tersebut
      for (const childDoc of childrenSnapshot.docs) {
        const childId = childDoc.id;

        // Cari detail_ip milik child ini
        const detailsSnapshot = await db
          .collection("ip_details")
          .where("child_id", "==", childId)
          .get();

        detailsSnapshot.forEach((detailDoc) => {
          batch.delete(detailDoc.ref);
        });

        // Masukkan childDoc ke antrian hapus
        batch.delete(childDoc.ref);
      }

      // 3. Hapus juga detail_ip jika ID yang dihapus saat ini adalah Child
      const selfDetailsSnapshot = await db
        .collection("ip_details")
        .where("child_id", "==", id)
        .get();
      selfDetailsSnapshot.forEach((detailDoc) => {
        batch.delete(detailDoc.ref);
      });

      // 4. Hapus dokumen utama (Parent atau Child itu sendiri)
      batch.delete(ipCollection.doc(id));

      // 5. Eksekusi semua perintah dalam satu waktu
      await batch.commit();

      Swal.fire(
        "Berhasil",
        "Semua data terkait telah dibersihkan dari database.",
        "success"
      );
    } catch (err) {
      console.error("Error saat menghapus berantai:", err);
      Swal.fire("Gagal", "Terjadi kesalahan saat menghapus data.", "error");
    }
  }
};

const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
document.getElementById("menu-toggle")?.addEventListener("click", () => {
  sidebar?.classList.toggle("-translate-x-full");
  backdrop?.classList.toggle("opacity-0");
  backdrop?.classList.toggle("pointer-events-none");
});

window.handleLogout = function () {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = "login.html";
};

document.addEventListener("DOMContentLoaded", () => {
  checkAccessTimeout();
  loadUserHeader();
  applyPermissions();
  loadIPData();
});
