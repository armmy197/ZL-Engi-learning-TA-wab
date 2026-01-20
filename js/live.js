// live.js — open Google Meet in new tab (no floating popup)

import { db } from "./firebase.js";
import { state } from "./state.js";
import { toast } from "./ui.js";
import { markStudentLiveJoined, refreshStudentFromDB } from "./student.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COURSES = "courses";

/** fallback qs */
function qsLocal(sel, root = document) {
  return root.querySelector(sel);
}

let qs = qsLocal;
try {
  const mod = await import("./utils.js");
  if (typeof mod.qs === "function") qs = mod.qs;
} catch (e) {
  // ignore
}

export function bindLiveUI() {
  // keep for compatibility
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

  if (isStudent) {
    // ผู้เรียนส่วนใหญ่ไม่ได้ Firebase Auth => /students read อาจโดน deny
    // ไม่ให้เด้ง error/Uncaught
    try {
      await refreshStudentFromDB();
    } catch (e) {
      console.warn("refreshStudentFromDB skipped:", e?.code || e);
    }
  }

  const courseId =
    state.selectedCourseId ||
    state.student?.courseId ||
    state.admin?.selectedCourseId;

  if (!courseId) {
    panel.innerHTML = `<div class="muted">ยังไม่ได้เลือกคอร์ส</div>`;
    return;
  }

  let course = null;
  try {
    const courseSnap = await getDoc(doc(db, COURSES, courseId));
    course = courseSnap.exists() ? courseSnap.data() : null;
  } catch (e) {
    panel.innerHTML = `<div class="muted">โหลดคอร์สไม่สำเร็จ (${e?.code || "error"})</div>`;
    return;
  }

  if (!course) {
    panel.innerHTML = `<div class="muted">ไม่พบคอร์ส</div>`;
    return;
  }

  let joined = false;
  if (isStudent) {
    joined = !!state.student?.liveJoined;
  } else if (isAdmin) {
    joined = localStorage.getItem(`admin_live_${courseId}`) === "1";
  }

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-weight:700;font-size:18px">${course.name || ""}</div>
        <div class="small muted">สถานะเรียนสด: ${joined ? "เข้าร่วมแล้ว" : "ยังไม่เข้าร่วม"}</div>
        <div class="small muted">ปลดล็อกเอกสาร/แบบฝึกหัดเมื่อ: แอดมินประกาศ “จบคอร์ส”</div>
      </div>
      <div>
        <button id="btnOpenLiveTab" class="btn btn-secondary">เรียนสดด้วย Meet</button>
      </div>
    </div>
  `;

  const meetUrl = (course.meetUrl || "").trim();

  qs("#btnOpenLiveTab")?.addEventListener("click", async () => {
    if (!meetUrl) {
      toast("คอร์สนี้ยังไม่มีลิงก์ Google Meet");
      return;
    }

    if (isStudent && !state.student?.liveJoined) {
      try {
        if (state.student?.id) {
          await markStudentLiveJoined(state.student.id);
        }
        toast("บันทึกสถานะเข้าร่วมเรียนสดแล้ว");
      } catch (e) {
        // ✅ ถ้า rules deny (update students) ให้ยังเปิด Meet ได้ตามปกติ
        if (e?.code === "permission-denied") {
          console.warn("markStudentLiveJoined denied:", e?.message || e);
          toast("เปิด Meet ได้ แต่บันทึกสถานะไม่ได้ (สิทธิ์ไม่พอ)");
        } else {
          console.error("markStudentLiveJoined error:", e);
          toast("เปิด Meet ได้ แต่บันทึกสถานะล้มเหลว");
        }
      }
    }

    if (isAdmin) {
      localStorage.setItem(`admin_live_${courseId}`, "1");
    }

    window.open(meetUrl, "_blank", "noopener,noreferrer");
    await renderLivePanel();
  });
}
