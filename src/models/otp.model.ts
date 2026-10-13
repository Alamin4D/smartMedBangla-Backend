import { prisma } from "../config/prisma.js";
import type { OtpPurpose } from "../generated/prisma/enums.js";

export const OtpModel = {
  /** Invalidates older codes of the same purpose, then stores the new one. */
  replace: async (userId: string, purpose: OtpPurpose, codeHash: string, expiresAt: Date) => {
    await prisma.otpToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return prisma.otpToken.create({ data: { userId, purpose, codeHash, expiresAt } });
  },

  findLatestActive: (userId: string, purpose: OtpPurpose) =>
    prisma.otpToken.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),

  findLatest: (userId: string, purpose: OtpPurpose) =>
    prisma.otpToken.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" } }),

  incrementAttempts: (id: string) => prisma.otpToken.update({ where: { id }, data: { attempts: { increment: 1 } } }),

  consume: (id: string) => prisma.otpToken.update({ where: { id }, data: { consumedAt: new Date() } }),

  deleteExpired: () => prisma.otpToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
};
