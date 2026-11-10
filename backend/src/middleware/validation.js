import { HttpError } from "../utils/http.js";

export async function readJsonObject(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Тип вмісту запиту має бути application/json");
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) throw new HttpError(413, "Тіло запиту завелике");

  let bytes;
  try {
    if (!request.body) throw new Error("empty body");
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16_384) {
        await reader.cancel();
        throw new HttpError(413, "Тіло запиту завелике");
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Тіло запиту має містити коректний JSON");
  }

  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Тіло запиту має містити коректний JSON");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Тіло запиту має бути об’єктом JSON");
  }
  return value;
}

export function requiredString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") {
    throw new HttpError(400, `Поле ${field} має бути текстом`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(400, `Довжина поля ${field} має становити від ${min} до ${max} символів`);
  }
  return normalized;
}

export function requiredPassword(value, { min = 1, max = 128 } = {}) {
  if (typeof value !== "string") throw new HttpError(400, "Пароль має бути текстом");
  if (value.length < min || value.length > max) {
    throw new HttpError(400, `Пароль має містити від ${min} до ${max} символів`);
  }
  return value;
}

export function pathId(value, field = "id") {
  return requiredString(value, field, { min: 1, max: 128 });
}

export function validEmail(value) {
  const email = requiredString(value, "email", { min: 3, max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Вкажіть коректну адресу електронної пошти");
  }
  return email.toLowerCase();
}

export function decodePathSegment(value, field = "id") {
  try {
    return pathId(decodeURIComponent(value), field);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, `Некоректне значення поля ${field}`);
  }
}
