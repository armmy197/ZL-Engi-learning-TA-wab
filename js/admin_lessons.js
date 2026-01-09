import { db, storage } from "./firebase.js";
import { state } from "./state.js";
import { qs, escapeHtml } from "./utils.js";
import { toast } from "./ui.js";

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const COURSES = "courses";

// ---------- Public API ----------
export async function renderAdminLessons(){
  const panel = qs("#adminLessonsPanel");
  if(!panel) return;

  if(state.role !== "admin"){
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบแอดมิน</div>`;
    return;
  }

  const courses = await getAllCourses();

  const selected = (window.__adminLessonsCourseId && courses.find(c=>c.id===window.__adminLessonsCourseId))
    ? window.__adminLessonsCourseId
    : (courses[0]?.id || "");

  window.__adminLessonsCourseId = selected;

  panel.innerHTML = `
    <div class="grid-2">
      <div class="card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
        <div style="font-weight:700;margin-bottom:8px">เลือกคอร์ส</div>

        <label class="label">คอร์ส</label>
        <select id="alCourse" class="input">
          ${courses.map(c=>`<option value="${c.id}" ${c.id===selected?"selected":""}>${escapeHtml(c.name||c.id)}</option>`).join("")}
        </select>

        <div class="small muted" style="margin-top:10px">
          • เพิ่ม “บทเรียน” ได้หลายบท<br/>
          • ในแต่ละบท เพิ่ม “แบบฝึกหัด” ได้หลายข้อ (มีรูป URL / อัปโหลดรูป + เฉลย)
        </div>
      </div>

      <div class="card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
        <div style="font-weight:700;margin-bottom:8px">เพิ่มบทเรียน</div>

        <label class="label">ชื่อบทเรียน</label>
        <input id="alNewLessonTitle" class="input" placeholder="เช่น บทที่ 1: 故障 (กู้จ้าง)"/>

        <label class="label">ลำดับ (ตัวเลข)</label>
        <input id="alNewLessonOrder" class="input" type="number" value="1"/>

        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <button id="alAddLesson" class="btn btn-primary">+ เพิ่มบทเรียน</button>
        </div>
      </div>
    </div>

    <div style="margin-top:14px">
      <div style="font-weight:700">รายการบทเรียน</div>
      <div id="alLessonsList" style="margin-top:10px"></div>
    </div>
  `;

  qs("#alCourse").addEventListener("change", async (e)=>{
    window.__adminLessonsCourseId = e.target.value;
    await renderAdminLessons();
  });

  qs("#alAddLesson").addEventListener("click", async ()=>{
    const courseId = window.__adminLessonsCourseId;
    if(!courseId){ toast("ไม่พบคอร์ส"); return; }

    const title = qs("#alNewLessonTitle").value.trim();
    const order = Number(qs("#alNewLessonOrder").value || 1);

    if(!title){
      toast("กรุณากรอกชื่อบทเรียน");
      return;
    }

    await addDoc(collection(db, COURSES, courseId, "lessons"), {
      title,
      order,
      createdAt: new Date()
    });

    toast("เพิ่มบทเรียนแล้ว");
    await renderAdminLessons();
  });

  await renderLessonsList(window.__adminLessonsCourseId);
}

// ---------- UI Render ----------
async function renderLessonsList(courseId){
  const list = qs("#alLessonsList");
  if(!list) return;

  if(!courseId){
    list.innerHTML = `<div class="muted">กรุณาเลือกคอร์สก่อน</div>`;
    return;
  }

  const lessons = await getLessons(courseId);

  if(!lessons.length){
    list.innerHTML = `<div class="muted">ยังไม่มีบทเรียน</div>`;
    return;
  }

  list.innerHTML = lessons.map(lesson=>`
    <div class="card glass" style="margin:10px 0; padding:12px; border:1px solid rgba(255,255,255,.10)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:240px">
          <div style="font-weight:700">บทเรียน</div>
          <label class="label">ชื่อบทเรียน</label>
          <input class="input" data-lesson-title="${lesson.id}" value="${escapeHtmlAttr(lesson.title||"")}" />

          <label class="label">ลำดับ</label>
          <input class="input" type="number" data-lesson-order="${lesson.id}" value="${Number(lesson.order ?? 1)}" />
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <button class="btn btn-secondary" data-lesson-save="${lesson.id}">บันทึกบท</button>
          <button class="btn btn-ghost" data-lesson-del="${lesson.id}">ลบบท</button>
        </div>
      </div>

      <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.10);padding-top:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div style="font-weight:700">แบบฝึกหัดในบทนี้</div>
          <button class="btn btn-primary" data-quiz-add="${lesson.id}">+ เพิ่มข้อ</button>
        </div>

        <div id="quizList-${lesson.id}" style="margin-top:10px"></div>

        <div id="quizAddForm-${lesson.id}" class="card" style="display:none;margin-top:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10)">
          <div style="font-weight:700;margin-bottom:8px">เพิ่มแบบฝึกหัด</div>

          <label class="label">หัวข้อ/คำถาม</label>
          <input class="input" data-new-q="${lesson.id}" placeholder="เช่น 故障 แปลว่าอะไร?" />

          <label class="label">เนื้อหา (อธิบายเพิ่มเติม)</label>
          <textarea class="input" rows="3" data-new-c="${lesson.id}" placeholder="อธิบายโจทย์..."></textarea>

          <div class="grid-2" style="margin-top:10px">
            <div>
              <label class="label">รูป (URL)</label>
              <input class="input" data-new-imgurl="${lesson.id}" placeholder="https://..." />
              <div class="small muted" style="margin-top:6px">ใส่ URL หรืออัปโหลดรูปก็ได้</div>
            </div>
            <div>
              <label class="label">อัปโหลดรูปจากเครื่อง</label>
              <input class="input" type="file" accept="image/*" data-new-imgfile="${lesson.id}" />
              <div class="small muted" style="margin-top:6px">รองรับ JPG/PNG/WebP</div>
            </div>
          </div>

          <label class="label">เฉลย (คำตอบที่ถูก)</label>
          <input class="input" data-new-a="${lesson.id}" placeholder="เช่น หมายถึง เครื่องขัดข้อง / เสีย" />

          <label class="label">ลำดับข้อ (ตัวเลข)</label>
          <input class="input" type="number" value="1" data-new-order="${lesson.id}" />

          <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary" data-quiz-cancel="${lesson.id}">ยกเลิก</button>
            <button class="btn btn-primary" data-quiz-save="${lesson.id}">บันทึกข้อ</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");

  // bind lesson actions
  list.querySelectorAll("[data-lesson-save]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const lessonId = btn.dataset.lessonSave;
      const title = qs(`[data-lesson-title="${lessonId}"]`).value.trim();
      const order = Number(qs(`[data-lesson-order="${lessonId}"]`).value || 1);
      if(!title){ toast("ชื่อบทเรียนห้ามว่าง"); return; }

      await updateDoc(doc(db, COURSES, courseId, "lessons", lessonId), { title, order });
      toast("บันทึกบทเรียนแล้ว");
      await renderAdminLessons();
    });
  });

  list.querySelectorAll("[data-lesson-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const lessonId = btn.dataset.lessonDel;
      if(!confirm("ลบบทเรียนนี้? (ข้อแบบฝึกหัดในบทจะถูกลบด้วย)")) return;

      // ลบ quizzes ใต้บทก่อน (เพราะ Firestore ไม่ลบ subcollection อัตโนมัติ)
      const quizzes = await getQuizzes(courseId, lessonId);
      for(const q of quizzes){
        await deleteDoc(doc(db, COURSES, courseId, "lessons", lessonId, "quizzes", q.id));
      }

      await deleteDoc(doc(db, COURSES, courseId, "lessons", lessonId));
      toast("ลบบทเรียนแล้ว");
      await renderAdminLessons();
    });
  });

  // for each lesson render quizzes + bind quiz add form
  for(const lesson of lessons){
    await renderQuizList(courseId, lesson.id);

    const btnAdd = list.querySelector(`[data-quiz-add="${lesson.id}"]`);
    const form = qs(`#quizAddForm-${lesson.id}`);

    btnAdd.addEventListener("click", ()=>{
      form.style.display = (form.style.display === "none" || !form.style.display) ? "block" : "none";
    });

    form.querySelector(`[data-quiz-cancel="${lesson.id}"]`).addEventListener("click", ()=>{
      form.style.display = "none";
    });

    form.querySelector(`[data-quiz-save="${lesson.id}"]`).addEventListener("click", async ()=>{
      const question = form.querySelector(`[data-new-q="${lesson.id}"]`).value.trim();
      const content  = form.querySelector(`[data-new-c="${lesson.id}"]`).value.trim();
      const answer   = form.querySelector(`[data-new-a="${lesson.id}"]`).value.trim();
      const order    = Number(form.querySelector(`[data-new-order="${lesson.id}"]`).value || 1);

      const imgUrlInput = form.querySelector(`[data-new-imgurl="${lesson.id}"]`).value.trim();
      const imgFileInput = form.querySelector(`[data-new-imgfile="${lesson.id}"]`);
      const imgFile = imgFileInput.files?.[0] || null;

      if(!question || !answer){
        toast("กรุณากรอกคำถามและเฉลย");
        return;
      }

      let imageUrl = imgUrlInput;

      // Upload file first (if provided) — ให้ไฟล์มีสิทธิ์เหนือ URL
      if(imgFile){
        try{
          toast("กำลังอัปโหลดรูป...");
          imageUrl = await uploadQuizImage(courseId, lesson.id, imgFile);
        }catch(err){
          console.error(err);
          toast("อัปโหลดรูปไม่สำเร็จ (ตรวจ Storage Rules/การเชื่อมต่อ)");
          return;
        }
      }

      await addDoc(collection(db, COURSES, courseId, "lessons", lesson.id, "quizzes"), {
        question,
        content,
        answer,
        imageUrl: imageUrl || "",
        order,
        createdAt: new Date()
      });

      toast("เพิ่มแบบฝึกหัดแล้ว");
      await renderAdminLessons();
    });
  }
}

