import { getRedis } from "../config/redis.js";

/**
 * Tiny cache facade: Redis when available, otherwise an in-process Map.
 * Used to cache AI answers (medicine info) and dashboard stats.
 */
const memory = new Map<string, { value: string; expiresAt: number }>();

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    let raw: string | null = null;
    try {
      if (redis) raw = await redis.get(key);
      else {
        const hit = memory.get(key);
        if (hit && hit.expiresAt > Date.now()) raw = hit.value;
        else memory.delete(key);
      }
    } catch {
      return null;
    }
    return raw ? (JSON.parse(raw) as T) : null;
  },

  async set(key: string, value: unknown, ttlSeconds: number) {
    const raw = JSON.stringify(value);
    const redis = getRedis();
    try {
      if (redis) await redis.set(key, raw, "EX", ttlSeconds);
      else {
        if (memory.size > 1000) memory.clear();
        memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
      }
    } catch {
      /* caching is best-effort */
    }
  },

  async del(key: string) {
    const redis = getRedis();
    try {
      if (redis) await redis.del(key);
      else memory.delete(key);
    } catch {
      /* ignore */
    }
  },
};
