import { qs } from "./utils.js";
import { state, setRole } from "./state.js";
import { toast, showModal, closeModal, refreshRoleUI, setActiveRoute } from "./ui.js";
import { studentJoinFlow } from "./student.js";
import { loadCoursesIntoSelect } from "./courses.js";

// ตามสเปคคุณ: แอดมินรหัสตายตัว (ไม่ปลอดภัยถ้าอยู่ฝั่งเว็บ)
const ADMIN_USER = "KruArm";
const ADMIN_PASS = "ZLTA198745";

export function bindAuthUI(){
  // open role modal
  qs("#btnRole").addEventListener("click", ()=>{
    showModal("roleModal");
  });

  // shortcuts on home buttons
  qs("#btnJoinAsStudent").addEventListener("click", async ()=>{
    await openStudentJoin();
  });
  qs("#btnLoginAdmin").addEventListener("click", ()=>{
    openAdminLogin();
  });

  // choose role
  qs("#roleStudent").addEventListener("click", async ()=>{
    closeModal("roleModal");
    await openStudentJoin();
  });
  qs("#roleAdmin").addEventListener("click", ()=>{
    closeModal("roleModal");
    openAdminLogin();
  });

  // student join submit
  qs("#btnStudentJoin").addEventListener("click", async ()=>{
    await studentJoinFlow();
  });

  // admin login submit
  qs("#btnAdminLogin").addEventListener("click", ()=>{
    const u = qs("#adminUsername").value.trim();
    const p = qs("#adminPassword").value;

    if(u === ADMIN_USER && p === ADMIN_PASS){
      setRole("admin");
      state.admin = { username: u };
      closeModal("adminLoginModal");
      refreshRoleUI();
      setActiveRoute("admin-dashboard");
      toast("เข้าสู่ระบบแอดมินสำเร็จ");
    }else{
      toast("Username หรือ Password ไม่ถูกต้อง");
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
