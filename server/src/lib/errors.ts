/**
 * Typed application error used across services; the central error handler
 * converts these into a consistent JSON envelope. Anything thrown that is
 * not an AppError is treated as an internal server error (and logged).
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, "unauthorized", message);
  }
  static forbidden(message = "Not allowed") {
    return new AppError(403, "forbidden", message);
  }
  static notFound(message = "Not found") {
    return new AppError(404, "not_found", message);
  }
  static conflict(message: string) {
    return new AppError(409, "conflict", message);
  }
  static payloadTooLarge(message: string) {
    return new AppError(413, "payload_too_large", message);
  }
  static upstream(message: string, details?: unknown) {
    return new AppError(502, "upstream_error", message, details);
  }
  static unavailable(message: string) {
    return new AppError(503, "service_unavailable", message);
  }
}
