import { bindGlobalUI, refreshRoleUI, setActiveRoute, toast } from "./ui.js";
import { bindAuthUI } from "./auth.js";
import { bindLiveUI, renderLivePanel } from "./live.js";
import { renderLessons } from "./lessons.js";
import { renderQuizzes } from "./quizzes.js";
import { renderDocuments } from "./documents.js";
import { renderCourseGrids, maybeShowPromotePopup, bindAdminCourseUI, renderAdminCourses } from "./courses.js";
import { renderHomeStatsAndChart } from "./charts.js";
import { state } from "./state.js";
import { renderAdminDashboard, renderAdminStudents, renderAdminDocs, bindAdminExport } from "./admin.js";
import { renderAdminLessons } from "./admin_lessons.js";
import { auth, authReady } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

bindGlobalUI();
bindAuthUI();
bindLiveUI();
bindAdminCourseUI();
bindAdminExport();

refreshRoleUI();
setActiveRoute("home");

// ✅ รอให้ Auth state พร้อมก่อนค่อย bootstrap
// หมายเหตุ: บางเครื่อง/บาง browser ตอนรีโหลดหน้า จะมีการยิง Firestore ก่อน auth พร้อม
// ทำให้เด้ง Missing or insufficient permissions ได้
let _booted = false;
onAuthStateChanged(auth, async () => {
  await authReady;
  if (_booted) return;

  try {
    await bootstrap();
    _booted = true;
  } catch (e) {
    // กันไม่ให้เด้ง Uncaught (in promise)
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
 * - ไม่ให้ permission-denied โผล่เป็น error แดงใน console
 * - กัน Uncaught (in promise)
 *
 * options:
 * - silentPermissionDenied: true -> ไม่ toast/ไม่ warn
 * - onPermissionDenied: fn
 * - onError: fn
 */
async function safeRun(fn, { silentPermissionDenied = false, onPermissionDenied, onError } = {}) {
  try {
    return await fn();
  } catch (e) {
    const code = e?.code || "";
    if (code === "permission-denied") {
      // ✅ ทำให้ไม่เป็น error แดง (ใช้ warn แบบเงียบแทน)
      if (!silentPermissionDenied) {
        console.warn("permission-denied (silenced):", e?.message || e);
        toastOncePermissionDenied();
      }
      if (typeof onPermissionDenied === "function") onPermissionDenied(e);
      return null;
    }

    // error อื่น ๆ ยัง log ได้
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

      // admin routes
      if (route === "admin-dashboard") await renderAdminDashboard();
      if (route === "admin-courses") await safeRun(() => renderAdminCourses());
      if (route === "admin-students") await renderAdminStudents();
      if (route === "admin-docs") await renderAdminDocs();
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

  // also make topbar role button open modal
  document.querySelector("#btnRole")?.addEventListener("click", () => {});

  // home stats auto refresh
  // ✅ ถ้าโดน permission-denied ให้หยุด interval ทันที + ไม่ spam console
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
        // ถ้าคุณอยากให้แจ้งผู้ใช้ครั้งเดียว ให้เปิดบรรทัดนี้
        // toastOncePermissionDenied();
      },
    });
  }, 8000);

  toast("พร้อมใช้งาน");
}
