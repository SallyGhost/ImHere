import { apiRequest } from "./api.js";
import { apiErrorMessage, escapeHtml, formatDate, setBusy, showNotice } from "./utils.js";

export async function initAdminPage() {
  const host = document.getElementById("admin-registrations");
  const message = document.getElementById("admin-message");

  const load = async () => {
    const { registrations } = await apiRequest("/api/admin/registrations");
    host.innerHTML = registrations.length
      ? `<div class="table-wrap"><table><thead><tr><th>Логін</th><th>Роль</th><th>Надіслано</th><th>Рішення</th></tr></thead><tbody>${registrations.map((item) => `<tr><td>${escapeHtml(item.username)}</td><td>${item.role === "teacher" ? "Викладач" : "Учень"}</td><td>${escapeHtml(formatDate(item.created_at))}</td><td><div class="toolbar"><button class="button approve-registration" type="button" data-user-id="${escapeHtml(item.id)}">Підтвердити</button><button class="button button-quiet reject-registration" type="button" data-user-id="${escapeHtml(item.id)}">Відхилити</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state">Немає заявок, що очікують розгляду.</div>`;

    host.querySelectorAll(".approve-registration, .reject-registration").forEach((button) => {
      button.addEventListener("click", async () => {
        const decision = button.classList.contains("approve-registration") ? "approve" : "reject";
        setBusy(button, true, "Зберігаємо…");
        try {
          await apiRequest(`/api/admin/registrations/${encodeURIComponent(button.dataset.userId)}/decision`, {
            method: "POST",
            body: { decision },
          });
          message.hidden = true;
          await load();
        } catch (error) {
          showNotice(message, apiErrorMessage(error));
          setBusy(button, false);
        }
      });
    });
  };

  await load();
}

export function initAdminSetup() {
  const form = document.getElementById("admin-setup-form");
  const message = document.getElementById("form-message");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Створюємо…");
    message.hidden = true;
    const data = new FormData(form);
    try {
      const result = await apiRequest("/api/admin/bootstrap", {
        method: "POST",
        body: {
          bootstrapCode: data.get("bootstrapCode"),
          username: data.get("username").trim(),
          password: data.get("password"),
        },
      });
      showNotice(message, result.message, "success");
      form.reset();
    } catch (error) {
      showNotice(message, apiErrorMessage(error));
    } finally {
      setBusy(button, false);
    }
  });
}
