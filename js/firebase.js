// firebase.js
// จุดเดียวที่ initializeApp() เพื่อกันการสร้าง Firebase ซ้ำ

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBSVmPLD_9rcqtVSgU2ye1QQsLy_pkKrzs",
  authDomain: "zl-ta-learning.firebaseapp.com",
  projectId: "zl-ta-learning",
  storageBucket: "zl-ta-learning.firebasestorage.app",
  messagingSenderId: "467486749002",
  appId: "1:467486749002:web:b2a48de85bd45ffb3051b3",
  measurementId: "G-DSGVLWMFFC",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// ------------------------------------------------------------------
// Auth ready gate: กันโค้ดบางส่วนยิง Firestore ก่อน auth state พร้อม
// ------------------------------------------------------------------
let _authReadyResolved = false;
let _resolveAuthReady;
export const authReady = new Promise((resolve) => {
  _resolveAuthReady = resolve;
});

onAuthStateChanged(auth, () => {
  if (_authReadyResolved) return;
  _authReadyResolved = true;
  _resolveAuthReady(true);
});

export function isSignedIn() {
  return !!auth.currentUser;
}
