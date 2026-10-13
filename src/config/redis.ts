import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let client: Redis | null = null;

/**
 * Returns a shared Redis connection, or null when REDIS_URL is not configured.
 * BullMQ requires `maxRetriesPerRequest: null`.
 */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
    client.on("error", (err) => logger.error("Redis error:", err.message));
    client.on("ready", () => logger.info("Redis connected"));
  }
  return client;
}

export async function closeRedis() {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
