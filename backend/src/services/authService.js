import { HttpError } from "../utils/http.js";

// PBKDF2 count is kept small for the Workers Free CPU budget; the keyed pepper
// is stored separately from D1 and rate limits constrain online guessing.
const PBKDF2_ITERATIONS = 20_000;
const SESSION_TTL_DEFAULT = 86_400;
const DUMMY_SALT = new Uint8Array(16).fill(0x5a);

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

async function passwordMaterial(password, pepper) {
  if (typeof pepper !== "string" || pepper.length < 32) {
    throw new Error("Секрет для захисту паролів відсутній або закороткий");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password)));
}

async function derivePasswordHash(passwordBytes, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, pepper) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await passwordMaterial(password, pepper);
  const digest = await derivePasswordHash(material, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(digest)}`;
}

export async function verifyPassword(password, storedHash, pepper) {
  const [scheme, iterationText, saltText, digestText, extra] = storedHash.split("$");
  const iterations = Number(iterationText);
  const salt = fromHex(saltText ?? "");
  const expected = fromHex(digestText ?? "");
  if (
    extra !== undefined ||
    scheme !== "pbkdf2-sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 20_000 ||
    iterations > 200_000 ||
    !salt ||
    salt.length < 16 ||
    !expected ||
    expected.length !== 32
  ) {
    return false;
  }

  const material = await passwordMaterial(password, pepper);
  const actual = await derivePasswordHash(material, salt, iterations);
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createSession(db, userId, ttlSeconds = SESSION_TTL_DEFAULT) {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, await sha256Hex(token), expiresAt)
    .run();
  return { token, expiresAt };
}

export async function login(db, username, password, ttlSeconds, pepper) {
  const user = await db
    .prepare(`
      SELECT id, email, username, role, password_hash, approval_status, is_admin
      FROM users
      WHERE username = ? COLLATE NOCASE OR (username IS NULL AND email = ? COLLATE NOCASE)
      LIMIT 1
    `)
    .bind(username, username)
    .first();

  if (!user) {
    const material = await passwordMaterial(password, pepper);
    await derivePasswordHash(material, DUMMY_SALT, PBKDF2_ITERATIONS);
    throw new HttpError(401, "Неправильний логін або пароль");
  }
  if (!(await verifyPassword(password, user.password_hash, pepper))) {
    throw new HttpError(401, "Неправильний логін або пароль");
  }
  if (user.approval_status === "pending") {
    throw new HttpError(403, "Заявка очікує підтвердження адміністратора", "ACCOUNT_PENDING");
  }
  if (user.approval_status === "rejected") {
    throw new HttpError(403, "Адміністратор відхилив заявку на реєстрацію", "ACCOUNT_REJECTED");
  }

  const session = await createSession(db, user.id, ttlSeconds);
  return {
    user: {
      id: user.id,
      username: user.username ?? user.email,
      role: user.is_admin ? "admin" : user.role,
    },
    ...session,
  };
}

export async function register(db, username, password, pepper, role) {
  const email = `${username}@accounts.imhere.invalid`;
  const existing = await db
    .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? LIMIT 1")
    .bind(username, email)
    .first();
  if (existing) throw new HttpError(409, "Цей логін уже зареєстровано");

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password, pepper);
  try {
    await db
      .prepare(`
        INSERT INTO users (id, email, username, password_hash, role, approval_status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `)
      .bind(id, email, username, passwordHash, role)
      .run();
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message ?? error))) {
      throw new HttpError(409, "Цей логін уже зареєстровано");
    }
    throw error;
  }

  return { id, username, role, approval_status: "pending" };
}

export async function createFirstAdmin(db, username, password, pepper) {
  const email = `${username}@accounts.imhere.invalid`;
  const passwordHash = await hashPassword(password, pepper);
  const result = await db
    .prepare(`
      INSERT INTO users (id, email, username, password_hash, role, approval_status, is_admin)
      SELECT ?, ?, ?, ?, 'teacher', 'approved', 1
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1)
    `)
    .bind(crypto.randomUUID(), email, username, passwordHash)
    .run();
  if (result.meta.changes !== 1) {
    throw new HttpError(409, "Обліковий запис адміністратора вже створено");
  }
  return { username, role: "admin" };
}

export async function revokeSession(db, token) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}
