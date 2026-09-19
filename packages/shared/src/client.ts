/**
 * Typed API client shared by web and mobile.
 * baseUrl: absolute base URL of the RenderVid API.
 * getToken: returns the Supabase JWT access token (sent as Bearer).
 */
import { z } from "zod";
import {
  ApiError,
  BillingDto,
  CreateGenerationRequest,
  CreateGenerationResponse,
  EstimateRequest,
  EstimateResponse,
  GenerationDto,
  GenerationListResponse,
  PlanDto,
  ProjectDto,
  SignInRequest,
  SignUpRequest,
  TransactionListResponse,
  UploadInitiateRequest,
  UploadInitiateResponse,
  WalletDto,
  AuthSession,
  OnboardingUpdate,
  AssetDto,
} from "./index.js";

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    messageText: string,
    public readonly hint?: string,
    public readonly status?: number,
  ) {
    super(messageText);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null>;
  private readonly onUnauthorized: (() => void) | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getToken = opts.getToken;
    this.onUnauthorized = opts.onUnauthorized;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<T extends z.ZodTypeAny>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
    const token = await this.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

    if (res.status === 401) this.onUnauthorized?.();

    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }

    if (!res.ok) {
      const parsed = ApiError.safeParse(body);
      if (parsed.success) {
        throw new ApiClientError(
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.hint,
          res.status,
        );
      }
      throw new ApiClientError("internal_error", `Request failed (${res.status})`, undefined, res.status);
    }

    return schema.parse(body);
  }

  /* ---------------- auth ---------------- */

  async signUp(req: SignUpRequest): Promise<AuthSession> {
    return this.request(AuthSession, "/api/auth/signup", { method: "POST", body: JSON.stringify(req) });
  }

  async signIn(req: SignInRequest): Promise<AuthSession> {
    return this.request(AuthSession, "/api/auth/signin", { method: "POST", body: JSON.stringify(req) });
  }

  async completeOnboarding(req: OnboardingUpdate): Promise<{ ok: true }> {
    return this.request(z.object({ ok: z.literal(true) }), "/api/user/onboarding", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /* ---------------- profile / wallet ---------------- */

  async getWallet(): Promise<WalletDto> {
    return this.request(WalletDto, "/api/credits/wallet");
  }

  async getPlans(): Promise<PlanDto[]> {
    return this.request(z.array(PlanDto), "/api/billing/plans");
  }

  async getBilling(): Promise<BillingDto> {
    return this.request(BillingDto, "/api/billing");
  }

  async getTransactions(cursor?: string): Promise<TransactionListResponse> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request(TransactionListResponse, `/api/credits/transactions${q}`);
  }

  async purchaseCredits(packId: string): Promise<{ checkoutUrl: string }> {
    return this.request(z.object({ checkoutUrl: z.string() }), "/api/billing/checkout/credits", {
      method: "POST",
      body: JSON.stringify({ packId }),
    });
  }

  async startSubscription(planId: string): Promise<{ checkoutUrl: string }> {
    return this.request(z.object({ checkoutUrl: z.string() }), "/api/billing/checkout/subscription", {
      method: "POST",
      body: JSON.stringify({ planId }),
    });
  }

  async getBillingPortal(): Promise<{ portalUrl: string }> {
    return this.request(z.object({ portalUrl: z.string() }), "/api/billing/portal", { method: "POST" });
  }

  /* ---------------- projects ---------------- */

  async listProjects(): Promise<ProjectDto[]> {
    return this.request(z.array(ProjectDto), "/api/projects");
  }

  async createProject(name: string, description?: string): Promise<ProjectDto> {
    return this.request(ProjectDto, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  /* ---------------- assets ---------------- */

  async listAssets(projectId?: string, favoriteOnly?: boolean): Promise<AssetDto[]> {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (favoriteOnly) params.set("favorite", "true");
    const qs = params.toString();
    return this.request(z.array(AssetDto), `/api/assets${qs ? `?${qs}` : ""}`);
  }

  async toggleFavorite(assetId: string): Promise<AssetDto> {
    return this.request(AssetDto, `/api/assets/${assetId}/favorite`, { method: "POST" });
  }

  async deleteAsset(assetId: string): Promise<{ ok: true }> {
    return this.request(z.object({ ok: z.literal(true) }), `/api/assets/${assetId}`, { method: "DELETE" });
  }

  async initiateUpload(req: UploadInitiateRequest): Promise<UploadInitiateResponse> {
    return this.request(UploadInitiateResponse, "/api/upload", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  /* ---------------- estimates & generation ---------------- */

  async estimate(req: EstimateRequest): Promise<EstimateResponse> {
    return this.request(EstimateResponse, "/api/generations/estimate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async createGeneration(req: CreateGenerationRequest): Promise<CreateGenerationResponse> {
    return this.request(CreateGenerationResponse, "/api/generations", {
      method: "POST",
      body: JSON.stringify(req),
    });
  }

  async getGeneration(id: string): Promise<GenerationDto> {
    return this.request(GenerationDto, `/api/generations/${id}`);
  }

  async listGenerations(cursor?: string, limit = 20): Promise<GenerationListResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request(GenerationListResponse, `/api/generations?${params.toString()}`);
  }

  async cancelGeneration(id: string): Promise<GenerationDto> {
    return this.request(GenerationDto, `/api/generations/${id}/cancel`, { method: "POST" });
  }
}
