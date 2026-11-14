import { apiRequest } from "./api.js";
import { escapeHtml, formatDate } from "./utils.js";

const attendanceLabels = { present: "Присутній", late: "Запізнився", absent: "Відсутній" };

function averageGrade(rows) {
  const grades = rows.map((row) => row.grade).filter((grade) => Number.isInteger(grade));
  return grades.length
    ? (grades.reduce((sum, grade) => sum + grade, 0) / grades.length).toFixed(1)
    : "—";
}

function attendanceTable(rows, teacher = false) {
  if (!rows.length) return `<div class="empty-state">Записів ще немає.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${teacher ? "<th>Учень</th>" : ""}<th>Заняття</th><th>Група</th><th>Статус</th><th>Запізнення</th><th>Оцінка</th><th>Дата</th></tr></thead><tbody>${rows.map((row) => `<tr>${teacher ? `<td>${escapeHtml(row.student_login)}</td>` : ""}<td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.group_name)}</td><td>${attendanceLabels[row.status] ?? "—"}</td><td>${row.status === "late" ? `${row.late_minutes ?? 0} хв.` : "—"}</td><td>${row.grade ?? "—"}</td><td>${escapeHtml(formatDate(row.marked_at))}</td></tr>`).join("")}</tbody></table></div>`;
}

export async function initHistory() {
  const host = document.getElementById("history-list");
  const { attendance } = await apiRequest("/api/attendance/history");
  host.innerHTML = `<div class="grid grid-3" style="margin-bottom:20px"><article class="panel"><p class="metric-label">Середній бал</p><p class="metric-value">${averageGrade(attendance)}</p></article><article class="panel"><p class="metric-label">З оцінкою</p><p class="metric-value">${attendance.filter((row) => Number.isInteger(row.grade)).length}</p></article><article class="panel"><p class="metric-label">Пропуски</p><p class="metric-value">${attendance.filter((row) => row.status === "absent").length}</p></article></div>${attendanceTable(attendance)}`;
}

export async function initTeacherStats() {
  const host = document.getElementById("stats-view");
  const [{ attendance }, { groups }] = await Promise.all([
    apiRequest("/api/attendance/history"),
    apiRequest("/api/groups"),
  ]);
  const statuses = {
    present: attendance.filter((row) => row.status === "present").length,
    late: attendance.filter((row) => row.status === "late").length,
    absent: attendance.filter((row) => row.status === "absent").length,
  };
  host.innerHTML = `<div class="grid grid-4" style="margin-bottom:24px"><article class="panel"><p class="metric-label">Записів</p><p class="metric-value">${attendance.length}</p></article><article class="panel"><p class="metric-label">Присутні</p><p class="metric-value">${statuses.present}</p></article><article class="panel"><p class="metric-label">Запізнилися</p><p class="metric-value">${statuses.late}</p></article><article class="panel"><p class="metric-label">Відсутні</p><p class="metric-value">${statuses.absent}</p></article></div><h2>Останні записи</h2>${attendanceTable(attendance, true)}<p class="small muted" style="margin-top:14px">Груп без занять: ${groups.filter((group) => !attendance.some((row) => row.group_id === group.id)).length}</p>`;
}

export function initConfirmation() {
  const result = new URLSearchParams(window.location.search).get("result");
  const title = document.getElementById("confirmation-title");
  const message = document.getElementById("confirmation-text");
  if (result === "success") { title.textContent = "Відвідування збережено"; message.textContent = "Відмітку успішно записано. Її можна переглянути в історії відвідувань."; }
  else if (result === "duplicate") { title.textContent = "Ви вже відмітилися"; message.textContent = "Відвідування цього заняття вже збережено."; }
  else { title.textContent = "Не вдалося підтвердити"; message.textContent = "Перевірте QR-код і стан заняття, а потім спробуйте ще раз."; }
}
