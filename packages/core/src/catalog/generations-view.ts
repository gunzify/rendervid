/**
 * Generation read models. DTOs are user-safe by construction:
 * provider/model names and provider costs are never selected into the shape.
 */
import { getDb } from "../db/client.js";
import { generations, assets } from "../db/schema.js";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getStorage } from "../storage/storage.js";
import type {
  AssetDto,
  GenerationDto,
  GenerationListResponse,
  GenerationStage,
  GenerationStatus,
} from "@rendervid/shared";

function stageFor(status: GenerationStatus, providerStatus: string | null): GenerationStage {
  switch (status) {
    case "created":
    case "credits_reserved":
    case "queued":
      return "understanding";
    case "submitted":
      return "building";
    case "processing":
      return providerStatus === "in_progress" ? "generating" : "building";
    case "succeeded":
      return "done";
    case "failed":
    case "refunding":
    case "refunded":
      return "failed";
    case "canceled":
      return "failed";
    default:
      return "generating";
  }
}

function progressFor(status: GenerationStatus, providerStatus: string | null): number {
  switch (status) {
    case "created":
    case "credits_reserved":
      return 5;
    case "queued":
      return 10;
    case "submitted":
      return 25;
    case "processing":
      return providerStatus === "in_progress" ? 65 : 35;
    case "succeeded":
      return 100;
    case "failed":
    case "canceled":
    case "refunding":
    case "refunded":
      return 100;
    default:
      return 40;
  }
}

export async function generationToDto(generationId: string, userId: string): Promise<GenerationDto | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.userId, userId)))
    .limit(1);
  const g = rows[0];
  if (!g) return null;

  const assetRows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.generationId, g.id), isNull(assets.deletedAt)));

  const storage = getStorage();
  const assetDtos: AssetDto[] = await Promise.all(
    assetRows.map(async (a) => ({
      id: a.id,
      projectId: a.projectId,
      type: a.type as AssetDto["type"],
      url: await storage.signedUrl(a.storageKey),
      thumbnailUrl: a.thumbnailStorageKey ? await storage.signedUrl(a.thumbnailStorageKey) : null,
      mimeType: a.mimeType,
      width: a.width,
      height: a.height,
      durationSeconds: a.durationMs ? a.durationMs / 1000 : null,
      fileSize: a.fileSize,
      generationId: a.generationId,
      createdAt: a.createdAt.toISOString(),
      favorite: a.favorite,
    })),
  );

  return {
    id: g.id,
    status: g.status,
    stage: stageFor(g.status, g.providerStatus),
    progress: progressFor(g.status, g.providerStatus),
    prompt: g.prompt,
    mode: g.mode as GenerationDto["mode"],
    contentType: g.contentType,
    quality: g.quality as GenerationDto["quality"],
    durationSeconds: g.durationSeconds,
    aspectRatio: g.aspectRatio,
    reservedCredits: g.reservedCredits,
    chargedCredits: g.chargedCredits,
    refundedCredits: g.refundedCredits,
    assets: assetDtos,
    failureMessage: g.failureMessage,
    createdAt: g.createdAt.toISOString(),
    completedAt: g.completedAt?.toISOString() ?? null,
  };
}

export async function listGenerations(
  userId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<GenerationListResponse> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const conditions = [eq(generations.userId, userId)];
  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(generations.createdAt, cursorDate));
    }
  }

  const rows = await db
    .select()
    .from(generations)
    .where(and(...conditions))
    .orderBy(desc(generations.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const storage = getStorage();

  const items = await Promise.all(
    page.map(async (g) => {
      const assetRows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.generationId, g.id), isNull(assets.deletedAt)));
      const assetDtos: AssetDto[] = await Promise.all(
        assetRows.map(async (a) => ({
          id: a.id,
          projectId: a.projectId,
          type: a.type as AssetDto["type"],
          url: await storage.signedUrl(a.storageKey),
          thumbnailUrl: a.thumbnailStorageKey ? await storage.signedUrl(a.thumbnailStorageKey) : null,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          durationSeconds: a.durationMs ? a.durationMs / 1000 : null,
          fileSize: a.fileSize,
          generationId: a.generationId,
          createdAt: a.createdAt.toISOString(),
          favorite: a.favorite,
        })),
      );
      return {
        id: g.id,
        status: g.status,
        stage: stageFor(g.status, g.providerStatus),
        progress: progressFor(g.status, g.status === "processing" ? g.providerStatus : g.providerStatus),
        prompt: g.prompt,
        mode: g.mode as GenerationDto["mode"],
        contentType: g.contentType,
        quality: g.quality as GenerationDto["quality"],
        durationSeconds: g.durationSeconds,
        aspectRatio: g.aspectRatio,
        reservedCredits: g.reservedCredits,
        chargedCredits: g.chargedCredits,
        refundedCredits: g.refundedCredits,
        assets: assetDtos,
        failureMessage: g.failureMessage,
        createdAt: g.createdAt.toISOString(),
        completedAt: g.completedAt?.toISOString() ?? null,
      } satisfies GenerationDto;
    }),
  );

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}
