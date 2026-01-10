import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";
import { toast } from "./ui.js";

import {
  doc, getDoc, getDocs, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let quizState = {
  index: 0,
  attempts: {},   // { [quizId]: number }
  solved: {},     // { [quizId]: true }
  revealed: {},   // { [quizId]: true }
  msg: {},        // { [quizId]: string }
  items: []
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
    items
  };

  renderQuiz(panel);
}

function renderQuiz(panel){
  const q = quizState.items[quizState.index];
  const tries = quizState.attempts[q.id] || 0;
  const isSolved = !!quizState.solved[q.id];
  const isRevealed = !!quizState.revealed[q.id];
  const canGoNext = isSolved || isRevealed;

  const type = q.type || "text"; // รองรับข้อเก่า

  // ----- Answer UI -----
  let answerUI = "";

  if(type === "choice"){
    const choices = Array.isArray(q.choices) ? q.choices : [];
    answerUI = choices.map((c, i)=>`
      <label style="display:flex;gap:8px;margin:6px 0;cursor:pointer;align-items:flex-start">
        <input type="radio" name="quizChoice" value="${i}" ${isSolved ? "disabled" : ""}>
        <span>${escapeHtml(c)}</span>
      </label>
    `).join("");

    if(!choices.length){
      answerUI = `<div class="muted">⚠️ ข้อนี้ยังไม่มีตัวเลือก (choices) กรุณาให้แอดมินแก้ไข</div>`;
    }
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
    ${q.content ? `<div class="muted" style="margin-top:6px">${escapeHtml(q.content)}</div>` : ""}

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

      <button id="btnNext" class="btn btn-ghost" ${canGoNext ? "" : "disabled"}>
        ถัดไป ⏭️
      </button>
    </div>
  `;

// ----- message (FIXED) -----
const msgEl = qs("#quizMsg");
msgEl.style.color = "rgba(255,255,255,.9)";

if (quizState.solved[q.id]) {
  msgEl.innerHTML = "✅ ตอบถูก";
  msgEl.style.color = "rgba(241,210,138,.95)";
} 
else if (quizState.revealed[q.id]) {
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
}
else if (quizState.msg[q.id]) {
  msgEl.innerHTML = quizState.msg[q.id];
}
else {
  msgEl.innerHTML = "";
}


  // ----- events -----
  qs("#btnCheck")?.addEventListener("click", ()=>checkAnswer(q, panel, type));

  qs("#btnPrev")?.addEventListener("click", ()=>{
    if(quizState.index > 0){
      quizState.index--;
      renderQuiz(panel);
    }
  });

  qs("#btnNext")?.addEventListener("click", ()=>{
    if(canGoNext && quizState.index < quizState.items.length-1){
      quizState.index++;
      renderQuiz(panel);
    }
  });

  qs("#btnShowAnswer")?.addEventListener("click", ()=>{
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

function checkAnswer(q, panel, type){
  // เตือน: ต้องตอบก่อน
  if(type === "choice"){
    const sel = document.querySelector('input[name="quizChoice"]:checked');
    if(!sel){
      toast("กรุณาเลือกคำตอบก่อน");
      return;
    }
  } else {
    const input = qs("#quizAnswer")?.value.trim();
    if(!input){
      toast("กรุณากรอกคำตอบก่อน");
      return;
    }
  }

  // เพิ่มจำนวนครั้ง
  quizState.attempts[q.id] = (quizState.attempts[q.id] || 0) + 1;
  const tries = quizState.attempts[q.id];

  // ตรวจคำตอบ
  let correct = false;

  if(type === "choice"){
    const sel = document.querySelector('input[name="quizChoice"]:checked');
    correct = Number(sel.value) === Number(q.correctIndex);
  } else {
    const input = qs("#quizAnswer")?.value.trim();
    const ans = (q.answerText || q.answer || "").trim();
    correct = input === ans;
  }

  if(correct){
    quizState.solved[q.id] = true;
    quizState.msg[q.id] = "✅ ตอบถูก";
  } else {
    if(tries === 1){
      quizState.msg[q.id] = "❌ คุณตอบผิด ครั้งที่ 1";
    } else if(tries === 2){
      quizState.msg[q.id] = "❌ คุณตอบผิด ครั้งที่ 2 (สามารถกด “ดูเฉลยคำตอบ” ได้)";
    } else {
      // เผื่อมีกรณีลองกดซ้ำ
      quizState.msg[q.id] = `❌ คุณตอบผิด (พยายาม ${tries} ครั้ง)`;
    }
  }

  renderQuiz(panel);
}

