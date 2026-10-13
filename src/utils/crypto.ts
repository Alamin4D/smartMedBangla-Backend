import crypto from "node:crypto";

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/** 6-digit numeric OTP generated with a CSPRNG. */
export const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

export const transactionId = (prefix = "SM") =>
  `${prefix}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
