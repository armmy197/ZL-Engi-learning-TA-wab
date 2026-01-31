import { db, storage } from "./firebase.js";
import { state } from "./state.js";
import { qs, escapeHtml } from "./utils.js";
import { toast } from "./ui.js";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

const COURSES = "courses";

/**
 * Quiz schema (backward compatible)
 * - type: "text" | "choice" (if missing -> treat as "text")
 * - shared: question, content, imageUrl, order
 * - text: answerText (also keep legacy answer for compatibility)
 * - choice: choices[], correctIndex, explain (optional)
 */

// ---------- Public API ----------
export async function renderAdminLessons() {
  const panel = qs("#adminLessonsPanel");
  if (!panel) return;

  if (state.role !== "admin") {
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบแอดมิน</div>`;
    return;
  }

  const courses = await getAllCourses();

  const selected =
    window.__adminLessonsCourseId && courses.find((c) => c.id === window.__adminLessonsCourseId)
      ? window.__adminLessonsCourseId
      : courses[0]?.id || "";

  window.__adminLessonsCourseId = selected;

  panel.innerHTML = `
    <div class="grid-2">
      <div class="card" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
        <div style="font-weight:700;margin-bottom:8px">เลือกคอร์ส</div>

        <label class="label">คอร์ส</label>
        <select id="alCourse" class="input">
          ${courses
            .map(
              (c) =>
                `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${escapeHtml(
                  c.name || c.id
                )}</option>`
            )
            .join("")}
        </select>

        <div class="small muted" style="margin-top:10px">
          • เพิ่ม “บทเรียน” ได้หลายบท<br/>
          • ในแต่ละบท เพิ่ม “แบบฝึกหัด” ได้หลายข้อ (รองรับ Choices + พิมพ์ตอบ, รูป URL / อัปโหลดรูป + เฉลย)
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

  qs("#alCourse").addEventListener("change", async (e) => {
    window.__adminLessonsCourseId = e.target.value;
    await renderAdminLessons();
  });

  qs("#alAddLesson").addEventListener("click", async () => {
    const courseId = window.__adminLessonsCourseId;
    if (!courseId) {
      toast("ไม่พบคอร์ส");
      return;
    }

    const title = qs("#alNewLessonTitle").value.trim();
    const order = Number(qs("#alNewLessonOrder").value || 1);

    if (!title) {
      toast("กรุณากรอกชื่อบทเรียน");
      return;
    }

    await addDoc(collection(db, COURSES, courseId, "lessons"), {
      title,
      order,
      createdAt: new Date(),
    });

    toast("เพิ่มบทเรียนแล้ว");
    await renderAdminLessons();
  });

  await renderLessonsList(window.__adminLessonsCourseId);
}

// ---------- UI Render ----------
async function renderLessonsList(courseId) {
  const list = qs("#alLessonsList");
  if (!list) return;

  if (!courseId) {
    list.innerHTML = `<div class="muted">กรุณาเลือกคอร์สก่อน</div>`;
    return;
  }

  const lessons = await getLessons(courseId);

  if (!lessons.length) {
    list.innerHTML = `<div class="muted">ยังไม่มีบทเรียน</div>`;
    return;
  }

  list.innerHTML = lessons
    .map(
      (lesson) => `
    <div class="card glass" style="margin:10px 0; padding:12px; border:1px solid rgba(255,255,255,.10)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:240px">
          <div style="font-weight:700">บทเรียน</div>
          <label class="label">ชื่อบทเรียน</label>
          <input class="input" data-lesson-title="${lesson.id}" value="${escapeHtmlAttr(lesson.title || "")}" />

          <label class="label">ลำดับ</label>
          <input class="input" type="number" data-lesson-order="${lesson.id}" value="${Number(
            lesson.order ?? 1
          )}" />
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

        ${renderQuizAddForm(lesson.id)}
      </div>
    </div>
  `
    )
    .join("");

  // bind lesson actions
  list.querySelectorAll("[data-lesson-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lessonId = btn.dataset.lessonSave;
      const title = qs(`[data-lesson-title="${lessonId}"]`).value.trim();
      const order = Number(qs(`[data-lesson-order="${lessonId}"]`).value || 1);
      if (!title) {
        toast("ชื่อบทเรียนห้ามว่าง");
        return;
      }

      await updateDoc(doc(db, COURSES, courseId, "lessons", lessonId), { title, order });
      toast("บันทึกบทเรียนแล้ว");
      await renderAdminLessons();
    });
  });

  list.querySelectorAll("[data-lesson-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const lessonId = btn.dataset.lessonDel;
      if (!confirm("ลบบทเรียนนี้? (ข้อแบบฝึกหัดในบทจะถูกลบด้วย)")) return;

      // ลบ quizzes ใต้บทก่อน (เพราะ Firestore ไม่ลบ subcollection อัตโนมัติ)
      const quizzes = await getQuizzes(courseId, lessonId);
      for (const q of quizzes) {
        await deleteDoc(doc(db, COURSES, courseId, "lessons", lessonId, "quizzes", q.id));
      }

      await deleteDoc(doc(db, COURSES, courseId, "lessons", lessonId));
      toast("ลบบทเรียนแล้ว");
      await renderAdminLessons();
    });
  });

  // for each lesson render quizzes + bind quiz add form
  for (const lesson of lessons) {
    await renderQuizList(courseId, lesson.id);

    const btnAdd = list.querySelector(`[data-quiz-add="${lesson.id}"]`);
    const form = qs(`#quizAddForm-${lesson.id}`);

    btnAdd.addEventListener("click", () => {
      form.style.display = form.style.display === "none" || !form.style.display ? "block" : "none";
    });

    form.querySelector(`[data-quiz-cancel="${lesson.id}"]`).addEventListener("click", () => {
      form.style.display = "none";
    });

    // toggle type UI
    const typeSel = form.querySelector(`[data-new-type="${lesson.id}"]`);
    const typeUI = () => {
      const t = typeSel.value;
      const boxText = form.querySelector(`[data-new-box-text="${lesson.id}"]`);
      const boxChoice = form.querySelector(`[data-new-box-choice="${lesson.id}"]`);
      if (t === "choice") {
        boxChoice.style.display = "block";
        boxText.style.display = "none";
      } else {
        boxChoice.style.display = "none";
        boxText.style.display = "block";
      }
    };
    typeSel.addEventListener("change", typeUI);
    typeUI();

    form.querySelector(`[data-quiz-save="${lesson.id}"]`).addEventListener("click", async () => {
      const question = form.querySelector(`[data-new-q="${lesson.id}"]`).value.trim();
      const content = form.querySelector(`[data-new-c="${lesson.id}"]`).value.trim();
      const type = form.querySelector(`[data-new-type="${lesson.id}"]`).value;
      const order = Number(form.querySelector(`[data-new-order="${lesson.id}"]`).value || 1);

      const imgUrlInput = form.querySelector(`[data-new-imgurl="${lesson.id}"]`).value.trim();
      const imgFileInput = form.querySelector(`[data-new-imgfile="${lesson.id}"]`);
      const imgFile = imgFileInput.files?.[0] || null;

      if (!question) {
        toast("กรุณากรอกคำถาม");
        return;
      }

      let payload = {
        question,
        content,
        type: type === "choice" ? "choice" : "text",
        imageUrl: "",
        order,
        createdAt: new Date(),
      };

      if (payload.type === "text") {
        const answerText = form.querySelector(`[data-new-ans-text="${lesson.id}"]`).value.trim();
        if (!answerText) {
          toast("กรุณากรอกเฉลย");
          return;
        }
        payload.answerText = answerText;
        payload.answer = answerText; // legacy support
      } else {
        const choices = readChoicesFromForm(form, lesson.id, "new");
        const correctIndex = Number(
          form.querySelector(`[data-new-correct="${lesson.id}"]`).value || 0
        );
        if (choices.filter((x) => x.trim()).length < 2) {
          toast("กรุณากรอกตัวเลือกอย่างน้อย 2 ตัว");
          return;
        }
        if (!choices[correctIndex] || !choices[correctIndex].trim()) {
          toast("กรุณาเลือกข้อที่ถูกต้อง");
          return;
        }
        const explain = form.querySelector(`[data-new-explain="${lesson.id}"]`).value.trim();
        payload.choices = choices;
        payload.correctIndex = correctIndex;
        payload.explain = explain || "";
        payload.answerText = choices[correctIndex].trim();
        payload.answer = payload.answerText; // legacy support
      }

      let imageUrl = imgUrlInput;

      // Upload file first (if provided) — ให้ไฟล์มีสิทธิ์เหนือ URL
      if (imgFile) {
        try {
          toast("กำลังอัปโหลดรูป...");
          imageUrl = await uploadQuizImage(courseId, lesson.id, imgFile);
        } catch (err) {
          console.error(err);
          toast("อัปโหลดรูปไม่สำเร็จ (ตรวจ Storage Rules/การเชื่อมต่อ)");
          return;
        }
      }

      payload.imageUrl = imageUrl || "";
      const audioUrl = (qs(`[data-new-audiourl="${lesson.id}"]`)?.value || "").trim();
      payload.audioUrl = audioUrl || "";

      await addDoc(collection(db, COURSES, courseId, "lessons", lesson.id, "quizzes"), payload);

      toast("เพิ่มแบบฝึกหัดแล้ว");
      await renderAdminLessons();
    });
  }
}

