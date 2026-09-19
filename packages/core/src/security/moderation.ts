/**
 * Content moderation gate (PRD §76). Runs BEFORE the AI Director.
 * Phase 1: deterministic blocklist covering clearly disallowed categories.
 * Swap/extend with a classifier later without touching call sites.
 */

const BLOCKED = [
  /\b(csam|child sexual|minor sexual)\b/i,
  /\b(how to (make|build) (a )?(bomb|explosive|bioweapon|nerve agent))\b/i,
  /\b(deepfake|revenge porn|non-?consensual intimate)\b/i,
  /\b(assassinate|kill (the )?president)\b/i,
];

export interface ModerationVerdict {
  allowed: boolean;
  category?: string;
}

export function moderatePrompt(prompt: string): ModerationVerdict {
  for (const re of BLOCKED) {
    if (re.test(prompt)) {
      return { allowed: false, category: "prohibited_content" };
    }
  }
  return { allowed: true };
}
