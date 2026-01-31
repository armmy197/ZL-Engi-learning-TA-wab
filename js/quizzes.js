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
// State
// -----------------------------
let quizState = {
  index: 0,
  attempts: {},
  solved: {},
  revealed: {},
  msg: {},
  items: [],
};

let _activeAudioObjectUrl = null;

function cleanupAudioObjectUrl() {
  if (_activeAudioObjectUrl) {
    try { URL.revokeObjectURL(_activeAudioObjectUrl); } catch {}
    _activeAudioObjectUrl = null;
  }
}

// -----------------------------
// Audio UI with speed controls
// -----------------------------
function buildAudioUI(containerEl, audioUrl) {
  containerEl.innerHTML = "";
  cleanupAudioObjectUrl();
  if (!audioUrl) return;

  const wrap = document.createElement("div");
  wrap.style.marginTop = "6px";
  wrap.style.userSelect = "none";

  const btnLoad = document.createElement("button");
  btnLoad.className = "btn btn-secondary";
  btnLoad.textContent = "🔊 โหลดเสียง";

  const status = document.createElement("div");
  status.className = "muted small";
  status.style.marginTop = "6px";
  status.textContent = "กดโหลดเสียงก่อน";

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "none";
  audio.style.width = "100%";
  audio.setAttribute("controlsList", "nodownload");
  audio.addEventListener("contextmenu", e => e.preventDefault());

  // speed controls
  const speedWrap = document.createElement("div");
  speedWrap.style.marginTop = "8px";
  speedWrap.style.display = "flex";
  speedWrap.style.gap = "6px";

  const speedLabel = document.createElement("span");
  speedLabel.className = "small muted";
  speedLabel.textContent = "สปีด: 1x";

  function setSpeed(v) {
    audio.playbackRate = v;
    speedLabel.textContent = `สปีด: ${v}x`;
  }

  const btnSlow = document.createElement("button");
  btnSlow.className = "btn btn-ghost";
  btnSlow.textContent = "➖";
  btnSlow.onclick = () => setSpeed(0.75);

  const btnNormal = document.createElement("button");
  btnNormal.className = "btn btn-ghost";
  btnNormal.textContent = "1x";
  btnNormal.onclick = () => setSpeed(1);

  const btnFast = document.createElement("button");
  btnFast.className = "btn btn-ghost";
  btnFast.textContent = "➕";
  btnFast.onclick = () => setSpeed(1.5);

  speedWrap.append(btnSlow, btnNormal, btnFast, speedLabel);

  btnLoad.onclick = async () => {
    btnLoad.disabled = true;
    btnLoad.textContent = "กำลังโหลด...";
    status.textContent = "⏳ โหลดเสียง...";

    try {
      const res = await fetch(audioUrl);
      const blob = await res.blob();
      cleanupAudioObjectUrl();
      const objUrl = URL.createObjectURL(blob);
      _activeAudioObjectUrl = objUrl;

      audio.src = objUrl;
      audio.load();

      status.textContent = "✅ พร้อมเล่น";
      btnLoad.textContent = "โหลดแล้ว";
    } catch {
      status.textContent = "⚠ โหลดเสียงไม่สำเร็จ";
      btnLoad.disabled = false;
      btnLoad.textContent = "🔊 โหลดเสียง";
    }
  };

  wrap.append(btnLoad, status, audio, speedWrap);
  containerEl.appendChild(wrap);
}

// -----------------------------
// Main render
// -----------------------------
export async function renderQuizzes() {
  const panel = qs("#quizPanel");
  await refreshStudentFromDB();

  const courseId = state.selectedCourseId;
  const lessonId = state.selectedLessonId;

  if (!courseId || !lessonId) {
    panel.innerHTML = "เลือกคอร์ส/บทเรียนก่อน";
    return;
  }

  const qy = query(
    collection(db, "courses", courseId, "lessons", lessonId, "quizzes"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(qy);

  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));

  quizState = { index: 0, attempts: {}, solved: {}, revealed: {}, msg: {}, items };
  renderQuiz(panel);
}

function renderQuiz(panel) {
  const q = quizState.items[quizState.index];
  const isLast = quizState.index === quizState.items.length - 1;
  const canGoNext = quizState.solved[q.id] || quizState.revealed[q.id];

  panel.innerHTML = `
    <div>ข้อ ${quizState.index + 1}/${quizState.items.length}</div>
    <div style="font-size:18px">${escapeHtml(q.question || "")}</div>
    <div id="audioBox"></div>

    <input id="quizAnswer" class="input" placeholder="คำตอบ">

    <button id="btnCheck" class="btn btn-primary">ตรวจคำตอบ</button>
    <button id="btnShow" class="btn btn-secondary">ดูเฉลย</button>

    <div id="quizMsg" class="small"></div>

    <div style="margin-top:10px">
      ${isLast
        ? `<button id="btnFinish" class="btn btn-primary" ${canGoNext ? "" : "disabled"}>เสร็จสิ้น</button>`
        : `<button id="btnNext" class="btn btn-ghost" ${canGoNext ? "" : "disabled"}>ถัดไป</button>`
      }
    </div>
  `;

  buildAudioUI(qs("#audioBox"), q.audioUrl);

  qs("#btnCheck").onclick = () => {
    const ans = qs("#quizAnswer").value.trim();
    if (ans === q.answerText) {
      quizState.solved[q.id] = true;
      qs("#quizMsg").innerHTML = "✅ ถูกต้อง";
    } else {
      qs("#quizMsg").innerHTML = "❌ ผิด";
    }
    renderQuiz(panel);
  };

  qs("#btnShow").onclick = () => {
    quizState.revealed[q.id] = true;
    qs("#quizMsg").innerHTML =
      `เฉลย: ${escapeHtml(q.answerText)}<br>` +
      (q.explain ? `คำอธิบาย: ${escapeHtml(q.explain)}` : "");
  };

  qs("#btnNext")?.addEventListener("click", () => {
    quizState.index++;
    renderQuiz(panel);
  });

  qs("#btnFinish")?.addEventListener("click", async () => {
    toast("เสร็จสิ้นแบบฝึกหัด");
    setActiveRoute("student-lessons");
    await renderLessons();
  });
}

window.addEventListener("beforeunload", cleanupAudioObjectUrl);
