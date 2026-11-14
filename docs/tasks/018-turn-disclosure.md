# Task 018 - Fold the assistant's working steps

Found in the real-model evaluation (`docs/BACKLOG.md`, "Real-model
evaluation, round 1"): when the assistant builds several levels it makes
several tool calls, and the sentence before each call stacks up into a
400 to 700 character reply. The floating chat surface shows only the
latest exchange, so that is too long. And while a build runs (1 to 3
minutes) the user only sees a generic working phrase.

The owner's decisions:

## 1. One component, two densities

Build one disclosure component for an assistant turn in the glass module
(`apps/web/src/glass/`, on the existing primitives; the static glass
check must keep passing). It renders a turn from the same data in two
densities:

Compact (the floating latest-exchange surface above the input):
- While the turn runs: one live line with the current step. Use the
  summary of the batch being applied or just applied (e.g. "正在盖二层…"),
  falling back to the existing phase phrases. It replaces itself as the
  turn advances; it never grows into a list.
- When the turn is done: only the final text (the text after the last
  tool call), and above it one line "做了 N 步修改 ›" (English: "N
  changes ›") when there were changes. Tapping it expands the list of
  change summaries, one line each (the `changes[].summary` we already
  keep). The intermediate sentences are NOT shown in compact, expanded or
  not. Undo stays where it is.
- A turn with no tool calls shows its text as today.

Full (the pinned conversation sidebar):
- The latest turn is a timeline in order: each intermediate sentence
  followed by the change it led to, then the final text. It fills in live
  while the turn runs and stays open when done.
- Older turns collapse to their final text plus the "做了 N 步修改 ›"
  line; expanding one shows its full timeline.

To do this the chat store must keep the structure of a turn (text
segments and changes in order) instead of one concatenated string. Keep
autosave compatible: an older saved conversation without the structure
still loads and renders as plain text.

Interaction follows `docs/UI_STYLE.md` and task 017 section 2b: the
expand/collapse uses the shared spring, content stays clipped inside the
glass shape, reduced motion fades. Keyboard: the line is a button with
`aria-expanded`.

## 2. Prompt

In `packages/agent/src/prompt.ts`:
- Every assumption or trade-off the assistant made for the user (e.g.
  "three 4.7 m bays do not fit 14 m, so 4.6 + 4.8 + 4.6") must be in the
  final message, because the sentences before tool calls are hidden in
  the compact view.
- The final message stands alone: it does not rely on the earlier
  sentences of the same turn.
- Keep the existing length rule (about five short lines) for the final
  message.

## 3. How to work

1. First read the chat code (`apps/web/src/chat/`, the turn controller in
   `packages/agent/src/turn.ts`, the studio's recent strip and pinned
   sidebar) and write a short scope note at the top of your report: which
   files change and anything in this spec that does not fit the code. If
   something here is wrong or much bigger than it looks, stop and report
   instead of improvising.
2. Implement. Small logical commits, local only, do not push.
3. Verify:
   - unit tests for the store's turn structure and the old-autosave
     fallback; update `chat-e2e.mjs` and the chat stub for the new DOM;
     `pnpm -r typecheck` and `pnpm -r test` pass.
   - Replay (free): `pnpm eval tools/eval/scenarios/villa-14x11.json
     --replay artifacts/eval/villa-14x11-2026-11-13T20-56-39/log` (add
     `--no-build` only after a fresh build). A replay matches only while
     the request order is unchanged; if the prompt change breaks the
     replay, run it before the prompt change, or say so.
   - One live run of `villa-14x11` after the prompt change (about 9
     minutes, real model). Read `tools/eval/README.md` first.
   - Screenshots under `artifacts/task018/` (not committed), desktop
     1440x900 and phone 390x844: compact while working (live line),
     compact done collapsed, compact expanded, sidebar latest turn as a
     timeline, sidebar with an older turn collapsed and expanded.

## 4. Report

Scope note; commits; what the component and the store look like now;
screenshot paths with one line each; from the live run: the length of
each final message, whether assumptions appear in the final message, and
anything that looks wrong; what was skipped or does not work.

Project rules in `CLAUDE.md` apply. Do not edit `docs/UI_STYLE.md`.
