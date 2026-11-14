import { login, registerAccount } from "./auth.js";
import { apiErrorMessage, setBusy, showNotice } from "./utils.js";

export function initAuthPage(page) {
  const form = document.getElementById(page === "login" ? "login-form" : "register-form");
  const message = document.getElementById("form-message");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, page === "login" ? "Вхід…" : "Надсилаємо заявку…");
    message.hidden = true;
    const data = new FormData(form);
    try {
      if (page === "login") {
        await login(data.get("username").trim(), data.get("password"));
        window.location.assign("./dashboard.html");
      } else {
        const result = await registerAccount(
          data.get("username").trim(),
          data.get("password"),
          data.get("role"),
        );
        showNotice(message, result.message || "Заявку надіслано адміністратору. Дочекайтеся підтвердження.", "success");
        form.reset();
        setBusy(button, false);
      }
    } catch (error) {
      showNotice(message, apiErrorMessage(error));
      setBusy(button, false);
    }
  });
}
