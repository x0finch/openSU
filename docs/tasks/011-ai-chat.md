# Task 011 - AI chat that edits the house

## Goal
First "aha moment": type a sentence, the house changes. Build the full
path from chat box to model edits, verified end to end against a local
scripted OpenAI-compatible stub. There are NO provider credentials in this
environment: a real-model run is explicitly out of scope and must be
reported as not done. Do not present stub results as model quality.

## Architecture (lead's decisions)
- Tool execution and the agent loop run in the browser, where the model,
  commands and validator live.
- The Worker route `/api/chat` is a byte-level pass-through to an
  OpenAI-compatible `chat/completions` endpoint with `stream: true`: it
  adds the API key and model, forwards the request body, and pipes the
  upstream response body back untouched. No parsing, no re-encoding (the
  free tier allows 10 ms CPU per request; waiting on the network is free).
- Provider config by env: `OPENROUTER_API_KEY` (default base URL
  `https://openrouter.ai/api/v1`), or `OPENAI_API_KEY` with
  `OPENAI_BASE_URL`; `OPENSU_MODEL` selects the model. Look up the
  providers' current docs and model lists; choose a strong tool-calling
  default and document how to change it.
- Bring-your-own key: a user can enter their own key and base URL in a
  settings sheet; it is stored only in the browser and sent per request in
  a header the Worker forwards; never logged, never stored server-side.
- Client: use TanStack AI on the client side against our `/api/chat`
  (OpenAI-compatible adapter / custom connection). Read the current
  TanStack AI docs first. If its client cannot consume a raw
  OpenAI-compatible SSE stream through a custom endpoint without a
  TanStack server handler, implement a small typed client for the stream
  and tool loop yourself and say so; do not move parsing into the Worker.
- Credits / rate limiting are a later task (needs Cloudflare storage).
  Leave one clear hook in the Worker where the check will go.

## `packages/agent` (`@opensu/agent`), no DOM, no network
- System prompt for a house-design assistant for Chinese self-built
  homes: how to read `describeHouse`, how to edit with commands, design
  rules of thumb (300 mm module, typical room sizes, living room and
  bedrooms to the south, kitchen and bathrooms north, stairs central,
  every bedroom a window, structure aligned between levels), behaviour
  rules from docs/DECISIONS.md (comply, explain consequences with facts,
  offer a recommended alternative, hard constraints only). It answers in
  the user's language.
- Tools: `edit_house({ commands })` -> `applyCommands`; result returned to
  the model is compact: ok flag, applied summaries, issues, and the
  changed parts of `describeHouse`. `get_house()` -> `describeHouse`.
- Loop controller: on validation errors the tool result carries the
  errors and the model retries, max 3 repair rounds per user turn; if
  still failing, the house stays at the last valid state and the user is
  told plainly. One undo step per user turn (uses `History`).
- Context budget: send `describeHouse` once per turn (latest state), not
  per tool call; keep history trimmed.
- Unit tests with scripted model outputs: happy path, repair round,
  give-up path, undo.

## Starting from nothing
- `new_house` flow: the assistant can create a house from a brief (plot
  size, storeys, rooms). Provide at least one built-in starter template
  of OUR OWN design (not the reference/golden house): a simple
  two-storey 10 m x 12 m house authored with commands, validated, and
  checked visually. The golden sample stays available as an internal
  example only.

## App (`apps/web`)
- Chat panel (the reserved left rail): message list with streaming text,
  input with suggestion chips, a compact "changes" card per assistant
  turn listing applied edits in plain language with an undo button, a
  retry affordance, a settings sheet for the key. On phone it is a
  full-height sheet over the drawing with a peek state.
- When the house changes, the 3D view updates and plays a short "grow"
  transition (`viewer.playGrow()` in `packages/render`: levels rise in
  sequence over ~1.5 s, render-on-demand afterwards). Creating a new
  house plays the full grow.
- Errors (no key configured, upstream error, rate limit) are shown as
  calm inline messages with what to do next.

## Verification without credentials
- A local stub server speaking the OpenAI-compatible streaming protocol
  (SSE chunks with text deltas and tool-call deltas, a few scripted
  conversations). Used only in tests and screenshots.
- Playwright e2e against the built app in the local Workers runtime with
  the stub as upstream: user sends "把客厅加宽 600" -> stream shows text
  -> tool call applied -> house changes (model area changes, canvas
  pixels change) -> undo restores. Also a scripted bad edit followed by a
  repair round.
- Measure and report the Worker's CPU time per chat request in the local
  runtime if the tooling exposes it; say clearly that the real limit can
  only be checked on Cloudflare.
- Screenshots desktop + phone: empty chat with suggestions, streaming,
  changes card, error state, settings sheet. Copy to the scratchpad path
  in your brief.

## Acceptance criteria
- Clean checkout: install, build, typecheck, test, shots pass.
- The Worker bundle still has no three.js and stays small; `/api/chat`
  does no body parsing of the upstream stream.
- No key ever appears in logs, URLs or stored server state.
- Chat UI looks designed and consistent with the studio at both
  viewports.
- README documents configuration, the BYO-key flow, and exactly what was
  and was not verified.

## Notes
`packages/model` must not change except bug fixes you can justify. Keep
`apps/web` edits localised (new files for chat; small edits to shared
studio files): another agent is adding walk mode in a different worktree.
