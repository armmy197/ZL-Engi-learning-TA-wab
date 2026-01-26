import { db, authReady, isSignedIn } from "../js/firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "../js/state.js";
import { toast, showModal, closeModal } from "../js/ui.js";

import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COL = "courses";

export async function getAllCourses(){
  // กันกรณีบางหน้าเรียกก่อน Auth state พร้อม
  // (เช่น หน้าเพิ่งโหลด / reload แล้ว code บางส่วนยิง Firestore ทันที)
  await authReady;

  try{
    const snap = await getDocs(collection(db, COL));
    const out = [];
    snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
    out.sort((a,b)=> (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    return out;
  }catch(e){
    console.error("getAllCourses failed:", e);
    if(e?.code === "permission-denied"){
      // ถ้า user ยังไม่ล็อกอิน ให้บอกสาเหตุแบบตรงไปตรงมา
      if(!isSignedIn()){
        toast("กรุณาเข้าสู่ระบบก่อน (Firestore ปฏิเสธสิทธิ์)");
      }else{
        toast("อ่านคอร์สไม่ได้: สิทธิ์ไม่พอ (Firestore Rules / App Check)");
      }
      return [];
    }
    toast(e?.message || "โหลดคอร์สไม่สำเร็จ");
    return [];
  }
}

export function courseCard(course, { onJoin, showAdmin=false } = {}){
  const cover = course.coverUrl || "https://images.unsplash.com/photo-1526378722484-bd91ca387e72?auto=format&fit=crop&w=1200&q=60";
  return `
  <div class="course-card">
    <div class="course-cover">
      <img src="${escapeHtml(cover)}" alt="cover">
    </div>
    <div class="course-body">
      <div class="course-title">${escapeHtml(course.name || "Untitled")}</div>
      <div class="course-desc">${escapeHtml(course.description || "")}</div>
      <div class="small muted">Docs: ${course.docsOpen ? "เปิด" : "ปิด"} • Quiz: ${course.quizOpen ? "เปิด" : "ปิด"} • Lessons: ${course.lessonOpen ? "เปิด" : "ปิด"}</div>
      <div class="course-actions">
        ${onJoin ? `<button class="btn btn-primary" data-join="${course.id}">เข้าร่วมเรียน</button>` : ""}
        ${showAdmin ? `
          <button class="btn btn-secondary" data-edit="${course.id}">แก้ไข</button>
          <button class="btn btn-ghost" data-del="${course.id}">ลบ</button>
          <button class="btn btn-secondary" data-promo="${course.id}">
            ${course.promote ? "ยกเลิกโปรโมท" : "ตั้งโปรโมท"}
          </button>
        ` : ""}
      </div>
    </div>
  </div>`;
}

export async function renderCourseGrids(){
  const courses = await getAllCourses();
  qs("#courseGridHome").innerHTML = courses.map(c=>courseCard(c)).join("");
  qs("#courseGridStudent").innerHTML = courses.map(c=>courseCard(c, { onJoin:true })).join("");

  const promote = courses.filter(c=>c.promote);
  qs("#promoteArea").innerHTML = promote.length
    ? promote.map(c=>`• ${escapeHtml(c.name)}<br>`).join("")
    : `<span class="muted">ยังไม่มีคอร์สโปรโมท</span>`;

  document.querySelectorAll("[data-join]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.selectedCourseId = btn.dataset.join;
      toast("เลือกคอร์สแล้ว ไปที่เมนู “เข้าเรียนสด”");
    });
  });
}

export async function loadCoursesIntoSelect(selectEl){
  const courses = await getAllCourses();
  selectEl.innerHTML = courses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if(!courses.length){
    selectEl.innerHTML = `<option value="">(ยังไม่มีคอร์ส)</option>`;
  }
}

