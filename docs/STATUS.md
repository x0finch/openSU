# Status

Lead-maintained snapshot for whoever picks this up next (human or agent).
Update it when a milestone moves.

## Done and merged
- Style layer, model + resolver + validation, kernel, SVG plans (tasks
  001-004): golden sample reproduced and accepted against the references.
- Web shell on TanStack Start / Cloudflare Workers (005), sun study and
  level cutaway (006), sheet export (007), app integration (008).
- Edit commands, schema hardening, `describeHouse` (009).
- Furniture in 3D and walk mode (010).
- AI chat path: `packages/agent`, `/api/chat` pass-through relay, assistant
  panel, grow transition (011).
- Independent QA pass and its fixes (012): camera limits, clean low-sun
  rendering, framing around the chrome, phone and landscape walk, URL state
  and browser autosave, three original template houses (T1 default, T2,
  T3), shared planting for plan and 3D, sheet and landing fixes, joined
  pitched roofs, compact phone plans.

## Verified only locally (never on real infrastructure)
- Nothing has been deployed. The Worker was run only in the local Workers
  runtime. The 10 ms CPU limit is unconfirmed.
- No real model has ever been called. The chat path was exercised against
  a scripted OpenAI-compatible stub. Prompt quality, token use, cost and
  model choice are unknown.
- Rendering was only run on software GL (SwiftShader) in headless
  Chromium. No real phone, no WeChat browser, no real GPU timings.

## Needs credentials (add as environment variables, then a new session)
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: deploy, measure CPU,
  create D1 / R2, bind a custom domain (workers.dev may be unreliable in
  mainland China; verify).
- `OPENROUTER_API_KEY` (low spend cap): real-model evaluation.

## Next, in order
1. Deploy to Cloudflare; confirm `/api/chat` CPU time under streaming.
2. Real-model evaluation: a fixed set of ~20 briefs and edits, scored by
   the validator and by reviewing plan + 3D screenshots; tune the system
   prompt and `describeHouse` length; publish a recommended-model list.
3. Credits: per-user limit on the owner's key (hook exists in the relay:
   `checkCredits()`), identity, storage.
4. Share links: save a house to R2/D1, `/s/$id` viewer with OG image from
   a sheet.
5. A second independent QA pass after 012 (none has been run on the
   merged result yet), then raise the templates toward golden-sample
   richness (see their listed weaknesses in the task 012 report).
6. Later: style presets, rain, interior decoration, CLA + contributor docs.

See `docs/BACKLOG.md` for accepted but unscheduled findings.
