// live.js — Student Live join (NO Firestore write for students)
// Student: mark joined in state + localStorage only
// Admin: remember joined in localStorage (UI only)
// Course meetUrl read from Firestore (courses read allowed)

import { db } from "./firebase.js";
import { state } from "./state.js";
import { toast } from "./ui.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COURSES = "courses";

function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function bindLiveUI() {
  // compat
}

function getCourseIdForLive() {
  return (
    state.selectedCourseId ||
    state.student?.courseId ||
    state.admin?.selectedCourseId ||
    null
  );
}

function studentKey(courseId) {
  return `student_live_${courseId}`;
}

function adminKey(courseId) {
  return `admin_live_${courseId}`;
}

export async function renderLivePanel() {
  const panel = qs("#livePanel");
  if (!panel) return;

  const isStudent = state.role === "student";
  const isAdmin = state.role === "admin";

  if (!isStudent && !isAdmin) {
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบก่อน</div>`;
    return;
  }

  const courseId = getCourseIdForLive();
  if (!courseId) {
    panel.innerHTML = `<div class="muted">ยังไม่ได้เลือกคอร์ส</div>`;
    return;
  }

  // Load course
  let course = null;
  try {
    const snap = await getDoc(doc(db, COURSES, courseId));
    course = snap.exists() ? snap.data() : null;
  } catch (e) {
    panel.innerHTML = `<div class="muted">โหลดคอร์สไม่สำเร็จ (${e?.code || "error"})</div>`;
    return;
  }

  if (!course) {
    panel.innerHTML = `<div class="muted">ไม่พบคอร์ส</div>`;
    return;
  }

  const meetUrl = (course.meetUrl || "").trim();

  // ✅ joined status (NO Firestore)
  let joined = false;
  if (isStudent) {
    joined =
      !!state.student?.liveJoined ||
      localStorage.getItem(studentKey(courseId)) === "1";
  } else {
    joined = localStorage.getItem(adminKey(courseId)) === "1";
  }

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-weight:700;font-size:18px">${course.name || ""}</div>
        <div class="small muted">สถานะเรียนสด: ${joined ? "เข้าร่วมแล้ว" : "ยังไม่เข้าร่วม"}</div>
        <div class="small muted">ผู้เรียนเปิด Meet ได้ทันที (ไม่ต้องบันทึกลง Firestore)</div>
      </div>
      <div>
        <button id="btnOpenLiveTab" class="btn btn-secondary">เรียนสดด้วย Meet</button>
      </div>
    </div>
  `;

  qs("#btnOpenLiveTab")?.addEventListener("click", async () => {
    if (!meetUrl) {
      toast("คอร์สนี้ยังไม่มีลิงก์ Google Meet");
      return;
    }

    // ✅ Student: mark joined locally only
    if (isStudent && !joined) {
      if (!state.student) state.student = {};
      state.student.liveJoined = true;
      state.student.liveJoinedAt = new Date();
      localStorage.setItem(studentKey(courseId), "1");
      toast("เข้าเรียนสดแล้ว");
    }

    // Admin: UI-only
    if (isAdmin && !joined) {
      localStorage.setItem(adminKey(courseId), "1");
    }

    window.open(meetUrl, "_blank", "noopener,noreferrer");
    await renderLivePanel();
  });
}
