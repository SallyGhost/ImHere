import { apiRequest } from "./api.js";
import { escapeHtml, formatDate, queryParam, apiErrorMessage, setBusy, showNotice } from "./utils.js";

const statusLabel = { planned: "Заплановано", active: "Триває", closed: "Завершено" };
const statusClass = { planned: "status-planned", active: "status-active", closed: "status-closed" };

export async function initLessons() {
  const host = document.getElementById("lessons-list");
  const { lessons } = await apiRequest("/api/lessons");
  host.innerHTML = lessons.length ? `<ul class="list">${lessons.map((lesson) => `<li class="list-item"><div><p class="list-title">${escapeHtml(lesson.title)}</p><p class="list-meta">Створено ${escapeHtml(formatDate(lesson.created_at))}</p></div><div class="toolbar"><span class="status ${statusClass[lesson.status]}">${statusLabel[lesson.status]}</span><a class="button button-secondary" href="./lesson.html?lessonId=${encodeURIComponent(lesson.id)}">Відкрити</a></div></li>`).join("")}</ul>` : `<div class="empty-state">Занять ще немає. Створіть перше.</div>`;
}

export async function initLessonCreate() {
  const select = document.getElementById("group-id");
  const message = document.getElementById("lesson-message");
  const { groups } = await apiRequest("/api/groups");
  select.innerHTML = groups.length ? `<option value="">Оберіть групу</option>${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("")}` : `<option value="">Спочатку створіть групу</option>`;
  select.disabled = groups.length === 0;
  document.getElementById("lesson-create-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); setBusy(button, true, "Створюємо…");
    const data = new FormData(form);
    try { const { lesson } = await apiRequest("/api/lessons", { method: "POST", body: { groupId: data.get("groupId"), title: data.get("title").trim(), lateThresholdMinutes: Number(data.get("lateThresholdMinutes")) } }); window.location.assign(`./lesson.html?lessonId=${encodeURIComponent(lesson.id)}`); }
    catch (error) { showNotice(message, apiErrorMessage(error)); setBusy(button, false); }
  });
}

