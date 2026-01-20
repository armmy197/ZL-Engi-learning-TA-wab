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
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";


bindGlobalUI();
bindAuthUI();
bindLiveUI();
bindAdminCourseUI();
bindAdminExport();

refreshRoleUI();
setActiveRoute("home");

// ✅ รอให้ Auth พร้อมก่อนค่อยโหลด Firestore (กัน Missing or insufficient permissions)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.warn("ยังไม่ได้เข้าสู่ระบบ → ไม่โหลดคอร์สจาก Firestore");
    return;
  }
  try {
    await bootstrap();
  } catch (e) {
    // กันไม่ให้เด้ง Uncaught (in promise)
    console.error("bootstrap failed:", e);
    toast("โหลดข้อมูลไม่ได้ (สิทธิ์ไม่พอ / Rules / App Check)");
  }
});

let statsTimer = null;

async function safeRun(fn, { onPermissionDenied } = {}){
  try{
    return await fn();
  }catch(e){
    console.error("safeRun error:", e);
    if(e?.code === "permission-denied"){
      toast("สิทธิ์ไม่พออ่าน Firestore (ตรวจ Rules/App Check)");
      if(typeof onPermissionDenied === "function") onPermissionDenied(e);
      return null;
    }
    // error อื่นๆ
    toast(e?.message || "เกิดข้อผิดพลาด");
    return null;
  }
}

async function bootstrap(){
  // initial load
  await safeRun(() => renderCourseGrids());
  await safeRun(() => renderHomeStatsAndChart());
  await safeRun(() => maybeShowPromotePopup());

  // home buttons already bound in auth.js

  // when route changes: re-render
  document.querySelectorAll(".nav-item[data-route]").forEach(a=>{
    a.addEventListener("click", async ()=>{
      const route = a.dataset.route;

      // student routes
      if(route === "student-courses") await safeRun(() => renderCourseGrids());
      if(route === "student-live") await renderLivePanel();
      if(route === "student-lessons") await renderLessons();
      if(route === "student-quizzes") await renderQuizzes();
      if(route === "student-docs") await renderDocuments();

      // admin routes
      if(route === "admin-dashboard") await renderAdminDashboard();
      if(route === "admin-courses") await safeRun(() => renderAdminCourses());
      if(route === "admin-students") await renderAdminStudents();
      if(route === "admin-docs") await renderAdminDocs();
      if(route === "admin-lessons") await renderAdminLessons();

      if(route === "admin-live"){
      setActiveRoute("student-live");     // ให้โชว์ view เดิม
      await renderLivePanel();            // ให้ render ปุ่ม meet
      return;                             // กันไหลไป logic อื่น
      }
      // home refresh
      if(route === "home"){
        await safeRun(() => renderCourseGrids());
        await safeRun(() => renderHomeStatsAndChart());
      }
    });
  });

  // also make topbar role button open modal
  document.querySelector("#btnRole").addEventListener("click", ()=>{});
  // live panel refresh if student selects course by clicking "เข้าร่วมเรียน"
  statsTimer = setInterval(async ()=>{
    // lightweight auto-refresh stats on home only
    const homeActive = document.querySelector("#view-home")?.classList.contains("active");
    if(homeActive){
      await safeRun(() => renderHomeStatsAndChart(), {
        onPermissionDenied: () => {
          // ถ้าถูก deny อย่ารันซ้ำทุก 8 วิให้ error เด้งซ้ำ
          if(statsTimer){
            clearInterval(statsTimer);
            statsTimer = null;
          }
        }
      });
    }
  }, 8000);

  toast("พร้อมใช้งาน");
}
