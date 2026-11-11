// The model connection: TanStack AI's OpenAI-compatible Chat Completions
// adapter, pointed at our own relay endpoint instead of a provider. The
// relay (the app's `/api/chat` Worker route) adds the key and the model and
// pipes the provider's SSE stream back unchanged; parsing it, assembling
// tool calls and running the tool loop all happen here, in the caller.
import type { AnyTextAdapter } from '@tanstack/ai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';

/** Model id sent when the relay should use its configured default. */
export const DEFAULT_MODEL = 'default';

export interface RelayOptions {
  /** Relay URL, e.g. "/api/chat" (relative URLs are fine in the browser). */
  endpoint: string;
  /** Model id; with the owner's key the relay replaces it with its own. */
  model?: string;
  /** Extra headers per request (bring-your-own key, see the app). */
  headers?: () => Record<string, string>;
  /** fetch implementation (tests). */
  fetch?: typeof fetch;
}

/** Placeholder base URL: the SDK appends `/chat/completions`, our fetch replaces the whole URL. */
const PLACEHOLDER = 'https://relay.invalid/v1';

export function createRelayAdapter(opts: RelayOptions): AnyTextAdapter {
  const doFetch = opts.fetch ?? ((input: Parameters<typeof fetch>[0], init?: RequestInit) => globalThis.fetch(input, init));
  const relayFetch = (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    // The relay owns authorisation; never send the SDK's placeholder key.
    headers.delete('authorization');
    for (const [k, v] of Object.entries(opts.headers?.() ?? {})) headers.set(k, v);
    // Drop the SDK's telemetry headers: the relay forwards only what it needs.
    for (const k of [...headers.keys()]) if (k.startsWith('x-stainless')) headers.delete(k);
    return doFetch(opts.endpoint, { ...init, headers });
  };
  return openaiCompatibleText(opts.model ?? DEFAULT_MODEL, {
    name: 'opensu-relay',
    baseURL: PLACEHOLDER,
    apiKey: 'relay',
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    fetch: relayFetch as typeof fetch,
  }) as unknown as AnyTextAdapter;
}
