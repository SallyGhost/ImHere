import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

export async function initDashboard(user) {
  const host = document.getElementById("dashboard-view");
  if (user.role === "teacher") {
    const [{ groups }, { lessons }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/lessons"), apiRequest("/api/attendance/history"),
    ]);
    const students = new Set(attendance.map((row) => row.student_id));
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Вітаємо</h1><p class="subtitle">Тут зібрано ваші групи, заняття та останні відмітки.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Групи</p><p class="metric-value">${groups.length}</p><a class="link small" href="./groups.html">Керувати групами →</a></article><article class="panel"><p class="metric-label">Учнів із відмітками</p><p class="metric-value">${students.size}</p><a class="link small" href="./teacher-stats.html">Відвідуваність →</a></article><article class="panel"><p class="metric-label">Заняття</p><p class="metric-value">${lessons.length}</p><a class="link small" href="./lessons.html">Список занять →</a></article></div><section class="panel" style="margin-top:20px"><h2>Останні події</h2>${attendance.length ? `<ul class="list">${attendance.slice(0,5).map((row) => `<li class="list-item"><div><p class="list-title">${escapeHtml(row.student_email)} · ${escapeHtml(row.title)}</p><p class="list-meta">${escapeHtml(row.group_name)}</p></div><span class="small muted">${escapeHtml(formatDate(row.marked_at))}</span></li>`).join("")}</ul>` : `<div class="empty-state">Відміток ще немає. Створіть заняття та покажіть QR-код групі.</div>`}</section>`;
  } else {
    const [{ groups }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/attendance/history"),
    ]);
    const latest = attendance[0];
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Учень</p><h1>Вітаємо</h1><p class="subtitle">Ваші заняття та підтверджені відвідування.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Мої групи</p><p class="metric-value">${groups.length}</p><a class="link small" href="./my-groups.html">Відкрити групи →</a></article><article class="panel"><p class="metric-label">Відвідано занять</p><p class="metric-value">${attendance.length}</p><a class="link small" href="./history.html">Історія →</a></article><article class="panel"><p class="metric-label">Остання відмітка</p><p class="metric-value" style="font-size:20px">${latest ? escapeHtml(formatDate(latest.marked_at)) : "Ще немає"}</p><a class="link small" href="./scan.html">Сканувати QR-код →</a></article></div><section class="panel" style="margin-top:20px"><h2>Швидка дія</h2><p class="subtitle">Відкрийте сканер, коли викладач покаже QR-код поточного заняття.</p><a class="button" style="margin-top:18px" href="./scan.html">Відкрити сканер</a></section>`;
  }
}
