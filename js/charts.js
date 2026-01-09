import { db } from "./firebase.js";
import { qs } from "./utils.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export async function renderHomeStatsAndChart(){
  const [students, courses] = await Promise.all([getAll("students"), getAll("courses")]);
  const liveNow = students.filter(s=>s.liveJoined && !s.courseEnded).length;

  qs("#statTotalStudents").textContent = students.length;
  qs("#statLiveNow").textContent = liveNow;
  qs("#statTotalCourses").textContent = courses.length;

  const byCourse = {};
  for(const s of students){
    byCourse[s.courseId] = (byCourse[s.courseId]||0)+1;
  }
  const labels = courses.map(c=>c.name || c.id);
  const data = courses.map(c=>byCourse[c.id]||0);

  const ctx = qs("#studentsChart").getContext("2d");
  if(window.__homeChart) window.__homeChart.destroy();
  window.__homeChart = new Chart(ctx, {
    type:"bar",
    data:{ labels, datasets:[{ label:"ผู้เรียน", data }] },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:"#eaf0ff" } } },
      scales:{
        x:{ ticks:{ color:"#eaf0ff" }, grid:{ color:"rgba(255,255,255,.08)" } },
        y:{ ticks:{ color:"#eaf0ff" }, grid:{ color:"rgba(255,255,255,.08)" } }
      }
    }
  });
}

async function getAll(col){
  const snap = await getDocs(collection(db,col));
  const out = [];
  snap.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}
