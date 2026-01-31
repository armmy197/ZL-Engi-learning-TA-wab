export const state = {
  role: null,            // "student" | "admin"
  student: null,         // { id, fullname, courseId, joinedAt, liveJoined, courseEnded }
  admin: null,           // { username }
  selectedCourseId: null,
  promoteShown: false,
};

export function setRole(role){
  state.role = role;
}

export function resetSession(){
  state.role = null;
  state.student = null;
  state.admin = null;
  state.selectedCourseId = null;
}
