import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { closeRedis } from "./config/redis.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";
import { logger } from "./utils/logger.js";

async function bootstrap() {
  await prisma.$connect();
  logger.info("Database connected");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`SmartMed API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  if (env.ENABLE_JOBS) await startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    server.close();
    await stopScheduler();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error("Failed to start server:", err);
  process.exit(1);
});