async function renderQuizList(courseId, lessonId){
  const box = qs(`#quizList-${lessonId}`);
  if(!box) return;

  const quizzes = await getQuizzes(courseId, lessonId);

  if(!quizzes.length){
    box.innerHTML = `<div class="muted">ยังไม่มีแบบฝึกหัด</div>`;
    return;
  }

  box.innerHTML = quizzes.map(q=>`
    <div class="card" style="margin:10px 0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
      <div class="small muted">ข้อ ID: ${escapeHtml(q.id)}</div>

      <label class="label">หัวข้อ/คำถาม</label>
      <input class="input" data-q-question="${lessonId}|${q.id}" value="${escapeHtmlAttr(q.question||"")}" />

      <label class="label">เนื้อหา</label>
      <textarea class="input" rows="3" data-q-content="${lessonId}|${q.id}">${escapeHtml(q.content||"")}</textarea>

      <div class="grid-2" style="margin-top:10px">
        <div>
          <label class="label">รูป (URL)</label>
          <input class="input" data-q-imageurl="${lessonId}|${q.id}" value="${escapeHtmlAttr(q.imageUrl||"")}" />
          ${q.imageUrl ? `<div style="margin-top:8px"><img src="${escapeHtmlAttr(q.imageUrl)}" style="max-width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.12)" /></div>` : ``}
        </div>
        <div>
          <label class="label">อัปโหลดรูปใหม่</label>
          <input class="input" type="file" accept="image/*" data-q-imagefile="${lessonId}|${q.id}" />
          <div class="small muted" style="margin-top:6px">อัปโหลดแล้วจะเขียนทับ URL เดิม</div>
        </div>
      </div>

      <label class="label">เฉลย</label>
      <input class="input" data-q-answer="${lessonId}|${q.id}" value="${escapeHtmlAttr(q.answer||"")}" />

      <label class="label">ลำดับข้อ</label>
      <input class="input" type="number" data-q-order="${lessonId}|${q.id}" value="${Number(q.order ?? 1)}" />

      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" data-q-save="${lessonId}|${q.id}">บันทึกข้อ</button>
        <button class="btn btn-ghost" data-q-del="${lessonId}|${q.id}">ลบข้อ</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-q-save]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const key = btn.dataset.qSave; // lessonId|quizId
      const [lId, qId] = key.split("|");

      const question = qs(`[data-q-question="${key}"]`).value.trim();
      const content = qs(`[data-q-content="${key}"]`).value.trim();
      const answer = qs(`[data-q-answer="${key}"]`).value.trim();
      const order = Number(qs(`[data-q-order="${key}"]`).value || 1);

      const urlInput = qs(`[data-q-imageurl="${key}"]`).value.trim();
      const fileInput = qs(`[data-q-imagefile="${key}"]`);
      const file = fileInput.files?.[0] || null;

      if(!question || !answer){
        toast("คำถามและเฉลยห้ามว่าง");
        return;
      }

      let imageUrl = urlInput;

      if(file){
        try{
          toast("กำลังอัปโหลดรูป...");
          imageUrl = await uploadQuizImage(courseId, lId, file, qId);
        }catch(err){
          console.error(err);
          toast("อัปโหลดรูปไม่สำเร็จ");
          return;
        }
      }

      await updateDoc(doc(db, COURSES, courseId, "lessons", lId, "quizzes", qId), {
        question, content, answer, order,
        imageUrl: imageUrl || ""
      });

      toast("บันทึกข้อแล้ว");
      await renderAdminLessons();
    });
  });

  box.querySelectorAll("[data-q-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const key = btn.dataset.qDel;
      const [lId, qId] = key.split("|");
      if(!confirm("ลบข้อแบบฝึกหัดนี้?")) return;

      await deleteDoc(doc(db, COURSES, courseId, "lessons", lId, "quizzes", qId));
      toast("ลบข้อแล้ว");
      await renderAdminLessons();
    });
  });
}

// ---------- Data ----------
async function getAllCourses(){
  const snap = await getDocs(collection(db, "courses"));
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  out.sort((a,b)=> (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return out;
}

async function getLessons(courseId){
  const qy = query(collection(db, COURSES, courseId, "lessons"), orderBy("order", "asc"));
  const snap = await getDocs(qy);
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}

async function getQuizzes(courseId, lessonId){
  const qy = query(collection(db, COURSES, courseId, "lessons", lessonId, "quizzes"), orderBy("order", "asc"));
  const snap = await getDocs(qy);
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}

// ---------- Storage Upload ----------
async function uploadQuizImage(courseId, lessonId, file, quizId = ""){
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const stamp = Date.now();
  const path = quizId
    ? `quiz_images/${courseId}/${lessonId}/${quizId}_${stamp}_${safeName}`
    : `quiz_images/${courseId}/${lessonId}/${stamp}_${safeName}`;

  const r = ref(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

// ---------- small helpers ----------
function escapeHtmlAttr(s){
  // ปลอดภัยสำหรับใส่ใน value="..."
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll('"',"&quot;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
