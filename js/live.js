// live.js (REWRITE) — No popup/liveFloat, only open Google Meet in new tab

import { db } from "./firebase.js";
import { state } from "./state.js";
import { toast } from "./ui.js";
import { markStudentLiveJoined, refreshStudentFromDB } from "./student.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COURSES = "courses";

/**
 * Fallback qs (กันกรณี utils.js มีปัญหา import แล้วเว็บพัง)
 * ถ้าคุณมั่นใจว่า utils.js ถูกแน่นอน จะลบส่วนนี้ได้
 */
function qsLocal(sel, root = document) {
  return root.querySelector(sel);
}

// พยายามใช้ qs จาก utils.js ถ้า import ได้ (ไม่ทำให้พังถ้า import มีปัญหา)
let qs = qsLocal;
try {
  // dynamic import เพื่อกันหน้าแตกเวลา path/export ผิด
  const mod = await import("./utils.js");
  if (typeof mod.qs === "function") qs = mod.qs;
} catch (e) {
  // ใช้ fallback qsLocal ต่อไป
}

export function bindLiveUI() {
  // เวอร์ชันใหม่: ไม่ต้อง bind ปุ่ม popup แล้ว
  // เหลือไว้เพื่อไม่ให้ app.js ที่เรียก bindLiveUI() พัง
  // (ทำให้เรียกได้แต่ไม่ทำอะไร)
}

/**
 * แสดง panel เข้าเรียนสด (สำหรับ role student)
 * - ปุ่มเดียว: "เรียนสดด้วย Meet"
 * - กดแล้ว: บันทึกสถานะเข้าร่วม (ถ้ายังไม่ joined) แล้วเปิด Meet ในแท็บใหม่
 */
export async function renderLivePanel() {
  const panel = qs("#livePanel");
  if (!panel) return;

  if (state.role !== "student") {
    panel.innerHTML = `<div class="muted">กรุณาเข้าสู่ระบบผู้เรียนก่อน</div>`;
    return;
  }

  await refreshStudentFromDB();

  const courseId = state.selectedCourseId || state.student?.courseId;
  if (!courseId) {
    panel.innerHTML = `<div class="muted">ยังไม่ได้เลือกคอร์ส</div>`;
    return;
  }

  const courseSnap = await getDoc(doc(db, COURSES, courseId));
  const course = courseSnap.exists() ? courseSnap.data() : null;

  if (!course) {
    panel.innerHTML = `<div class="muted">ไม่พบคอร์ส</div>`;
    return;
  }

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-weight:700;font-size:18px">${course.name || ""}</div>
        <div class="small muted">สถานะเรียนสด: ${state.student?.liveJoined ? "เข้าร่วมแล้ว" : "ยังไม่เข้าร่วม"}</div>
        <div class="small muted">ปลดล็อกเอกสาร/แบบฝึกหัดเมื่อ: แอดมินประกาศ “จบคอร์ส”</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="btnOpenLiveTab" class="btn btn-secondary">เรียนสดด้วย Meet</button>
      </div>
    </div>
  `;

  const meetUrl = (course.meetUrl || "").trim();

  const openMeet = async () => {
    if (!meetUrl) {
      toast("คอร์สนี้ยังไม่มีลิงก์ Google Meet");
      return;
    }

    // mark live joined (save to DB)
    if (!state.student?.liveJoined) {
      await markStudentLiveJoined(state.student.id);
      toast("บันทึกสถานะเข้าร่วมเรียนสดแล้ว");
      await renderLivePanel(); // refresh status text
    }

    window.open(meetUrl, "_blank", "noopener,noreferrer");
  };

  const btn = qs("#btnOpenLiveTab");
  if (btn) btn.addEventListener("click", openMeet);
}
