/**
 * RenderVid AI — shared API contracts.
 *
 * RULES ENCODED HERE:
 * - Customer-facing DTOs never contain provider or model names, provider costs, or USD margins.
 * - Money is represented as integer micro-USD (1_000_000 micros = $1.00) to avoid float errors.
 * - Credits are integers. The client may *display* estimates but never *decides* them.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Money primitives                                                    */
/* ------------------------------------------------------------------ */

/** Integer micro-USD. 1_000_000 micros = $1.00. */
export const MicroUsd = z.number().int().nonnegative();
export type MicroUsd = z.infer<typeof MicroUsd>;

/** Credits are whole, non-negative integers. */
export const CreditAmount = z.number().int().nonnegative();
export type CreditAmount = z.infer<typeof CreditAmount>;

/** Basis points: 10_000 = 1.0x. Default markup 2.5x = 25_000. */
export const BasisPoints = z.number().int().positive();
export type BasisPoints = z.infer<typeof BasisPoints>;

/* ------------------------------------------------------------------ */
/* User-facing vocabulary (the ONLY quality/mode words users see)      */
/* ------------------------------------------------------------------ */

export const GenerationMode = z.enum(["auto", "quality", "economy"]);
export type GenerationMode = z.infer<typeof GenerationMode>;

export const MediaType = z.enum(["image", "video"]);
export type MediaType = z.infer<typeof MediaType>;

/** Customer-facing quality label shown in the "Why this amount?" breakdown. */
export const QualityLabel = z.enum(["standard", "high", "maximum"]);
export type QualityLabel = z.infer<typeof QualityLabel>;

/* ------------------------------------------------------------------ */
/* Internal generation lifecycle                                       */
/* ------------------------------------------------------------------ */

export const GenerationStatus = z.enum([
  "created",
  "credits_reserved",
  "queued",
  "submitted",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "refunding",
  "refunded",
]);
export type GenerationStatus = z.infer<typeof GenerationStatus>;

export const TERMINAL_STATUSES: readonly GenerationStatus[] = [
  "succeeded",
  "failed",
  "canceled",
  "refunded",
];

export const isTerminal = (s: GenerationStatus): boolean => TERMINAL_STATUSES.includes(s);

/** Allowed state machine transitions (PRD §92). Enforced server-side. */
export const ALLOWED_TRANSITIONS: Record<GenerationStatus, readonly GenerationStatus[]> = {
  created: ["credits_reserved", "failed"],
  credits_reserved: ["queued", "failed", "refunding"],
  queued: ["submitted", "failed", "canceled", "refunding"],
  submitted: ["processing", "failed", "canceled", "refunding"],
  processing: ["succeeded", "failed", "refunding"],
  succeeded: [],
  failed: ["refunding", "refunded"],
  canceled: ["refunding", "refunded"],
  refunding: ["refunded", "failed"],
  refunded: [],
};

export function assertTransition(from: GenerationStatus, to: GenerationStatus): void {
  if (from === to) return; // idempotent no-op
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal generation transition: ${from} -> ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

export const CreditTransactionType = z.enum([
  "PURCHASE",
  "SUBSCRIPTION",
  "GENERATION_RESERVATION",
  "GENERATION_CHARGE",
  "GENERATION_REFUND",
  "BONUS",
  "ADMIN_ADJUSTMENT",
  "PROMOTION",
  "EXPIRATION",
]);
export type CreditTransactionType = z.infer<typeof CreditTransactionType>;

export const CreditPool = z.enum(["paid", "bonus"]);
export type CreditPool = z.infer<typeof CreditPool>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_conflict",
  "insufficient_credits",
  "rate_limited",
  "moderation_rejected",
  "provider_unavailable",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** User-safe remediation hints; may be shown in UI. */
    hint: z.string().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const AuthSession = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    onboardingCompleted: z.boolean(),
  }),
});
export type AuthSession = z.infer<typeof AuthSession>;

export const SignUpRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

export const SignInRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

export const OnboardingUpdate = z.object({
  creatorType: z.enum([
    "content",
    "business",
    "marketing",
    "ecommerce",
    "agency",
    "exploring",
  ]),
  interests: z.array(z.enum(["images", "videos", "ads", "social", "product", "everything"])).min(1),
});
export type OnboardingUpdate = z.infer<typeof OnboardingUpdate>;

/* ------------------------------------------------------------------ */
/* Projects & assets                                                   */
/* ------------------------------------------------------------------ */

export const ProjectDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  assetCount: z.number().int().nonnegative(),
});
export type ProjectDto = z.infer<typeof ProjectDto>;

export const AssetDto = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  type: z.enum(["image", "video", "audio", "document", "thumbnail"]),
  /** Signed URL, short-lived. */
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  mimeType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationSeconds: z.number().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  generationId: z.string().uuid().nullable(),
  createdAt: z.string(),
  favorite: z.boolean(),
});
export type AssetDto = z.infer<typeof AssetDto>;

/* ------------------------------------------------------------------ */
/* Generation estimates (shown BEFORE charging anyone)                 */
/* ------------------------------------------------------------------ */

export const EstimateRequest = z.object({
  prompt: z.string().min(1).max(4000),
  mode: GenerationMode.default("auto"),
  /** Client asset ids referenced as inputs (image-to-video etc.). */
  assetIds: z.array(z.string().uuid()).max(4).default([]),
  mediaHint: MediaType.optional(),
});
export type EstimateRequest = z.infer<typeof EstimateRequest>;

/** Breakdown is user-safe: no provider names, no USD, no model ids. */
export const EstimateBreakdownLine = z.object({
  label: z.string(),
  detail: z.string().optional(),
  credits: CreditAmount,
});
export type EstimateBreakdownLine = z.infer<typeof EstimateBreakdownLine>;