export async function maybeShowPromotePopup(){
  if(localStorage.getItem("zl_promote_shown") === "1") return;

  const courses = await getAllCourses();
  const promote = courses.filter(c=>c.promote);
  if(!promote.length) return;

  const body = promote.slice(0,3).map(c=>{
    const cover = c.coverUrl || "https://images.unsplash.com/photo-1526378722484-bd91ca387e72?auto=format&fit=crop&w=1200&q=60";
    return `
      <div class="card" style="
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
        margin:10px 0;
        overflow:hidden;
        padding:0;
      ">
        <div style="height:140px;background:rgba(255,255,255,.06);">
          <img
            src="${escapeHtml(cover)}"
            alt="cover"
            style="width:100%;height:100%;object-fit:cover;display:block;"
            onerror="this.style.display='none'"
          />
        </div>
        <div style="padding:12px;">
          <div style="font-weight:700">${escapeHtml(c.name || "")}</div>
          <div class="small muted" style="margin-top:6px;">
            ${escapeHtml(c.description || "")}
          </div>
        </div>
      </div>
    `;
  }).join("");

  qs("#promoteBody").innerHTML = body;
  showModal("promoteModal");
  localStorage.setItem("zl_promote_shown","1");
}

/* ---------------- Admin ---------------- */

export function bindAdminCourseUI(){
  qs("#btnAddCourse").addEventListener("click", ()=>{
    openCourseForm(null);
  });

  qs("#btnSaveCourse").addEventListener("click", async ()=>{
    await saveCourseFromForm();
  });
}

export async function renderAdminCourses(){
  const courses = await getAllCourses();
  const panel = qs("#adminCoursesPanel");
  panel.innerHTML = courses.length ? courses.map(c=>courseCard(c, { showAdmin:true })).join("") : `<div class="muted">ยังไม่มีคอร์ส</div>`;

  panel.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.edit;
      const c = await getCourseById(id);
      openCourseForm(c);
    });
  });
  panel.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.del;
      if(!confirm("ลบคอร์สนี้?")) return;
      await deleteDoc(doc(db, COL, id));
      toast("ลบคอร์สแล้ว");
      await renderAdminCourses();
    });
  });
  panel.querySelectorAll("[data-promo]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.promo;
      const c = await getCourseById(id);
      await updateDoc(doc(db, COL, id), { promote: !c.promote });
      toast("อัปเดตโปรโมทแล้ว");
      await renderAdminCourses();
    });
  });
}

async function getCourseById(id){
  const snap = await getDoc(doc(db, COL, id));
  return { id:snap.id, ...snap.data() };
}

function openCourseForm(course){
  qs("#courseFormTitle").textContent = course ? "แก้ไขคอร์ส" : "เพิ่มคอร์ส";
  qs("#courseFormModal").dataset.editId = course?.id || "";

  qs("#courseName").value = course?.name || "";
  qs("#courseCover").value = course?.coverUrl || "";
  qs("#courseDesc").value = course?.description || "";
  qs("#courseMeet").value = course?.meetUrl || "";
  qs("#coursePromote").checked = !!course?.promote;
  qs("#courseDocsOpen").checked = !!course?.docsOpen;
  qs("#courseQuizOpen").checked = !!course?.quizOpen;
  qs("#courseLessonOpen").checked = !!course?.lessonOpen;

  showModal("courseFormModal");
}

async function saveCourseFromForm(){
  const editId = qs("#courseFormModal").dataset.editId || "";
  const payload = {
    name: qs("#courseName").value.trim(),
    coverUrl: qs("#courseCover").value.trim(),
    description: qs("#courseDesc").value.trim(),
    meetUrl: qs("#courseMeet").value.trim(),
    promote: qs("#coursePromote").checked,
    docsOpen: qs("#courseDocsOpen").checked,
    quizOpen: qs("#courseQuizOpen").checked,
    lessonOpen: qs("#courseLessonOpen").checked,
    updatedAt: new Date(),
  };

  if(!payload.name){
    toast("กรุณากรอกชื่อคอร์ส");
    return;
  }

  if(editId){
    await updateDoc(doc(db, COL, editId), payload);
    toast("บันทึกการแก้ไขแล้ว");
  }else{
    payload.createdAt = new Date();
    await addDoc(collection(db, COL), payload);
    toast("เพิ่มคอร์สแล้ว");
  }

  closeModal("courseFormModal");
}