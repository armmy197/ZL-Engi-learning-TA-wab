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

  quizState = { index:0, attempts:{}, items };
  renderQuiz(panel);
}

function renderQuiz(panel){
  const q = quizState.items[quizState.index];
  const tries = quizState.attempts[q.id] || 0;

  panel.innerHTML = `
    <div class="small muted">ข้อ ${quizState.index+1}/${quizState.items.length}</div>
    <div style="font-size:18px;margin-top:6px">${escapeHtml(q.question)}</div>

    ${q.imageUrl ? `<img src="${escapeHtml(q.imageUrl)}" style="max-width:100%;margin:10px 0;border-radius:12px">` : ""}

    <input id="quizAnswer" class="input" placeholder="พิมพ์คำตอบของคุณ"/>

    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="btnCheck" class="btn btn-primary">ตรวจคำตอบ</button>
      ${tries >= 2 ? `<button id="btnShowAnswer" class="btn btn-secondary">ดูเฉลย</button>` : ""}
    </div>

    <div id="quizMsg" class="small muted" style="margin-top:8px"></div>

    <div style="display:flex;justify-content:space-between;margin-top:12px">
      <button id="btnPrev" class="btn btn-ghost">⏮️ กลับ</button>
      <button id="btnNext" class="btn btn-ghost">ถัดไป ⏭️</button>
    </div>
  `;

  qs("#btnCheck").onclick = ()=>checkAnswer(q);
  qs("#btnPrev").onclick = ()=>{ if(quizState.index>0){ quizState.index--; renderQuiz(panel);} };
  qs("#btnNext").onclick = ()=>{ if(quizState.index<quizState.items.length-1){ quizState.index++; renderQuiz(panel);} };

  if(tries >= 2){
    qs("#btnShowAnswer").onclick = ()=>{
      qs("#quizMsg").innerHTML = `❌ เฉลย: <b>${escapeHtml(q.answer)}</b>`;
    };
  }
}

function checkAnswer(q){
  const input = qs("#quizAnswer").value.trim();
  const msg = qs("#quizMsg");

  quizState.attempts[q.id] = (quizState.attempts[q.id] || 0) + 1;

  if(input === q.answer){
    msg.innerHTML = "✅ ถูกต้อง";
    msg.style.color = "rgba(241,210,138,.95)";
  }else{
    const t = quizState.attempts[q.id];
    msg.innerHTML = t < 2
      ? `❌ ผิด ครั้งที่ ${t}`
      : `❌ ผิดครบ 2 ครั้ง สามารถดูเฉลยได้`;
    msg.style.color = "rgba(255,170,170,.95)";
  }
}
