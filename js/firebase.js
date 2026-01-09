import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBSVmPLD_9rcqtVSgU2ye1QQsLy_pkKrzs",
  authDomain: "zl-ta-learning.firebaseapp.com",
  projectId: "zl-ta-learning",
  storageBucket: "zl-ta-learning.firebasestorage.app",
  messagingSenderId: "467486749002",
  appId: "1:467486749002:web:b2a48de85bd45ffb3051b3",
  measurementId: "G-DSGVLWMFFC"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
