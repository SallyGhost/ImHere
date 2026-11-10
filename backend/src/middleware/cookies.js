export const SESSION_COOKIE = "__Host-imhere_session";
export const CSRF_COOKIE = "__Host-imhere_csrf";

export function readCookies(request) {
  const header = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
    }),
  );
}

export function getSessionToken(request) {
  return readCookies(request)[SESSION_COOKIE] ?? null;
}

export function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=None; Partitioned`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None; Partitioned`;
}

export function csrfCookie(token, maxAge = 900) {
  return `${CSRF_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; SameSite=None; Partitioned`;
}

export function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=None; Partitioned`;
}
