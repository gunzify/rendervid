/**
 * Mock provider — runs the entire product loop without external credentials.
 * Behaviors controlled by prompt markers (useful for demos/tests):
 *   "[fail]"   → terminal failure (refund path)
 *   "[flake]"  → transient provider error on first submit (retry path)
 *   "[nsfw]"   → moderation rejection
 *   "[slow]"   → longer latency
 */
import { env } from "../env.js";
import type {
  GenerationProvider,
  ProviderJobHandle,
  ProviderStatusResult,
  ProviderSubmission,
  ProviderOutput,
} from "./types.js";

interface MockJob {
  status: ProviderJobHandle["initialStatus"];
  readyAt: number;
  outputs: ProviderOutput[];
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __rendervidMockJobs: Map<string, MockJob> | undefined;
}

function jobs(): Map<string, MockJob> {
  if (!globalThis.__rendervidMockJobs) globalThis.__rendervidMockJobs = new Map();
  return globalThis.__rendervidMockJobs;
}

let counter = 0;
let flakeToggle = 0;

export class MockProvider implements GenerationProvider {
  readonly id = "mock";

  async submit(input: ProviderSubmission): Promise<ProviderJobHandle> {
    counter += 1;
    const id = `mock-${Date.now()}-${counter}`;

    if (input.prompt.includes("[flake]")) {
      flakeToggle += 1;
      if (flakeToggle % 2 === 1) {
        throw new Error(
          JSON.stringify({ code: "provider_unavailable", status: 503, provider: "mock", retryable: true }),
        );
      }
    }

    const latency = input.prompt.includes("[slow]") ? 12_000 : env.mockLatencyMs();
    const now = Date.now();
    const kind: ProviderOutput["kind"] = input.durationSeconds !== null ? "video" : "image";
    const ext = kind === "video" ? "mp4" : "png";

    const job: MockJob = {
      status: "queued",
      readyAt: now + latency,
      outputs: [{ kind, url: `mock://outputs/${id}/out.${ext}` }],
    };

    if (input.prompt.includes("[fail]")) {
      job.status = "failed";
      job.errorCode = "provider_error";
      job.errorMessage = "Simulated terminal provider failure";
      job.retryable = false;
      job.outputs = [];
    } else if (input.prompt.includes("[nsfw]")) {
      job.status = "nsfw";
      job.errorCode = "moderation_rejected";
      job.errorMessage = "Request rejected by content moderation";
      job.outputs = [];
    }

    jobs().set(id, job);
    return { providerRequestId: id, statusUrl: null, cancelUrl: null, initialStatus: job.status };
  }

  async status(providerRequestId: string): Promise<ProviderStatusResult> {
    const job = jobs().get(providerRequestId);
    if (!job) {
      return {
        providerStatus: "failed",
        outputs: [],
        errorCode: "not_found",
        errorMessage: "Unknown mock job",
        retryable: false,
      };
    }
    if (job.status === "queued" && Date.now() >= job.readyAt) {
      job.status = "completed";
    }
    return {
      providerStatus: job.status,
      outputs: job.status === "completed" ? job.outputs : [],
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      retryable: job.retryable ?? false,
    };
  }

  async cancel(providerRequestId: string): Promise<void> {
    jobs().delete(providerRequestId);
  }
}
