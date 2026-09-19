import { z } from "zod";

/**
 * The AI Director's plan. This is the ONLY thing the LLM is allowed to produce.
 * It contains NO prices, NO credits, NO model/provider names — those are
 * decided deterministically by the router and pricing engine (PRD §105).
 */
export const DirectorPlan = z.object({
  task: z.enum(["image", "video"]),
  workflow: z.enum([
    "text_to_image",
    "text_to_video",
    "image_to_video",
    "image_edit",
    "product_shot",
    "advertisement",
  ]),
  inputType: z.enum(["none", "image"]),
  outputType: z.enum(["image", "video"]),
  durationSeconds: z.number().int().min(4).max(10).nullable(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]),
  style: z.string().max(120),
  quality: z.enum(["standard", "high", "maximum"]),
  /** Short normalized subject used for provider prompt. */
  subject: z.string().min(1).max(1200),
  motionHint: z.string().max(300).nullable(),
  confidence: z.number().min(0).max(1),
});
export type DirectorPlan = z.infer<typeof DirectorPlan>;

/** Map plan → user-facing content type label (PRD §59 vocabulary). */
export function displayContentType(plan: DirectorPlan): string {
  switch (plan.workflow) {
    case "product_shot":
      return plan.outputType === "video" ? "Product video" : "Product image";
    case "advertisement":
      return "Advertisement";
    case "image_to_video":
      return "Video from your image";
    case "image_edit":
      return "Edited image";
    case "text_to_video":
      return "Video";
    case "text_to_image":
      return "Image";
  }
}

/** Human quality label for the estimate breakdown. */
export function qualityLabel(plan: DirectorPlan): "standard" | "high" | "maximum" {
  return plan.quality;
}
