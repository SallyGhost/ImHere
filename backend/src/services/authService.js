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
    throw new Error("Authentication pepper is missing or too short");
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

export async function login(db, email, password, ttlSeconds, pepper) {
  const user = await db
    .prepare("SELECT id, email, role, password_hash FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();

  if (!user) {
    const material = await passwordMaterial(password, pepper);
    await derivePasswordHash(material, DUMMY_SALT, PBKDF2_ITERATIONS);
    throw new HttpError(401, "Invalid email or password");
  }
  if (!(await verifyPassword(password, user.password_hash, pepper))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const session = await createSession(db, user.id, ttlSeconds);
  return {
    user: { id: user.id, email: user.email, role: user.role },
    ...session,
  };
}

export async function register(db, email, password, ttlSeconds, pepper) {
  const existing = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) throw new HttpError(409, "Email is already registered");

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password, pepper);
  try {
    await db
      .prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'student')")
      .bind(id, email, passwordHash)
      .run();
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error?.message ?? error))) {
      throw new HttpError(409, "Email is already registered");
    }
    throw error;
  }

  const session = await createSession(db, id, ttlSeconds);
  return { user: { id, email, role: "student" }, ...session };
}

export async function revokeSession(db, token) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}
