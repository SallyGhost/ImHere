import { HttpError } from "../utils/http.js";

export async function readJsonObject(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) throw new HttpError(413, "Request body is too large");

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
        throw new HttpError(413, "Request body is too large");
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
    throw new HttpError(400, "Request body must contain valid JSON");
  }

  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return value;
}

export function requiredString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

export function requiredPassword(value, { min = 1, max = 128 } = {}) {
  if (typeof value !== "string") throw new HttpError(400, "password must be a string");
  if (value.length < min || value.length > max) {
    throw new HttpError(400, `password must be between ${min} and ${max} characters`);
  }
  return value;
}

export function pathId(value, field = "id") {
  return requiredString(value, field, { min: 1, max: 128 });
}

export function validEmail(value) {
  const email = requiredString(value, "email", { min: 3, max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "email must be a valid email address");
  }
  return email.toLowerCase();
}

export function decodePathSegment(value, field = "id") {
  try {
    return pathId(decodeURIComponent(value), field);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, `Invalid ${field}`);
  }
}
