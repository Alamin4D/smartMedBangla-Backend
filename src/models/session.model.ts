import { prisma } from "../config/prisma.js";

export const SessionModel = {
  create: (data: { userId: string; tokenHash: string; userAgent?: string; ip?: string; expiresAt: Date }) =>
    prisma.session.create({ data }),

  findActiveByHash: (tokenHash: string) =>
    prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, role: true, status: true } } },
    }),

  rotate: (id: string, tokenHash: string, expiresAt: Date) =>
    prisma.session.update({ where: { id }, data: { tokenHash, expiresAt } }),

  revoke: (id: string) => prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } }),

  revokeAllForUser: (userId: string, exceptId?: string) =>
    prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    }),

  listActive: (userId: string) =>
    prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),

  deleteExpired: () =>
    prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
    }),
};
