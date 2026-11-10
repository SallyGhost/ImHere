import { HttpError } from "../utils/http.js";

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(db, scope, identity, { limit, periodSeconds = 60 }) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / periodSeconds) * periodSeconds;
  const keyHash = await hashKey(`${scope}:${identity || "unknown"}`);
  const result = await db
    .prepare(`
      INSERT INTO api_rate_limits (key_hash, window_start, request_count, updated_at)
      VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(key_hash) DO UPDATE SET
        request_count = CASE
          WHEN api_rate_limits.window_start = excluded.window_start
            THEN api_rate_limits.request_count + 1
          ELSE 1
        END,
        window_start = excluded.window_start,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      RETURNING request_count
    `)
    .bind(keyHash, windowStart)
    .first();

  if (result.request_count > limit) {
    throw new HttpError(429, "Забагато запитів. Спробуйте трохи пізніше");
  }
}

export async function cleanupExpiredData(db) {
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE julianday(expires_at) <= julianday('now')"),
    db.prepare("DELETE FROM api_rate_limits WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')"),
  ]);
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}
