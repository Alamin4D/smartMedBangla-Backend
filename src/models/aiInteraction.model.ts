import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { AiFeature } from "../generated/prisma/enums.js";

export const AiInteractionModel = {
  log: (data: Prisma.AiInteractionUncheckedCreateInput) => prisma.aiInteraction.create({ data }),

  countSuccessfulSince: (userId: string, features: AiFeature[], since: Date) =>
    prisma.aiInteraction.count({ where: { userId, feature: { in: features }, success: true, createdAt: { gte: since } } }),

  list: async (where: Prisma.AiInteractionWhereInput, skip: number, take: number) => {
    const [items, total] = await prisma.$transaction([
      prisma.aiInteraction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          feature: true,
          provider: true,
          success: true,
          error: true,
          latencyMs: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.aiInteraction.count({ where }),
    ]);
    return { items, total };
  },
};
