/**
 * Queue abstraction (PRD §36).
 * QUEUE_MODE=redis → BullMQ (separate worker process).
 * QUEUE_MODE=inline → in-process timers, zero infrastructure, dev-friendly.
 * Business logic lives in processors; the transport is swappable.
 */
import { env } from "../env.js";

export type QueueName = "generation" | "media" | "billing" | "cleanup";

export interface EnqueueOptions {
  delayMs?: number | undefined;
  attempts?: number | undefined;
  jobId?: string | undefined;
}

interface Driver {
  enqueue(queue: QueueName, name: string, payload: Record<string, unknown>, opts?: EnqueueOptions): Promise<void>;
  start(processor: (queue: QueueName, name: string, payload: Record<string, unknown>) => Promise<void>): void;
}

/* ------------------------------------------------------------------ */
/* Inline driver (dev)                                                 */
/* ------------------------------------------------------------------ */

const pending = new Set<ReturnType<typeof setTimeout>>();

type ProcessorFn = (queue: QueueName, name: string, payload: Record<string, unknown>) => Promise<void>;

class InlineDriver implements Driver {
  private processor: ProcessorFn | null = null;

  async enqueue(queue: QueueName, name: string, payload: Record<string, unknown>, opts?: EnqueueOptions): Promise<void> {
    const delay = opts?.delayMs ?? 0;
    const t = setTimeout(async () => {
      pending.delete(t);
      try {
        await this.processor?.(queue, name, payload);
      } catch (err) {
        console.error(`[inline-queue] ${queue}/${name} failed:`, err);
      }
    }, delay);
    pending.add(t);
  }

  start(processor: ProcessorFn): void {
    this.processor = processor;
  }

  clear(): void {
    for (const t of pending) clearTimeout(t);
    pending.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Redis/BullMQ driver (production)                                    */
/* ------------------------------------------------------------------ */

class RedisDriver implements Driver {
  private queues: Map<QueueName, import("bullmq").Queue> = new Map();

  private async getQueue(name: QueueName): Promise<import("bullmq").Queue> {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const { Queue } = await import("bullmq");
    const q = new Queue(name, { connection: await this.connection() });
    this.queues.set(name, q);
    return q;
  }

  private async connection(): Promise<import("ioredis").default> {
    const { default: IORedis } = await import("ioredis");
    return new IORedis(env.redisUrl(), { maxRetriesPerRequest: null });
  }

  async enqueue(queue: QueueName, name: string, payload: Record<string, unknown>, opts?: EnqueueOptions): Promise<void> {
    const q = await this.getQueue(queue);
    await q.add(name, payload, {
      delay: opts?.delayMs ?? 0,
      attempts: opts?.attempts ?? 1,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    });
  }

  start(_processor: (queue: QueueName, name: string, payload: Record<string, unknown>) => Promise<void>): void {
    // Workers run in workers/ processes (see workers/generation.worker.ts).
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line no-var
  var __rendervidQueueDriver: Driver | undefined;
}

/**
 * The driver is process-global (not module-global): Next.js dev can load this
 * module twice (routes vs instrumentation), and the inline processor must be
 * visible to whichever module enqueues a job.
 */
function getDriver(): Driver {
  if (!globalThis.__rendervidQueueDriver) {
    globalThis.__rendervidQueueDriver = env.queueMode() === "redis" ? new RedisDriver() : new InlineDriver();
  }
  return globalThis.__rendervidQueueDriver;
}

export async function enqueue(
  queue: QueueName,
  name: string,
  payload: Record<string, unknown>,
  opts?: EnqueueOptions,
): Promise<void> {
  await getDriver().enqueue(queue, name, payload, opts);
}

/** No-op in web process; called by worker entrypoint in redis mode. */
export function startProcessor(
  processor: (queue: QueueName, name: string, payload: Record<string, unknown>) => Promise<void>,
): void {
  getDriver().start(processor);
}

/** Flush pending inline timers (tests). */
export function disposeInlineQueue(): void {
  const d = globalThis.__rendervidQueueDriver;
  if (d instanceof InlineDriver) d.clear();
}