export async function initLesson() {
  const host = document.getElementById("lesson-view");
  const lessonId = queryParam("lessonId");
  if (!lessonId) { host.innerHTML = `<div class="notice error">У посиланні не вказано ID заняття.</div>`; return; }
  let stopQr = null;
  let attendanceTimer = null;
  const refreshAttendance = async () => {
    const attendanceHost = document.getElementById("lesson-attendance");
    if (!attendanceHost) return;
    if (attendanceHost.contains(document.activeElement)) return;
    try {
      const { attendance, lesson } = await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}/attendance`);
      const present = attendance.filter((row) => row.status === "present" || row.status === "late").length;
      attendanceHost.innerHTML = attendance.length
        ? `<p class="small muted">Присутні або запізнилися: ${present} із ${attendance.length}</p><div class="table-wrap"><table><thead><tr><th>Учень</th><th>Відвідування</th><th>Оцінка</th><th>Час</th><th>Зміни</th></tr></thead><tbody>${attendance.map((row) => `<tr data-student-id="${escapeHtml(row.student_id)}"><td>${escapeHtml(row.student_login)}${row.marked_manually ? `<p class="small muted">Змінено викладачем</p>` : ""}</td><td><div class="field"><label class="small" for="attendance-status-${escapeHtml(row.student_id)}">Статус</label><select class="attendance-status" id="attendance-status-${escapeHtml(row.student_id)}"><option value="" ${row.status === null ? "selected" : ""}>${lesson.status === "closed" ? "Відсутній" : "Очікує"}</option><option value="present" ${row.status === "present" ? "selected" : ""}>Присутній</option><option value="late" ${row.status === "late" ? "selected" : ""}>Запізнився</option><option value="absent" ${row.status === "absent" ? "selected" : ""}>Відсутній</option></select><input class="late-minutes" type="number" min="1" max="1440" aria-label="Хвилини запізнення для ${escapeHtml(row.student_login)}" placeholder="Хвилини" value="${row.late_minutes ?? ""}" ${row.status === "late" ? "" : "hidden"}></div></td><td><input class="grade-value" type="number" min="1" max="12" aria-label="Оцінка для ${escapeHtml(row.student_login)}" placeholder="1–12" value="${row.grade ?? ""}"></td><td>${row.marked_at ? escapeHtml(formatDate(row.marked_at)) : "—"}</td><td><div class="stack"><button class="button button-secondary save-attendance" type="button">Зберегти статус</button><button class="button button-quiet save-grade" type="button">Зберегти оцінку</button></div></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty-state">У групі поки немає учнів.</div>`;
      attendanceHost.querySelectorAll(".attendance-status").forEach((select) => {
        select.addEventListener("change", () => {
          const input = select.closest("td").querySelector(".late-minutes");
          input.hidden = select.value !== "late";
        });
      });
      attendanceHost.querySelectorAll(".save-attendance").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("tr");
        const status = row.querySelector(".attendance-status").value;
        const message = document.getElementById("lesson-attendance-message");
        if (!status) { showNotice(message, "Оберіть статус відвідування перед збереженням."); return; }
        const lateMinutes = Number(row.querySelector(".late-minutes").value);
        setBusy(button, true, "Зберігаємо…");
        try {
          await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}/attendance/${encodeURIComponent(row.dataset.studentId)}`, {
            method: "PATCH",
            body: { status, lateMinutes: status === "late" ? lateMinutes : null },
          });
          button.blur();
          message.hidden = true;
          await refreshAttendance();
        } catch (error) { showNotice(message, apiErrorMessage(error)); setBusy(button, false); }
      }));
      attendanceHost.querySelectorAll(".save-grade").forEach((button) => button.addEventListener("click", async () => {
        const row = button.closest("tr");
        const rawGrade = row.querySelector(".grade-value").value.trim();
        const grade = rawGrade === "" ? null : Number(rawGrade);
        const message = document.getElementById("lesson-attendance-message");
        if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 12)) {
          showNotice(message, "Оцінка має бути цілим числом від 1 до 12 або порожньою.");
          return;
        }
        setBusy(button, true, "Зберігаємо…");
        try {
          await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}/grades/${encodeURIComponent(row.dataset.studentId)}`, {
            method: "PUT",
            body: { grade },
          });
          button.blur();
          message.hidden = true;
          await refreshAttendance();
        } catch (error) { showNotice(message, apiErrorMessage(error)); setBusy(button, false); }
      }));
    } catch (error) {
      attendanceHost.innerHTML = `<div class="notice error">${escapeHtml(apiErrorMessage(error))}</div>`;
    }
  };
  const render = async (notice = "") => {
    const { lesson } = await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}`);
    const { groups } = await apiRequest("/api/groups");
    const group = groups.find((item) => item.id === lesson.group_id);
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(group?.name || "Заняття")}</p><h1>${escapeHtml(lesson.title)}</h1><p class="subtitle">Створено ${escapeHtml(formatDate(lesson.created_at))}</p></div><span class="status ${statusClass[lesson.status]}">${statusLabel[lesson.status]}</span></div>${notice ? `<div class="notice error" id="lesson-action-message">${escapeHtml(notice)}</div>` : ""}<section class="panel"><div class="toolbar">${lesson.status === "planned" ? `<button class="button" id="start-lesson">Розпочати заняття</button>` : ""}${lesson.status === "active" ? `<button class="button button-danger" id="close-lesson">Завершити заняття</button>` : ""}<a class="button button-secondary" href="./lessons.html">До списку занять</a></div>${lesson.status === "active" ? `<div class="qr-layout" style="margin-top:26px"><div><div class="qr-frame"><canvas id="lesson-qr" aria-label="Дійсний QR-код заняття"></canvas></div><p class="qr-countdown">Код оновиться за <span id="qr-countdown">…</span></p><div class="notice" id="qr-message" role="status" style="margin-top:12px">Завантажуємо захищений QR-код…</div></div><div><h2>Відмітка присутності</h2><p class="subtitle">Покажіть цей екран учасникам групи. Код оновлюється автоматично кожні 25 секунд.</p><p class="small muted">Поріг запізнення: ${lesson.late_threshold_minutes} хв.</p><div class="notice warning" style="margin-top:18px">Після завершення заняття нові відмітки не прийматимуться.</div></div></div>` : ""}</section>${lesson.status !== "planned" ? `<section class="panel" style="margin-top:20px"><h2>Журнал заняття</h2><div class="notice" id="lesson-attendance-message" role="status" hidden></div><div id="lesson-attendance" class="empty-state">Завантажуємо список…</div></section>` : ""}`;
    if (attendanceTimer) { clearInterval(attendanceTimer); attendanceTimer = null; }
    if (stopQr) { stopQr(); stopQr = null; }
    if (lesson.status === "active") {
      const { showLessonQr } = await import("./qr.js");
      const canvas = document.getElementById("lesson-qr");
      const onQrError = (error) => {
        const node = document.getElementById("qr-message");
        if (!canvas.isConnected || !node) return;
        if (error) {
          node.className = "notice error";
          node.textContent = error.message;
        } else {
          node.className = "notice success";
          node.textContent = "QR-код готовий до сканування.";
        }
      };
      void showLessonQr({
        lessonId,
        canvas,
        countdown: document.getElementById("qr-countdown"),
        onError: onQrError,
      }).then((stop) => {
        if (canvas.isConnected) stopQr = stop;
        else stop();
      }).catch(onQrError);
      attendanceTimer = setInterval(() => void refreshAttendance(), 5000);
    }
    if (lesson.status !== "planned") await refreshAttendance();
    const transition = async (action) => {
      const button = document.getElementById(action === "start" ? "start-lesson" : "close-lesson"); setBusy(button, true, "Зберігаємо…");
      try { await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}/${action}`, { method: "POST" }); await render(); }
      catch (error) { await render(apiErrorMessage(error)); }
    };
    document.getElementById("start-lesson")?.addEventListener("click", () => void transition("start"));
    document.getElementById("close-lesson")?.addEventListener("click", () => void transition("close"));
  };
  await render();
  window.addEventListener("pagehide", () => { stopQr?.(); if (attendanceTimer) clearInterval(attendanceTimer); }, { once: true });
}
