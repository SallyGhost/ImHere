import { apiRequest } from "./api.js";
import { logout } from "./auth.js";
import { escapeHtml, apiErrorMessage } from "./utils.js";
import "./config.js";

const page = document.body.dataset.page || "home";
const content = document.getElementById("page-content");
let topbar = document.getElementById("topbar-actions");
if (!topbar) {
  const header = document.querySelector(".topbar");
  if (header) {
    topbar = document.createElement("div");
    topbar.id = "topbar-actions";
    topbar.className = "topbar-actions";
    header.append(topbar);
  }
}

function savedTheme() {
  try {
    return localStorage.getItem("imhere-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let activeTheme = savedTheme();

function applyTheme(theme) {
  activeTheme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.append(themeColor);
  }
  themeColor.content = color;
}

function themeButton() {
  const dark = activeTheme === "dark";
  return `<button class="button button-secondary theme-toggle" id="theme-toggle" type="button" aria-label="${dark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}" title="${dark ? "Світла тема" : "Темна тема"}" aria-pressed="${dark}"><span aria-hidden="true">${dark ? "☀" : "☾"}</span></button>`;
}

function bindThemeButton() {
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try { localStorage.setItem("imhere-theme", nextTheme); } catch { /* Налаштування діє до закриття вкладки. */ }
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.outerHTML = themeButton();
      bindThemeButton();
    }
  });
}

applyTheme(activeTheme);

