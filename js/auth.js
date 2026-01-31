// auth.js (Firebase Auth version)
import { qs } from "./utils.js";
import { state, setRole } from "./state.js";
import { toast, showModal, closeModal, refreshRoleUI, setActiveRoute } from "./ui.js";
import { studentJoinFlow } from "./student.js";
import { loadCoursesIntoSelect } from "./courses.js";

import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

export function bindAuthUI() {
  // open role modal
  qs("#btnRole").addEventListener("click", () => showModal("roleModal"));

  // shortcuts on home buttons
  qs("#btnJoinAsStudent").addEventListener("click", async () => {
    await openStudentJoin();
  });
  qs("#btnLoginAdmin").addEventListener("click", () => {
    openAdminLogin();
  });

  // choose role
  qs("#roleStudent").addEventListener("click", async () => {
    closeModal("roleModal");
    await openStudentJoin();
  });
  qs("#roleAdmin").addEventListener("click", () => {
    closeModal("roleModal");
    openAdminLogin();
  });

  // student join submit
  qs("#btnStudentJoin").addEventListener("click", async () => {
    await studentJoinFlow();
  });

  // ✅ admin login submit (Email/Password)
  qs("#btnAdminLogin").addEventListener("click", async () => {
    const email = qs("#adminUsername").value.trim(); // ใช้ช่องเดิม แต่ให้กรอก Email
    const password = qs("#adminPassword").value;

    if (!email || !password) {
      toast("กรุณากรอก Email และ Password");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeModal("adminLoginModal");
      toast("เข้าสู่ระบบแอดมินสำเร็จ");
      // onAuthStateChanged จะจัด UI ต่อให้เอง
    } catch (err) {
      toast("ล็อกอินไม่สำเร็จ: " + err.message);
    }
  });

  // ✅ logout
  qs("#btnLogout").addEventListener("click", async () => {
    await signOut(auth);
    toast("ออกจากระบบแล้ว");
  });

  // ✅ listen auth state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // แบบง่าย: ใครล็อกอิน = admin
      setRole("admin");
      state.admin = { uid: user.uid, email: user.email };

      refreshRoleUI();
      setActiveRoute("admin-dashboard");
    } else {
      setRole("guest");
      state.admin = null;

      refreshRoleUI();
      setActiveRoute("home");
    }
  });
}

async function openStudentJoin() {
  await loadCoursesIntoSelect(qs("#studentCourseSelect"));
  showModal("studentJoinModal");
}

function openAdminLogin() {
  showModal("adminLoginModal");
}