/**
 * Runs once when the Next.js server starts.
 * In inline queue mode the web server processes generation jobs itself
 * (dev-friendly, zero infra). In redis mode the dedicated worker process
 * (workers/) consumes queues instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env, startProcessor } = await import("@rendervid/core");
    const { processJob } = await import("@rendervid/core/jobs");
    if (env.queueMode() === "inline") {
      startProcessor(processJob);
      console.log("[rendervid] inline job processor started (QUEUE_MODE=inline)");
    }
  }
}
