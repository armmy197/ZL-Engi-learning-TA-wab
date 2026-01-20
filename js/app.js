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

// ✅ ต้องมีแค่ครั้งเดียว (ห้ามซ้ำ)
import { renderHomeStatsAndChart } from "./charts.js";

import { state } from "./state.js";
import * as Admin from "./admin.js";
import { renderAdminLessons } from "./admin_lessons.js";
import { auth, authReady } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

bindGlobalUI();
bindAuthUI();
bindLiveUI();
bindAdminCourseUI();

if (typeof Admin.bindAdminExport === "function") {
  Admin.bindAdminExport();
}

refreshRoleUI();
setActiveRoute("home");

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
  await safeRun(() => renderCourseGrids());
  await safeRun(() => renderHomeStatsAndChart(), { silentPermissionDenied: true });
  await safeRun(() => maybeShowPromotePopup());

  document.querySelectorAll(".nav-item[data-route]").forEach((a) => {
    a.addEventListener("click", async () => {
      const route = a.dataset.route;

      if (route === "student-courses") await safeRun(() => renderCourseGrids());
      if (route === "student-live") await renderLivePanel();
      if (route === "student-lessons") await renderLessons();
      if (route === "student-quizzes") await renderQuizzes();
      if (route === "student-docs") await renderDocuments();

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

      if (route === "home") {
        await safeRun(() => renderCourseGrids());
        await safeRun(() => renderHomeStatsAndChart(), { silentPermissionDenied: true });
      }
    });
  });

  document.querySelector("#btnRole")?.addEventListener("click", () => {});

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
