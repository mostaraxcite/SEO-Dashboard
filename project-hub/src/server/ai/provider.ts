import "server-only";
import { AiProviderError, type AiProvider } from "./types";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";

let override: AiProvider | null = null;
/** Tests can inject a provider (e.g. one that fails or records the context). */
export function setAiProviderForTests(p: AiProvider | null) {
  override = p;
}

export function aiProvider(): AiProvider {
  if (override) return override;
  if (process.env.AI_FORCE_UNAVAILABLE === "1") return new UnavailableProvider();
  if (process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
  return new MockProvider();
}

class UnavailableProvider implements AiProvider {
  name = "unavailable";
  modelFor() {
    return "none";
  }
  async generate(): Promise<never> {
    throw new AiProviderError("unavailable", "AI provider forced unavailable");
  }
}

export { AiProviderError, type AiProvider };
