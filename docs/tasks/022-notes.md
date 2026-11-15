# Task 022 notes (work in progress)

## Done
- Server (committed e220d05): `migrations/0004_account_keys.sql` (one table,
  one row per user and provider, `chosen` marks the key in use),
  `src/server/keys.ts` (AES-256-GCM, HKDF-SHA-256 from `KEYS_SECRET`, user id
  and provider bound as AAD; `/api/keys` GET/PUT/PATCH/DELETE, signed-in only,
  writes need the site origin + JSON, 30 writes per user per hour via `bump`),
  relay names a saved key with `x-opensu-account-key`, never falls back to the
  site key, skips the quota, logs `key: "own"`. `KEYS_SECRET` in deploy.yml.
- Anthropic: its OpenAI-compatible endpoint (`https://api.anthropic.com/v1`,
  docs: https://platform.claude.com/docs/en/api/openai-sdk), 0 KB bundle
  change; the native adapter (`@tanstack/ai-anthropic` + SDK) measured at
  ~90 KB gzip, which would push the 110.6 KB assistant chunk over its 150 KB
  budget. Relay adds `max_tokens: 32000` for Anthropic when none is given.
  Caveat: Anthropic calls that layer "not considered a long-term or
  production-ready solution for most use cases"; `strict` is ignored.
- Default models (src/lib/providers.ts): OpenRouter
  `anthropic/claude-sonnet-5.5`, OpenAI `gpt-6.1-sol` (OpenAI models page,
  balanced choice), Anthropic `claude-opus-5-5` (models overview: "start with
  Claude Opus 5.5").
- CPU (scripts/auth-check.ts, Node approximation): save 2.2 ms median, list
  2.0, choose 2.1, relayed chat with decryption 2.5 ms (30 KB body).
- Client (uncommitted until this commit): `src/chat/keys.ts`,
  `src/chat/KeyPicker.tsx` (pop-up button at the pinned input and in the
  recent strip header; menu portalled outside the glass surface; key sheet;
  one-time offer after sign-in), chat-store integration, strings zh/en.
  GlassSheet: buttons in the top strip keep their tap (sheet close X was
  unclickable on phones, sign-in sheet too).
- Tests: `scripts/keys-test.ts` (8 tests pass), auth-check passes,
  `account-e2e.mjs --only keys` passes with screenshots in artifacts/task022/.

## Left
- Full `chat-e2e` run after replacing the header sliders button (test updated).
- README section "Keys saved with the account" + owner setup for KEYS_SECRET.
- Full `pnpm -r typecheck && pnpm -r test` run on the final tree.
- Phone tab-bar icon bug: not looked at.

## Decisions
- The picker is not in the idle input bar: the owner's 9-widget / 11-element
  limit for the default screen would be exceeded. It sits in the pinned
  conversation's input (where the spark stood; the header sliders button is
  removed) and in the recent strip's header; the project menu entry opens it.
- A newly saved key becomes the one in use; saving the browser key from the
  offer removes the browser copy.
