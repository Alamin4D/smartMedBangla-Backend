import type { Response } from "express";
import { langOf, translate } from "./i18n.js";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Uniform success envelope: { success, message, data, meta } */
export function sendResponse<T>(
  res: Response,
  { statusCode = 200, message = "OK", data, meta }: { statusCode?: number; message?: string; data?: T; meta?: PaginationMeta },
) {
  const text = translate(message, langOf(res.req));
  return res.status(statusCode).json({ success: true, message: text, data: data ?? null, ...(meta ? { meta } : {}) });
}

export function getPagination(query: { page?: number; limit?: number }) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
