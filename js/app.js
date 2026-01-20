import { bindGlobalUI, refreshRoleUI, setActiveRoute, toast } from "./ui.js";
import { bindAuthUI } from "./auth.js";
import { bindLiveUI, renderLivePanel } from "./live.js";
import { renderLessons } from "./lessons.js";
import { renderQuizzes } from "./quizzes.js";
import { renderDocuments } from "./documents.js";

import {
  renderCourseGrids,
  maybeShowPromotePopup,
  bindAdminCourseUI,
  renderAdminCourses,
} from "./courses.js";

// ✅ import แค่ครั้งเดียวพอ
import { renderHomeStatsAndChart } from "./charts.js";

import { state } from "./state.js";

// ✅ ใช้ namespace import กันพังถ้า admin.js ไม่มีบาง export
import * as Admin from "./admin.js";

import { renderAdminLessons } from "./admin_lessons.js";
import { auth, authReady } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

bindGlobalUI();
bindAuthUI();
bindLiveUI();
bindAdminCourseUI();

// ✅ เรียก bindAdminExport เฉพาะถ้ามีจริง (กันหน้าแตก)
if (typeof Admin.bindAdminExport === "function") {
  Admin.bindAdminExport();
}

refreshRoleUI();
setActiveRoute("home");

// ✅ เมื่อผู้เรียนกรอกชื่อแล้วกดเข้าสู่ระบบ -> พาไปหน้า "เข้าเรียนสด" ทันที
// (event ยิงมาจาก student.js)
window.addEventListener("student:joined", async () => {
  try {
    setActiveRoute("student-live");
    await renderLivePanel();
  } catch (e) {
    console.warn("auto-open live failed:", e?.code || e);
  }
});

// ✅ รอให้ Auth state พร้อมก่อนค่อย bootstrap (กันบาง browser ยิง Firestore ก่อน ready)
let _booted = false;
onAuthStateChanged(auth, async () => {
  await authReady;
  if (_booted) return;

  try {
    await bootstrap();
    _booted = true;
  } catch (e) {
    console.error("bootstrap failed:", e);
    toast("โหลดข้อมูลไม่ได้ (สิทธิ์ไม่พอ / Rules / App Check)");
  }
});

let statsTimer = null;
let _permToastShown = false;

function toastOncePermissionDenied() {
  if (_permToastShown) return;
  _permToastShown = true;
  toast("สิทธิ์ไม่พออ่าน Firestore (ตรวจ Rules/App Check)");
}

/**
 * safeRun
 * - กัน Uncaught (in promise)
 * - permission-denied ไม่ให้เป็น error แดง
 */
async function safeRun(fn, { silentPermissionDenied = false, onPermissionDenied, onError } = {}) {
  try {
    return await fn();
  } catch (e) {
    const code = e?.code || "";
    if (code === "permission-denied") {
      if (!silentPermissionDenied) {
        console.warn("permission-denied (silenced):", e?.message || e);
        toastOncePermissionDenied();
      }
      if (typeof onPermissionDenied === "function") onPermissionDenied(e);
      return null;
    }

    console.error("safeRun error:", e);
    if (typeof onError === "function") onError(e);
    toast(e?.message || "เกิดข้อผิดพลาด");
    return null;
  }
}

async function bootstrap() {
  // initial load
  await safeRun(() => renderCourseGrids());
  await safeRun(() => renderHomeStatsAndChart(), { silentPermissionDenied: true });
  await safeRun(() => maybeShowPromotePopup());

  // when route changes: re-render
  document.querySelectorAll(".nav-item[data-route]").forEach((a) => {
    a.addEventListener("click", async () => {
      const route = a.dataset.route;

      // student routes
      if (route === "student-courses") await safeRun(() => renderCourseGrids());
      if (route === "student-live") await renderLivePanel();
      if (route === "student-lessons") await renderLessons();
      if (route === "student-quizzes") await renderQuizzes();
      if (route === "student-docs") await renderDocuments();

      // admin routes (เรียกผ่าน Admin.* เพื่อกันพังถ้าบางฟังก์ชันไม่มี)
      if (route === "admin-dashboard" && typeof Admin.renderAdminDashboard === "function") {
        await Admin.renderAdminDashboard();
      }
      if (route === "admin-courses") await safeRun(() => renderAdminCourses());

      if (route === "admin-students" && typeof Admin.renderAdminStudents === "function") {
        await Admin.renderAdminStudents();
      }
      if (route === "admin-docs" && typeof Admin.renderAdminDocs === "function") {
        await Admin.renderAdminDocs();
      }

      if (route === "admin-lessons") await renderAdminLessons();

      if (route === "admin-live") {
        setActiveRoute("student-live");
        await renderLivePanel();
        return;
      }

      // home refresh
      if (route === "home") {
        await safeRun(() => renderCourseGrids());
        await safeRun(() => renderHomeStatsAndChart(), { silentPermissionDenied: true });
      }
    });
  });

  // home stats auto refresh
  statsTimer = setInterval(async () => {
    const homeActive = document.querySelector("#view-home")?.classList.contains("active");
    if (!homeActive) return;

    await safeRun(() => renderHomeStatsAndChart(), {
      silentPermissionDenied: true,
      onPermissionDenied: () => {
        if (statsTimer) {
          clearInterval(statsTimer);
          statsTimer = null;
        }
      },
    });
  }, 8000);

  toast("พร้อมใช้งาน");
}
