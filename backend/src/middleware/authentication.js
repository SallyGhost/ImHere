import { HttpError } from "../utils/http.js";
import { getSessionToken } from "./cookies.js";

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function findSessionUser(request, db) {
  const token = getSessionToken(request);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  return db
    .prepare(`
      SELECT users.id, users.email, users.role
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND julianday(sessions.expires_at) > julianday('now')
      LIMIT 1
    `)
    .bind(tokenHash)
    .first();
}

export async function requireAuthentication(request, env) {
  const user = await findSessionUser(request, env.DB);
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}
