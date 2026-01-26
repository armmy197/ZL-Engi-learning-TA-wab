import { db } from "./firebase.js";
import { qs } from "./utils.js";
import { state, setRole } from "./state.js";
import { toast, closeModal, refreshRoleUI } from "./ui.js";

import {
  collection,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  setDoc,
  increment,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COL = "students";

// ---------- helpers: stats (public read) ----------
function todayId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function ensurePublicSummary() {
  const ref = doc(db, "public_stats", "summary");
  const snap = await getDoc(ref);
  if (snap.exists()) return { ref, data: snap.data() || {} };
  const init = { totalStudents: 0, liveJoined: 0, uniqueNames: [], updatedAt: new Date() };
  await setDoc(ref, init, { merge: true });
  return { ref, data: init };
}

async function bumpDaily(field, by = 1) {
  const dayId = todayId();
  // daily docs are stored at: public_stats/summary/daily/{YYYY-MM-DD}
  const dayRef = doc(db, "public_stats", "summary", "daily", dayId);
  // NOTE: Rules must allow write for students (or you must use Cloud Functions)
  await setDoc(
    dayRef,
    { dayId, [field]: increment(by), updatedAt: new Date() },
    { merge: true }
  );
}

function normalizeName(fullname) {
  return String(fullname || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ใช้ docId แบบคงที่: courseId + ชื่อ (กันชื่อซ้ำแบบไม่ต้อง query)
function makeStudentId(fullname, courseId) {
  const safeCourse = String(courseId || "").trim();
  const safeName = normalizeName(fullname)
    // กันอักขระที่เสี่ยงทำให้ path ผิด
    .replace(/[\\/#[\].$]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);

  return `${safeCourse}__${safeName || "unknown"}`;
}

async function markNewStudentIfUnique(fullname) {
  const { ref, data } = await ensurePublicSummary();
  const list = Array.isArray(data.uniqueNames) ? data.uniqueNames : [];
  const nameKey = String(fullname || "").trim();
  const already = list.includes(nameKey);
  if (already) return false;

  // keep list bounded (simple safety)
  const next = list.length > 3000 ? list.slice(-3000) : list.slice(0);
  next.push(nameKey);

  await setDoc(
    ref,
    {
      totalStudents: increment(1),
      uniqueNames: next,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  await bumpDaily("joinedCount", 1);
  return true;
}

async function bumpLiveJoinedOnce() {
  const ref = doc(db, "public_stats", "summary");
  await setDoc(ref, { liveJoined: increment(1), updatedAt: new Date() }, { merge: true });
  await bumpDaily("liveCount", 1);
}

// ---------- API ----------
export async function studentJoinFlow() {
  const fullname = qs("#studentFullname").value.trim();
  const consent = qs("#studentConsent").checked;
  const courseId = qs("#studentCourseSelect").value;

  if (!fullname) {
    toast("กรุณากรอกชื่อ–นามสกุล");
    return;
  }
  if (!consent) {
    toast("กรุณาติ๊กยินยอมเข้าร่วมเรียน");
    return;
  }
  if (!courseId) {
    toast("ยังไม่มีคอร์สให้เลือก");
    return;
  }

  const payload = {
    fullname,
    courseId,
    joinedAt: new Date(),
    liveJoined: false,
    courseEnded: false,
    unlockedAt: null,
  };

  // ✅ กันชื่อซ้ำแบบไม่ต้อง query (แก้ permission-denied)
  const studentId = makeStudentId(fullname, courseId);

  // ถ้ามีอยู่แล้วจะเป็น update (merge) / ถ้าไม่มีจะเป็น create
  await setDoc(doc(db, COL, studentId), payload, { merge: true });
  state.student = { id: studentId, ...payload };

  // ✅ เพิ่มสถิติแบบกันชื่อซ้ำด้วย uniqueNames (ถ้า Rules ไม่ให้ write จะถูก catch)
  try {
    await markNewStudentIfUnique(`${courseId}__${normalizeName(fullname)}`);
  } catch (e) {
    console.warn("update public stats failed:", e?.code, e?.message);
  }

  setRole("student");
  state.selectedCourseId = courseId;

  closeModal("studentJoinModal");
  refreshRoleUI();
  toast("เข้าสู่ระบบผู้เรียนแล้ว");

  // ✅ เด้งไปหน้าเข้าร่วมเรียนสดทันที
  try {
    const { setActiveRoute } = await import("./ui.js");
    const { renderLivePanel } = await import("./live.js");
    setActiveRoute("student-live");
    await renderLivePanel();
  } catch (_) {
    // ignore
  }
}

export async function markStudentLiveJoined(studentId) {
  // ✅ ไม่อ่าน students (กัน permission-denied)
  // ใช้ localStorage กันนับซ้ำในเครื่องเดิม
  const key = `liveJoined_${studentId}`;
  const was = localStorage.getItem(key) === "1";

  try {
    await updateDoc(doc(db, COL, studentId), { liveJoined: true, liveJoinedAt: new Date() });
  } catch (e) {
    // ถ้า Rules ไม่ให้ update students จะเข้ามาตรงนี้
    console.warn("update student liveJoined failed:", e?.code, e?.message);
  }

  state.student.liveJoined = true;
  localStorage.setItem(key, "1");

  // bump public stats only on first join (ตาม localStorage)
  if (!was) {
    try {
      await bumpLiveJoinedOnce();
    } catch (e) {
      console.warn("bump liveJoined failed:", e?.code, e?.message);
    }
  }
}

export async function refreshStudentFromDB() {
  if (!state.student?.id) return;
  try {
    const snap = await getDoc(doc(db, COL, state.student.id));
    if (!snap.exists()) return;
    state.student = { id: snap.id, ...snap.data() };
  } catch (e) {
    // ถ้า Rules ไม่ให้ read students: ใช้ state.student เดิมต่อ
    console.warn("refreshStudentFromDB failed:", e?.code, e?.message);
  }
}
