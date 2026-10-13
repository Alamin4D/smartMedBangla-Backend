export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  readonly code?: string;

  constructor(statusCode: number, message: string, options: { details?: unknown; code?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = options.details;
    this.code = options.code;
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new ApiError(400, message, { details });
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message);
  }
  static paymentRequired(message = "Upgrade required", code = "PLAN_LIMIT") {
    return new ApiError(402, message, { code });
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }
  static conflict(message = "Resource already exists") {
    return new ApiError(409, message);
  }
  static tooMany(message = "Too many requests, please try again later") {
    return new ApiError(429, message);
  }
  static unavailable(message = "Service temporarily unavailable", code?: string) {
    return new ApiError(503, message, { code });
  }
}
