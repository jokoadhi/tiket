// js/firebase_init.js

const firebaseConfig = {
  apiKey: "AIzaSyAKWBcatcilVZQs4UYE0ySI6F8DRQE2lTA",
  authDomain: "ticks-97efb.firebaseapp.com",
  projectId: "ticks-97efb",
  storageBucket: "ticks-97efb.firebasestorage.app",
  messagingSenderId: "270838053064",
  appId: "1:270838053064:web:f6e9e69736bbb5c79d4dfd",
};

// Inisialisasi Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const TIMEOUT_AKSES = 10 * 60 * 1000;

// --- FUNGSI KEAMANAN BARU (FIRESTORE BASED) ---

// 1. Fungsi mengambil kode verifikasi dari database
async function getMasterNocCode() {
  try {
    const doc = await db.collection("settings").doc("noc_config").get();
    if (doc.exists) {
      return doc.data().verification_code;
    } else {
      // Inisialisasi jika dokumen belum ada di Firestore
      await db.collection("settings").doc("noc_config").set({
        verification_code: "123456",
      });
      return "123456";
    }
  } catch (error) {
    console.error("Gagal mengambil kode NOC:", error);
    return null;
  }
}

// 2. Fungsi untuk mengubah kode verifikasi (Panggil fungsi ini dari UI Admin)
window.updateKodeNOC = async function (newCode) {
  if (!newCode || newCode.length < 4) {
    Swal.fire("Gagal", "Kode minimal 4 karakter!", "error");
    return;
  }

  try {
    await db.collection("settings").doc("noc_config").update({
      verification_code: newCode,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    Swal.fire("Berhasil", "Kode verifikasi NOC diperbarui!", "success");
  } catch (error) {
    Swal.fire(
      "Gagal",
      "Anda tidak memiliki akses untuk mengubah kode.",
      "error",
    );
  }
};

// 3. Logika Cek Akses Kelola IP
window.cekAksesKelolaIP = async function () {
  const role = (localStorage.getItem("userRole") || "user")
    .trim()
    .toLowerCase();
  const isAdmin = role === "admin" || role === "administrator";

  const lastAccess = sessionStorage.getItem("lastNocAccess");
  const now = Date.now();

  let sessionValid = false;
  if (lastAccess && now - parseInt(lastAccess) < TIMEOUT_AKSES) {
    sessionValid = true;
  }

  // Jika Admin atau Session masih berlaku
  if (isAdmin || sessionValid) {
    sessionStorage.setItem("lastNocAccess", Date.now().toString());
    window.location.href = "kelola_ip.html";
    return;
  }

  // Minta Kode dari Firestore
  const masterCode = await getMasterNocCode();

  const { value: password } = await Swal.fire({
    title: "Akses Terbatas",
    text: "Masukkan Kode Verifikasi NOC",
    input: "password",
    inputPlaceholder: "Kode NOC",
    showCancelButton: true,
    confirmButtonColor: "#4f46e5",
  });

  if (password) {
    if (password === masterCode) {
      sessionStorage.setItem("lastNocAccess", Date.now().toString());
      window.location.href = "kelola_ip.html";
    } else {
      Swal.fire({ icon: "error", title: "Kode Salah" });
    }
  }
};

function checkBackupReminder() {
  const today = new Date();
  const date = today.getDate();
  const todayString = today.toDateString(); // Contoh: "Fri Mar 13 2026"

  // Aktif di tanggal 10 dan 25 (tambahkan tanggal lain untuk testing)
  if (date === 10 || date === 25) {
    // Cek apakah sudah pernah klik "SUDAH" hari ini di localStorage
    const backupStatus = localStorage.getItem("backupDoneDate");

    if (backupStatus !== todayString) {
      showBackupAlert(date, todayString);
    }
  }
}

function showBackupAlert(tgl, todayString) {
  Swal.fire({
    title: `JADWAL BACKUP RUTIN`,
    icon: "warning",
    iconColor: "#f59e0b",
    html: `
      <div class="text-left mt-4">
        <p class="text-slate-500 text-xs tracking-widest uppercase font-bold mb-2">Periode: Tanggal ${tgl}</p>
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <p class="text-slate-700 font-semibold text-sm mb-3">Daftar Perangkat Wajib Backup:</p>
          <div class="grid grid-cols-1 gap-2">
            <div class="flex items-center text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 shadow-sm">
              <span class="w-2 h-2 bg-blue-500 rounded-full mr-2"></span> Perangkat OLT (Running Config)
            </div>
            <div class="flex items-center text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 shadow-sm">
              <span class="w-2 h-2 bg-blue-500 rounded-full mr-2"></span> Perangkat Mikrotik (Binary & Export)
            </div>
          </div>
        </div>
        <p class="mt-4 text-[11px] text-center text-slate-400">Status: <span class="text-red-400 font-medium">Belum Terverifikasi</span></p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "SAYA SUDAH BACKUP",
    cancelButtonText: "NANTI Saja",
    confirmButtonColor: "#2563eb", // Blue 600
    cancelButtonColor: "#f1f5f9", // Slate 100
    reverseButtons: true,
    allowOutsideClick: false,
    customClass: {
      popup: "noc-premium-popup",
      title: "noc-premium-title",
      confirmButton: "noc-confirm-btn",
      cancelButton: "noc-cancel-btn",
    },
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.setItem("backupDoneDate", todayString);
      Swal.fire({
        icon: "success",
        title: "VERIFIED",
        text: "Backup tercatat di sistem lokal.",
        timer: 2000,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", checkBackupReminder);

// Jalankan pengecekan ulang setiap 1 jam tanpa perlu refresh
setInterval(checkBackupReminder, 3600000);
