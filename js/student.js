import { db } from "./firebase.js";
import { qs } from "./utils.js";
import { state, setRole } from "./state.js";
import { toast, closeModal, refreshRoleUI } from "./ui.js";

import {
  collection, addDoc, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const COL = "students";

export async function studentJoinFlow(){
  const fullname = qs("#studentFullname").value.trim();
  const consent = qs("#studentConsent").checked;
  const courseId = qs("#studentCourseSelect").value;

  if(!fullname){
    toast("กรุณากรอกชื่อ–นามสกุล");
    return;
  }
  if(!consent){
    toast("กรุณาติ๊กยินยอมเข้าร่วมเรียน");
    return;
  }
  if(!courseId){
    toast("ยังไม่มีคอร์สให้เลือก");
    return;
  }

  const payload = {
    fullname,
    courseId,
    joinedAt: new Date(),
    liveJoined: false,
    courseEnded: false,
    unlockedAt: null
  };

  const ref = await addDoc(collection(db, COL), payload);

  setRole("student");
  state.student = { id: ref.id, ...payload };
  state.selectedCourseId = courseId;

  closeModal("studentJoinModal");
  refreshRoleUI();
  toast("เข้าสู่ระบบผู้เรียนแล้ว");
}

export async function markStudentLiveJoined(studentId){
  await updateDoc(doc(db, COL, studentId), { liveJoined: true, liveJoinedAt: new Date() });
  state.student.liveJoined = true;
}

export async function refreshStudentFromDB(){
  if(!state.student?.id) return;
  const snap = await getDoc(doc(db, COL, state.student.id));
  if(!snap.exists()) return;
  state.student = { id:snap.id, ...snap.data() };
}
