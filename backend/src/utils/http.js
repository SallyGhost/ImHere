export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function notImplemented(route) {
  return jsonResponse(
    { error: `The ${route} route is not implemented yet` },
    501,
  );
}

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ error: "Цей метод запиту не підтримується" }), {
    status: 405,
    headers: {
      "content-type": "application/json; charset=utf-8",
      allow: allowed.join(", "),
    },
  });
}
