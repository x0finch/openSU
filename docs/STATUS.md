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
  panel, grow transition, original starter house (011).

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
5. Original template houses of real design quality; landing page with a
   real render (the reference/golden house must not be shown publicly).
6. Later: style presets, rain, interior decoration, CLA + contributor docs.

See `docs/BACKLOG.md` for accepted but unscheduled findings.
