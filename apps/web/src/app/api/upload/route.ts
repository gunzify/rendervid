import { NextRequest, NextResponse } from "next/server";
import { prepareUpload, getStorage, uploadKey } from "@rendervid/core";
import { UploadInitiateRequest } from "@rendervid/shared";
import { requireUser, errorResponse, readJson, httpError } from "@/lib/api-auth";
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const body = await readJson<unknown>(req);
    const parsed = UploadInitiateRequest.safeParse(body);
    if (!parsed.success) {
      throw httpError(400, "bad_request", "Unsupported file type or size.");
    }

    const { storageKey } = await prepareUpload(userId, {
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      projectId: parsed.data.projectId,
    });

    // Phase 1: single-shot PUT to our own callback (works in dev and behind a proxy).
    // R2 presigned PUT drops in here when STORAGE_MODE=r2.
    const expires = Math.floor(Date.now() / 1000) + 600;
    const sig = createHmac("sha256", process.env.APP_SECRET ?? "dev-secret-change-me")
      .update(`${userId}:${storageKey}:${expires}`)
      .digest("hex");

    return NextResponse.json({
      uploadUrl: `/api/upload/callback?userId=${encodeURIComponent(userId)}&key=${encodeURIComponent(storageKey)}&expires=${expires}&sig=${sig}`,
      method: "PUT" as const,
      headers: { "Content-Type": parsed.data.mimeType },
      assetId: null,
    });
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
