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
      "error"
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
