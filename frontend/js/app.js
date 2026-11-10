import { apiRequest } from "./api.js";
import { logout } from "./auth.js";
import { escapeHtml, apiErrorMessage } from "./utils.js";
import "./config.js";

const page = document.body.dataset.page || "home";
const content = document.getElementById("page-content");
const topbar = document.getElementById("topbar-actions");

const templates = {
  home: `<section class="hero"><p class="eyebrow">Учёт посещаемости</p><h1>Отметка присутствия — за пару секунд.</h1><p class="subtitle">ImHere помогает преподавателям управлять занятиями, а ученикам — отмечаться по актуальному QR-коду.</p><div class="hero-actions"><a class="button" href="./login.html">Войти в ImHere</a><a class="button button-secondary" href="./register.html">Создать аккаунт ученика</a></div><p class="small muted">Преподавательский доступ выдаётся администратором.</p></section>`,
  login: `<section class="auth-layout"><div class="auth-card"><p class="eyebrow">С возвращением</p><h1>Вход в аккаунт</h1><p class="subtitle">Продолжите работу с группами и занятиями.</p><div class="notice" id="form-message" role="status" hidden></div><form class="form" id="login-form"><div class="field"><label for="email">Электронная почта</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="1" maxlength="128"></div><button class="button" type="submit">Войти</button></form><p class="auth-footer">Нет аккаунта? <a class="link" href="./register.html">Зарегистрироваться</a></p></div></section>`,
  register: `<section class="auth-layout"><div class="auth-card"><p class="eyebrow">Для учеников</p><h1>Создать аккаунт</h1><p class="subtitle">После регистрации преподаватель сможет добавить вас в группу.</p><div class="notice" id="form-message" role="status" hidden></div><form class="form" id="register-form"><div class="field"><label for="email">Электронная почта</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"><p class="field-help">Не менее 12 символов.</p></div><button class="button" type="submit">Зарегистрироваться</button></form><p class="auth-footer">Уже есть аккаунт? <a class="link" href="./login.html">Войти</a></p></div></section>`,
  dashboard: `<div id="dashboard-view"><div class="panel empty-state">Загружаем вашу панель…</div></div>`,
  groups: `<div class="page-heading"><div><p class="eyebrow">Преподаватель</p><h1>Группы</h1><p class="subtitle">Создавайте группы и управляйте их участниками.</p></div></div><div class="grid grid-2"><section class="panel"><h2>Новая группа</h2><div class="notice" id="group-message" role="status" hidden></div><form id="group-create" class="form"><div class="field"><label for="group-name">Название группы</label><input id="group-name" name="name" required maxlength="120" placeholder="Например, Английский B1"></div><button class="button" type="submit">Создать группу</button></form></section><section class="panel"><h2>Ваши группы</h2><div id="groups-list" class="empty-state">Загружаем группы…</div></section></div>`,
  members: `<div class="page-heading"><div><p class="eyebrow">Группа</p><h1>Участники</h1><p class="subtitle" id="group-subtitle">Состав и управление участниками.</p></div><a class="button button-secondary" href="./groups.html">К группам</a></div><div class="grid grid-2"><section class="panel"><h2>Добавить ученика</h2><div class="notice" id="member-message" role="status" hidden></div><form id="member-add" class="form"><div class="field"><label for="student-id">ID ученика</label><input id="student-id" name="studentId" required maxlength="128" placeholder="ID учётной записи"><p class="field-help">Сейчас требуется ID, потому что API не раскрывает каталог пользователей.</p></div><button class="button" type="submit">Добавить в группу</button></form></section><section class="panel"><h2>Список участников</h2><div id="members-list" class="empty-state">Загружаем участников…</div></section></div>`,
  lessons: `<div class="page-heading"><div><p class="eyebrow">Преподаватель</p><h1>Занятия</h1><p class="subtitle">Планируйте занятия и открывайте отметку по QR.</p></div><a class="button" href="./lesson-create.html">Создать занятие</a></div><section class="panel"><div id="lessons-list" class="empty-state">Загружаем занятия…</div></section>`,
  "lesson-create": `<div class="page-heading"><div><p class="eyebrow">Преподаватель</p><h1>Новое занятие</h1><p class="subtitle">Занятие создаётся в статусе «Запланировано».</p></div></div><section class="panel" style="max-width:620px"><div class="notice" id="lesson-message" role="status" hidden></div><form id="lesson-create-form" class="form"><div class="field"><label for="group-id">Группа</label><select id="group-id" name="groupId" required><option value="">Загружаем группы…</option></select></div><div class="field"><label for="lesson-title">Название занятия</label><input id="lesson-title" name="title" required maxlength="200" placeholder="Например, Урок 4 · Past Simple"></div><button class="button" type="submit">Создать занятие</button></form></section>`,
  lesson: `<div id="lesson-view"><div class="panel empty-state">Загружаем занятие…</div></div>`,
  "teacher-stats": `<div class="page-heading"><div><p class="eyebrow">Преподаватель</p><h1>Посещаемость</h1><p class="subtitle">История отметок учеников в ваших группах.</p></div></div><section class="panel"><div id="stats-view" class="empty-state">Загружаем статистику…</div></section>`,
  "my-groups": `<div class="page-heading"><div><p class="eyebrow">Ученик</p><h1>Мои группы</h1><p class="subtitle">Здесь отображаются группы, в которые вас добавил преподаватель.</p></div></div><section class="panel"><div id="student-groups" class="empty-state">Загружаем группы…</div></section>`,
  scan: `<div class="page-heading"><div><p class="eyebrow">Ученик</p><h1>Отметить посещение</h1><p class="subtitle">Наведите камеру на QR-код, который показывает преподаватель.</p></div></div><div class="qr-layout"><section class="panel"><div class="camera-frame" id="scanner"></div><div class="scan-controls"><div class="field"><label for="camera-choice">Камера</label><select id="camera-choice"><option value="">Основная камера</option></select></div><div class="toolbar"><button class="button" id="camera-start" type="button">Включить камеру</button><button class="button button-secondary" id="camera-stop" type="button" disabled>Остановить</button></div><div class="notice" id="scan-message" role="status">Камера доступна на HTTPS-сайте или localhost. Разрешите доступ, когда браузер спросит.</div></div></section><section class="panel"><h2>Камера недоступна?</h2><p class="subtitle">Можно вставить содержимое QR вручную. Сервер всё равно проверит подпись и срок действия.</p><form id="manual-token-form" class="form"><div class="field"><label for="manual-token">Содержимое QR-кода</label><textarea id="manual-token" name="token" rows="5" required maxlength="2048" placeholder='{"version":1,"lessonId":"…","timeSlot":123,"signature":"…"}'></textarea></div><button class="button button-secondary" type="submit">Проверить и отметить</button></form></section></div>`,
  "attendance-confirm": `<section class="auth-layout"><div class="auth-card center"><div class="event-mark" style="margin:0 auto 18px">✓</div><p class="eyebrow">Результат проверки</p><h1 id="confirmation-title">Посещение обработано</h1><p class="subtitle" id="confirmation-text">Проверяем результат…</p><p style="margin-top:24px"><a class="button" href="./history.html">Открыть историю</a></p><p><a class="link" href="./scan.html">Сканировать ещё раз</a></p></div></section>`,
  history: `<div class="page-heading"><div><p class="eyebrow">Ученик</p><h1>История посещаемости</h1><p class="subtitle">Ваши подтверждённые посещения.</p></div><a class="button" href="./scan.html">Сканировать QR</a></div><section class="panel"><div id="history-list" class="empty-state">Загружаем историю…</div></section>`,
};

