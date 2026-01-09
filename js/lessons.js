import { db } from "./firebase.js";
import { qs, escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { refreshStudentFromDB } from "./student.js";

import {
  doc, getDoc, getDocs, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export async function renderLessons(){
  const panel = qs("#lessonsPanel");

  if(state.role !== "student"){
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }

  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student.courseId;
  const courseSnap = await getDoc(doc(db, "courses", courseId));
  const course = courseSnap.exists() ? courseSnap.data() : null;

  const unlocked = !!course?.lessonOpen || !!state.student.courseEnded;
  if(!unlocked){
    panel.innerHTML = `<div class="muted">ยังไม่ปลดล็อกบทเรียน</div>`;
    return;
  }

  const qy = query(
    collection(db, "courses", courseId, "lessons"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(qy);

  const lessons = [];
  snap.forEach(d=> lessons.push({ id:d.id, ...d.data() }));

  if(!lessons.length){
    panel.innerHTML = `<div class="muted">ยังไม่มีบทเรียนในคอร์สนี้</div>`;
    return;
  }

  panel.innerHTML = lessons.map(l=>`
    <div class="card" style="margin:10px 0">
      <div style="font-weight:700">${escapeHtml(l.title)}</div>
      <button class="btn btn-secondary" data-go-quiz="${l.id}" style="margin-top:8px">
        ทำแบบฝึกหัดบทนี้
      </button>
    </div>
  `).join("");

  panel.querySelectorAll("[data-go-quiz]").forEach(btn=>{
    btn.onclick = ()=>{
      state.selectedLessonId = btn.dataset.goQuiz;
      document.querySelector('[data-route="student-quizzes"]').click();
    };
  });
}
