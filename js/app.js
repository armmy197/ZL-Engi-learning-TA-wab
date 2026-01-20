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
  // ให้แน่ใจว่า authReady ถูก resolve แล้ว
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

async function safeRun(fn, { onPermissionDenied } = {}) {
  try {
    return await fn();
  } catch (e) {
    console.error("safeRun error:", e);
    if (e?.code === "permission-denied") {
      toast("สิทธิ์ไม่พออ่าน Firestore (ตรวจ Rules/App Check)");
      if (typeof onPermissionDenied === "function") onPermissionDenied(e);
      return null;
    }
    // error อื่นๆ
    toast(e?.message || "เกิดข้อผิดพลาด");
    return null;
  }
}

async function bootstrap() {
  // initial load
  await safeRun(() => renderCourseGrids());
  await safeRun(() => renderHomeStatsAndChart());
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
        setActiveRoute("student-live"); // ให้โชว์ view เดิม
        await renderLivePanel(); // ให้ render ปุ่ม meet
        return; // กันไหลไป logic อื่น
      }

      // home refresh
      if (route === "home") {
        await safeRun(() => renderCourseGrids());
        await safeRun(() => renderHomeStatsAndChart());
      }
    });
  });

  // also make topbar role button open modal
  document.querySelector("#btnRole").addEventListener("click", () => {});

  // home stats auto refresh
  statsTimer = setInterval(async () => {
    const homeActive = document.querySelector("#view-home")?.classList.contains("active");
    if (homeActive) {
      await safeRun(() => renderHomeStatsAndChart(), {
        onPermissionDenied: () => {
          if (statsTimer) {
            clearInterval(statsTimer);
            statsTimer = null;
          }
        },
      });
    }
  }, 8000);

  toast("พร้อมใช้งาน");
}
