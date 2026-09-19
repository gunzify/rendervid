import { env, assertLiveProviderConfigured } from "../env.js";
import { HiggsfieldProvider } from "./higgsfield.js";
import { MockProvider } from "./mock.js";
import type { GenerationProvider } from "./types.js";

export * from "./types.js";

let cached: GenerationProvider | null = null;

export function getProvider(): GenerationProvider {
  if (cached) return cached;
  if (env.providerMode() === "live") {
    assertLiveProviderConfigured();
    cached = new HiggsfieldProvider();
  } else {
    cached = new MockProvider();
  }
  return cached;
}

/** Test hook. */
export function setProviderForTests(p: GenerationProvider | null): void {
  cached = p;
}
