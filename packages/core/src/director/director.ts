/**
 * AI Director (PRD §9–11, §104, §106–107).
 *
 * - Mistral structured output via response_format json_schema (strict).
 * - Falls back to deterministic heuristics when MISTRAL_API_KEY is absent,
 *   so the product works end-to-end in dev without keys.
 * - Results cached by (prompt, mode, assetCount, mediaHint) hash to cut LLM spend.
 * - The Director NEVER computes prices or credits.
 */
import { createHash } from "node:crypto";
import { DirectorPlan, type DirectorPlan as DirectorPlanT } from "./types.js";
import { env } from "../env.js";
import type { GenerationMode } from "@rendervid/shared";

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  plan: DirectorPlanT;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(prompt: string, mode: GenerationMode, assetCount: number, mediaHint?: string): string {
  return createHash("sha256").update(`${prompt}::${mode}::${assetCount}::${mediaHint ?? ""}`).digest("hex");
}

/* ------------------------------------------------------------------ */
/* JSON schema handed to Mistral                                       */
/* ------------------------------------------------------------------ */

const DIRECTOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    task: { type: "string", enum: ["image", "video"] },
    workflow: {
      type: "string",
      enum: ["text_to_image", "text_to_video", "image_to_video", "image_edit", "product_shot", "advertisement"],
    },
    inputType: { type: "string", enum: ["none", "image"] },
    outputType: { type: "string", enum: ["image", "video"] },
    durationSeconds: { type: ["integer", "null"], minimum: 4, maximum: 10 },
    aspectRatio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
    style: { type: "string" },
    quality: { type: "string", enum: ["standard", "high", "maximum"] },
    subject: { type: "string" },
    motionHint: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: [
    "task",
    "workflow",
    "inputType",
    "outputType",
    "durationSeconds",
    "aspectRatio",
    "style",
    "quality",
    "subject",
    "motionHint",
    "confidence",
  ],
} as const;

const SYSTEM_PROMPT = `You are the creative production director of a premium AI studio.
You convert a user's request into a structured production plan. You optimize for task
suitability, quality, cost, speed and reliability. You never expose internal provider
or model names. You never compute prices. Return only JSON matching the schema.
Choose "product_shot" when the user references an uploaded product image.
Choose "advertisement" when the goal is selling/promoting to an audience on a platform.
Choose "image_to_video" when an image is attached and motion is requested.
Prefer 9:16 for TikTok/Reels/Shorts, 16:9 for YouTube/landscape, 1:1 for feed posts.
Durations must be between 4 and 10 seconds for video; use null for images.`;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface PlanInput {
  prompt: string;
  mode: GenerationMode;
  assetCount: number;
  mediaHint?: "image" | "video" | undefined;
}

export async function createPlan(input: PlanInput): Promise<DirectorPlanT> {
  const key = cacheKey(input.prompt, input.mode, input.assetCount, input.mediaHint);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.plan;

  let plan: DirectorPlanT | null = null;

  const { apiKey, model } = env.mistral();
  if (apiKey) {
    plan = await mistralPlan(input, model).catch(() => null);
  }
  if (!plan) plan = heuristicPlan(input);

  cache.set(key, { plan, expiresAt: Date.now() + CACHE_TTL_MS });
  return plan;
}

export function invalidatePlanCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Mistral                                                             */
/* ------------------------------------------------------------------ */

async function mistralPlan(input: PlanInput, model: string): Promise<DirectorPlanT | null> {
  const { apiKey } = env.mistral();
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            prompt: input.prompt,
            mode: input.mode,
            attachedImages: input.assetCount,
            mediaHint: input.mediaHint ?? null,
          }),
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "director_plan", strict: true, schema: DIRECTOR_JSON_SCHEMA } },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  const parsed = DirectorPlan.safeParse(JSON.parse(content));
  return parsed.success ? normalizePlan(parsed.data, input) : null;
}

/* ------------------------------------------------------------------ */
/* Deterministic heuristic fallback                                    */
/* ------------------------------------------------------------------ */

