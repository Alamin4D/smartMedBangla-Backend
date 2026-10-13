import { Queue, Worker } from "bullmq";
import cron, { type ScheduledTask } from "node-cron";
import { getRedis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { JOBS, materializeAllPatients, processExpiryAlerts, type JobName } from "./handlers.js";

const QUEUE = "smartmed-jobs";
let queue: Queue | null = null;
let worker: Worker | null = null;
const cronTasks: ScheduledTask[] = [];

async function run(name: JobName) {
  try {
    await JOBS[name].handler();
  } catch (err) {
    logger.error(`Job ${name} failed:`, (err as Error).message);
    throw err;
  }
}

/**
 * Starts recurring jobs. With Redis, BullMQ job schedulers guarantee each tick runs once
 * even with several API instances; without Redis we fall back to in-process node-cron.
 */
export async function startScheduler() {
  const connection = getRedis();

  if (connection) {
    queue = new Queue(QUEUE, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200, attempts: 2 } });
    for (const [name, job] of Object.entries(JOBS)) {
      await queue.upsertJobScheduler(name, { pattern: job.pattern, tz: "Asia/Dhaka" }, { name });
    }
    worker = new Worker(QUEUE, async (job) => run(job.name as JobName), { connection, concurrency: 2 });
    worker.on("failed", (job, err) => logger.error(`BullMQ job ${job?.name} failed:`, err.message));
    logger.info("Scheduler started with BullMQ (Redis)");
  } else {
    for (const [name, job] of Object.entries(JOBS)) {
      cronTasks.push(cron.schedule(job.pattern, () => void run(name as JobName).catch(() => undefined), { timezone: "Asia/Dhaka" }));
    }
    logger.info("Scheduler started with node-cron (no REDIS_URL set)");
  }

  // Catch up right away after a restart / cold start.
  void materializeAllPatients().catch((err) => logger.error("Initial materialize failed:", err.message));
  void processExpiryAlerts().catch((err) => logger.error("Initial expiry check failed:", err.message));
}

export async function stopScheduler() {
  cronTasks.forEach((t) => t.stop());
  await worker?.close();
  await queue?.close();
}