const templates = {
  home: `<section class="hero"><p class="eyebrow">Облік відвідуваності</p><h1>Відмітка присутності — за кілька секунд.</h1><p class="subtitle">ImHere допомагає викладачам керувати заняттями, а учням — відмічатися за актуальним QR-кодом.</p><div class="hero-actions"><a class="button" href="./login.html">Увійти в ImHere</a><a class="button button-secondary" href="./register.html">Створити обліковий запис</a></div></section>`,
  login: `<section class="auth-layout"><div class="auth-card"><p class="eyebrow">З поверненням</p><h1>Вхід до облікового запису</h1><p class="subtitle">Продовжуйте роботу з групами та заняттями.</p><div class="notice" id="form-message" role="status" hidden></div><form class="form" id="login-form"><div class="field"><label for="username">Логін</label><input id="username" name="username" type="text" autocomplete="username" required maxlength="254"><p class="field-help">Для старих облікових записів можна ввести електронну пошту.</p></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="1" maxlength="128"></div><button class="button" type="submit">Увійти</button></form><p class="auth-footer">Ще не маєте облікового запису? <a class="link" href="./register.html">Зареєструватися</a></p></div></section>`,
  register: `<section class="auth-layout"><div class="auth-card"><p class="eyebrow">Новий користувач</p><h1>Створити обліковий запис</h1><p class="subtitle">Заявки учнів і викладачів підтверджує адміністратор.</p><div class="notice" id="form-message" role="status" hidden></div><form class="form" id="register-form"><div class="field"><label for="role">Тип облікового запису</label><select id="role" name="role" required><option value="student">Учень</option><option value="teacher">Викладач</option></select></div><div class="field"><label for="username">Логін</label><input id="username" name="username" type="text" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9._-]*"><p class="field-help">3–32 символи: латинські літери, цифри, крапка, дефіс або підкреслення.</p></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="128" pattern="[!-~]{6,128}"><p class="field-help">Від 6 символів: латинські літери, цифри або знаки пунктуації без пробілів.</p></div><button class="button" type="submit">Надіслати заявку</button></form><p class="auth-footer">Вже маєте обліковий запис? <a class="link" href="./login.html">Увійти</a></p></div></section>`,
  "admin-setup": `<section class="auth-layout"><div class="auth-card"><p class="eyebrow">Первинне налаштування</p><h1>Створити адміністратора</h1><p class="subtitle">Це можна зробити лише один раз за кодом, збереженим у секретах Worker.</p><div class="notice" id="form-message" role="status" hidden></div><form class="form" id="admin-setup-form"><div class="field"><label for="bootstrap-code">Код налаштування</label><input id="bootstrap-code" name="bootstrapCode" type="password" required autocomplete="off" maxlength="128"></div><div class="field"><label for="username">Логін адміністратора</label><input id="username" name="username" type="text" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" autocomplete="username"></div><div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" required minlength="6" maxlength="128" pattern="[!-~]{6,128}" autocomplete="new-password"></div><button class="button" type="submit">Створити адміністратора</button></form><p class="auth-footer"><a class="link" href="./login.html">До входу</a></p></div></section>`,
  admin: `<div class="page-heading"><div><p class="eyebrow">Адміністратор</p><h1>Заявки на реєстрацію</h1><p class="subtitle">Підтверджуй облікові записи учнів і викладачів.</p></div></div><section class="panel"><div class="notice" id="admin-message" role="status" hidden></div><div id="admin-registrations" class="empty-state">Завантажуємо заявки…</div></section>`,
  dashboard: `<div id="dashboard-view"><div class="panel empty-state">Завантажуємо вашу панель…</div></div>`,
  groups: `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Групи</h1><p class="subtitle">Створюйте групи та керуйте їхніми учасниками.</p></div></div><div class="grid grid-2"><section class="panel"><h2>Нова група</h2><div class="notice" id="group-message" role="status" hidden></div><form id="group-create" class="form"><div class="field"><label for="group-name">Назва групи</label><input id="group-name" name="name" required maxlength="120" placeholder="Наприклад, Англійська B1"></div><button class="button" type="submit">Створити групу</button></form></section><section class="panel"><h2>Ваші групи</h2><div id="groups-list" class="empty-state">Завантажуємо групи…</div></section></div>`,
  members: `<div class="page-heading"><div><p class="eyebrow">Група</p><h1>Учасники</h1><p class="subtitle" id="group-subtitle">Склад групи та керування учасниками.</p></div><a class="button button-secondary" href="./groups.html">До груп</a></div><div class="grid grid-2"><section class="panel"><h2>Додати учня</h2><div class="notice" id="member-message" role="status" hidden></div><form id="member-add" class="form"><div class="field"><label for="student-login">Логін учня</label><input id="student-login" name="login" type="text" autocomplete="off" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" placeholder="student01"><p class="field-help">Учень має спершу зареєструватися й отримати підтвердження адміністратора.</p></div><button class="button" type="submit">Додати до групи</button></form></section><section class="panel"><h2>Список учасників</h2><div id="members-list" class="empty-state">Завантажуємо учасників…</div></section></div>`,
  lessons: `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Заняття</h1><p class="subtitle">Плануйте заняття та відкривайте відмітку за QR-кодом.</p></div><a class="button" href="./lesson-create.html">Створити заняття</a></div><section class="panel"><div id="lessons-list" class="empty-state">Завантажуємо заняття…</div></section>`,
  "lesson-create": `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Нове заняття</h1><p class="subtitle">Створене заняття матиме статус «Заплановано».</p></div></div><section class="panel" style="max-width:620px"><div class="notice" id="lesson-message" role="status" hidden></div><form id="lesson-create-form" class="form"><div class="field"><label for="group-id">Група</label><select id="group-id" name="groupId" required><option value="">Завантажуємо групи…</option></select></div><div class="field"><label for="lesson-title">Назва заняття</label><input id="lesson-title" name="title" required maxlength="200" placeholder="Наприклад, Урок 4 · Past Simple"></div><div class="field"><label for="late-threshold">Поріг запізнення, хвилин</label><input id="late-threshold" name="lateThresholdMinutes" type="number" min="0" max="120" value="5" required><p class="field-help">Після цього часу QR-відмітка отримає статус «Запізнився».</p></div><button class="button" type="submit">Створити заняття</button></form></section>`,
  lesson: `<div id="lesson-view"><div class="panel empty-state">Завантажуємо заняття…</div></div>`,
  "teacher-stats": `<div class="page-heading"><div><p class="eyebrow">Викладач</p><h1>Відвідуваність</h1><p class="subtitle">Історія відміток учнів у ваших групах.</p></div></div><section class="panel"><div id="stats-view" class="empty-state">Завантажуємо статистику…</div></section>`,
  "my-groups": `<div class="page-heading"><div><p class="eyebrow">Учень</p><h1>Мої групи</h1><p class="subtitle">Тут відображаються групи, до яких вас додав викладач.</p></div></div><section class="panel"><div id="student-groups" class="empty-state">Завантажуємо групи…</div></section>`,
  scan: `<div class="page-heading"><div><p class="eyebrow">Учень</p><h1>Відмітити присутність</h1><p class="subtitle">Наведіть камеру на QR-код, який показує викладач.</p></div></div><div class="qr-layout"><section class="panel"><div class="camera-frame" id="scanner"></div><div class="scan-controls"><div class="field"><label for="camera-choice">Камера</label><select id="camera-choice"><option value="">Основна камера</option></select></div><div class="toolbar"><button class="button" id="camera-start" type="button">Увімкнути камеру</button><button class="button button-secondary" id="camera-stop" type="button" disabled>Зупинити</button></div><div class="notice" id="scan-message" role="status">Камера доступна на сайті з HTTPS або на localhost. Дозвольте доступ, коли браузер запитає.</div></div></section><section class="panel"><h2>Камера недоступна?</h2><p class="subtitle">Вставте вміст QR вручну. Сервер однаково перевірить підпис і строк дії.</p><form id="manual-token-form" class="form"><div class="field"><label for="manual-token">Вміст QR-коду</label><textarea id="manual-token" name="token" rows="5" required maxlength="2048" placeholder='{"version":1,"lessonId":"…","timeSlot":123,"signature":"…"}'></textarea></div><button class="button button-secondary" type="submit">Перевірити та відмітити</button></form></section></div>`,
  "attendance-confirm": `<section class="auth-layout"><div class="auth-card center"><div class="event-mark" style="margin:0 auto 18px">✓</div><p class="eyebrow">Результат перевірки</p><h1 id="confirmation-title">Відвідування оброблено</h1><p class="subtitle" id="confirmation-text">Перевіряємо результат…</p><p style="margin-top:24px"><a class="button" href="./history.html">Відкрити історію</a></p><p><a class="link" href="./scan.html">Сканувати ще раз</a></p></div></section>`,
  history: `<div class="page-heading"><div><p class="eyebrow">Учень</p><h1>Історія відвідувань</h1><p class="subtitle">Статуси відвідування та оцінки за заняття.</p></div><a class="button" href="./scan.html">Сканувати QR-код</a></div><section class="panel"><div id="history-list" class="empty-state">Завантажуємо історію…</div></section>`,
};

