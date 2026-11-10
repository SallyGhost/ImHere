import { apiRequest, clearCsrfToken } from "./api.js";

export function registerStudent(email, password) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export function login(email, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password },
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
