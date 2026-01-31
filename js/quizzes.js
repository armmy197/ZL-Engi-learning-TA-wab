import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";
import { toast, setActiveRoute } from "./ui.js";
import { renderLessons } from "./lessons.js";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// -----------------------------
// Quiz state
// -----------------------------
let quizState = {
  index: 0,
  attempts: {}, // { [quizId]: number }
  solved: {},   // { [quizId]: true }
  revealed: {}, // { [quizId]: true }
  msg: {},      // { [quizId]: string }
  items: [],
};

// -----------------------------
// MP3 (Protected-ish) audio helper
// - เล่นได้เสถียรกว่า (fetch -> blob)
// - ไม่โชว์ URL จริงใน DOM
// - กันปุ่มดาวน์โหลด/คลิกขวา (กันได้ระดับ user ทั่วไป)
// -----------------------------
let _activeAudioObjectUrl = null;

function cleanupAudioObjectUrl() {
  if (_activeAudioObjectUrl) {
    try { URL.revokeObjectURL(_activeAudioObjectUrl); } catch {}
    _activeAudioObjectUrl = null;
  }
}

async function mountProtectedAudio(containerEl, audioUrl) {
  containerEl.innerHTML = "";
  cleanupAudioObjectUrl();

  if (!audioUrl) return;

  // UI placeholder
  const loading = document.createElement("div");
  loading.className = "muted small";
  loading.textContent = "🔊 กำลังโหลดเสียง...";
  containerEl.appendChild(loading);

  try {
    // fetch เป็น blob เพื่อให้เล่นได้ในหลายเครื่อง/หลายเบราว์เซอร์
    const res = await fetch(audioUrl, {
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      referrerPolicy: "no-referrer",
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    _activeAudioObjectUrl = objUrl;

    // สร้าง audio element
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = objUrl;

    // กันปุ่ม download (รองรับบางเบราว์เซอร์)
    audio.setAttribute("controlsList", "nodownload noplaybackrate");
    audio.setAttribute("playsinline", "true");

    // กันคลิกขวา/ลาก/เลือก
    audio.addEventListener("contextmenu", (e) => e.preventDefault());
    audio.addEventListener("dragstart", (e) => e.preventDefault());
    audio.style.width = "100%";
    audio.style.marginTop = "10px";

    // ลบ placeholder แล้วแสดง audio
    containerEl.innerHTML = "";
    containerEl.appendChild(audio);

    // note เล็ก ๆ
    const note = document.createElement("div");
    note.className = "muted small";
    note.style.marginTop = "6px";
    note.textContent = "หมายเหตุ: เสียงจะเล่นได้เมื่อกดปุ่ม ▶️ (บางเครื่องบล็อกการเล่นอัตโนมัติ)";
    containerEl.appendChild(note);

  } catch (err) {
    console.error("Audio load failed:", err);
    containerEl.innerHTML = `
      <div class="muted small">⚠ ไม่สามารถโหลดเสียงได้ (อาจเป็นเน็ต/สิทธิ์ไฟล์/เบราว์เซอร์บล็อก)</div>
    `;
  }
}

// -----------------------------
// Render quizzes
// -----------------------------
export async function renderQuizzes() {
  const panel = qs("#quizPanel");

  if (state.role !== "student") {
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }

  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student?.courseId;
  const lessonId = state.selectedLessonId;

  if (!courseId) {
    panel.innerHTML = `<div class="muted">กรุณาเลือกคอร์สก่อน</div>`;
    return;
  }

  if (!lessonId) {
    panel.innerHTML = `<div class="muted">กรุณาเลือกบทเรียนก่อน</div>`;
    return;
  }

  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const course = courseSnap.exists() ? courseSnap.data() : null;

  // เงื่อนไขต้องเข้าเรียนสดก่อน
  if (!course?.quizOpen || !state.student?.liveJoined) {
    panel.innerHTML = `<div class="muted">ต้องเข้าเรียนสดก่อน จึงทำแบบฝึกหัดได้</div>`;
    return;
  }

  const qy = query(
    collection(db, "courses", courseId, "lessons", lessonId, "quizzes"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(qy);

  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));

  if (!items.length) {
    panel.innerHTML = `<div class="muted">บทนี้ยังไม่มีแบบฝึกหัด</div>`;
    return;
  }

  quizState = {
    index: 0,
    attempts: {},
    solved: {},
    revealed: {},
    msg: {},
    items,
  };

  renderQuiz(panel);
}

function renderQuiz(panel) {
  const q = quizState.items[quizState.index];
  const tries = quizState.attempts[q.id] || 0;
  const isSolved = !!quizState.solved[q.id];
  const isRevealed = !!quizState.revealed[q.id];
  const canGoNext = isSolved || isRevealed;

  const isLast = quizState.index === quizState.items.length - 1;

  const type = q.type || "text"; // รองรับข้อเก่า

  // ----- Answer UI -----
  let answerUI = "";

  if (type === "choice") {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    answerUI = choices
      .map(
        (c, i) => `
      <label style="display:flex;gap:8px;margin:6px 0;cursor:pointer;align-items:flex-start">
        <input type="radio" name="quizChoice" value="${i}" ${
          isSolved ? "disabled" : ""
        }>
        <span>${escapeHtml(c)}</span>
      </label>
    `
      )
      .join("");

    if (!choices.length) {
      answerUI = `<div class="muted">⚠️ ข้อนี้ยังไม่มีตัวเลือก (choices) กรุณาให้แอดมินแก้ไข</div>`;
    }
  } else {
    answerUI = `
      <input id="quizAnswer" class="input"
        placeholder="พิมพ์คำตอบของคุณ"
        ${isSolved ? "disabled" : ""} />
    `;
  }

  // ปุ่ม Next/Finish
  const nextBtnHtml = isLast
    ? `
      <button id="btnFinish" class="btn btn-primary" ${
        canGoNext ? "" : "disabled"
      }>
        ✅ เสร็จสิ้น
      </button>
    `
    : `
      <button id="btnNext" class="btn btn-ghost" ${canGoNext ? "" : "disabled"}>
        ถัดไป ⏭️
      </button>
    `;

  panel.innerHTML = `
    <div class="small muted">ข้อ ${quizState.index + 1}/${quizState.items.length}</div>

    <div style="font-size:18px;margin-top:6px">${escapeHtml(q.question || "")}</div>
    ${q.content ? `<div class="muted" style="margin-top:6px">${escapeHtml(q.content)}</div>` : ""}

    ${q.imageUrl ? `
      <img src="${escapeHtml(q.imageUrl)}"
        style="max-width:100%;margin:10px 0;border-radius:12px;border:1px solid rgba(255,255,255,.12)">
    ` : ""}

    <!-- MP3 -->
    <div id="audioBox" style="margin-top:6px; user-select:none;"></div>

    <div style="margin-top:10px">${answerUI}</div>

    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button id="btnCheck" class="btn btn-primary" ${isSolved ? "disabled" : ""}>
        ตรวจคำตอบ
      </button>

      ${(!isSolved && !isRevealed && tries >= 2)
        ? `<button id="btnShowAnswer" class="btn btn-secondary">ดูเฉลยคำตอบ</button>`
        : ""}
    </div>

    <div id="quizMsg" class="small muted" style="margin-top:8px"></div>

    <div style="display:flex;justify-content:space-between;margin-top:12px;gap:8px;align-items:center">
      <button id="btnPrev" class="btn btn-ghost" ${quizState.index === 0 ? "disabled" : ""}>
        ⏮️ กลับ
      </button>

      ${nextBtnHtml}
    </div>
  `;

  // ----- mount audio (MP3) -----
  const audioBox = qs("#audioBox");
  mountProtectedAudio(audioBox, q.audioUrl || "");

  // ----- message -----
  const msgEl = qs("#quizMsg");
  msgEl.style.color = "rgba(255,255,255,.9)";

  if (quizState.solved[q.id]) {
    msgEl.innerHTML = "✅ ตอบถูก";
    msgEl.style.color = "rgba(241,210,138,.95)";
  } else if (quizState.revealed[q.id]) {
    const ans =
      (q.explain && String(q.explain).trim()) ||
      (q.answerText && String(q.answerText).trim()) ||
      (q.answer && String(q.answer).trim()) ||
      "(ไม่มีเฉลย)";
    msgEl.innerHTML = `
      📘 เฉลยคำตอบ:
      <b style="font-size:22px; line-height:1.4;">
        ${escapeHtml(ans)}
      </b>
    `;
  } else if (quizState.msg[q.id]) {
    msgEl.innerHTML = quizState.msg[q.id];
  } else {
    msgEl.innerHTML = "";
  }

  // ถ้าเป็นข้อสุดท้ายและผ่านแล้ว -> เตือนให้กดเสร็จสิ้น
  if (isLast && canGoNext) {
    const doneNote = document.createElement("div");
    doneNote.className = "muted small";
    doneNote.style.marginTop = "8px";
    doneNote.textContent = "🎉 ทำครบทุกข้อแล้ว กด “เสร็จสิ้น” เพื่อกลับไปหน้าเมนูบทเรียน";
    panel.appendChild(doneNote);
  }

  // ----- events -----
  qs("#btnCheck")?.addEventListener("click", () => checkAnswer(q, panel, type));

  qs("#btnPrev")?.addEventListener("click", () => {
    if (quizState.index > 0) {
      quizState.index--;
      renderQuiz(panel);
    }
  });

  qs("#btnNext")?.addEventListener("click", () => {
    if (canGoNext && quizState.index < quizState.items.length - 1) {
      quizState.index++;
      renderQuiz(panel);
    }
  });

  qs("#btnFinish")?.addEventListener("click", async () => {
    if (!canGoNext) return;
    cleanupAudioObjectUrl();
    toast("เสร็จสิ้นแบบฝึกหัดแล้ว");
    setActiveRoute("student-lessons");
    await renderLessons();
  });

  qs("#btnShowAnswer")?.addEventListener("click", () => {
    quizState.revealed[q.id] = true;
    const ans =
      (q.explain && String(q.explain).trim()) ||
      (q.answerText && String(q.answerText).trim()) ||
      (q.answer && String(q.answer).trim()) ||
      "";
    quizState.msg[q.id] = `📘 เฉลย: <b>${escapeHtml(ans || "(ไม่มีเฉลย)")}</b>`;
    renderQuiz(panel);
  });
}

function checkAnswer(q, panel, type) {
  // ต้องตอบก่อน
  if (type === "choice") {
    const sel = document.querySelector('input[name="quizChoice"]:checked');
    if (!sel) {
      toast("กรุณาเลือกคำตอบก่อน");
      return;
    }
  } else {
    const input = qs("#quizAnswer")?.value.trim();
    if (!input) {
      toast("กรุณากรอกคำตอบก่อน");
      return;
    }
  }

  // เพิ่มจำนวนครั้ง
  quizState.attempts[q.id] = (quizState.attempts[q.id] || 0) + 1;
  const tries = quizState.attempts[q.id];

  // ตรวจคำตอบ
  let correct = false;

  if (type === "choice") {
    const sel = document.querySelector('input[name="quizChoice"]:checked');
    correct = Number(sel.value) === Number(q.correctIndex);
  } else {
    const input = qs("#quizAnswer")?.value.trim();
    const ans = (q.answerText || q.answer || "").trim();
    correct = input === ans;
  }

  if (correct) {
    quizState.solved[q.id] = true;
    quizState.msg[q.id] = "✅ ตอบถูก";
  } else {
    if (tries === 1) {
      quizState.msg[q.id] = "❌ คุณตอบผิด ครั้งที่ 1";
    } else if (tries === 2) {
      quizState.msg[q.id] = "❌ คุณตอบผิด ครั้งที่ 2 (สามารถกด “ดูเฉลยคำตอบ” ได้)";
    } else {
      quizState.msg[q.id] = `❌ คุณตอบผิด (พยายาม ${tries} ครั้ง)`;
    }
  }

  renderQuiz(panel);
}

// cleanup เมื่อมีการเปลี่ยนหน้า (กัน memory leak)
window.addEventListener("beforeunload", cleanupAudioObjectUrl);
