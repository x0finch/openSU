# Real-model evaluation

Runs a scripted conversation against the real studio with Claude as the
assistant's model, and saves what happened for review. It is a manual
tool: it calls a real model (slow, costs money) and is not part of
`pnpm test` or CI.

```bash
pnpm eval tools/eval/scenarios/villa-14x11.json             # live, Claude Opus
pnpm eval tools/eval/scenarios/villa-14x11.json --model sonnet
pnpm eval <scenario> --replay artifacts/eval/<run>/log --no-build   # no model calls
```

How it works:
- `bridge.mjs` is an OpenAI-compatible endpoint backed by the local
  `claude -p` CLI (its own login; no API key anywhere in the repo). It
  sends the app's system prompt, history and tool schemas, and streams
  the model's answer back as text and tool-call deltas.
- `run.mjs` builds `apps/web`, starts `vite preview` with the Worker's
  upstream pointed at the bridge, opens the studio in headless Chromium,
  types each turn, waits for the reply, and screenshots the 3D view and
  every level's plan.
- `--replay <dir>` serves the model turns logged by an earlier run instead
  of calling the model: fast and free, for re-checking app changes (a
  replay only matches while the prompt and tools are unchanged).

Output goes to `artifacts/eval/<scenario>-<time>/` (git-ignored):
`transcript.json` (turns, replies with the final message after the last tool call, crashes, cost per call), `log/` (every
model call with its full request) and the screenshots. Review them against
the scenario's `criteria`.

Scenarios are plain JSON: `name`, `about`, `criteria` (what a good result
looks like, written before running) and `turns` (`tag`, `text`, optional
`levels` to screenshot). Describe reference images in words; never store
third-party images in the repo.

Needs: the `claude` CLI on PATH and logged in (not needed with
`--replay`), and Playwright with Chromium.
