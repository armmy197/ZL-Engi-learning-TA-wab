import { qs, qsa } from "./utils.js";
import { state, resetSession } from "./state.js";

export function showModal(id){
  qs(`#${id}`)?.classList.remove("hidden");
}
export function closeModal(id){
  qs(`#${id}`)?.classList.add("hidden");
}

export function toast(msg){
  const el = qs("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(()=> el.classList.add("hidden"), 2200);
}

export function setActiveRoute(route){
  // nav active
  qsa(".nav-item[data-route]").forEach(a=>{
    a.classList.toggle("active", a.dataset.route === route);
  });

  // views
  qsa(".view").forEach(v=>v.classList.remove("active"));
  qs(`#view-${route}`)?.classList.add("active");
}

export function refreshRoleUI(){
  const pill = qs("#pillRole");
  const btnRole = qs("#btnRole");
  const btnLogout = qs("#btnLogout");

  if(state.role === "admin"){
    pill.textContent = "Admin";
    pill.classList.remove("hidden");
    btnRole.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    qsa(".admin-only").forEach(x=>x.classList.remove("hidden"));
  } else if(state.role === "student"){
    pill.textContent = `Student: ${state.student?.fullname ?? ""}`;
    pill.classList.remove("hidden");
    btnRole.classList.add("hidden");
    btnLogout.classList.remove("hidden");
    qsa(".admin-only").forEach(x=>x.classList.add("hidden"));
  } else {
    pill.classList.add("hidden");
    btnRole.classList.remove("hidden");
    btnLogout.classList.add("hidden");
    qsa(".admin-only").forEach(x=>x.classList.add("hidden"));
  }
}

export function bindGlobalUI(){
  // close modal by data-close
  qsa("[data-close]").forEach(btn=>{
    btn.addEventListener("click", ()=> closeModal(btn.dataset.close));
  });

  // sidebar toggle
  const sidebar = qs("#sidebar");
  const btnSidebarToggle = qs("#btnSidebarToggle");
  btnSidebarToggle.addEventListener("click", ()=>{
    sidebar.classList.toggle("open");
  });

  // logout
  qs("#btnLogout").addEventListener("click", ()=>{
    resetSession();
    refreshRoleUI();
    setActiveRoute("home");
    toast("ออกจากระบบแล้ว");
  });

  // route click
  qsa(".nav-item[data-route]").forEach(a=>{
    a.addEventListener("click", (e)=>{
      e.preventDefault();
      const route = a.dataset.route;
      setActiveRoute(route);
      // auto close sidebar on mobile
      sidebar.classList.remove("open");
    });
  });
}