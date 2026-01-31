import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";
import { toast, setActiveRoute } from "./ui.js";
import { renderLessons } from "./lessons.js";

import {
  doc, getDoc, getDocs, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let quizState = {
  index: 0,
  attempts: {},
  solved: {},
  revealed: {},
  msg: {},
  items: [],
  audioSpeed: 1
};

export async function renderQuizzes(){
  const panel = qs("#quizPanel");

  if(state.role !== "student"){
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }

  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student.courseId;
  const lessonId = state.selectedLessonId;

  if(!lessonId){
    panel.innerHTML = `<div class="muted">กรุณาเลือกบทเรียนก่อน</div>`;
    return;
  }

  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const course = courseSnap.exists() ? courseSnap.data() : null;

  if(!course?.quizOpen || !state.student.liveJoined){
    panel.innerHTML = `<div class="muted">ต้องเข้าเรียนสดก่อน จึงทำแบบฝึกหัดได้</div>`;
    return;
  }

  const qy = query(
    collection(db, "courses", courseId, "lessons", lessonId, "quizzes"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(qy);

  const items = [];
  snap.forEach(d=> items.push({ id:d.id, ...d.data() }));

  if(!items.length){
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
    audioSpeed: 1
  };

  renderQuiz(panel);
}

function renderQuiz(panel){
  const q = quizState.items[quizState.index];
  const tries = quizState.attempts[q.id] || 0;
  const isSolved = !!quizState.solved[q.id];
  const isRevealed = !!quizState.revealed[q.id];
  const canGoNext = isSolved || isRevealed;
  const isLast = quizState.index === quizState.items.length - 1;
  const type = q.type || "text";

  let answerUI = "";

  if(type === "choice"){
    const choices = Array.isArray(q.choices) ? q.choices : [];
    answerUI = choices.map((c, i)=>`
      <label style="display:flex;gap:8px;margin:6px 0;cursor:pointer">
        <input type="radio" name="quizChoice" value="${i}" ${isSolved ? "disabled" : ""}>
        <span>${escapeHtml(c)}</span>
      </label>
    `).join("");
  } else {
    answerUI = `
      <input id="quizAnswer" class="input"
        placeholder="พิมพ์คำตอบของคุณ"
        ${isSolved ? "disabled" : ""} />
    `;
  }

  panel.innerHTML = `
    <div class="small muted">ข้อ ${quizState.index+1}/${quizState.items.length}</div>

    <div style="font-size:18px;margin-top:6px">${escapeHtml(q.question || "")}</div>

    ${q.audioUrl ? `
      <div style="margin-top:12px">
        <audio id="quizAudio" preload="metadata" src="${escapeHtml(q.audioUrl)}"></audio>

        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <button id="btnPlayAudio" class="btn btn-secondary">▶ เล่นเสียง</button>
          <button id="btnSlow" class="btn btn-ghost">🐢 ช้า</button>
          <button id="btnFast" class="btn btn-ghost">⚡ เร็ว</button>
          <span class="small muted">สปีด: ${quizState.audioSpeed.toFixed(1)}x</span>
        </div>
      </div>
    ` : ""}

    ${q.imageUrl ? `
      <img src="${escapeHtml(q.imageUrl)}"
        style="max-width:100%;margin:10px 0;border-radius:12px;border:1px solid rgba(255,255,255,.12)">
    ` : ""}

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

    <div style="display:flex;justify-content:space-between;margin-top:12px;gap:8px">
      <button id="btnPrev" class="btn btn-ghost" ${quizState.index === 0 ? "disabled" : ""}>
        ⏮️ กลับ
      </button>

      <div style="display:flex;gap:8px">
        ${isLast && canGoNext ? `<button id="btnFinish" class="btn btn-primary">เสร็จสิ้น ✅</button>` : ``}
        <button id="btnNext" class="btn btn-ghost" ${(!isLast && canGoNext) ? "" : "disabled"}>
          ถัดไป ⏭️
        </button>
      </div>
    </div>
  `;

  // ---- Audio controls ----
  const audio = qs("#quizAudio");

  qs("#btnPlayAudio")?.addEventListener("click", async ()=>{
    try{
      audio.playbackRate = quizState.audioSpeed;
      await audio.play(); // user gesture fix
    }catch(e){
      toast("ไม่สามารถเล่นเสียงได้");
    }
  });

  qs("#btnSlow")?.addEventListener("click", ()=>{
    quizState.audioSpeed = Math.max(0.5, quizState.audioSpeed - 0.25);
    renderQuiz(panel);
  });

  qs("#btnFast")?.addEventListener("click", ()=>{
    quizState.audioSpeed = Math.min(2, quizState.audioSpeed + 0.25);
    renderQuiz(panel);
  });

  // ---- Message + Explanation ----
  const msgEl = qs("#quizMsg");

  if (quizState.revealed[q.id]) {
    const answer =
      (q.answerText || q.answer || "(ไม่มีเฉลย)");

    const explain =
      (q.explain || "");

    msgEl.innerHTML = `
      📘 <b>เฉลย:</b> ${escapeHtml(answer)}
      ${explain ? `<div style="margin-top:6px">💬 ${escapeHtml(explain)}</div>` : ""}
    `;
  }
  else if (quizState.msg[q.id]) {
    msgEl.innerHTML = quizState.msg[q.id];
  }

  // events
  qs("#btnCheck")?.addEventListener("click", ()=>checkAnswer(q, panel, type));
  qs("#btnPrev")?.addEventListener("click", ()=>{ quizState.index--; renderQuiz(panel); });
  qs("#btnNext")?.addEventListener("click", ()=>{ quizState.index++; renderQuiz(panel); });
  qs("#btnShowAnswer")?.addEventListener("click", ()=>{
    quizState.revealed[q.id] = true;
    renderQuiz(panel);
  });

  qs("#btnFinish")?.addEventListener("click", async ()=>{
    toast("✅ ทำครบแล้ว");
    setActiveRoute("student-lessons");
    await renderLessons();
  });
}

function checkAnswer(q, panel, type){
  if(type === "text"){
    const input = qs("#quizAnswer")?.value.trim();
    if(!input){ toast("กรุณากรอกคำตอบ"); return; }

    const ans = (q.answerText || q.answer || "").trim();

    quizState.attempts[q.id] = (quizState.attempts[q.id] || 0) + 1;

    if(input === ans){
      quizState.solved[q.id] = true;
      quizState.msg[q.id] = "✅ ตอบถูก";
    }else{
      quizState.msg[q.id] = "❌ ตอบผิด";
    }
  }

  renderQuiz(panel);
}
