import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

function attendanceTable(rows, teacher = false) {
  if (!rows.length) return `<div class="empty-state">Записей пока нет.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${teacher ? "<th>Ученик</th>" : ""}<th>Занятие</th><th>Группа</th><th>Отмечено</th></tr></thead><tbody>${rows.map((row) => `<tr>${teacher ? `<td>${escapeHtml(row.student_email)}</td>` : ""}<td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.group_name)}</td><td>${escapeHtml(formatDate(row.marked_at))}</td></tr>`).join("")}</tbody></table></div>`;
}

export async function initHistory() {
  const host = document.getElementById("history-list");
  const { attendance } = await apiRequest("/api/attendance/history");
  host.innerHTML = attendanceTable(attendance);
}

export async function initTeacherStats() {
  const host = document.getElementById("stats-view");
  const [{ attendance }, { groups }] = await Promise.all([apiRequest("/api/attendance/history"), apiRequest("/api/groups")]);
  const presentStudents = new Set(attendance.map((row) => row.student_id)).size;
  host.innerHTML = `<div class="grid grid-3" style="margin-bottom:24px"><article><p class="metric-label">Отметок всего</p><p class="metric-value">${attendance.length}</p></article><article><p class="metric-label">Групп с отметками</p><p class="metric-value">${new Set(attendance.map((row) => row.group_id)).size}</p></article><article><p class="metric-label">Учеников с отметками</p><p class="metric-value">${presentStudents}</p></article></div><h2>Последние посещения</h2>${attendanceTable(attendance, true)}<p class="small muted" style="margin-top:14px">Групп без посещений: ${groups.filter((group) => !attendance.some((row) => row.group_id === group.id)).length}</p>`;
}

export function initConfirmation() {
  const result = new URLSearchParams(window.location.search).get("result");
  const title = document.getElementById("confirmation-title");
  const message = document.getElementById("confirmation-text");
  if (result === "success") { title.textContent = "Посещение сохранено"; message.textContent = "Отметка успешно записана. Её можно увидеть в истории посещаемости."; }
  else if (result === "duplicate") { title.textContent = "Вы уже отмечены"; message.textContent = "Для этого занятия посещение уже было сохранено."; }
  else { title.textContent = "Не удалось подтвердить"; message.textContent = "Проверьте QR-код и статус занятия, затем попробуйте ещё раз."; }
}