const VIDEO_HINTS = /\b(video|animate|animation|motion|clip|footage|commercial|ad\b|advertisement|trailer|reel|cinematic move|camera move|pan|zoom|orbit)\b/i;
const IMAGE_HINTS = /\b(image|photo|photograph|poster|thumbnail|illustration|logo|banner|render)\b/i;
const PRODUCT_HINTS = /\b(product|bottle|watch|sneaker|shoe|perfume|packaging|device|gadget|furniture)\b/i;
const AD_HINTS = /\b(advertisement|ad for|advert|promote|promo|sell|sales|campaign|audience|convert)\b/i;
const VERTICAL_HINTS = /\b(tiktok|reels?|story|stories|shorts|vertical|9:16)\b/i;
const HORIZONTAL_HINTS = /\b(youtube|widescreen|landscape|16:9|cinematic)\b/i;
const DURATION_RE = /\b(\d{1,2})\s*(?:-?\s*(?:sec|secs|second|seconds|s)\b)/i;
const STYLE_HINTS: Array<[RegExp, string]> = [
  [/\bcinematic\b/i, "cinematic"],
  [/\bluxury|premium|high-end\b/i, "luxury"],
  [/\bminimal\w*\b/i, "minimal"],
  [/\bplayful|fun\b/i, "playful"],
  [/\beditorial\b/i, "editorial"],
  [/\bdocumentary\b/i, "documentary"],
  [/\bvibrant|colorful\b/i, "vibrant"],
];

export function heuristicPlan(input: PlanInput): DirectorPlanT {
  const text = input.prompt;
  const wantsVideo =
    input.mediaHint === "video" ||
    (input.mediaHint !== "image" &&
      (VIDEO_HINTS.test(text) || (!IMAGE_HINTS.test(text) && input.assetCount > 0)));

  const hasImageInput = input.assetCount > 0;
  const isAd = AD_HINTS.test(text) && wantsVideo;
  const isProduct = PRODUCT_HINTS.test(text) && hasImageInput;

  let workflow: DirectorPlanT["workflow"];
  if (isAd) workflow = "advertisement";
  else if (hasImageInput && wantsVideo) workflow = "image_to_video";
  else if (isProduct) workflow = "product_shot";
  else if (wantsVideo) workflow = "text_to_video";
  else workflow = "text_to_image";

  const durMatch = DURATION_RE.exec(text);
  const durationSeconds = wantsVideo ? clampDuration(durMatch ? Number(durMatch[1]) : 5) : null;

  let aspectRatio: DirectorPlanT["aspectRatio"];
  if (VERTICAL_HINTS.test(text)) aspectRatio = "9:16";
  else if (HORIZONTAL_HINTS.test(text)) aspectRatio = "16:9";
  else if (workflow === "advertisement" || workflow === "image_to_video") aspectRatio = "9:16";
  else if (wantsVideo) aspectRatio = "16:9";
  else aspectRatio = "1:1";

  let style = "clean modern";
  for (const [re, s] of STYLE_HINTS) {
    if (re.test(text)) {
      style = s;
      break;
    }
  }

  const quality: DirectorPlanT["quality"] =
    input.mode === "quality" ? "maximum" : input.mode === "economy" ? "standard" : "high";

  return normalizePlan(
    {
      task: wantsVideo ? "video" : "image",
      workflow,
      inputType: hasImageInput ? "image" : "none",
      outputType: wantsVideo ? "video" : "image",
      durationSeconds,
      aspectRatio,
      style,
      quality,
      subject: text.slice(0, 1200),
      motionHint: wantsVideo && hasImageInput ? text.slice(0, 300) : null,
      confidence: 0.55,
    },
    input,
  );
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(4, Math.round(n)));
}

/** Belt-and-braces normalization for LLM output that parsed but is semantically off. */
function normalizePlan(plan: DirectorPlanT, input: PlanInput): DirectorPlanT {
  const out = { ...plan };
  if (out.durationSeconds !== null) out.durationSeconds = clampDuration(out.durationSeconds);
  if (out.outputType === "video" && out.durationSeconds === null) out.durationSeconds = 5;
  if (out.outputType === "image") out.durationSeconds = null;
  // An image-to-video workflow requires an attached image; demote otherwise.
  if (out.workflow === "image_to_video" && input.assetCount === 0) {
    out.workflow = "text_to_video";
    out.inputType = "none";
  }
  if (out.inputType === "image" && input.assetCount === 0) out.inputType = "none";
  return out;
}
