# Task 019 - Accounts and the daily quota (phase 1 of 2)

The site is public and anyone can spend the owner's model key. This task
adds sign-in and a daily quota on the owner's key. Phase 2 (task 020,
not part of this task) adds per-account API keys for OpenRouter, OpenAI
and Anthropic with a picker in the chat.

## Owner's decisions

- Sign-in with Better Auth: email one-time code (no passwords) and
  Google. No email + password: password hashing does not fit the Workers
  free tier's 10 ms CPU.
- Email is sent with Resend from the owner's own domain.
- Not signed in: 3 trial edits on the owner's key. Signed in: 10 per day.
  The owner's key always uses one fixed model.
- A visitor's own key (the existing bring-your-own-key flow) is never
  limited. Do not change how it is stored in this task.
- The numbers are deployment configuration, not code.

## Constraints

- Cloudflare Workers free tier: 10 ms CPU per request. Waiting on D1,
  Resend or Google does not count, hashing and big JSON work do. Measure
  the auth and quota paths (the relay check already estimates relay CPU;
  extend it or add one for the auth routes) and report the numbers.
- Before designing, verify against current documentation and say what
  you found: Better Auth on Cloudflare Workers with D1 (adapter, how the
  session is read without heavy CPU, the email OTP and Google plugins),
  D1 free-tier limits, Resend's API and limits. If something does not
  fit the free tier, stop and report.
- The server bundle budget (`scripts/size-report.mjs`) still applies; if
  Better Auth cannot fit, report the size and the options instead of
  raising the budget yourself.
- The deploy must keep working when the new secrets are missing: without
  them sign-in is hidden and the quota falls back to anonymous limits.
- AGPL self-hosters must be able to turn the whole thing off.

## What to build

1. Storage: a D1 database with migrations in the repo, applied by the
   deploy workflow. Tables for Better Auth and for usage counters.
2. Auth: Better Auth mounted in the Worker; email OTP (6 digits, sent
   with Resend, rate limited per address and per IP) and Google. Session
   in a cookie. In local dev and tests the code is logged or returned by
   a test-only hook instead of being emailed; no network in tests.
3. Quota on `/api/chat` when the owner's key is used (the relay's
   `checkCredits()` hook):
   - one user message = one credit (the client sends a turn id; the
     server counts a turn once) and at most `QUOTA_CALLS_PER_TURN` model
     calls per turn;
   - limits: signed-in per day, anonymous trial (a signed, http-only
     visitor cookie), per IP per day, whole site per day; the day rolls
     over at midnight China time unless configured;
   - counting is atomic in D1 (no read-then-write races) and costs one
     statement per request where possible;
   - when the whole-site limit is reached, the owner's key stops for
     everyone and own-key users continue.
   - Configuration (Worker vars, documented in `apps/web/README.md` and
     set from GitHub Variables in the deploy workflow, like
     `OPENSU_MODEL`): `QUOTA_ENABLED`, `QUOTA_USER_DAILY` (10),
     `QUOTA_ANON_TRIAL` (3), `QUOTA_IP_DAILY` (60), `QUOTA_SITE_DAILY`
     (500), `QUOTA_CALLS_PER_TURN` (8), `QUOTA_TZ`.
   - `GET /api/chat` also reports the caller's remaining credits and when
     they reset.
4. UI, on the glass primitives only (the static glass check must pass),
   Chinese and English:
   - an account entry in the project menu (sign in / the signed-in email
     / sign out);
   - a sign-in sheet: email, then the 6-digit code; "Continue with
     Google" (hidden when Google is not configured);
   - remaining credits shown in the input only when 3 or fewer remain;
   - when credits run out: a calm message with what to do (sign in for
     10 a day when anonymous; come back at the reset time; or use your
     own key), never a raw error.
5. Prompt: change the reply length rule in `packages/agent/src/prompt.ts`
   from about 150 to about 200 Chinese characters (owner's decision after
   task 018).
6. Deploy workflow: create/apply D1 migrations, pass the new secrets and
   variables. List exactly what the owner must set up (see below) in
   `apps/web/README.md`.

## Owner setup (document it; do not ask for secrets in chat)

