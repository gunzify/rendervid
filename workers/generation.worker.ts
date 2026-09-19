/**
 * Dedicated generation worker (PRD §36). Run with QUEUE_MODE=redis.
 * pnpm dev:worker
 */
import "dotenv/config";
import { processJob } from "@rendervid/core/jobs";
import { env } from "@rendervid/core";

async function main() {
  if (env.queueMode() !== "redis") {
    console.log("[worker] QUEUE_MODE is not 'redis' — nothing to do here.");
    console.log("[worker] The web app processes jobs inline in this mode.");
    return;
  }

  const { Worker } = await import("bullmq");
  const { default: IORedis } = await import("ioredis");
  const connection = new IORedis(env.redisUrl(), { maxRetriesPerRequest: null });

  const worker = new Worker(
    "generation",
    async (job) => {
      console.log(`[worker] ${job.name} ${JSON.stringify(job.data)}`);
      await processJob("generation", job.name, job.data as Record<string, unknown>);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  const mediaWorker = new Worker(
    "media",
    async (job) => {
      await processJob("media", job.name, job.data as Record<string, unknown>);
    },
    { connection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] generation job ${job?.id} failed:`, err.message);
  });

  console.log("[worker] generation worker ready (redis)");
  void mediaWorker;

  const shutdown = async () => {
    await worker.close();
    await mediaWorker.close();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
