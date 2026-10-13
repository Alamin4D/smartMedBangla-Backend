import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const AuditLogModel = {
  create: (data: { actorId?: string; action: string; targetType?: string; targetId?: string; meta?: Prisma.InputJsonValue }) =>
    prisma.auditLog.create({ data }),

  list: async (skip: number, take: number) => {
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    return { items, total };
  },
};
