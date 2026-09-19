/**
 * Projects & assets services. Every query filters by userId — IDOR-proof by construction.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { projects, assets } from "../db/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { DomainError } from "../credits/errors.js";
import { getStorage } from "../storage/storage.js";
import { uploadKey } from "../storage/storage.js";
import type { ProjectDto, AssetDto } from "@rendervid/shared";

export async function listProjects(userId: string): Promise<ProjectDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      p: projects,
      assetCount: sql<number>`count(${assets.id})::int`,
    })
    .from(projects)
    .leftJoin(assets, and(eq(assets.projectId, projects.id), isNull(assets.deletedAt)))
    .where(and(eq(projects.userId, userId), eq(projects.archived, false)))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));
  return rows.map((r) => ({
    id: r.p.id,
    name: r.p.name,
    description: r.p.description ?? undefined,
    createdAt: r.p.createdAt.toISOString(),
    assetCount: r.assetCount,
  }));
}

export async function createProject(userId: string, name: string, description?: string): Promise<ProjectDto> {
  const db = getDb();
  const rows = await db
    .insert(projects)
    .values({ id: randomUUID(), userId, name: name.slice(0, 120), description: description ? description.slice(0, 500) : null })
    .returning();
  const p = rows[0]!;
  return { id: p.id, name: p.name, description: p.description ?? undefined, createdAt: p.createdAt.toISOString(), assetCount: 0 };
}

export async function assertProjectOwner(userId: string, projectId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new DomainError("not_found", "Project not found");
}

export async function listAssets(
  userId: string,
  opts: { projectId?: string; favoriteOnly?: boolean; limit?: number } = {},
): Promise<AssetDto[]> {
  const db = getDb();
  const conditions = [eq(assets.userId, userId), isNull(assets.deletedAt)];
  if (opts.projectId) conditions.push(eq(assets.projectId, opts.projectId));
  if (opts.favoriteOnly) conditions.push(eq(assets.favorite, true));

  const rows = await db
    .select()
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt))
    .limit(opts.limit ?? 100);

  const storage = getStorage();
  return Promise.all(
    rows.map(async (a) => ({
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
}

export async function getAsset(userId: string, assetId: string): Promise<AssetDto | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId), isNull(assets.deletedAt)))
    .limit(1);
  const a = rows[0];
  if (!a) return null;
  const storage = getStorage();
  return {
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
  };
}

export async function toggleFavorite(userId: string, assetId: string): Promise<AssetDto | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
    .limit(1);
  const a = rows[0];
  if (!a) return null;
  await db.update(assets).set({ favorite: !a.favorite }).where(eq(assets.id, assetId));
  return getAsset(userId, assetId);
}

export async function softDeleteAsset(userId: string, assetId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId), isNull(assets.deletedAt)))
    .returning({ id: assets.id });
  return rows.length > 0;
}

/** Creates a pending upload asset row and returns the storage key to upload to. */
export async function prepareUpload(
  userId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number; projectId?: string | null },
): Promise<{ storageKey: string }> {
  if (input.projectId) await assertProjectOwner(userId, input.projectId);
  const key = uploadKey(userId, input.fileName);
  return { storageKey: key };
}

export async function finalizeUpload(
  userId: string,
  storageKey: string,
  input: { mimeType: string; sizeBytes: number; projectId?: string | null },
): Promise<string> {
  const db = getDb();
  const rows = await db
    .insert(assets)
    .values({
      userId,
      projectId: input.projectId ?? null,
      type: input.mimeType.startsWith("video/") ? "video" : "image",
      mimeType: input.mimeType,
      storageKey,
      fileSize: input.sizeBytes,
      source: "upload",
    })
    .returning({ id: assets.id });
  return rows[0]!.id;
}
