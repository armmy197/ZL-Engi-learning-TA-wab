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
  attempts: {},
  solved: {},
  revealed: {},
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

  const type = q.type || "text";

  let answerUI = "";

  if(type === "choice"){
    answerUI = q.choices.map((c, i)=>`
      <label style="display:flex;gap:8px;margin:6px 0;cursor:pointer">
        <input type="radio" name="quizChoice" value="${i}"
          ${isSolved ? "disabled" : ""}>
        <span>${escapeHtml(c)}</span>
      </label>
    `).join("");
  }else{
    answerUI = `
      <input id="quizAnswer" class="input"
        placeholder="พิมพ์คำตอบของคุณ"
        ${isSolved ? "disabled" : ""} />
    `;
  }

  panel.innerHTML = `
    <div class="small muted">ข้อ ${quizState.index+1}/${quizState.items.length}</div>
    <div style="font-size:18px;margin-top:6px">${escapeHtml(q.question)}</div>

    ${q.content ? `<div class="muted" style="margin-top:6px">${escapeHtml(q.content)}</div>` : ""}

    ${q.imageUrl ? `
      <img src="${escapeHtml(q.imageUrl)}"
        style="max-width:100%;margin:10px 0;border-radius:12px">
    ` : ""}

    <div style="margin-top:10px">${answerUI}</div>

    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="btnCheck" class="btn btn-primary"
        ${isSolved ? "disabled" : ""}>
        ตรวจคำตอบ
      </button>

      ${(!isSolved && tries >= 2)
        ? `<button id="btnShowAnswer" class="btn btn-secondary">ดูเฉลย</button>`
        : ""}
    </div>

    <div id="quizMsg" class="small muted" style="margin-top:8px"></div>

    <div style="display:flex;justify-content:space-between;margin-top:12px">
      <button id="btnPrev" class="btn btn-ghost"
        ${quizState.index === 0 ? "disabled" : ""}>
        ⏮️ กลับ
      </button>

      <button id="btnNext" class="btn btn-ghost"
        ${canGoNext ? "" : "disabled"}>
        ถัดไป ⏭️
      </button>
    </div>
  `;

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

  if(!isSolved && tries >= 2){
    qs("#btnShowAnswer")?.addEventListener("click", ()=>{
      quizState.revealed[q.id] = true;
      const ans = q.explain || q.answerText || q.answer || "";
      qs("#quizMsg").innerHTML = `📘 เฉลย: <b>${escapeHtml(ans)}</b>`;
      renderQuiz(panel);
    });
  }

  if(isSolved){
    qs("#quizMsg").innerHTML = "✅ ถูกต้อง";
    qs("#quizMsg").style.color = "rgba(241,210,138,.95)";
  }
}

function checkAnswer(q, panel, type){
  let correct = false;

  if(type === "choice"){
    const sel = document.querySelector("input[name=quizChoice]:checked");
    if(!sel){
      toast("กรุณาเลือกคำตอบก่อน");
      return;
    }
    correct = Number(sel.value) === Number(q.correctIndex);
  }else{
    const input = qs("#quizAnswer")?.value.trim();
    if(!input){
      toast("กรุณากรอกคำตอบก่อน");
      return;
    }
    const ans = (q.answerText || q.answer || "").trim();
    correct = input === ans;
  }

  quizState.attempts[q.id] = (quizState.attempts[q.id] || 0) + 1;

  if(correct){
    quizState.solved[q.id] = true;
    renderQuiz(panel);
  }else{
    renderQuiz(panel);
  }
}
