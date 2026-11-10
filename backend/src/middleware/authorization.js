import { HttpError } from "../utils/http.js";

export function requireRole(user, role) {
  if (user.role !== role) {
    throw new HttpError(403, "You do not have permission to perform this action");
  }
  return user;
}
