import { CSRF_COOKIE, csrfCookie, readCookies } from "./cookies.js";
import { validateOrigin } from "./cors.js";
import { HttpError } from "../utils/http.js";

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function newCsrfToken() {
  return randomToken();
}

export function csrfSetCookie(token) {
  return csrfCookie(token);
}

export function requireCsrf(request, env) {
  validateOrigin(request, env, { required: true });
  const cookieToken = readCookies(request)[CSRF_COOKIE];
  const headerToken = request.headers.get("x-csrf-token");
  if (!safeEqual(cookieToken, headerToken)) {
    throw new HttpError(403, "Не вдалося перевірити безпеку запиту");
  }
}
