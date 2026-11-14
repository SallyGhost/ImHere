import { HttpError } from "../utils/http.js";

export function requireRole(user, role) {
  if (user.role !== role) {
    throw new HttpError(403, "У вас немає дозволу на цю дію");
  }
  return user;
}
