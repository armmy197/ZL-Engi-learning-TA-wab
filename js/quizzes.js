import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";
import { toast, setActiveRoute } from "./ui.js";
import { renderLessons } from "./lessons.js";

import {
  doc, getDoc, getDocs, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

function normalizeMediaUrl(url){
  if(!url) return "";
  let u = String(url).trim();
  // Convert GitHub "blob" links to raw links so audio works everywhere
  // Example: https://github.com/user/repo/blob/main/path/file.mp3
  //      -> https://raw.githubusercontent.com/user/repo/main/path/file.mp3
  try{
    if(u.includes("github.com/") && u.includes("/blob/")){
      const m = u.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/);
      if(m){
        u = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
      }
    }
    // If they used "?raw=1" keep it; browsers generally handle it fine.
    // Force https for safety if scheme missing or http
    if(u.startsWith("http://")) u = "https://" + u.slice("http://".length);
  }catch(e){}
  return u;
}

let quizState = {
  index: 0,
  attempts: {},   // { [quizId]: number }
  solved: {},     // { [quizId]: true }
  revealed: {},   // { [quizId]: true }
  msg: {},        // { [quizId]: string }
  items: []
};

function getQuizLSKey(courseId, lessonId){
  const sid = state?.student?.id || "student";
  return `quiz_state_v2:${sid}:${courseId}:${lessonId}`;
}

