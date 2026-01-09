export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

export function escapeHtml(str=""){
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function formatDateTime(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" });
}

export function toCSV(rows){
  if(!rows?.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v)=> `"${String(v ?? "").replaceAll('"','""')}"`;
  const lines = [cols.map(esc).join(",")];
  for(const r of rows){
    lines.push(cols.map(c=>esc(r[c])).join(","));
  }
  return lines.join("\n");
}

export function downloadText(filename, content, mime="text/csv;charset=utf-8"){
  const blob = new Blob([content], { type:mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
