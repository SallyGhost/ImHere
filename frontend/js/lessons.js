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
    try { const { lesson } = await apiRequest("/api/lessons", { method: "POST", body: { groupId: data.get("groupId"), title: data.get("title").trim() } }); window.location.assign(`./lesson.html?lessonId=${encodeURIComponent(lesson.id)}`); }
    catch (error) { showNotice(message, apiErrorMessage(error)); setBusy(button, false); }
  });
}

export async function initLesson() {
  const host = document.getElementById("lesson-view");
  const lessonId = queryParam("lessonId");
  if (!lessonId) { host.innerHTML = `<div class="notice error">У посиланні не вказано ID заняття.</div>`; return; }
  let stopQr = null;
  const render = async (notice = "") => {
    const { lesson } = await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}`);
    const { groups } = await apiRequest("/api/groups");
    const group = groups.find((item) => item.id === lesson.group_id);
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(group?.name || "Заняття")}</p><h1>${escapeHtml(lesson.title)}</h1><p class="subtitle">Створено ${escapeHtml(formatDate(lesson.created_at))}</p></div><span class="status ${statusClass[lesson.status]}">${statusLabel[lesson.status]}</span></div>${notice ? `<div class="notice error" id="lesson-action-message">${escapeHtml(notice)}</div>` : ""}<section class="panel"><div class="toolbar">${lesson.status === "planned" ? `<button class="button" id="start-lesson">Розпочати заняття</button>` : ""}${lesson.status === "active" ? `<button class="button button-danger" id="close-lesson">Завершити заняття</button><a class="button button-secondary" href="./teacher-stats.html">Переглянути відмітки</a>` : ""}<a class="button button-secondary" href="./lessons.html">До списку занять</a></div>${lesson.status === "active" ? `<div class="qr-layout" style="margin-top:26px"><div><div class="qr-frame"><canvas id="lesson-qr" aria-label="Дійсний QR-код заняття"></canvas></div><p class="qr-countdown">Код оновиться за <span id="qr-countdown">…</span></p><div class="notice" id="qr-message" role="status" style="margin-top:12px">Завантажуємо захищений QR-код…</div></div><div><h2>Відмітка присутності</h2><p class="subtitle">Покажіть цей екран учасникам групи. Код оновлюється автоматично кожні 25 секунд.</p><div class="notice warning" style="margin-top:18px">Після завершення заняття нові відмітки не прийматимуться.</div></div></div>` : ""}</section>`;
    if (stopQr) { stopQr(); stopQr = null; }
    if (lesson.status === "active") {
      const { showLessonQr } = await import("./qr.js");
      stopQr = await showLessonQr({ lessonId, canvas: document.getElementById("lesson-qr"), countdown: document.getElementById("qr-countdown"), onError: (error) => { const node = document.getElementById("qr-message"); if (node && error) { node.className = "notice error"; node.textContent = error.message; } else if (node) { node.className = "notice success"; node.textContent = "QR-код готовий до сканування."; } } });
    }
    const transition = async (action) => {
      const button = document.getElementById(action === "start" ? "start-lesson" : "close-lesson"); setBusy(button, true, "Зберігаємо…");
      try { await apiRequest(`/api/lessons/${encodeURIComponent(lessonId)}/${action}`, { method: "POST" }); await render(); }
      catch (error) { await render(apiErrorMessage(error)); }
    };
    document.getElementById("start-lesson")?.addEventListener("click", () => void transition("start"));
    document.getElementById("close-lesson")?.addEventListener("click", () => void transition("close"));
  };
  await render();
  window.addEventListener("pagehide", () => stopQr?.(), { once: true });
}
