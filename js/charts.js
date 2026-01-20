// charts.js — simple stats (no complex chart required)
import { db, authReady } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ใส่ค่าลง DOM แบบไม่พังถ้า element ไม่มี
function setText(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
}

export async function renderHomeStatsAndChart() {
  await authReady;

  // default
  setText("statTotalStudents", "—");
  setText("statLiveNow", "—");
  setText("statTotalCourses", "—");

  // 1) คอร์สทั้งหมด (courses read: true)
  try {
    const coursesSnap = await getDocs(collection(db, "courses"));
    setText("statTotalCourses", String(coursesSnap.size));
  } catch (e) {
    console.warn("statTotalCourses error:", e?.code, e?.message);
    setText("statTotalCourses", "N/A");
  }

  // 2) ผู้เรียนทั้งหมด + ผู้เรียนเข้าร่วมเรียนสด
  // อ่านจาก public_stats/summary เพื่อให้ผู้เรียนทั่วไปเห็นได้
  try {
    const summaryRef = doc(db, "public_stats", "summary");
    const summarySnap = await getDoc(summaryRef);

    if (!summarySnap.exists()) {
      // ยังไม่สร้างเอกสาร summary
      setText("statTotalStudents", "N/A");
      setText("statLiveNow", "N/A");
      return;
    }

    const data = summarySnap.data() || {};
    const totalStudents = Number.isFinite(data.totalStudents) ? data.totalStudents : null;
    const liveJoined = Number.isFinite(data.liveJoined) ? data.liveJoined : null;

    setText("statTotalStudents", totalStudents == null ? "N/A" : String(totalStudents));
    setText("statLiveNow", liveJoined == null ? "N/A" : String(liveJoined));

  } catch (e) {
    console.warn("public_stats summary error:", e?.code, e?.message);
    // ถ้า rules ยังไม่ให้ ก็จะ N/A
    setText("statTotalStudents", "N/A");
    setText("statLiveNow", "N/A");
  }

  // *** หมายเหตุ:
  // คุณมี <canvas id="studentsChart"> ในหน้า Home :contentReference[oaicite:3]{index=3}
  // ถ้าตอนนี้อยากแค่ให้สถิติ 3 ตัวขึ้นก่อน ยังไม่จำเป็นต้องวาดกราฟ
}
