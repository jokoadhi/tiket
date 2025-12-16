// js/firebase_init.js

// Konfigurasi Firebase Anda
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

console.log("Firebase dan Firestore berhasil diinisialisasi.");
