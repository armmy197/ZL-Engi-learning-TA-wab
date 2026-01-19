// auth.js (SECURE VERSION)
import { qs } from "./utils.js";
import { state, setRole } from "./state.js";
import { toast, showModal, closeModal, refreshRoleUI, setActiveRoute } from "./ui.js";
import { studentJoinFlow } from "./student.js";
import { loadCoursesIntoSelect } from "./courses.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* Firebase config */
const firebaseConfig = {
  apiKey: "AIzaSyBSVmPLD_9rcqtVSgU2ye1QQsLy_pkKrzs",
  authDomain: "zl-ta-learning.firebaseapp.com",
  projectId: "zl-ta-learning",
  storageBucket: "zl-ta-learning.firebasestorage.app",
  messagingSenderId: "467486749002",
  appId: "1:467486749002:web:b2a48de85bd45ffb3051b3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export function bindAuthUI(){

  // เปิด modal เลือกบทบาท
  qs("#btnRole").addEventListener("click", ()=>{
    showModal("roleModal");
  });

  // ปุ่มลัดหน้าแรก
  qs("#btnJoinAsStudent").addEventListener("click", async ()=>{
    await openStudentJoin();
  });
  qs("#btnLoginAdmin").addEventListener("click", ()=>{
    openAdminLogin();
  });

  // เลือกบทบาท
  qs("#roleStudent").addEventListener("click", async ()=>{
    closeModal("roleModal");
    await openStudentJoin();
  });
  qs("#roleAdmin").addEventListener("click", ()=>{
    closeModal("roleModal");
    openAdminLogin();
  });

  // ผู้เรียน
  qs("#btnStudentJoin").addEventListener("click", async ()=>{
    await studentJoinFlow();
  });

  // 🔐 แอดมินล็อกอิน (Firebase Auth)
  qs("#btnAdminLogin").addEventListener("click", async ()=>{
    const email = qs("#adminUsername").value.trim();   // ใช้ Email
    const password = qs("#adminPassword").value;

    if(!email || !password){
      toast("กรุณากรอก Email และ Password");
      return;
    }

    try{
      await signInWithEmailAndPassword(auth, email, password);
      closeModal("adminLoginModal");
      toast("เข้าสู่ระบบแอดมินสำเร็จ");
    }catch(err){
      toast("ล็อกอินไม่สำเร็จ: " + err.message);
    }
  });

  // ออกจากระบบ
  qs("#btnLogout").addEventListener("click", async ()=>{
    await signOut(auth);
    toast("ออกจากระบบแล้ว");
  });

  // 👂 ฟังสถานะล็อกอิน
  onAuthStateChanged(auth, (user)=>{
    if(user){
      setRole("admin");
      state.admin = { email: user.email, uid: user.uid };
      refreshRoleUI();
      setActiveRoute("admin-dashboard");
    }else{
      setRole("guest");
      state.admin = null;
      refreshRoleUI();
      setActiveRoute("home");
    }
  });
}

async function openStudentJoin(){
  await loadCoursesIntoSelect(qs("#studentCourseSelect"));
  showModal("studentJoinModal");
}

function openAdminLogin(){
  showModal("adminLoginModal");
}
