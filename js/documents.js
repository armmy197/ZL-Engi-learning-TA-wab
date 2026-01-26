import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";

import { doc, getDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export async function renderDocuments(){
  const panel = qs("#docsPanel");
  if(state.role !== "student"){
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }
  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student.courseId;
  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const course = courseSnap.exists() ? courseSnap.data() : null;

  const unlocked = !!course?.docsOpen && !!state.student.liveJoined;
  if(!unlocked){
    panel.innerHTML = `<div class="muted">เอกสารยังดาวน์โหลดไม่ได้ (ต้องเข้าร่วมเรียนสด + แอดมินเปิดสิทธิ์ดาวน์โหลด)</div>`;
    return;
  }

  // documents collection: documents { courseId, title, fileUrl }
  const snap = await getDocs(query(collection(db,"documents"), where("courseId","==", courseId)));
  const items = [];
  snap.forEach(d=>items.push({ id:d.id, ...d.data() }));

  panel.innerHTML = items.length ? items.map(x=>`
    <div class="card" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);margin:10px 0;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
      <div>
        <div style="font-weight:700">${escapeHtml(x.title || "Document")}</div>
        <div class="small muted">${escapeHtml(x.fileUrl || "")}</div>
      </div>
      <a class="btn btn-primary" href="${escapeHtml(x.fileUrl || "#")}" target="_blank" rel="noreferrer">ดาวน์โหลด</a>
    </div>
  `).join("") : `<div class="muted">ยังไม่มีเอกสารในคอร์สนี้</div>`;
}
