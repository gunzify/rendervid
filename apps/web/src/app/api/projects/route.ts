import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@rendervid/core";
import { requireUser, errorResponse, readJson } from "@/lib/api-auth";
import { randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    return NextResponse.json(await listProjects(userId));
  } catch (err) {
    return errorResponse(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const { userId } = await requireUser(req);
    const body = await readJson<{ name?: string; description?: string }>(req);
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: { code: "bad_request", message: "Project name is required" } }, { status: 400 });
    }
    const project = await createProject(userId, body.name.trim(), body.description);
    return NextResponse.json(project);
  } catch (err) {
    return errorResponse(err, requestId);
  }
}
