export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", {
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
  if (error?.code === "ALREADY_ATTENDED") return "Посещение этого занятия уже сохранено.";
  if (error?.code === "NOT_GROUP_MEMBER") return "Ваш аккаунт не добавлен в эту группу.";
  if (error?.code === "LESSON_NOT_ACTIVE") return "Занятие уже завершено или ещё не началось.";
  if (error?.status === 401) return "Сессия завершилась. Войдите в аккаунт ещё раз.";
  if (error?.status === 429) return "Слишком много запросов. Подождите немного и повторите.";
  return error?.message || "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

export function setBusy(button, busy, label = "Загрузка…") {
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
