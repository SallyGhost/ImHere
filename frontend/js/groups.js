import { apiRequest } from "./api.js";
import { escapeHtml, formatDate, queryParam, apiErrorMessage, setBusy, showNotice } from "./utils.js";

export async function initGroups() {
  const form = document.getElementById("group-create");
  const message = document.getElementById("group-message");
  const host = document.getElementById("groups-list");
  const load = async () => {
    const { groups } = await apiRequest("/api/groups");
    host.innerHTML = groups.length ? `<ul class="list">${groups.map((group) => `<li class="list-item"><div><p class="list-title">${escapeHtml(group.name)}</p><p class="list-meta">Створено ${escapeHtml(formatDate(group.created_at))}</p></div><a class="button button-secondary" href="./members.html?groupId=${encodeURIComponent(group.id)}">Учасники</a></li>`).join("")}</ul>` : `<div class="empty-state">Груп ще немає. Створіть першу.</div>`;
  };
  await load();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button"); setBusy(button, true, "Створюємо…");
    try { const { group } = await apiRequest("/api/groups", { method: "POST", body: { name: new FormData(form).get("name").trim() } }); showNotice(message, `Групу «${group.name}» створено.`, "success"); form.reset(); await load(); }
    catch (error) { showNotice(message, apiErrorMessage(error)); }
    finally { setBusy(button, false); }
  });
}

export async function initMembers() {
  const groupId = queryParam("groupId");
  const host = document.getElementById("members-list");
  const message = document.getElementById("member-message");
  if (!groupId) { host.textContent = "У посиланні немає ID групи."; return; }
  const load = async () => {
    const [{ group }, { members }] = await Promise.all([
      apiRequest(`/api/groups/${encodeURIComponent(groupId)}`),
      apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members`),
    ]);
    document.getElementById("group-subtitle").textContent = `${group.name} · учасників: ${members.length}`;
    host.innerHTML = members.length ? `<ul class="list">${members.map((member) => `<li class="list-item"><div><p class="list-title">${escapeHtml(member.email)}</p><p class="list-meta">Додано ${escapeHtml(formatDate(member.joined_at))}</p></div><button class="button button-quiet remove-member" type="button" data-student-id="${escapeHtml(member.id)}" aria-label="Вилучити учасника">Вилучити</button></li>`).join("")}</ul>` : `<div class="empty-state">У групі ще немає учнів.</div>`;
    host.querySelectorAll(".remove-member").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(button.dataset.studentId)}`, { method: "DELETE" }); await load(); }
      catch (error) { button.disabled = false; showNotice(message, apiErrorMessage(error)); }
    }));
  };
  await load();
  document.getElementById("member-add").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); setBusy(button, true, "Додаємо…");
    try { await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members`, { method: "POST", body: { studentId: new FormData(form).get("studentId").trim() } }); showNotice(message, "Учня додано до групи.", "success"); form.reset(); await load(); }
    catch (error) { showNotice(message, apiErrorMessage(error)); }
    finally { setBusy(button, false); }
  });
}

export async function initStudentGroups() {
  const host = document.getElementById("student-groups");
  const { groups } = await apiRequest("/api/groups");
  host.innerHTML = groups.length ? `<ul class="list">${groups.map((group) => `<li class="list-item"><div><p class="list-title">${escapeHtml(group.name)}</p><p class="list-meta">У групі ${group.member_count} ${group.member_count === 1 ? "учень" : "учнів"} · ви з ${escapeHtml(formatDate(group.joined_at))}</p></div><span class="status status-success">Учасник</span></li>`).join("")}</ul>` : `<div class="empty-state">Вас ще не додали до жодної групи.</div>`;
}
