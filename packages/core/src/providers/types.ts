/**
 * Provider abstraction (PRD §33, §159). Higgsfield is the first provider,
 * not the product. Adding OpenAI/Runway/Fal later means adding files here only.
 */

export interface ProviderSubmission {
  /** Provider-internal model id (from the models registry). */
  providerModelId: string;
  endpointPath: string;
  /** Final normalized prompt after Director processing. */
  prompt: string;
  /** Publicly fetchable input image URLs (uploaded by us beforehand). */
  inputImageUrls: string[];
  durationSeconds: number | null;
  aspectRatio: string;
  /** Opaque metadata echoed back by some providers. */
  metadata?: Record<string, unknown>;
}

export interface ProviderJobHandle {
  providerRequestId: string;
  statusUrl: string | null;
  cancelUrl: string | null;
  initialStatus: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
}

export interface ProviderOutput {
  kind: "image" | "video" | "audio" | "other";
  url: string;
}

export interface ProviderStatusResult {
  providerStatus: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
  outputs: ProviderOutput[];
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  /** Whether an automatic retry could plausibly succeed (PRD §37). */
  retryable: boolean;
}

export interface GenerationProvider {
  readonly id: string;
  submit(input: ProviderSubmission): Promise<ProviderJobHandle>;
  status(providerRequestId: string): Promise<ProviderStatusResult>;
  cancel(providerRequestId: string): Promise<void>;
}

/** Classify provider/HTTP errors for retry policy (PRD §37). */
export function isRetryableProviderError(statusOrCode: number | string): boolean {
  if (typeof statusOrCode === "number") {
    return statusOrCode === 408 || statusOrCode === 429 || statusOrCode >= 500;
  }
  const code = statusOrCode.toLowerCase();
  return ["timeout", "temporarily_unavailable", "rate_limited", "internal", "network"].includes(code);
}
