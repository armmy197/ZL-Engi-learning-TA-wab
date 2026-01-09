import { db } from "./firebase.js";
import { qs, escapeHtml, toCSV, downloadText } from "./utils.js";
import { state } from "./state.js";
import { toast } from "./ui.js";
import { renderAdminCourses } from "./courses.js";

import {
  collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export async function renderAdminDashboard(){
  if(state.role !== "admin"){
    qs("#adminStatusBox").innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบแอดมิน</div>`;
    return;
  }
  const [students, courses] = await Promise.all([getAllStudents(), getAllCourses()]);
  const liveNow = students.filter(s=>s.liveJoined && !s.courseEnded).length;

  qs("#adminStatusBox").innerHTML = `
    <div>ผู้เรียนทั้งหมด: <b>${students.length}</b></div>
    <div>กำลังเรียนสด: <b>${liveNow}</b></div>
    <div>คอร์สทั้งหมด: <b>${courses.length}</b></div>
    <div class="small muted" style="margin-top:8px">Tip: ตั้งค่าปลดล็อกเอกสาร/แบบฝึกหัดในหน้า “จัดการคอร์ส”</div>
  `;

  // simple chart data
  const byCourse = {};
  for(const s of students){
    byCourse[s.courseId] = (byCourse[s.courseId]||0)+1;
  }
  const labels = courses.map(c=>c.name || c.id);
  const data = courses.map(c=>byCourse[c.id]||0);

  // Chart.js
  const ctx = qs("#adminStudentsChart").getContext("2d");
  if(window.__adminChart) window.__adminChart.destroy();
  window.__adminChart = new Chart(ctx, {
    type:"bar",
    data:{ labels, datasets:[{ label:"ผู้เรียน", data }] },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:"#eaf0ff" } } },
      scales:{
        x:{ ticks:{ color:"#eaf0ff" }, grid:{ color:"rgba(255,255,255,.08)" } },
        y:{ ticks:{ color:"#eaf0ff" }, grid:{ color:"rgba(255,255,255,.08)" } }
      }
    }
  });
}

export async function renderAdminStudents(){
  if(state.role !== "admin"){
    qs("#adminStudentsPanel").innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบแอดมิน</div>`;
    return;
  }

  const students = await getAllStudents();
  qs("#adminStudentsPanel").innerHTML = students.length ? students.map(s=>`
    <div class="card" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);margin:10px 0">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700">${escapeHtml(s.fullname || "")}</div>
          <div class="small muted">courseId: ${escapeHtml(s.courseId || "")}</div>
          <div class="small muted">liveJoined: ${s.liveJoined ? "✅" : "—"} • courseEnded: ${s.courseEnded ? "✅" : "—"}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary" data-end="${s.id}">${s.courseEnded ? "ยกเลิกจบคอร์ส" : "ประกาศจบคอร์ส"}</button>
          <button class="btn btn-ghost" data-delstu="${s.id}">ลบผู้เรียน</button>
        </div>
      </div>
    </div>
  `).join("") : `<div class="muted">ยังไม่มีผู้เรียน</div>`;

  qs("#adminStudentsPanel").querySelectorAll("[data-end]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.end;
      const s = students.find(x=>x.id===id);
      await updateDoc(doc(db,"students",id), {
        courseEnded: !s.courseEnded,
        unlockedAt: !s.courseEnded ? new Date() : null
      });
      toast(!s.courseEnded ? "ประกาศจบคอร์สแล้ว (ปลดล็อก)" : "ยกเลิกจบคอร์สแล้ว");
      await renderAdminStudents();
    });
  });

  qs("#adminStudentsPanel").querySelectorAll("[data-delstu]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.delstu;
      if(!confirm("ลบผู้เรียนนี้?")) return;
      await deleteDoc(doc(db,"students",id));
      toast("ลบผู้เรียนแล้ว");
      await renderAdminStudents();
    });
  });
}

