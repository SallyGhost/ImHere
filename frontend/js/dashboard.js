import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

export async function initDashboard(user) {
  const host = document.getElementById("dashboard-view");
  if (user.role === "teacher") {
    const [{ groups }, { lessons }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/lessons"), apiRequest("/api/attendance/history"),
    ]);
    const students = new Set(attendance.map((row) => row.student_id));
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Преподаватель</p><h1>Добро пожаловать</h1><p class="subtitle">Здесь собраны ваши группы, занятия и последние отметки.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Группы</p><p class="metric-value">${groups.length}</p><a class="link small" href="./groups.html">Управлять группами →</a></article><article class="panel"><p class="metric-label">Учеников с отметками</p><p class="metric-value">${students.size}</p><a class="link small" href="./teacher-stats.html">Посещаемость →</a></article><article class="panel"><p class="metric-label">Занятия</p><p class="metric-value">${lessons.length}</p><a class="link small" href="./lessons.html">Список занятий →</a></article></div><section class="panel" style="margin-top:20px"><h2>Последние события</h2>${attendance.length ? `<ul class="list">${attendance.slice(0,5).map((row) => `<li class="list-item"><div><p class="list-title">${escapeHtml(row.student_email)} · ${escapeHtml(row.title)}</p><p class="list-meta">${escapeHtml(row.group_name)}</p></div><span class="small muted">${escapeHtml(formatDate(row.marked_at))}</span></li>`).join("")}</ul>` : `<div class="empty-state">Пока нет отметок. Создайте занятие и покажите QR-код группе.</div>`}</section>`;
  } else {
    const [{ groups }, { attendance }] = await Promise.all([
      apiRequest("/api/groups"), apiRequest("/api/attendance/history"),
    ]);
    const latest = attendance[0];
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Ученик</p><h1>Добро пожаловать</h1><p class="subtitle">Ваши занятия и подтверждённые посещения.</p></div></div><div class="grid grid-3"><article class="panel"><p class="metric-label">Мои группы</p><p class="metric-value">${groups.length}</p><a class="link small" href="./my-groups.html">Открыть группы →</a></article><article class="panel"><p class="metric-label">Отмечено посещений</p><p class="metric-value">${attendance.length}</p><a class="link small" href="./history.html">История →</a></article><article class="panel"><p class="metric-label">Последняя отметка</p><p class="metric-value" style="font-size:20px">${latest ? escapeHtml(formatDate(latest.marked_at)) : "Пока нет"}</p><a class="link small" href="./scan.html">Сканировать QR →</a></article></div><section class="panel" style="margin-top:20px"><h2>Быстрое действие</h2><p class="subtitle">Откройте сканер, когда преподаватель покажет QR-код текущего занятия.</p><a class="button" style="margin-top:18px" href="./scan.html">Открыть сканер</a></section>`;
  }
}
