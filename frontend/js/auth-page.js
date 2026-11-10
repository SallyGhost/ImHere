import { login, registerStudent } from "./auth.js";
import { apiErrorMessage, setBusy, showNotice } from "./utils.js";

export function initAuthPage(page) {
  const form = document.getElementById(page === "login" ? "login-form" : "register-form");
  const message = document.getElementById("form-message");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, page === "login" ? "Входим…" : "Создаём аккаунт…");
    message.hidden = true;
    const data = new FormData(form);
    try {
      if (page === "login") await login(data.get("email").trim(), data.get("password"));
      else await registerStudent(data.get("email").trim(), data.get("password"));
      window.location.assign("./dashboard.html");
    } catch (error) {
      showNotice(message, apiErrorMessage(error));
      setBusy(button, false);
    }
  });
}