export async function renderAdminDocs(){
  if(state.role !== "admin"){
    qs("#adminDocsPanel").innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบแอดมิน</div>`;
    return;
  }

  const courses = await getAllCourses();
  const docs = await getAllDocs();

  qs("#adminDocsPanel").innerHTML = `
    <div class="grid-2">
      <div class="card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
        <div style="font-weight:700;margin-bottom:8px">เพิ่มเอกสาร</div>
        <label class="label">เลือกคอร์ส</label>
        <select id="docCourse" class="input">
          ${courses.map(c=>`<option value="${c.id}">${escapeHtml(c.name||c.id)}</option>`).join("")}
        </select>
        <label class="label">ชื่อเอกสาร</label>
        <input id="docTitle" class="input" placeholder="PDF บทที่ 1" />
        <label class="label">ไฟล์ URL (PDF/DOC/อื่น ๆ)</label>
        <input id="docUrl" class="input" placeholder="https://..." />
        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <button id="btnAddDoc" class="btn btn-primary">บันทึกเอกสาร</button>
        </div>
      </div>

      <div class="card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
        <div style="font-weight:700;margin-bottom:8px">เปิด/ปิดสิทธิ์ดาวน์โหลด (ระดับคอร์ส)</div>
        <div class="small muted">ไปที่ “จัดการคอร์ส” แล้วติ๊ก “เปิดสิทธิ์ดาวน์โหลดเอกสาร”</div>
        <div style="margin-top:10px">
          <button id="btnGoCourses" class="btn btn-secondary">ไปหน้า “จัดการคอร์ส”</button>
        </div>
      </div>
    </div>

    <div style="margin-top:14px">
      <div style="font-weight:700">รายการเอกสารทั้งหมด</div>
      ${docs.length ? docs.map(d=>`
        <div class="card" style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);margin:10px 0;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div style="font-weight:700">${escapeHtml(d.title||"")}</div>
            <div class="small muted">courseId: ${escapeHtml(d.courseId||"")}</div>
            <div class="small muted">${escapeHtml(d.fileUrl||"")}</div>
          </div>
          <button class="btn btn-ghost" data-deldoc="${d.id}">ลบ</button>
        </div>
      `).join("") : `<div class="muted">ยังไม่มีเอกสาร</div>`}
    </div>
  `;

  qs("#btnAddDoc").addEventListener("click", async ()=>{
    const courseId = qs("#docCourse").value;
    const title = qs("#docTitle").value.trim();
    const fileUrl = qs("#docUrl").value.trim();
    if(!title || !fileUrl){
      toast("กรุณากรอกชื่อเอกสารและ URL");
      return;
    }
    await addDoc(collection(db,"documents"), { courseId, title, fileUrl, createdAt:new Date() });
    toast("เพิ่มเอกสารแล้ว");
    await renderAdminDocs();
  });

  qs("#btnGoCourses").addEventListener("click", async ()=>{
    await renderAdminCourses();
    // เปลี่ยน route ผ่านการคลิกเมนู (ง่ายสุด)
    document.querySelector('.nav-item[data-route="admin-courses"]')?.click();
  });

  document.querySelectorAll("[data-deldoc]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.deldoc;
      if(!confirm("ลบเอกสารนี้?")) return;
      await deleteDoc(doc(db,"documents",id));
      toast("ลบเอกสารแล้ว");
      await renderAdminDocs();
    });
  });
}

export async function bindAdminExport(){
  qs("#btnExportStudents").addEventListener("click", async ()=>{
    if(state.role !== "admin"){ toast("เฉพาะแอดมิน"); return; }
    const rows = await getAllStudents();
    const csv = toCSV(rows);
    downloadText("students.csv", csv);
  });

  qs("#btnExportCourses").addEventListener("click", async ()=>{
    if(state.role !== "admin"){ toast("เฉพาะแอดมิน"); return; }
    const rows = await getAllCourses();
    const csv = toCSV(rows);
    downloadText("courses.csv", csv);
  });
}

/* ------------------ helpers ------------------ */
async function getAllStudents(){
  const snap = await getDocs(collection(db,"students"));
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  out.sort((a,b)=> (b.joinedAt?.seconds ?? 0) - (a.joinedAt?.seconds ?? 0));
  return out;
}
async function getAllCourses(){
  const snap = await getDocs(collection(db,"courses"));
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  out.sort((a,b)=> (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return out;
}
async function getAllDocs(){
  const snap = await getDocs(collection(db,"documents"));
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  out.sort((a,b)=> (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return out;
}
