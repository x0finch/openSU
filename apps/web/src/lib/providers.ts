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
 * Default model per provider: for a saved key without a model of its own,
 * and the site's fallback for the owner's key when OPENSU_MODEL is unset.
 * OpenRouter and OpenAI: the owner's decision (2026-11-15); DeepSeek V4.1
 * Flash is listed with `tools` in OpenRouter's /api/v1/models. Anthropic:
 * "If you're unsure which model to use, start with Claude Opus 5.5" (models
 * overview, Claude API id `claude-opus-5-5`). See apps/web/README.md.
 */
export const DEFAULT_MODELS: Record<KeyProvider, string> = {
  openrouter: 'deepseek/deepseek-v4.1-flash',
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-opus-5-5',
};

export const PROVIDER_NAMES: Record<KeyProvider, string> = { openrouter: 'OpenRouter', openai: 'OpenAI', anthropic: 'Anthropic' };
