import { describe, expect, it } from "vitest";
import { assertTransition, type GenerationStatus } from "@rendervid/shared";
import { heuristicPlan } from "../src/director/director.js";
import { capabilityForPlan } from "../src/router/router.js";

describe("generation state machine (PRD §92)", () => {
  it("allows the happy path", () => {
    const path: GenerationStatus[] = [
      "created",
      "credits_reserved",
      "queued",
      "submitted",
      "processing",
      "succeeded",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("allows failure → refunding → refunded", () => {
    expect(() => assertTransition("processing", "failed")).not.toThrow();
    expect(() => assertTransition("failed", "refunding")).not.toThrow();
    expect(() => assertTransition("refunding", "refunded")).not.toThrow();
  });

  it("rejects illegal transitions (e.g. succeeded → failed)", () => {
    expect(() => assertTransition("succeeded", "failed")).toThrow(/Illegal/);
    expect(() => assertTransition("created", "succeeded")).toThrow(/Illegal/);
  });
});

describe("AI Director heuristics", () => {
  it("detects video requests", () => {
    const plan = heuristicPlan({ prompt: "Create a cinematic 10 second ad for my watch", mode: "auto", assetCount: 0 });
    expect(plan.outputType).toBe("video");
    expect(plan.durationSeconds).toBe(10);
  });

  it("defaults to image for photo language", () => {
    const plan = heuristicPlan({ prompt: "A product photo of a perfume bottle", mode: "auto", assetCount: 0 });
    expect(plan.outputType).toBe("image");
  });

  it("routes image+motion to image_to_video", () => {
    const plan = heuristicPlan({
      prompt: "Slowly orbit around the product with dramatic lighting",
      mode: "auto",
      assetCount: 1,
    });
    expect(plan.workflow).toBe("image_to_video");
  });

  it("maps mode to quality tier", () => {
    expect(heuristicPlan({ prompt: "a poster", mode: "quality", assetCount: 0 }).quality).toBe("maximum");
    expect(heuristicPlan({ prompt: "a poster", mode: "economy", assetCount: 0 }).quality).toBe("standard");
  });
});

describe("capability routing", () => {
  it("routes ad requests to the advertisement capability", () => {
    const plan = heuristicPlan({ prompt: "A TikTok ad for my sneaker launch", mode: "auto", assetCount: 0 });
    const cap = capabilityForPlan(plan);
    expect(cap).toBe("VIDEO_ADVERTISEMENT");
  });

  it("routes product images to IMAGE_PRODUCT", () => {
    const plan = heuristicPlan({ prompt: "Product photo of a bottle", mode: "auto", assetCount: 1 });
    plan.outputType = "image";
    plan.workflow = "product_shot";
    expect(capabilityForPlan(plan)).toBe("IMAGE_PRODUCT");
  });
});
