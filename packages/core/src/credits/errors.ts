export class DomainError extends Error {
  constructor(
    public readonly code:
      | "bad_request"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "insufficient_credits"
      | "rate_limited"
      | "moderation_rejected"
      | "provider_unavailable"
      | "internal_error",
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class InsufficientCreditsError extends DomainError {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      "insufficient_credits",
      `This creation needs ${required} credits but only ${available} are available.`,
      "Add credits or try Economy mode.",
    );
  }
}
