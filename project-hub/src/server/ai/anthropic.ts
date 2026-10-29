import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AiContext } from "./context";
import { schemas, type Feature, type Output } from "./schemas";
import { systemPrompt, userPrompt } from "./prompts";
import { AiProviderError, type AiProvider, type AiResult } from "./types";

/** USD per 1M tokens (input, output). Used for estimated cost only. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

/**
 * Real provider. Enabled only when AI_PROVIDER=anthropic and an approved key exists.
 * Structured outputs constrain the JSON; Zod validates it again server-side.
 * Light features (summaries, next steps) run on AI_MODEL_LIGHT at low effort.
 */
export class AnthropicProvider implements AiProvider {
  name = "anthropic";
  private client = new Anthropic({ timeout: 45_000, maxRetries: 1 });

  modelFor(feature: Feature) {
    const heavy = process.env.AI_MODEL ?? "claude-opus-5-5";
    const light = process.env.AI_MODEL_LIGHT ?? "claude-haiku-5-5";
    return feature === "summarize" || feature === "next_steps" ? light : heavy;
  }

  async generate<F extends Feature>(feature: F, ctx: AiContext): Promise<AiResult<F>> {
    const model = this.modelFor(feature);
    const schema = schemas[feature];
    let response: Anthropic.Messages.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: 4000,
        system: systemPrompt(feature),
        messages: [{ role: "user", content: userPrompt(ctx) }],
        output_config: { format: zodOutputFormat(schema), effort: feature === "summarize" || feature === "next_steps" ? "low" : "medium" },
      });
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new AiProviderError("unavailable", `provider error ${e.status ?? ""}`);
      throw new AiProviderError("unavailable", "provider connection error");
    }
    if (response.stop_reason === "refusal") throw new AiProviderError("refused", "model declined");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let parsed: Output<F>;
    try {
      parsed = schema.parse(JSON.parse(text)) as Output<F>;
    } catch {
      throw new AiProviderError("invalid_output", "schema validation failed");
    }
    const [pin, pout] = PRICES[model] ?? [4, 20];
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    return { output: parsed, model, inputTokens, outputTokens, costUsd: (inputTokens * pin + outputTokens * pout) / 1_000_000 };
  }
}
