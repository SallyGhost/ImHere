import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

function attendanceTable(rows, teacher = false) {
  if (!rows.length) return `<div class="empty-state">Записів ще немає.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${teacher ? "<th>Учень</th>" : ""}<th>Заняття</th><th>Група</th><th>Відмічено</th></tr></thead><tbody>${rows.map((row) => `<tr>${teacher ? `<td>${escapeHtml(row.student_email)}</td>` : ""}<td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.group_name)}</td><td>${escapeHtml(formatDate(row.marked_at))}</td></tr>`).join("")}</tbody></table></div>`;
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
  host.innerHTML = `<div class="grid grid-3" style="margin-bottom:24px"><article><p class="metric-label">Усього відміток</p><p class="metric-value">${attendance.length}</p></article><article><p class="metric-label">Груп із відмітками</p><p class="metric-value">${new Set(attendance.map((row) => row.group_id)).size}</p></article><article><p class="metric-label">Учнів із відмітками</p><p class="metric-value">${presentStudents}</p></article></div><h2>Останні відвідування</h2>${attendanceTable(attendance, true)}<p class="small muted" style="margin-top:14px">Груп без відвідувань: ${groups.filter((group) => !attendance.some((row) => row.group_id === group.id)).length}</p>`;
}

export function initConfirmation() {
  const result = new URLSearchParams(window.location.search).get("result");
  const title = document.getElementById("confirmation-title");
  const message = document.getElementById("confirmation-text");
  if (result === "success") { title.textContent = "Відвідування збережено"; message.textContent = "Відмітку успішно записано. Її можна переглянути в історії відвідувань."; }
  else if (result === "duplicate") { title.textContent = "Ви вже відмітилися"; message.textContent = "Відвідування цього заняття вже збережено."; }
  else { title.textContent = "Не вдалося підтвердити"; message.textContent = "Перевірте QR-код і стан заняття, а потім спробуйте ще раз."; }
}