GitHub secrets: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. GitHub variables: the public
site URL, the sender address, the quota numbers. Say which Cloudflare API
token permissions D1 needs, the Google OAuth redirect URI, and the DNS
records Resend needs.

## Checks

- Unit tests for the quota logic (limits, day rollover, turn counted
  once, calls per turn, races) and the configuration fallbacks.
- An end-to-end test with the chat stub: 3 anonymous edits then the
  out-of-credits message; sign in with an emailed code (test hook); 10
  edits; the remaining-credits hint; own key unaffected; site limit.
- `pnpm -r typecheck` and `pnpm -r test` pass; CPU numbers for the auth
  and quota paths; bundle size before and after.
- Screenshots under `artifacts/task019/` (desktop and phone): menu with
  the account entry, sign-in sheet (email step, code step), remaining
  hint, out of credits (anonymous and signed in).

## How to work

Scope note first (what you verified in the docs, the design in ten
lines, files to change). If the free tier, the bundle budget or Better
Auth do not fit, stop and report. Commit locally in small commits; do not
push (a push deploys to production). Report honestly what was skipped.
Project rules in `CLAUDE.md` apply.

## Owner's additions (2026-11-14)

- Public site address: `https://opensu.009003.xyz` (the Google redirect
  URI, the cookie domain and the sender domain derive from the configured
  site URL; nothing is hard-coded).
- One flow for sign-in and sign-up. There is no "register" anywhere: the
  user enters an email and the code; a new address becomes an account
  silently. Same for Google. Copy says "继续" / "Continue", never
  "注册" / "Sign up".
- Looks and interaction follow Apple, like the rest of the studio
  (`docs/UI_STYLE.md`, task 017 section 2b), and you compare against
  Apple yourself rather than from memory:
  - a glass sheet that flows out of the account entry (phone: the inset
    bottom sheet with detents from task 017), one field per step, one
    primary action, a short line of what happens next;
  - the code step is six separate boxes as in iOS verification: the
    first box is focused on arrival, typing advances, backspace goes
    back, pasting a 6-digit code fills all boxes, the code submits itself
    when complete, `autocomplete="one-time-code"` and
    `inputmode="numeric"` so the phone keyboard offers the code from the
    mail or message; a wrong code shakes the row and clears it; resend
    with a visible countdown;
  - the email step uses `type="email"`, `autocomplete="email"`, Return
    submits; "Continue with Google" follows Google's and Apple's sign-in
    button guidance (logo, wording, one neutral style on glass);
  - errors are calm sentences inside the sheet; nothing navigates away
    from the drawing; after sign-in the sheet flows back and the user is
    where they were, with their message draft kept.
  - Record the interactions (frame captures like `glass-record.mjs`) and
    put side-by-side sheets against Apple references under
    `artifacts/task019/compare/`. If you have no Apple footage for a
    step, say so and describe which Apple screen you matched (e.g. the
    iOS verification-code entry).
- Do not push: the owner deploys when the domain and the secrets are
  ready.

## Deviations for the owner to confirm

Implemented as below; nothing changes until the owner decides.

- **The anonymous trial is 3 per day, not 3 once.** The counter is keyed by
  the quota day, like the signed-in allowance, so an anonymous visitor gets
  3 again after midnight (China time). Reasons: the visitor is only a
  cookie, and clearing cookies or opening a private window already starts a
  new trial, so the real bounds are the per-IP (60) and whole-site (500)
  daily limits either way; and when sign-in is off (no secrets) a one-time
  trial would leave the site's own key unusable for every visitor after 3
  messages. A one-time trial would take: a counter key without the day
  (`trial|v:<visitor>`) kept outside the three-day cleanup, the out-of-credits
  note without a reset time for visitors, and a decision about what happens
  when sign-in is not configured (keep it daily then, or no trial at all).
- **Without `BETTER_AUTH_SECRET` the trial is counted per IP.** The visitor
  cookie is signed with that secret; without it there is nothing to sign
  with, so the anonymous subject is the IP (`ip:<address>`). Everyone
  behind one address (an office, a carrier NAT) then shares one trial of 3.
  Setting the secret (owner setup step 3) restores per-visitor trials.
