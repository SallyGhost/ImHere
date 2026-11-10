export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function showNotice(target, message, type = "error") {
  if (!target) return;
  target.className = `notice ${type}`;
  target.textContent = message;
  target.hidden = false;
}

export function apiErrorMessage(error) {
  if (error?.code === "ALREADY_ATTENDED") return "Відвідування цього заняття вже збережено.";
  if (error?.code === "NOT_GROUP_MEMBER") return "Вас ще не додано до цієї групи.";
  if (error?.code === "LESSON_NOT_ACTIVE") return "Заняття ще не почалося або вже завершилося.";
  if (error?.status === 401) return "Сеанс завершився. Увійдіть до облікового запису ще раз.";
  if (error?.status === 429) return "Забагато запитів. Зачекайте трохи й повторіть спробу.";
  if (/[іїєґ]/i.test(error?.message || "")) return error.message;
  return "Не вдалося виконати запит. Перевірте з’єднання та спробуйте ще раз.";
}

export function setBusy(button, busy, label = "Завантаження…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}