function renderQuizAddForm(lessonId) {
  return `
    <div id="quizAddForm-${lessonId}" class="card" style="display:none;margin-top:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10)">
      <div style="font-weight:700;margin-bottom:8px">เพิ่มแบบฝึกหัด</div>

      <label class="label">ประเภทแบบฝึกหัด</label>
      <select class="input" data-new-type="${lessonId}">
        <option value="text" selected>พิมพ์ตอบ</option>
        <option value="choice">ตัวเลือก (Choices)</option>
      </select>

      <label class="label">หัวข้อ/คำถาม</label>
      <input class="input" data-new-q="${lessonId}" placeholder="เช่น 故障 แปลว่าอะไร?" />

      <label class="label">เนื้อหา (อธิบายเพิ่มเติม)</label>
      <textarea class="input" rows="3" data-new-c="${lessonId}" placeholder="อธิบายโจทย์..."></textarea>

      <div class="grid-2" style="margin-top:10px">
        <div>
          <label class="label">รูป (URL)</label>
          <input class="input" data-new-imgurl="${lessonId}" placeholder="https://..." />

          <label class="label" style="margin-top:10px">เสียง (MP3 URL)</label>
          <input class="input" data-new-audiourl="${lessonId}" placeholder="https://raw.githubusercontent.com/.../audio.mp3" />
          <div class="small muted" style="margin-top:6px">ใส่ URL หรืออัปโหลดรูปก็ได้</div>
        </div>
        <div>
          <label class="label">อัปโหลดรูปจากเครื่อง</label>
          <input class="input" type="file" accept="image/*" data-new-imgfile="${lessonId}" />
          <div class="small muted" style="margin-top:6px">รองรับ JPG/PNG/WebP</div>
        </div>
      </div>

      <!-- TEXT ANSWER -->
      <div data-new-box-text="${lessonId}">
        <label class="label">เฉลย (พิมพ์ตอบ)</label>
        <input class="input" data-new-ans-text="${lessonId}" placeholder="เช่น หมายถึง เครื่องขัดข้อง / เสีย" />
      </div>

      <!-- CHOICES -->
      <div data-new-box-choice="${lessonId}" style="display:none">
        <label class="label">ตัวเลือก (กรอกอย่างน้อย 2 ตัว)</label>
        ${[0, 1, 2, 3]
          .map(
            (i) => `
          <input class="input" style="margin-bottom:8px" data-new-choice="${lessonId}" data-idx="${i}" placeholder="ตัวเลือก ${i + 1}" />
        `
          )
          .join("")}

        <label class="label">ข้อที่ถูกต้อง</label>
        <select class="input" data-new-correct="${lessonId}">
          <option value="0">ตัวเลือก 1</option>
          <option value="1">ตัวเลือก 2</option>
          <option value="2">ตัวเลือก 3</option>
          <option value="3">ตัวเลือก 4</option>
        </select>

        <label class="label">เฉลย/คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
        <textarea class="input" rows="2" data-new-explain="${lessonId}" placeholder="อธิบายสั้น ๆ..."></textarea>
      </div>

      <label class="label">ลำดับข้อ (ตัวเลข)</label>
      <input class="input" type="number" value="1" data-new-order="${lessonId}" />

      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" data-quiz-cancel="${lessonId}">ยกเลิก</button>
        <button class="btn btn-primary" data-quiz-save="${lessonId}">บันทึกข้อ</button>
      </div>
    </div>
  `;
}

