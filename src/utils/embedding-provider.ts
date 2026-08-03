/**
 * @file src/utils/embedding-provider.ts
 * @description Resolves which backend serves EMBEDDINGS, independently of the
 * chat provider (issue #154).
 *
 * `getProvider()` returns one object doing both jobs, which forces a project
 * using Claude Agent for generation to also use Voyage for vectors. Setting
 * LLMWIKI_EMBEDDING_PROVIDER splits them — e.g. Claude Agent for text and a
 * local vLLM instance over its OpenAI-compatible endpoint for embeddings.
 *
 * With the variable unset this module is a pass-through to `getProvider()`:
 * same object, same credentials handling, no store rebuild. Every rule below
 * applies ONLY to the explicit opt-in path, which is what keeps the default
 * path byte-for-byte unchanged.
 */

import type { LLMProvider } from "./provider.js";
import { buildProvider, getActiveProviderName, getProvider } from "./provider.js";

/**
 * Providers that can actually serve embeddings. `minimax` and `copilot` override
 * `embed()` to throw because their APIs expose no embeddings endpoint, so naming
 * one here would only defer a guaranteed failure to compile time. Matches the
 * EMBEDDING_MODELS / EMBED_BATCH_SIZES keys in constants.ts.
 *
 * Module-private: only `assertEmbeddingCapable` below reads it. Nothing outside
 * this file imports it, so exporting it would fail the dead-code gate.
 */
const EMBEDDING_CAPABLE_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "claude-agent",
  "openai",
  "ollama",
]);

/**
 * Environment variable holding each embedding provider's credential, and the
 * variable that marks its endpoint as self-hosted.
 *
 * Deliberately NOT `PROVIDER_KEY_VARS` from provider-guard.ts: that maps
 * anthropic to ANTHROPIC_API_KEY, which is the CHAT key. Anthropic and
 * claude-agent embeddings go to Voyage and need VOYAGE_API_KEY.
 *
 * `endpointVar` names the override that points at a self-hosted server. A local
 * vLLM instance ignores authentication, so requiring a key there would break the
 * very configuration this feature exists to support. `ollama` has no `keyVar` at
 * all — its OpenAI-compatible endpoint never requires a key, hosted or not — so
 * it needs no `endpointVar` exemption either.
 */
const EMBEDDING_CREDENTIALS: Record<string, { keyVar: string | null; endpointVar: string | null }> = {
  anthropic: { keyVar: "VOYAGE_API_KEY", endpointVar: null },
  "claude-agent": { keyVar: "VOYAGE_API_KEY", endpointVar: null },
  openai: { keyVar: "OPENAI_API_KEY", endpointVar: "OPENAI_EMBEDDINGS_BASE_URL" },
  ollama: { keyVar: null, endpointVar: null },
};

/** Read an env var, treating empty/whitespace as unset. */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** True when the operator explicitly named an embedding provider. */
export function isEmbeddingProviderExplicit(): boolean {
  return readEnv("LLMWIKI_EMBEDDING_PROVIDER") !== undefined;
}

/**
 * The provider name serving embeddings: the explicit override when set,
 * otherwise the active chat provider — which is what makes the default path
 * indistinguishable from today's behaviour.
 */
export function getActiveEmbeddingProviderName(): string {
  return readEnv("LLMWIKI_EMBEDDING_PROVIDER") ?? getActiveProviderName();
}

/** Throw unless `name` can serve embeddings, listing the values that can. */
function assertEmbeddingCapable(name: string): void {
  if (EMBEDDING_CAPABLE_PROVIDERS.has(name)) return;
  throw new Error(
    `LLMWIKI_EMBEDDING_PROVIDER="${name}" cannot serve embeddings.\n` +
      `  Supported: ${[...EMBEDDING_CAPABLE_PROVIDERS].join(", ")}`,
  );
}

/**
 * Throw when an explicitly named embedding provider is missing its credential.
 *
 * Skipped when the provider's endpoint override is set: that names a self-hosted
 * server which ignores auth. Applies only to the explicit path — on the default
 * path a missing key still degrades to lexical ranking, as documented.
 */
function assertEmbeddingCredential(name: string): void {
  const credential = EMBEDDING_CREDENTIALS[name];
  if (!credential?.keyVar) return;
  if (credential.endpointVar && readEnv(credential.endpointVar)) return;
  if (readEnv(credential.keyVar)) return;
  throw new Error(
    `${credential.keyVar} is required for LLMWIKI_EMBEDDING_PROVIDER="${name}".\n` +
      `  Set it with: export ${credential.keyVar}=<your-key>` +
      (credential.endpointVar
        ? `\n  Or set ${credential.endpointVar} if you are using a self-hosted endpoint that needs no key.`
        : ""),
  );
}

/**
 * The provider serving embeddings. Returns `getProvider()` unchanged when
 * LLMWIKI_EMBEDDING_PROVIDER is unset, so the default path keeps today's
 * behaviour exactly, including its soft handling of a missing embedding key.
 */
export function getEmbeddingProvider(): LLMProvider {
  if (!isEmbeddingProviderExplicit()) return getProvider();
  const name = getActiveEmbeddingProviderName();
  assertEmbeddingCapable(name);
  assertEmbeddingCredential(name);
  // buildProvider also resolves a chat model (LLMWIKI_MODEL) onto the returned
  // provider, but that field goes unused here — only embed()/embedBatch() are
  // ever called on the provider this function returns.
  return buildProvider(name);
}
