import { prisma } from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { NotificationType } from "../generated/prisma/enums.js";
import { NotificationModel } from "../models/notification.model.js";
import { PushSubscriptionModel } from "../models/pushSubscription.model.js";
import { getPagination, buildMeta } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";
import { pick, type Lang, type Localized } from "../utils/i18n.js";
import { pushPublicKey, sendPushToUser } from "./push.service.js";

export interface NotifyInput {
  type: NotificationType;
  title: Localized;
  message: Localized;
  speakText?: string | null;
  data?: Prisma.InputJsonValue;
  url?: string;
}

/** Stores an in-app notification (in the recipient's language) and fans it out as a browser push. */
export async function notify(userId: string, input: NotifyInput) {
  let lang: Lang = "bn";
  if (typeof input.title !== "string" || typeof input.message !== "string") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
    lang = user?.language ?? "bn";
  }
  const title = pick(input.title, lang);
  const message = pick(input.message, lang);
  const notification = await NotificationModel.create({
    userId,
    type: input.type,
    title,
    message,
    speakText: input.speakText ?? null,
    data: input.data,
  });
  void sendPushToUser(userId, {
    title,
    body: message,
    speakText: input.speakText,
    url: input.url ?? "/dashboard",
    tag: notification.id,
  });
  return notification;
}

export const notificationService = {
  async list(userId: string, query: { page?: number; limit?: number; unread?: boolean }) {
    const { page, limit, skip } = getPagination(query);
    const { items, total, unread } = await NotificationModel.list(userId, Boolean(query.unread), skip, limit);
    return { items, unread, meta: buildMeta(page, limit, total) };
  },

  unreadCount: (userId: string) => NotificationModel.unreadCount(userId),

  /** Voice lines created in the last few minutes that the browser has not spoken yet. */
  speakable: (userId: string, sinceMinutes: number) =>
    NotificationModel.recentSpeakable(userId, new Date(Date.now() - sinceMinutes * 60_000)),

  async markRead(userId: string, id: string) {
    const { count } = await NotificationModel.markRead(id, userId);
    if (!count) throw ApiError.notFound("Notification not found");
  },

  markAllRead: (userId: string) => NotificationModel.markAllRead(userId),

  async remove(userId: string, id: string) {
    const { count } = await NotificationModel.delete(id, userId);
    if (!count) throw ApiError.notFound("Notification not found");
  },

  pushConfig: () => ({ publicKey: pushPublicKey(), enabled: Boolean(pushPublicKey()) }),

  subscribePush: (userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    PushSubscriptionModel.upsert(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth),

  unsubscribePush: (userId: string, endpoint: string) => PushSubscriptionModel.deleteByEndpoint(endpoint, userId),
};
