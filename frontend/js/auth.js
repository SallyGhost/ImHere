import { apiRequest, clearCsrfToken } from "./api.js";

export function registerAccount(username, password, role) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: { username, password, role },
  });
}

export function login(username, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function logout() {
  try {
    return await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    clearCsrfToken();
  }
}

export function currentUser() {
  return apiRequest("/api/auth/me");
}