function setNavigation(user) {
  if (!topbar) return;
  if (!user) {
    topbar.innerHTML = `<a class="button button-quiet" href="./login.html">Увійти</a><a class="button" href="./register.html">Реєстрація</a>${themeButton()}`;
    bindThemeButton();
    return;
  }
  const links = user.role === "admin"
    ? [["Заявки на реєстрацію", "admin.html"]]
    : user.role === "teacher"
    ? [["Панель", "dashboard.html"], ["Групи", "groups.html"], ["Заняття", "lessons.html"], ["Відвідуваність", "teacher-stats.html"]]
    : [["Панель", "dashboard.html"], ["Мої групи", "my-groups.html"], ["Сканувати", "scan.html"], ["Історія", "history.html"]];
  topbar.innerHTML = `<span class="user-chip">${escapeHtml(user.username)}</span><a class="button button-secondary" href="./dashboard.html">Панель</a>${user.role === "admin" ? `<a class="button button-secondary" href="./admin.html">Заявки</a>` : ""}<button class="button button-quiet" id="logout-button" type="button">Вийти</button>${themeButton()}`;
  bindThemeButton();
  document.getElementById("logout-button")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await logout(); } finally { window.location.assign("./index.html"); }
  });
  if (page === "dashboard") {
    const nav = document.createElement("nav");
    nav.className = "toolbar";
    nav.setAttribute("aria-label", "Навігація");
    nav.innerHTML = links.map(([label, href]) => `<a class="link small" href="./${href}">${label}</a>`).join("");
    content?.prepend(nav);
  }
}

async function boot() {
  if (!templates[page] || !content) return;
  content.innerHTML = templates[page];
  if (["home", "login", "register", "admin-setup"].includes(page)) {
    setNavigation(null);
    if (["login", "register"].includes(page)) await import("./auth-page.js").then((module) => module.initAuthPage(page));
    if (page === "admin-setup") await import("./admin.js").then((module) => module.initAdminSetup());
    return;
  }
  try {
    const { user } = await apiRequest("/api/auth/me");
    setNavigation(user);
    const requiredRole = page === "admin" ? "admin" :
      ["groups", "members", "lessons", "lesson-create", "lesson", "teacher-stats"].includes(page) ? "teacher" :
      ["my-groups", "scan", "attendance-confirm", "history"].includes(page) ? "student" : null;
    if (requiredRole && user.role !== requiredRole) {
      window.location.replace("./dashboard.html");
      return;
    }
    const modules = {
      dashboard: "./dashboard.js", groups: "./groups.js", members: "./groups.js",
      lessons: "./lessons.js", "lesson-create": "./lessons.js", lesson: "./lessons.js",
      "teacher-stats": "./attendance.js", "my-groups": "./groups.js", scan: "./qr-scanner.js",
      "attendance-confirm": "./attendance.js", history: "./attendance.js", admin: "./admin.js",
    };
    const module = await import(modules[page]);
    const initializer = {
      dashboard: "initDashboard", groups: "initGroups", members: "initMembers",
      lessons: "initLessons", "lesson-create": "initLessonCreate", lesson: "initLesson",
      "teacher-stats": "initTeacherStats", "my-groups": "initStudentGroups", scan: "initScanPage",
      "attendance-confirm": "initConfirmation", history: "initHistory", admin: "initAdminPage",
    }[page];
    await module[initializer]?.(user);
  } catch (error) {
    if (error?.status === 401) { window.location.replace("./login.html"); return; }
    content.innerHTML = `<div class="notice error">${escapeHtml(apiErrorMessage(error))}</div><p class="small muted" style="margin-top:12px">Якщо сайт відкрито не локально, перевірте адресу API у frontend/js/config.js і список дозволених Origin у Worker.</p>`;
  }
}

void boot();
