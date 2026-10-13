import { prisma } from "../config/prisma.js";

export const PushSubscriptionModel = {
  upsert: (userId: string, endpoint: string, p256dh: string, auth: string) =>
    prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    }),

  listForUser: (userId: string) => prisma.pushSubscription.findMany({ where: { userId } }),

  deleteByEndpoint: (endpoint: string, userId?: string) =>
    prisma.pushSubscription.deleteMany({ where: { endpoint, ...(userId ? { userId } : {}) } }),
};
