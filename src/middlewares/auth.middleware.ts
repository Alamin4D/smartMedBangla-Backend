import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { ACCESS_COOKIE } from "../utils/cookies.js";
import { verifyAccessToken } from "../utils/jwt.js";
import type { Role } from "../generated/prisma/enums.js";

function extractToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[ACCESS_COOKIE] as string | undefined;
}

/** Verifies the JWT, then confirms the user + session are still valid in the database. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new ApiError(401, "Session expired", { code: "TOKEN_EXPIRED" });
    throw ApiError.unauthorized("Invalid authentication token");
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: {
        select: { id: true, role: true, email: true, name: true, plan: true, timezone: true, status: true, isEmailVerified: true },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.id !== payload.sub) {
    throw ApiError.unauthorized("Session is no longer valid");
  }
  if (session.user.status === "SUSPENDED") throw ApiError.forbidden("Your account has been suspended. Contact support.");

  const { status: _status, ...user } = session.user;
  req.user = { ...user, sessionId: payload.sid };
  next();
}

export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.isEmailVerified) {
    throw new ApiError(403, "Please verify your email address first", { code: "EMAIL_NOT_VERIFIED" });
  }
  next();
}
