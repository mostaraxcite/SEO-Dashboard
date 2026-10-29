import type { AiContext } from "./context";
import type { Feature, Output } from "./schemas";

export type AiResult<F extends Feature> = { output: Output<F>; model: string; inputTokens: number; outputTokens: number; costUsd: number };

/** Server-only provider boundary. No product code depends on a specific vendor. */
export interface AiProvider {
  name: string;
  modelFor(feature: Feature): string;
  generate<F extends Feature>(feature: F, ctx: AiContext): Promise<AiResult<F>>;
}

export class AiProviderError extends Error {
  constructor(public code: "unavailable" | "invalid_output" | "refused", message: string) {
    super(message);
  }
}
