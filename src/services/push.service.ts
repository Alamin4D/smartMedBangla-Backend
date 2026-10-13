import webpush from "web-push";
import { env, features } from "../config/env.js";
import { PushSubscriptionModel } from "../models/pushSubscription.model.js";
import { logger } from "../utils/logger.js";

if (features.webPush) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  speakText?: string | null;
  tag?: string;
}

/** Sends a browser push notification to every device of the user; prunes dead subscriptions. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!features.webPush) return;
  const subs = await PushSubscriptionModel.listForUser(userId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 30 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await PushSubscriptionModel.deleteByEndpoint(sub.endpoint);
        else logger.warn("Web push failed:", (err as Error).message);
      }
    }),
  );
}

export const pushPublicKey = () => env.VAPID_PUBLIC_KEY ?? null;
