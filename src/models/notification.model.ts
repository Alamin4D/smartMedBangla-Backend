import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const NotificationModel = {
  create: (data: Prisma.NotificationUncheckedCreateInput) => prisma.notification.create({ data }),

  createMany: (data: Prisma.NotificationCreateManyInput[]) => prisma.notification.createMany({ data }),

  list: async (userId: string, unreadOnly: boolean, skip: number, take: number) => {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { isRead: false } : {}) };
    const [items, total, unread] = await prisma.$transaction([
      prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, total, unread };
  },

  unreadCount: (userId: string) => prisma.notification.count({ where: { userId, isRead: false } }),

  /** Recent unread notifications that carry a voice line – polled by the browser to speak aloud. */
  recentSpeakable: (userId: string, since: Date) =>
    prisma.notification.findMany({
      where: { userId, isRead: false, speakText: { not: null }, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),

  markRead: (id: string, userId: string) => prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } }),

  markAllRead: (userId: string) => prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } }),

  delete: (id: string, userId: string) => prisma.notification.deleteMany({ where: { id, userId } }),
};