async function renderQuizList(courseId, lessonId) {
  const box = qs(`#quizList-${lessonId}`);
  if (!box) return;

  const quizzes = await getQuizzes(courseId, lessonId);

  if (!quizzes.length) {
    box.innerHTML = `<div class="muted">ยังไม่มีแบบฝึกหัด</div>`;
    return;
  }

  box.innerHTML = quizzes
    .map((q) => renderQuizCard(lessonId, q))
    .join("");

  // Bind per-quiz type toggles + save/delete
  box.querySelectorAll("[data-q-type]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.qType; // lessonId|quizId
      const t = sel.value;
      const boxText = qs(`[data-q-box-text="${key}"]`);
      const boxChoice = qs(`[data-q-box-choice="${key}"]`);
      if (t === "choice") {
        boxChoice.style.display = "block";
        boxText.style.display = "none";
      } else {
        boxChoice.style.display = "none";
        boxText.style.display = "block";
      }
    });

    // init
    sel.dispatchEvent(new Event("change"));
  });

  box.querySelectorAll("[data-q-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.qSave; // lessonId|quizId
      const [lId, qId] = key.split("|");

      const question = qs(`[data-q-question="${key}"]`).value.trim();
      const content = qs(`[data-q-content="${key}"]`).value.trim();
      const typeSel = qs(`[data-q-type="${key}"]`).value;
      const type = typeSel === "choice" ? "choice" : "text";
      const order = Number(qs(`[data-q-order="${key}"]`).value || 1);

      const urlInput = qs(`[data-q-imageurl="${key}"]`).value.trim();
      const fileInput = qs(`[data-q-imagefile="${key}"]`);
      const file = fileInput.files?.[0] || null;

      if (!question) {
        toast("คำถามห้ามว่าง");
        return;
      }

      let updatePayload = {
        question,
        content,
        type,
        order,
        imageUrl: "",
      };

      if (type === "text") {
        const answerText = qs(`[data-q-ans-text="${key}"]`).value.trim();
        if (!answerText) {
          toast("เฉลยห้ามว่าง");
          return;
        }
        updatePayload.answerText = answerText;
        updatePayload.answer = answerText; // legacy
        // clear choice fields if previously choice
        updatePayload.choices = [];
        updatePayload.correctIndex = 0;
        updatePayload.explain = "";
      } else {
        const choices = readChoicesFromForm(box, key, "edit");
        const correctIndex = Number(qs(`[data-q-correct="${key}"]`).value || 0);
        if (choices.filter((x) => x.trim()).length < 2) {
          toast("กรุณากรอกตัวเลือกอย่างน้อย 2 ตัว");
          return;
        }
        if (!choices[correctIndex] || !choices[correctIndex].trim()) {
          toast("กรุณาเลือกข้อที่ถูกต้อง");
          return;
        }
        const explain = qs(`[data-q-explain="${key}"]`).value.trim();
        updatePayload.choices = choices;
        updatePayload.correctIndex = correctIndex;
        updatePayload.explain = explain || "";
        updatePayload.answerText = choices[correctIndex].trim();
        updatePayload.answer = updatePayload.answerText; // legacy
      }

      let imageUrl = urlInput;

      if (file) {
        try {
          toast("กำลังอัปโหลดรูป...");
          imageUrl = await uploadQuizImage(courseId, lId, file, qId);
        } catch (err) {
          console.error(err);
          toast("อัปโหลดรูปไม่สำเร็จ");
          return;
        }
      }

      updatePayload.imageUrl = imageUrl || "";

      await updateDoc(doc(db, COURSES, courseId, "lessons", lId, "quizzes", qId), updatePayload);

      toast("บันทึกข้อแล้ว");
      await renderAdminLessons();
    });
  });

  box.querySelectorAll("[data-q-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.qDel;
      const [lId, qId] = key.split("|");
      if (!confirm("ลบข้อแบบฝึกหัดนี้?")) return;

      await deleteDoc(doc(db, COURSES, courseId, "lessons", lId, "quizzes", qId));
      toast("ลบข้อแล้ว");
      await renderAdminLessons();
    });
  });
}

