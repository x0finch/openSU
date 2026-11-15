# Task 022 - API keys saved with the account

Owner's request (2026-11-15): a signed-in user can save their own API
keys for OpenRouter, OpenAI and Anthropic with their account, and pick
which one the assistant uses, from the chat.

Today a visitor's own key lives only in the browser (the "AI 连接设置"
sheet) and is sent with each request; it works for OpenRouter and
OpenAI-compatible endpoints. That path stays for visitors who are not
signed in and for self-hosters without accounts.

## What to build

1. Storage: a new migration, one table: user id, provider
   (`openrouter` | `openai` | `anthropic`), the key encrypted, a short
   hint (last 4 characters), the chosen model for that provider, created
   and updated times. One key per provider per user.
2. Encryption at rest: AES-GCM (Web Crypto) with a key derived from a
   Worker secret. Use a dedicated secret `KEYS_SECRET`; if it is not set,
   saving keys to the account is not offered (the browser-only path still
   works). Never log a key, never put one in a turn record, never return
   the full key to the browser after it is saved: the browser gets the
   provider, the hint and the model only.
3. Endpoints, signed-in users only, same origin checks as the account
   routes: list (provider, hint, model), save or replace, delete. Rate
   limit writes with the existing counter (`bump`).
4. The relay: when a signed-in user's request names one of their saved
   providers, the Worker decrypts that key and calls the provider with
   it. These turns skip the daily quota, exactly as browser-held own keys
   do today, and are recorded as `ownKey: true`.
5. Anthropic: say in the scope note how you will call it (its
   OpenAI-compatible endpoint through the existing path, or the native
   Messages API with a TanStack AI adapter), what it costs in bundle size
   and CPU, and check tool calling with the draft 2020-12 schemas. Pick
   the smaller change that passes the real tool loop.
6. The picker, in the chat: one control at the conversation's input
   (where the sliders button is today) showing what is in use: "免费额度"
   (the site's key), or the provider name. It opens a glass popover or
   sheet listing the site's free allowance and each saved key (provider,
   hint, model), with "添加密钥" and, per key, change model / delete.
   Choosing an entry switches at once; the choice is remembered per
   account. Follow Apple: a pop-up menu for choosing, a sheet for
   entering a key. No card inside a card.
7. A key held in the browser by a signed-out visitor: after sign-in,
   offer once to save it to the account ("保存到账号，在其他设备也能用");
   never upload it silently.
8. Copy in Chinese and English. Say plainly where the key is kept:
   "密钥加密保存在服务器上，只用于你的对话。"

## Constraints

- Project rules in `CLAUDE.md`; server stays trivial (10 ms CPU): measure
  list, save and a relayed chat call with decryption, and report.
- Glass primitives only; the static glass check passes.
- Do not change the quota numbers, sign-in, or turn records beyond the
  `ownKey` flag.
- Model ids: do not guess. Offer a text field with a sensible default per
  provider taken from the provider's current documentation, and say what
  you chose and where it came from.

## Checks

- Unit or script tests: encrypt then decrypt round trip; a wrong secret
  fails closed; another user cannot read, use or delete a key; the full
  key never appears in any response, log line or turn record; no
  `KEYS_SECRET` means the feature is off; write rate limit.
- End to end with the chat stub standing in for each provider: save a
  key, pick it, a turn goes out with that key and skips the quota; delete
  it and the picker falls back to the free allowance; the signed-out
  browser-key path still works.
- `pnpm -r typecheck` and `pnpm -r test` pass. Screenshots under
  `artifacts/task022/` (desktop 1440x900, phone 390x844): the picker
  closed and open, the add-key sheet, a saved key, the offer after
  sign-in.

## How to work

Scope note first (files, the table, the Anthropic path, measured CPU and
bundle change). If something here does not fit the code or the free
tier, stop and report. Small local commits; do not push (a push to
`main` deploys; the lead pushes after review). Report honestly what was
skipped or not verified, in particular anything not tried against a real
provider.
