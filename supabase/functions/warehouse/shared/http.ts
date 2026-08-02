
// @ts-nocheck
export class HttpError extends Error {
  status;
  errors;
  constructor(status, message, errors = {}){
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
export function cors(request) {
  const configured = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app";
  const origin = request.headers.get("Origin")?.trim() || "";
  const allowed = new Set([
    configured,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : configured,
    "Access-Control-Expose-Headers": "content-disposition",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}
export function json(request, value, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: {
      ...cors(request),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
export function clean(value, max = 10_000) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}
export function required(value, message, field, max) {
  const result = clean(value, max);
  if (!result) throw new HttpError(400, message, {
    [field]: [
      message
    ]
  });
  return result;
}
export function uuid(value, name) {
  const result = clean(value, 80);
  if (!result || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, `Choose a valid ${name}.`);
  return result;
}
export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new HttpError(400, "Enter a valid number.");
  }
  return result;
}
export function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
export function bodyObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Check the request and try again.");
  }
  return value;
}
export function id() {
  return crypto.randomUUID();
}
