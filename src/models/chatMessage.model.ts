import { prisma } from "../config/prisma.js";

export const ChatMessageModel = {
  history: (userId: string, take = 50) =>
    prisma.chatMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }).then((rows) => rows.reverse()),

  create: (userId: string, role: "USER" | "ASSISTANT", content: string) =>
    prisma.chatMessage.create({ data: { userId, role, content } }),

  clear: (userId: string) => prisma.chatMessage.deleteMany({ where: { userId } }),
};