function loadQuizLocalState(courseId, lessonId){
  try{
    const raw = localStorage.getItem(getQuizLSKey(courseId, lessonId));
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}

function saveQuizLocalState(courseId, lessonId){
  try{
    const payload = {
      attempts: quizState.attempts || {},
      solved: quizState.solved || {},
      revealed: quizState.revealed || {}
    };
    localStorage.setItem(getQuizLSKey(courseId, lessonId), JSON.stringify(payload));
  }catch(e){}
}


export async function renderQuizzes(){
  const panel = qs("#quizPanel");

  if(state.role !== "student"){
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }

  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student.courseId;
  const lessonId = state.selectedLessonId;
  quizState._courseId = courseId;
  quizState._lessonId = lessonId;
  // restore attempts/solved/revealed per student+course+lesson
  const saved = loadQuizLocalState(courseId, lessonId);
  if(saved){
    quizState.attempts = saved.attempts || {};
    quizState.solved = saved.solved || {};
    quizState.revealed = saved.revealed || {};
  } else {
    quizState.attempts = {};
    quizState.solved = {};
    quizState.revealed = {};
  }


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
  const isLast = quizState.index === quizState.items.length - 1;

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

    ${q.audioUrl ? `
      <div style="margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px">
        <audio id="quizAudio" preload="none" playsinline
          style="width:100%;display:none"
          controlsList="nodownload noplaybackrate"
          src="${escapeHtml(normalizeMediaUrl(q.audioUrl))}"></audio>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button id="btnAudioToggle" class="btn btn-secondary">▶️ เล่นเสียง</button>
          <button id="btnSpeedDown" class="btn btn-ghost">− Speed</button>
          <span id="audioRate" class="small muted" style="min-width:52px;text-align:center">1.0x</span>
          <button id="btnSpeedUp" class="btn btn-ghost">+ Speed</button>
        </div>

        <div class="small muted" style="margin-top:6px">
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

    <div style="display:flex;justify-content:space-between;margin-top:12px;gap:8px;align-items:center">
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

// ----- message (FIXED) -----
const msgEl = qs("#quizMsg");
msgEl.style.color = "rgba(255,255,255,.9)";

if (quizState.solved[q.id]) {
  msgEl.innerHTML = "✅ ตอบถูก";
  msgEl.style.color = "rgba(241,210,138,.95)";
} 
else if (quizState.revealed[q.id]) {
  // แยก "เฉลยคำตอบ" และ "คำอธิบายเฉลย"
  let answer = "";
  let explainText = "";

  if (type === "choice") {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const ci = Number.isFinite(Number(q.correctIndex)) ? Number(q.correctIndex) : -1;
    answer =
      (choices[ci] && String(choices[ci]).trim()) ||
      (q.answerText && String(q.answerText).trim()) ||
      (q.answer && String(q.answer).trim()) ||
      (q.explain && String(q.explain).trim()) || // legacy (บางชุดเอาเฉลยไว้ใน explain)
      "(ไม่มีเฉลย)";
    explainText = (q.explain && String(q.explain).trim()) || "";
  } else {
    answer =
      (q.answerText && String(q.answerText).trim()) ||
      (q.answer && String(q.answer).trim()) ||
      (q.explain && String(q.explain).trim()) || // legacy
      "(ไม่มีเฉลย)";
    explainText =
      (q.explainText && String(q.explainText).trim()) ||
      ""; // อธิบายเฉลยสำหรับพิมพ์ตอบ
  }

  msgEl.innerHTML = `
    <div>📘 เฉลยคำตอบ:</div>
    <b style="font-size:22px; line-height:1.4;">${escapeHtml(answer)}</b>
    ${explainText ? `<div class="muted" style="margin-top:8px">📝 ${escapeHtml(explainText)}</div>` : ``}
  `;
}
else if (quizState.msg[q.id]) {
  msgEl.innerHTML = quizState.msg[q.id];
}
else {
  msgEl.innerHTML = "";
}

// ถ้าข้อสุดท้าย และผ่านเงื่อนไขไปต่อได้ -> แจ้งเตือนให้กดเสร็จสิ้น
if (isLast && canGoNext) {
  msgEl.innerHTML = "🎉 ทำครบทุกข้อแล้ว กด <b>เสร็จสิ้น</b> เพื่อกลับไปหน้าเมนูบทเรียน";
  msgEl.style.color = "rgba(241,210,138,.95)";
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

  qs("#btnFinish")?.addEventListener("click", async ()=>{
    // ทำครบทุกข้อแล้ว -> กลับไปหน้าเมนูบทเรียน
    toast("✅ ทำแบบฝึกหัดครบแล้ว");
    setActiveRoute("student-lessons");
    await renderLessons();
  });

  qs("#btnShowAnswer")?.addEventListener("click", ()=>{
    quizState.revealed[q.id] = true;
    saveQuizLocalState(quizState._courseId, quizState._lessonId);
    renderQuiz(panel);
  });

  // ----- audio controls (play + speed) -----
  const audioEl = qs("#quizAudio");
  const btnToggle = qs("#btnAudioToggle");
  const btnDown = qs("#btnSpeedDown");
  const btnUp = qs("#btnSpeedUp");
  const rateEl = qs("#audioRate");

  if(audioEl && btnToggle && btnDown && btnUp && rateEl){
    // init rate
    let rate = Number(audioEl.playbackRate || 1) || 1;
    const clamp = (v)=> Math.max(0.5, Math.min(2.0, v));
    const renderRate = ()=>{
      rateEl.textContent = `${rate.toFixed(1)}x`;
    };
    const syncBtn = ()=>{
      btnToggle.textContent = audioEl.paused ? "▶️ เล่นเสียง" : "⏸️ หยุดเสียง";
    };

    audioEl.playbackRate = rate;
    renderRate();
    syncBtn();

    btnToggle.addEventListener("click", async ()=>{
      try{
        if(audioEl.paused){
          await audioEl.play(); // requires user gesture (this click)
        }else{
          audioEl.pause();
        }
        syncBtn();
      }catch(err){
        console.error(err);
        toast("เล่นเสียงไม่ได้: ตรวจสอบว่าเป็นลิงก์ไฟล์ .mp3 แบบ raw และเปิดผ่าน https");
      }
    });

    btnDown.addEventListener("click", ()=>{
      rate = clamp(rate - 0.1);
      audioEl.playbackRate = rate;
      renderRate();
    });

    btnUp.addEventListener("click", ()=>{
      rate = clamp(rate + 0.1);
      audioEl.playbackRate = rate;
      renderRate();
    });

    audioEl.addEventListener("play", syncBtn);
    audioEl.addEventListener("pause", syncBtn);
    audioEl.addEventListener("ended", syncBtn);
  }

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

  
  // เงื่อนไขตามที่ต้องการ:
  // - ข้อ "พิมพ์ตอบ" (type=text) เมื่อผู้เรียนทำครบ 2 ครั้ง (tries >= 2)
  //   ให้แสดงเฉลย + คำอธิบายเฉลยอัตโนมัติ (ไม่ต้องกดปุ่ม)
  if(type !== "choice" && tries >= 2){
    quizState.revealed[q.id] = true;
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

    saveQuizLocalState(quizState._courseId, quizState._lessonId);

renderQuiz(panel);
}
