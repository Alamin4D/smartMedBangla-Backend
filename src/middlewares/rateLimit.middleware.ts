import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { langOf, translate } from "../utils/i18n.js";

const message = (text: string) => (req: Request) => ({ success: false, message: translate(text, langOf(req)) });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Too many requests, please slow down."),
});

/** Brute-force protection for login / OTP / password reset endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Too many attempts. Please try again in 15 minutes."),
});

/** AI calls are expensive – keep them reasonable per client. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("You are using AI features too quickly. Please wait a minute."),
});
