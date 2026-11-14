import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

export async function initDashboard(user) {
  const host = document.getElementById("dashboard-view");
  if (user.role === "admin") {
    const { registrations } = await apiRequest("/api/admin/registrations");
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Адміністратор</p><h1>Вітаємо</h1><p class="subtitle">Перевіряйте заявки на створення облікових записів.</p></div></div><section class="panel"><p class="metric-label">Заявки на розгляді</p><p class="metric-value">${registrations.length}</p><a class="button" href="./admin.html">Відкрити заявки</a></section>`;
    return;
  }
  if (user.role === "teacher") {
    const [{ groups }, { lessons }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/lessons"), apiRequest("/api/attendance/history"),
    ]);
    const students = new Set(attendance.map((row) => row.student_id));
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Вітаємо</h1><p class="subtitle">Тут зібрано ваші групи, заняття та останні відмітки.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Групи</p><p class="metric-value">${groups.length}</p><a class="link small" href="./groups.html">Керувати групами →</a></article><article class="panel"><p class="metric-label">Учнів із відмітками</p><p class="metric-value">${students.size}</p><a class="link small" href="./teacher-stats.html">Відвідуваність →</a></article><article class="panel"><p class="metric-label">Заняття</p><p class="metric-value">${lessons.length}</p><a class="link small" href="./lessons.html">Список занять →</a></article></div><section class="panel" style="margin-top:20px"><h2>Останні події</h2>${attendance.length ? `<ul class="list">${attendance.slice(0,5).map((row) => `<li class="list-item"><div><p class="list-title">${escapeHtml(row.student_login)} · ${escapeHtml(row.title)}</p><p class="list-meta">${escapeHtml(row.group_name)}</p></div><span class="small muted">${escapeHtml(formatDate(row.marked_at))}</span></li>`).join("")}</ul>` : `<div class="empty-state">Відміток ще немає. Створіть заняття та покажіть QR-код групі.</div>`}</section>`;
  } else {
    const [{ groups }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/attendance/history"),
    ]);
    const attended = attendance.filter((row) => row.status === "present" || row.status === "late").length;
    const grades = attendance.map((row) => row.grade).filter((grade) => Number.isInteger(grade));
    const average = grades.length
      ? (grades.reduce((sum, grade) => sum + grade, 0) / grades.length).toFixed(1)
      : "—";
    const latest = attendance[0];
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Учень</p><h1>Вітаємо</h1><p class="subtitle">Ваші заняття, відвідуваність та оцінки.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Мої групи</p><p class="metric-value">${groups.length}</p><a class="link small" href="./my-groups.html">Відкрити групи →</a></article><article class="panel"><p class="metric-label">Відвідано занять</p><p class="metric-value">${attended}</p><a class="link small" href="./history.html">Історія →</a></article><article class="panel"><p class="metric-label">Середній бал</p><p class="metric-value">${average}</p><a class="link small" href="./history.html">Оцінки →</a></article></div><section class="panel" style="margin-top:20px"><h2>Останнє заняття</h2><p class="subtitle">${latest ? `${escapeHtml(latest.title)} · ${escapeHtml(formatDate(latest.marked_at))} · ${latest.status === "late" ? `Запізнення ${latest.late_minutes} хв.` : latest.status === "absent" ? "Відсутній" : "Присутній"}` : "Записів поки немає."}</p><a class="button" style="margin-top:18px" href="./scan.html">Відкрити сканер</a></section>`;
  }
}
