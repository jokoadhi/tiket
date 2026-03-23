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

// Fungsi Global untuk Log Aktivitas
async function recordActivity(isLoginAction = false) {
    try {
        const username = localStorage.getItem("username");
        if (!username) return;

        // Logika: Kirim log HANYA JIKA ini proses login, 
        // ATAU jika sesi baru dimulai (belum ada flag 'session_logged')
        const alreadyLogged = sessionStorage.getItem("session_logged");

        if (isLoginAction || !alreadyLogged) {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            
            const logEntry = {
                username: username,
                nama: localStorage.getItem("userName") || "Unknown",
                ip: data.ip,
                url: isLoginAction ? "Login System" : "Access Website",
                device: navigator.userAgent,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection("logs").add(logEntry);
            
            // Tandai bahwa sesi ini sudah dicatat agar tidak duplikat saat pindah halaman
            sessionStorage.setItem("session_logged", "true");
            console.log("Activity logged successfully.");
        }
    } catch (e) {
        console.warn("Log failed", e);
    }
}

async function checkIPBan() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        const userIP = data.ip;

        const doc = await db.collection("banned_ips").doc(userIP).get();

        if (doc.exists) {
            // Jika IP terdaftar di blacklist, paksa ganti tampilan halaman
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; color:white; font-family:sans-serif; text-align:center; padding:20px;">
                    <h1 style="font-size:80px; margin-bottom:0;">🚫</h1>
                    <h1 style="margin-top:10px;">AKSES DITOLAK</h1>
                    <p style="color:#94a3b8; max-width:500px;">IP Address Anda (<b>${userIP}</b>) telah diblokir oleh sistem karena aktivitas mencurigakan.</p>
                    <p style="font-size:12px; margin-top:20px; color:#475569;">Silakan hubungi Administrator FIBERMAXS jika ini adalah kesalahan.</p>
                </div>
            `;
            window.stop(); // Hentikan loading script lainnya
        }
    } catch (e) {
        console.warn("Ban check failed (Offline/Network issue)");
    }
}

// Jalankan pengecekan
checkIPBan();

// Fungsi untuk menampilkan Toast Notifikasi
function showLogToast(msg, type = 'info') {
    const bgColor = type === 'danger' ? 'bg-red-600' : 'bg-indigo-600';
    
    // Gunakan SVG murni agar tidak bergantung pada FontAwesome
    const iconAlert = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    const iconBell = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>`;
    
    const icon = type === 'danger' ? iconAlert : iconBell;

    const toast = document.createElement('div');
    toast.className = `fixed top-20 right-5 z-[9999] flex items-center p-4 w-full max-w-xs text-white rounded-xl shadow-2xl backdrop-blur-sm border border-white/10 toast-animate-in ${bgColor}`;
    
    toast.innerHTML = `
        <div class="inline-flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-lg bg-white/20">
            ${icon}
        </div>
        <div class="ml-3 text-[11px] font-bold leading-tight mr-2">${msg}</div>
        <button type="button" class="ml-auto bg-white/10 hover:bg-white/30 text-white p-1 rounded-md transition-all h-7 w-7 flex items-center justify-center" onclick="closeToast(this.parentElement)">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => { if (toast) closeToast(toast); }, 5000);
}

// 3. Fungsi Keluar yang Halus
function closeToast(el) {
    if (!el) return;
    el.classList.remove('toast-animate-in');
    el.classList.add('toast-animate-out');
    // Hapus elemen setelah animasi keluar selesai (500ms)
    el.addEventListener('animationend', () => {
        el.remove();
    });
}

// Tambahkan animasi via JS ke Head
const style = document.createElement('style');
style.innerHTML = `
    @keyframes toastSlideIn {
        from { transform: translateX(120%) scale(0.9); opacity: 0; }
        to { transform: translateX(0) scale(1); opacity: 1; }
    }
    @keyframes toastSlideOut {
        from { transform: translateX(0) scale(1); opacity: 1; }
        to { transform: translateX(120%) scale(0.9); opacity: 0; }
    }
    .toast-animate-in {
        animation: toastSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .toast-animate-out {
        animation: toastSlideOut 0.5s cubic-bezier(0.7, 0, 0.84, 0) forwards;
    }
`;
document.head.appendChild(style);

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

function startRealtimeNotification() {
    if (window.location.pathname.includes('login.html')) return;

    const userRole = localStorage.getItem("userRole");
    if (userRole !== 'administrator' && userRole !== 'admin') return;

    console.log("Realtime Notification Active (New Activity Only)...");

    // 1. Ambil waktu server saat ini sebagai titik awal
    // Log yang waktunya lebih lama dari 'now' tidak akan diproses
    const now = new Date();

    db.collection("logs")
      .orderBy("timestamp", "desc")
      .limit(1) // Kita hanya pantau 1 data paling baru
      .onSnapshot((snapshot) => {
          snapshot.docChanges().forEach((change) => {
    if (change.type === "added") {
        const log = change.doc.data();
        
        // Logika filter waktu tetap sama (abaikan log lama)
        const now = new Date();
        if (log.timestamp && log.timestamp.toDate() <= now) return;

        // Jangan munculkan notif jika itu aktivitas kita sendiri
        const myUser = localStorage.getItem("username");
        if (log.username === myUser && log.action !== "FAILED LOGIN ATTEMPT") return;

        // Penentuan Pesan Toast berdasarkan Action
        if (log.action === "FAILED LOGIN ATTEMPT") {
            showLogToast(`ALERT: Percobaan Login Gagal! IP: ${log.ip}`, 'danger');
        } else if (log.action === "LOGIN_SUCCESS") {
            showLogToast(`USER MASUK: ${log.nama} (@${log.username}) baru saja login.`, 'info');
        } else if (log.action === "LOGOUT_ACTION") {
            showLogToast(`USER KELUAR: ${log.nama} (@${log.username}) telah logout.`, 'info');
        } else {
            // Opsional: Jika ingin tetap memunculkan akses halaman biasa
            // showLogToast(`${log.nama} membuka halaman ${log.url}`);
        }
    }
});
      });
}

// Jalankan listener saat DOM siap
document.addEventListener("DOMContentLoaded", startRealtimeNotification);
document.addEventListener("DOMContentLoaded", checkBackupReminder);

// Jalankan pengecekan ulang setiap 1 jam tanpa perlu refresh
setInterval(checkBackupReminder, 3600000);
