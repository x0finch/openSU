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

## Deployed
- https://opensu-web.ocean4334.workers.dev via `.github/workflows/deploy.yml`
  (push to `main` or run it by hand; secrets live in the
  GitHub repository settings). Owner's OpenRouter key is a Worker secret;
  default model `anthropic/claude-sonnet-5.5`.
- First real-model edit on the live site works ("把北侧房间加深 600":
  159.5 -> 172.8 m2, ~20 s). It first failed: the tool schema used
  draft-7 tuples, which Anthropic models reject; fixed (draft 2020-12).
- Not yet done: Worker CPU time measured on Cloudflare, per-user credit
  limit (anyone can spend the owner's key), the ~20-brief evaluation.

## Accounts, quota, turn records, still house (tasks 019-021, 2026-11-15)
- Deployed. `main` is the primary branch; a push to `main` deploys.
- 019: accounts (Better Auth on D1, email code, Google) and the daily
  quota. Sign-in stays hidden until the owner sets `SITE_URL`,
  `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (see
  `apps/web/README.md` "Accounts and quota"); until then the anonymous
  trial is counted per IP.
- 020: every finished turn is stored in D1 (`turn_record`, 30 days);
  users export a conversation from the project menu; the owner exports
  with `apps/web/scripts/turns-export.mjs`.
- 021: floating panels never move the house; the pinned conversation
  hangs under the house name.
- Unverified on Cloudflare: CPU time (local: warm sign-in 3 ms, first
  sign-in on a new instance 18-25 ms), real email, Google end to end, a
  real turn written to `turn_record`, phone keyboard and one-time-code
  autofill on real devices.
- Owner to confirm (`docs/tasks/019-accounts-quota.md`, "Deviations"):
  the anonymous trial is 3 per day, not 3 once.
- `pnpm -r test` takes 12-15 minutes.
- Next: task 022, per-account API keys (OpenRouter, OpenAI, Anthropic).

## Next, in order
0. Done 2026-11-13: liquid glass chrome and Apple-style layout (task 017,
   `docs/UI_STYLE.md`), deployed. Follow-ups: press light barely visible
   on white, house name unreadable over dark walk interiors, no
   real-device frame rates yet, accent still `#f2d40f`. Then finish what
   task 016 left (see `docs/BACKLOG.md`, "After task 016").
1. Deployed (see "Deployed"); still confirm `/api/chat` CPU time under streaming.
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
