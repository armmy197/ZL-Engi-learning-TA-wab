// charts.js — stats + simple line chart (Chart.js)
import { db, authReady } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ใส่ค่าลง DOM แบบไม่พังถ้า element ไม่มี
function setText(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
}

function getChart() {
  // Chart.js is loaded globally via CDN in index.html
  return window.Chart;
}

let _chartHome = null;
let _chartAdmin = null;

function destroyIf(chart) {
  try { chart?.destroy?.(); } catch (_) {}
}

async function loadDailySeries(maxDays = 14) {
  // public_stats/summary/daily/{YYYY-MM-DD} { joinedCount, liveCount }
  // NOTE: collection path must have odd segments; daily is a subcollection under public_stats/summary
  const snap = await getDocs(
    query(
      collection(db, "public_stats", "summary", "daily"),
      // NOTE: ใช้ __name__ แทน FieldPath.documentId() เพื่อเลี่ยงปัญหาในบาง build
      orderBy("__name__", "desc"),
      limit(maxDays)
    )
  );

  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));

  // reverse to oldest -> newest
  rows.sort((a, b) => String(a.dayId || a.id).localeCompare(String(b.dayId || b.id)));

  const labels = rows.map((r) => String(r.dayId || r.id));
  const joined = rows.map((r) => Number(r.joinedCount || 0));
  const live = rows.map((r) => Number(r.liveCount || 0));

  return { labels, joined, live };
}

function renderLineChart(canvasId, series, which = "both") {
  const Chart = getChart();
  const canvas = document.getElementById(canvasId);
  if (!Chart || !canvas) return null;

  const ctx = canvas.getContext("2d");
  const datasets = [];

  // ✅ white background + blue lines (2 datasets)
  if (which === "both" || which === "joined") {
    datasets.push({
      label: "ผู้เรียนใหม่/วัน",
      data: series.joined,
      borderColor: "#2f7ef7",
      backgroundColor: "rgba(47,126,247,0.12)",
      tension: 0.25,
      fill: true,
      pointRadius: 2,
    });
  }
  if (which === "both" || which === "live") {
    datasets.push({
      label: "เข้าร่วมเรียนสด/วัน",
      data: series.live,
      borderColor: "#1d4ed8",
      backgroundColor: "rgba(29,78,216,0.08)",
      tension: 0.25,
      fill: false,
      pointRadius: 2,
    });
  }

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: series.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
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
  try {
    const summaryRef = doc(db, "public_stats", "summary");
    const summarySnap = await getDoc(summaryRef);

    if (!summarySnap.exists()) {
      setText("statTotalStudents", "0");
      setText("statLiveNow", "0");
    } else {
      const data = summarySnap.data() || {};
      const totalStudents = Number.isFinite(data.totalStudents) ? data.totalStudents : 0;
      const liveJoined = Number.isFinite(data.liveJoined) ? data.liveJoined : 0;

      setText("statTotalStudents", String(totalStudents));
      setText("statLiveNow", String(liveJoined));
    }
  } catch (e) {
    console.warn("public_stats summary error:", e?.code, e?.message);
    setText("statTotalStudents", "N/A");
    setText("statLiveNow", "N/A");
  }

  // 3) line chart (home)
  try {
    const series = await loadDailySeries(14);
    destroyIf(_chartHome);
    _chartHome = renderLineChart("studentsChart", series, "both");
  } catch (e) {
    console.warn("studentsChart error:", e?.code, e?.message);
  }
}

export async function renderAdminDashboardChart() {
  await authReady;
  try {
    const series = await loadDailySeries(30);
    destroyIf(_chartAdmin);
    _chartAdmin = renderLineChart("adminStudentsChart", series, "both");
  } catch (e) {
    console.warn("adminStudentsChart error:", e?.code, e?.message);
  }
}
