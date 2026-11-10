import { HttpError } from "../utils/http.js";

export function qrWindowSeconds(env) {
  const value = Number(env.QR_TOKEN_TTL_SECONDS);
  return Number.isInteger(value) && value >= 10 && value <= 60 ? value : 25;
}

function encodeHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return new Uint8Array(value.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function signatureMessage(lessonId, timeSlot) {
  return `v1\n${lessonId}\n${timeSlot}`;
}

async function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("QR signing secret is missing or too short");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createQrToken(env, lessonId, now = Date.now()) {
  const seconds = qrWindowSeconds(env);
  const timeSlot = Math.floor(now / (seconds * 1000));
  const message = new TextEncoder().encode(signatureMessage(lessonId, timeSlot));
  const key = await hmacKey(env.QR_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return {
    token: { version: 1, lessonId, timeSlot, signature: encodeHex(signature) },
    serverTime: now,
    validUntil: (timeSlot + 1) * seconds * 1000,
  };
}

export async function verifyQrToken(env, rawToken, now = Date.now()) {
  let token = rawToken;
  if (typeof token === "string") {
    try {
      token = JSON.parse(token);
    } catch {
      throw new HttpError(400, "Вміст QR-коду не є коректним JSON", "INVALID_QR");
    }
  }
  if (
    token === null || typeof token !== "object" || Array.isArray(token) ||
    Object.keys(token).sort().join(",") !== "lessonId,signature,timeSlot,version" ||
    token.version !== 1 || typeof token.lessonId !== "string" ||
    token.lessonId.length < 1 || token.lessonId.length > 128 ||
    !Number.isSafeInteger(token.timeSlot) || typeof token.signature !== "string"
  ) {
    throw new HttpError(400, "QR-токен має неправильний формат", "INVALID_QR");
  }

  const signature = decodeHex(token.signature);
  if (!signature) throw new HttpError(400, "Підпис QR-токена має неправильний формат", "INVALID_QR");

  const key = await hmacKey(env.QR_SECRET);
  const message = new TextEncoder().encode(signatureMessage(token.lessonId, token.timeSlot));
  if (!(await crypto.subtle.verify("HMAC", key, signature, message))) {
    throw new HttpError(401, "Підпис QR-коду недійсний", "INVALID_QR_SIGNATURE");
  }

  const currentSlot = Math.floor(now / (qrWindowSeconds(env) * 1000));
  if (token.timeSlot !== currentSlot) {
    throw new HttpError(410, "Строк дії QR-токена завершився", "QR_EXPIRED");
  }
  return token;
}