function renderQuizCard(lessonId, q) {
  const key = `${lessonId}|${q.id}`;
  const type = q.type === "choice" ? "choice" : "text";

  // backward compatibility: old docs stored answer only
  const answerText = (q.answerText ?? q.answer ?? "").toString();
  const choices = Array.isArray(q.choices) && q.choices.length ? q.choices : ["", "", "", ""];
  const correctIndex = Number.isFinite(q.correctIndex) ? q.correctIndex : 0;
  const explain = (q.explain ?? "").toString();

  return `
    <div class="card" style="margin:10px 0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.10)">
      <div class="small muted">ข้อ ID: ${escapeHtml(q.id)}</div>

      <label class="label">ประเภทแบบฝึกหัด</label>
      <select class="input" data-q-type="${key}">
        <option value="text" ${type === "text" ? "selected" : ""}>พิมพ์ตอบ</option>
        <option value="choice" ${type === "choice" ? "selected" : ""}>ตัวเลือก (Choices)</option>
      </select>

      <label class="label">หัวข้อ/คำถาม</label>
      <input class="input" data-q-question="${key}" value="${escapeHtmlAttr(q.question || "")}" />

      <label class="label">เนื้อหา</label>
      <textarea class="input" rows="3" data-q-content="${key}">${escapeHtml(q.content || "")}</textarea>

      <div class="grid-2" style="margin-top:10px">
        <div>
          <label class="label">รูป (URL)</label>
          <input class="input" data-q-imageurl="${key}" value="${escapeHtmlAttr(q.imageUrl || "")}" />
          ${
            q.imageUrl
              ? `<div style="margin-top:8px"><img src="${escapeHtmlAttr(
                  q.imageUrl
                )}" style="max-width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.12)" /></div>`
              : ``
          }
        </div>
        <div>
          <label class="label">อัปโหลดรูปใหม่</label>
          <input class="input" type="file" accept="image/*" data-q-imagefile="${key}" />
          <div class="small muted" style="margin-top:6px">อัปโหลดแล้วจะเขียนทับ URL เดิม</div>
        </div>
      </div>

      <!-- TEXT -->
      <div data-q-box-text="${key}">
        <label class="label">เฉลย (พิมพ์ตอบ)</label>
        <input class="input" data-q-ans-text="${key}" value="${escapeHtmlAttr(answerText)}" />
      </div>

      <!-- CHOICE -->
      <div data-q-box-choice="${key}" style="display:none">
        <label class="label">ตัวเลือก (กรอกอย่างน้อย 2 ตัว)</label>
        ${[0, 1, 2, 3]
          .map(
            (i) => `
          <input class="input" style="margin-bottom:8px" data-q-choice="${key}" data-idx="${i}" value="${escapeHtmlAttr(
              choices[i] ?? ""
            )}" placeholder="ตัวเลือก ${i + 1}" />
        `
          )
          .join("")}

        <label class="label">ข้อที่ถูกต้อง</label>
        <select class="input" data-q-correct="${key}">
          <option value="0" ${correctIndex === 0 ? "selected" : ""}>ตัวเลือก 1</option>
          <option value="1" ${correctIndex === 1 ? "selected" : ""}>ตัวเลือก 2</option>
          <option value="2" ${correctIndex === 2 ? "selected" : ""}>ตัวเลือก 3</option>
          <option value="3" ${correctIndex === 3 ? "selected" : ""}>ตัวเลือก 4</option>
        </select>

        <label class="label">เฉลย/คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
        <textarea class="input" rows="2" data-q-explain="${key}">${escapeHtml(explain)}</textarea>
      </div>

      <label class="label">ลำดับข้อ</label>
      <input class="input" type="number" data-q-order="${key}" value="${Number(q.order ?? 1)}" />

      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" data-q-save="${key}">บันทึกข้อ</button>
        <button class="btn btn-ghost" data-q-del="${key}">ลบข้อ</button>
      </div>
    </div>
  `;
}

// ---------- Data ----------
async function getAllCourses() {
  const snap = await getDocs(collection(db, "courses"));
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  out.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return out;
}

async function getLessons(courseId) {
  const qy = query(collection(db, COURSES, courseId, "lessons"), orderBy("order", "asc"));
  const snap = await getDocs(qy);
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

async function getQuizzes(courseId, lessonId) {
  const qy = query(
    collection(db, COURSES, courseId, "lessons", lessonId, "quizzes"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(qy);
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

// ---------- Storage Upload ----------
async function uploadQuizImage(courseId, lessonId, file, quizId = "") {
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
function escapeHtmlAttr(s) {
  // ปลอดภัยสำหรับใส่ใน value="..."
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function readChoicesFromForm(rootEl, lessonOrKey, mode) {
  // mode: "new" uses lessonId + data-new-choice
  // mode: "edit" uses key (lessonId|quizId) + data-q-choice
  const sel = mode === "new" ? `[data-new-choice="${lessonOrKey}"]` : `[data-q-choice="${lessonOrKey}"]`;
  const nodes = Array.from(rootEl.querySelectorAll(sel));
  // ensure stable order by data-idx
  nodes.sort((a, b) => Number(a.dataset.idx || 0) - Number(b.dataset.idx || 0));
  return nodes.map((n) => (n.value ?? "").toString());
}
