import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { Prisma } from "../generated/prisma/client.js";
import { isProd } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { langOf, translate } from "../utils/i18n.js";
import { logger } from "../utils/logger.js";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = "Something went wrong. Please try again.";
  let details: unknown;
  let code: string | undefined;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
    code = err.code;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 8 MB)" : err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      status = 409;
      message = "A record with this value already exists";
    } else if (err.code === "P2025") {
      status = 404;
      message = "Record not found";
    } else if (err.code === "P2003") {
      status = 400;
      message = "Related record does not exist";
    }
  } else if (err instanceof SyntaxError && "body" in err) {
    status = 400;
    message = "Malformed JSON body";
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err);

  const lang = langOf(req);
  if (Array.isArray(details)) {
    details = details.map((d: { field?: string; message?: string }) => ({ ...d, message: translate(d.message ?? "", lang) }));
  }

  res.status(status).json({
    success: false,
    message: translate(message, lang),
    ...(code ? { code } : {}),
    ...(details ? { errors: details } : {}),
    ...(!isProd && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
  });
}
