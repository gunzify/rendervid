/**
 * Audit log (PRD §81). Sensitive events only: credits granted/removed/refunded,
 * plan changes, settings changes, moderation rejections.
 */
import { getDb } from "../db/client.js";
import { auditLogs, usageEvents } from "../db/schema.js";

export async function audit(entry: {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    actor: entry.actor,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export async function trackEvent(userId: string | null, event: string, properties?: Record<string, unknown>, generationId?: string | null): Promise<void> {
  const db = getDb();
  await db.insert(usageEvents).values({
    userId,
    event,
    generationId: generationId ?? null,
    properties: properties ?? {},
  });
}
