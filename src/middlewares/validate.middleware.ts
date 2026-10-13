import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../utils/ApiError.js";

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

const formatIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({ field: issue.path.join(".") || "root", message: issue.message }));

/**
 * Validates and coerces request parts with Zod.
 * Express 5 exposes `req.query` via a getter, so the parsed value is redefined on the request.
 */
export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  for (const key of ["params", "query", "body"] as const) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key] ?? {});
    if (!result.success) {
      const errors = formatIssues(result.error);
      throw ApiError.badRequest(errors[0]?.message ?? "Validation failed", errors);
    }
    Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true, enumerable: true });
  }
  next();
};