export const EstimateResponse = z.object({
  estimateId: z.string(),
  contentType: z.string(),
  quality: QualityLabel,
  durationSeconds: z.number().int().nullable(),
  aspectRatio: z.string().nullable(),
  estimatedCredits: CreditAmount,
  walletBalance: CreditAmount,
  remainingAfter: z.number().int(), // may be negative if unaffordable
  affordable: z.boolean(),
  breakdown: z.array(EstimateBreakdownLine),
  /** Frontends must treat this as a display hint, not a price commitment. */
  expiresAt: z.string(),
});
export type EstimateResponse = z.infer<typeof EstimateResponse>;

/* ------------------------------------------------------------------ */
/* Generation create / status                                          */
/* ------------------------------------------------------------------ */

export const CreateGenerationRequest = z.object({
  prompt: z.string().min(1).max(4000),
  mode: GenerationMode.default("auto"),
  estimateId: z.string().optional(),
  projectId: z.string().uuid().nullable().default(null),
  assetIds: z.array(z.string().uuid()).max(4).default([]),
  /** Ties a user double-click / app retry to the same generation. */
  idempotencyKey: z.string().min(8).max(100),
});
export type CreateGenerationRequest = z.infer<typeof CreateGenerationRequest>;

export const CreateGenerationResponse = z.object({
  generationId: z.string().uuid(),
  status: GenerationStatus,
  /** Actual reserved amount (server-authoritative; may differ from estimate). */
  reservedCredits: CreditAmount,
  walletBalanceAfter: CreditAmount,
  projectId: z.string().uuid().nullable(),
});
export type CreateGenerationResponse = z.infer<typeof CreateGenerationResponse>;

/** User-safe progress stage names — the only "pipeline" a user ever sees. */
export const GenerationStage = z.enum([
  "understanding",
  "building",
  "generating",
  "finalizing",
  "done",
  "failed",
]);
export type GenerationStage = z.infer<typeof GenerationStage>;

export const GenerationDto = z.object({
  id: z.string().uuid(),
  status: GenerationStatus,
  stage: GenerationStage,
  progress: z.number().int().min(0).max(100),
  prompt: z.string(),
  mode: GenerationMode,
  contentType: z.string(),
  quality: QualityLabel,
  durationSeconds: z.number().int().nullable(),
  aspectRatio: z.string().nullable(),
  reservedCredits: CreditAmount,
  chargedCredits: CreditAmount.nullable(),
  refundedCredits: CreditAmount.nullable(),
  assets: z.array(AssetDto).default([]),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type GenerationDto = z.infer<typeof GenerationDto>;

export const GenerationListResponse = z.object({
  items: z.array(GenerationDto),
  nextCursor: z.string().nullable(),
});
export type GenerationListResponse = z.infer<typeof GenerationListResponse>;

/* ------------------------------------------------------------------ */
/* Wallet, transactions, plans, packs                                  */
/* ------------------------------------------------------------------ */

export const WalletDto = z.object({
  paidCredits: CreditAmount,
  bonusCredits: CreditAmount,
  reservedCredits: CreditAmount,
  availableCredits: CreditAmount,
  totalCredits: CreditAmount,
});
export type WalletDto = z.infer<typeof WalletDto>;

export const TransactionDto = z.object({
  id: z.string().uuid(),
  type: CreditTransactionType,
  pool: CreditPool,
  amount: z.number().int(), // signed
  balanceAfter: z.number().int(),
  description: z.string(),
  generationId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type TransactionDto = z.infer<typeof TransactionDto>;

export const TransactionListResponse = z.object({
  items: z.array(TransactionDto),
  nextCursor: z.string().nullable(),
});
export type TransactionListResponse = z.infer<typeof TransactionListResponse>;

export const PlanDto = z.object({
  id: z.enum(["free", "creator", "pro", "studio", "agency"]),
  name: z.string(),
  monthlyPriceUsdCents: z.number().int().nonnegative(),
  monthlyCredits: CreditAmount,
  features: z.array(z.string()),
  current: z.boolean(),
});
export type PlanDto = z.infer<typeof PlanDto>;

export const CreditPackDto = z.object({
  id: z.string(),
  name: z.string(),
  credits: CreditAmount,
  bonusCredits: CreditAmount,
  priceUsdCents: z.number().int().nonnegative(),
});
export type CreditPackDto = z.infer<typeof CreditPackDto>;

export const BillingDto = z.object({
  plan: PlanDto.nullable(),
  wallet: WalletDto,
  stripePortalUrl: z.string().nullable(),
  autoTopUpEnabled: z.boolean(),
});
export type BillingDto = z.infer<typeof BillingDto>;

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

export const UploadInitiateRequest = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]),
  sizeBytes: z.number().int().min(1).max(200 * 1024 * 1024),
  projectId: z.string().uuid().nullable().default(null),
});
export type UploadInitiateRequest = z.infer<typeof UploadInitiateRequest>;

export const UploadInitiateResponse = z.object({
  uploadUrl: z.string(),
  method: z.literal("PUT"),
  headers: z.record(z.string()),
  assetId: z.string().uuid().nullable(),
});
export type UploadInitiateResponse = z.infer<typeof UploadInitiateResponse>;

/* ------------------------------------------------------------------ */
/* Webhook payload contracts (internal; signature-checked at edge)     */
/* ------------------------------------------------------------------ */

export const ProviderWebhookPayload = z.object({
  requestId: z.string(),
  status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]),
  outputs: z
    .object({
      images: z.array(z.object({ url: z.string() })).optional(),
      video: z.object({ url: z.string() }).optional(),
      audio: z.object({ url: z.string() }).optional(),
    })
    .optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
});
export type ProviderWebhookPayload = z.infer<typeof ProviderWebhookPayload>;
