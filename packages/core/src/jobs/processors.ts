/**
 * Job processors. The queue delivers (queue, name, payload); this maps to logic.
 */
import { pollGeneration } from "../generation/executor.js";
import { executeGeneration } from "../generation/executor.js";

export async function processJob(
  queue: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (queue !== "generation") return;
  const generationId = typeof payload.generationId === "string" ? payload.generationId : null;
  if (!generationId) return;

  switch (name) {
    case "execute":
      await executeGeneration(generationId);
      break;
    case "poll":
      await pollGeneration(generationId, typeof payload.pollIndex === "number" ? payload.pollIndex : 0);
      break;
    default:
      break;
  }
}
