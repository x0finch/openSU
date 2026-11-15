// The AI providers whose keys a signed-in user can save with the account
// (task 022), shared by the Worker (src/server/) and the studio. Plain
// constants, no imports: the relay stays free of app code.
//
// Every provider is called through its OpenAI-compatible Chat Completions
// endpoint, so the browser's one adapter and the relay's pass-through work
// for all three:
// - OpenRouter: https://openrouter.ai/docs/api-reference/chat-completion
// - OpenAI: https://developers.openai.com/api/docs/models
// - Anthropic: https://platform.claude.com/docs/en/api/openai-sdk
//   ("OpenAI SDK compatibility"; base URL https://api.anthropic.com/v1/,
//   `Authorization: Bearer`, streaming and tools supported, `strict` ignored).

export const KEY_PROVIDERS = ['openrouter', 'openai', 'anthropic'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export const isKeyProvider = (v: unknown): v is KeyProvider => typeof v === 'string' && (KEY_PROVIDERS as readonly string[]).includes(v);

export const PROVIDER_BASE_URLS: Record<KeyProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

/**
 * Default model per provider, used when a saved key has no model of its own
 * (checked 2026-11-15, see apps/web/README.md "Keys saved with the account"):
 * OpenRouter: the site's default, listed with `tools` in /api/v1/models;
 * OpenAI: "Choose GPT-6.1 Sol to balance intelligence and cost" (models page);
 * Anthropic: "If you're unsure which model to use, start with Claude Opus 5.5"
 * (models overview, Claude API id `claude-opus-5-5`).
 */
export const DEFAULT_MODELS: Record<KeyProvider, string> = {
  openrouter: 'anthropic/claude-sonnet-5.5',
  openai: 'gpt-6.1-sol',
  anthropic: 'claude-opus-5-5',
};

export const PROVIDER_NAMES: Record<KeyProvider, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic' };
