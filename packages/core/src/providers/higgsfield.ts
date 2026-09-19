/**
 * Higgsfield provider adapter.
 * Auth: `Authorization: Key {keyId}:{keySecret}` — server-side only, never client.
 * Lifecycle: queued → in_progress → completed | failed | nsfw | canceled.
 */
import { env } from "../env.js";
import type {
  GenerationProvider,
  ProviderJobHandle,
  ProviderStatusResult,
  ProviderSubmission,
} from "./types.js";
import { isRetryableProviderError } from "./types.js";

export class HiggsfieldProvider implements GenerationProvider {
  readonly id = "higgsfield";

  private authHeader(): string {
    const { keyId, keySecret } = env.higgsfield();
    return `Key ${keyId}:${keySecret}`;
  }

  async submit(input: ProviderSubmission): Promise<ProviderJobHandle> {
    const { baseUrl } = env.higgsfield();
    const url = `${baseUrl}${input.endpointPath}`;

    const body: Record<string, unknown> = {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      ...(input.durationSeconds ? { duration: input.durationSeconds } : {}),
      ...(input.inputImageUrls.length > 0 ? { image: input.inputImageUrls[0] } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        JSON.stringify({
          code: isRetryableProviderError(res.status) ? "provider_unavailable" : "bad_request",
          status: res.status,
          provider: "higgsfield",
          detail: errText.slice(0, 500),
        }),
      );
    }

    const data = (await res.json()) as {
      status: ProviderJobHandle["initialStatus"];
      request_id: string;
      status_url?: string;
      cancel_url?: string;
    };

    return {
      providerRequestId: data.request_id,
      statusUrl: data.status_url ?? null,
      cancelUrl: data.cancel_url ?? null,
      initialStatus: data.status,
    };
  }

  async status(providerRequestId: string): Promise<ProviderStatusResult> {
    const { baseUrl } = env.higgsfield();
    const res = await fetch(`${baseUrl}/requests/${providerRequestId}/status`, {
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return {
        providerStatus: "failed",
        outputs: [],
        errorCode: isRetryableProviderError(res.status) ? "provider_unavailable" : "bad_request",
        errorMessage: `Status check failed with HTTP ${res.status}`,
        retryable: isRetryableProviderError(res.status),
      };
    }

    const data = (await res.json()) as {
      status: ProviderStatusResult["providerStatus"];
      images?: Array<{ url: string }>;
      video?: { url: string };
      audio?: { url: string };
      error?: { code?: string; message?: string };
    };

    const outputs = [];
    if (data.images) for (const img of data.images) outputs.push({ kind: "image" as const, url: img.url });
    if (data.video) outputs.push({ kind: "video" as const, url: data.video.url });
    if (data.audio) outputs.push({ kind: "audio" as const, url: data.audio.url });

    const retryable =
      data.status === "failed" ? isRetryableProviderError(data.error?.code ?? "provider_error") : false;

    return {
      providerStatus: data.status,
      outputs,
      errorCode: data.error?.code,
      errorMessage: data.error?.message,
      retryable,
    };
  }

  async cancel(providerRequestId: string): Promise<void> {
    const { baseUrl } = env.higgsfield();
    await fetch(`${baseUrl}/requests/${providerRequestId}/cancel`, {
      method: "POST",
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => undefined); // cancellation is best-effort
  }
}