function setNavigation(user) {
  if (!topbar) return;
  if (!user) {
    topbar.innerHTML = `<a class="button button-quiet" href="./login.html">Войти</a><a class="button" href="./register.html">Регистрация</a>`;
    return;
  }
  const links = user.role === "teacher"
    ? [["Панель", "dashboard.html"], ["Группы", "groups.html"], ["Занятия", "lessons.html"], ["Посещаемость", "teacher-stats.html"]]
    : [["Панель", "dashboard.html"], ["Мои группы", "my-groups.html"], ["Сканировать", "scan.html"], ["История", "history.html"]];
  topbar.innerHTML = `<span class="user-chip">${escapeHtml(user.email)}</span><a class="button button-secondary" href="./dashboard.html">Панель</a><button class="button button-quiet" id="logout-button" type="button">Выйти</button>`;
  document.getElementById("logout-button")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await logout(); } finally { window.location.assign("./index.html"); }
  });
  if (page === "dashboard") {
    const nav = document.createElement("nav");
    nav.className = "toolbar";
    nav.setAttribute("aria-label", "Навигация");
    nav.innerHTML = links.map(([label, href]) => `<a class="link small" href="./${href}">${label}</a>`).join("");
    content?.prepend(nav);
  }
}

async function boot() {
  if (!templates[page] || !content) return;
  content.innerHTML = templates[page];
  if (["home", "login", "register"].includes(page)) {
    if (page !== "home") await import("./auth-page.js").then((module) => module.initAuthPage(page));
    return;
  }
  try {
    const { user } = await apiRequest("/api/auth/me");
    setNavigation(user);
    const requiredRole = ["groups", "members", "lessons", "lesson-create", "lesson", "teacher-stats"].includes(page) ? "teacher" :
      ["my-groups", "scan", "attendance-confirm", "history"].includes(page) ? "student" : null;
    if (requiredRole && user.role !== requiredRole) {
      window.location.replace(user.role === "teacher" ? "./dashboard.html" : "./dashboard.html");
      return;
    }
    const modules = {
      dashboard: "./dashboard.js", groups: "./groups.js", members: "./groups.js",
      lessons: "./lessons.js", "lesson-create": "./lessons.js", lesson: "./lessons.js",
      "teacher-stats": "./attendance.js", "my-groups": "./groups.js", scan: "./qr-scanner.js",
      "attendance-confirm": "./attendance.js", history: "./attendance.js",
    };
    const module = await import(modules[page]);
    const initializer = {
      dashboard: "initDashboard", groups: "initGroups", members: "initMembers",
      lessons: "initLessons", "lesson-create": "initLessonCreate", lesson: "initLesson",
      "teacher-stats": "initTeacherStats", "my-groups": "initStudentGroups", scan: "initScanPage",
      "attendance-confirm": "initConfirmation", history: "initHistory",
    }[page];
    await module[initializer]?.(user);
  } catch (error) {
    if (error?.status === 401) { window.location.replace("./login.html"); return; }
    content.innerHTML = `<div class="notice error">${escapeHtml(apiErrorMessage(error))}</div><p class="small muted" style="margin-top:12px">Если сайт открыт не локально, проверьте адрес API в frontend/js/config.js и список разрешённых Origin в Worker.</p>`;
  }
}

void boot();
