import { db, authReady, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  collectionGroup,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/**
 * คาดหวัง element เหล่านี้ (ถ้าไม่มี จะไม่พัง แค่ข้าม)
 * - #statCourses
 * - #statLessons
 * - #statQuizzes
 * - #statStudents
 * - #statsNote (optional)
 */

function setText(id, text) {
  const el = document.querySelector(id);
  if (el) el.textContent = text;
}

function setNote(text) {
  const el = document.querySelector("#statsNote");
  if (el) el.textContent = text;
}

async function countDocsFromCollection(colPath) {
  const snap = await getDocs(collection(db, colPath));
  return snap.size;
}

async function countDocsFromCollectionGroup(groupName) {
  const snap = await getDocs(collectionGroup(db, groupName));
  return snap.size;
}

async function getPublicTotalStudents() {
  // เอกสารสรุปสำหรับผู้เรียนทั่วไป (อ่านได้ทุกคน)
  // path: /public_stats/summary  field: totalStudents
  const ref = doc(db, "public_stats", "summary");
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return Number.isFinite(data.totalStudents) ? data.totalStudents : null;
}

async function countStudentsAdminOnly() {
  // students read ได้เฉพาะ admin ตาม rules
  const snap = await getDocs(collection(db, "students"));
  return snap.size;
}

export async function renderHomeStatsAndChart() {
  await authReady;

  // ค่าเริ่มต้น
  setText("#statCourses", "—");
  setText("#statLessons", "—");
  setText("#statQuizzes", "—");
  setText("#statStudents", "—");
  setNote("");

  // 1) Courses (read: true)
  try {
    const nCourses = await countDocsFromCollection("courses");
    setText("#statCourses", String(nCourses));
  } catch (e) {
    console.warn("stats courses error:", e?.code || "", e?.message || e);
    setText("#statCourses", "N/A");
  }

  // 2) Lessons (ถ้าคุณเก็บ nested ใต้ courses ใช้ collectionGroup ได้)
  try {
    const nLessons = await countDocsFromCollectionGroup("lessons");
    setText("#statLessons", String(nLessons));
  } catch (e) {
    // ถ้า rules ยังไม่ครอบคลุม nested จะโดน permission-denied
    console.warn("stats lessons error:", e?.code || "", e?.message || e);
    setText("#statLessons", "N/A");
  }

  // 3) Quizzes
  try {
    const nQuizzes = await countDocsFromCollectionGroup("quizzes");
    setText("#statQuizzes", String(nQuizzes));
  } catch (e) {
    console.warn("stats quizzes error:", e?.code || "", e?.message || e);
    setText("#statQuizzes", "N/A");
  }

  // 4) Students total
  // - ถ้าล็อกอินอยู่: ลองนับจาก students (admin)
  // - ถ้าไม่ได้ล็อกอิน/อ่านไม่ได้: fallback ไป public_stats/summary
  const isLoggedIn = !!auth.currentUser;

  if (isLoggedIn) {
    try {
      const nStudents = await countStudentsAdminOnly();
      setText("#statStudents", String(nStudents));
      return;
    } catch (e) {
      // ถ้าล็อกอินแต่ไม่ใช่ admin (ตามนิยาม rules คุณ: isAdmin=auth!=null จริงๆ ก็เป็น admin)
      // แต่ถ้ามี AppCheck/Rule mismatch ก็อาจพังได้
      console.warn("stats students(admin) error:", e?.code || "", e?.message || e);
    }
  }

  // fallback สำหรับผู้เรียนทั่วไป
  try {
    const total = await getPublicTotalStudents();
    if (total == null) {
      setText("#statStudents", "N/A");
      setNote("ยังไม่มี public_stats/summary หรือยังไม่ได้ตั้งค่า totalStudents");
    } else {
      setText("#statStudents", String(total));
    }
  } catch (e) {
    console.warn("stats students(public) error:", e?.code || "", e?.message || e);
    setText("#statStudents", "N/A");
  }
}
