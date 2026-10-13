import { z } from "zod";

const email = z.email("Enter a valid email address").trim().toLowerCase();

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const otp = z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits");

export const authValidator = {
  register: z.object({
    name: z.string().trim().min(2, "Name is too short").max(80),
    email,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,16}$/, "Enter a valid phone number")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    password,
    role: z.enum(["PATIENT", "CAREGIVER"]).default("PATIENT"),
  }),
  login: z.object({ email, password: z.string().min(1, "Password is required") }),
  verifyEmail: z.object({ email, code: otp }),
  resendOtp: z.object({ email, purpose: z.enum(["EMAIL_VERIFY", "PASSWORD_RESET"]) }),
  forgotPassword: z.object({ email }),
  resetPassword: z.object({ email, code: otp, password }),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password }),
};
