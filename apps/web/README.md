# @opensu/web

The openSU web app: a TanStack Start app deployed to Cloudflare Workers.
The studio shows the house model in 3D (`@opensu/render`) with a level
cutaway and a sun study (time of day, date presets, play the day), as
floor plans (`@opensu/plan`), and as a shareable sheet set (`图册`,
`@opensu/sheet`, rendered in the browser). The input at the bottom centre
(the studio's primary action) talks to an AI assistant that edits the house through validated commands (`@opensu/agent`, see "AI
assistant" below). The house, the chat transcript and the last 12 undo / redo steps are
autosaved in the browser (`localStorage` key `opensu.autosave.v1`; quota
errors are ignored; after a reload the changes card in the recent strip
still offers undo)
until "恢复为模板 / Reset to template" (the project menu under the house name) clears it;
an explicitly opened template (`?sample=t1|t2|t3`, the share page's
"open in studio") always shows that template, never the save, and leaves
the save alone until its first edit; that edit drops `?sample=` from the
address and from then on the edited house is the saved one. The studio opens with our own
default house (template T1 白墙坡顶小院; `?sample=t2` / `t3` open the other
templates); the golden reference house is internal (`?sample=golden`). The
studio title, the sheets and `/s/$id` show the house's own name.

## Run

From the repository root:

```sh
pnpm install
pnpm dev                                # vite dev with the Cloudflare plugin (workerd) on :5173
pnpm build                              # all packages, then this app + the bundle size report
pnpm --filter @opensu/web preview       # the built app in the local Workers runtime (workerd)
pnpm --filter @opensu/web shots         # checks + screenshots -> artifacts/web/*.png
pnpm --filter @opensu/web test          # smoke checks + chat e2e + relay checks (needs a build)
pnpm --filter @opensu/web chat          # chat e2e against the scripted stub -> artifacts/web/chat-*.png
pnpm --filter @opensu/web accounts      # task 019: sign-in and the daily quota against the stub, fresh local D1
                                        # -> artifacts/task019/*.png
pnpm --filter @opensu/web layout        # task 015 layout: every approved state, measurements, behaviour checks
                                        # -> artifacts/web/layout/ (--mockups <dir>: side by side with the mockup states)
node scripts/shots.mjs --only studio-sheets,check-sun   # just some shots / checks (name prefixes)
```

Workspace packages resolve to their TypeScript sources (Vite aliases and
`tsconfig` paths), so `pnpm dev` needs no prior package build.

Studio deep links: `/studio?mode=plan&level=L2`, `/studio?view=axo-ne`,
`?lang=en`, `?sample=golden`, sun study `?sun=winter|spring|summer|autumn|today&time=10:00`,
cutaway `?cut=L1`, sheets `?mode=sheet`, the recent strip open
`?panel=open`, the conversation pinned `?panel=pin` (for this page; the
pin chosen in the UI persists in `localStorage` `opensu.chat.pinned.v1`), walk mode `?walk=1`, `?frame=full` (3D framed on the whole
canvas, for comparison with the renderer's shots). The studio keeps mode,
level, view, cutaway, sun study and walk in the URL as they change
(`src/lib/url-state.ts`): a new history entry per change, the time of day
replaces the current one, so reload and back / forward restore them.

Besides screenshots, `shots` checks: walk mode (HUD shown, W moves the
camera, a wall stops, the entrance door lets through, exit), the time slider changes the shadows
(pixel diff 10:00 vs 15:00) and drives the physical sun, a cutaway hides
the roof, leaving the sun study returns to presentation light, and the
sheet set yields one 1500 x 2000 PNG blob per level plus the axonometric.

`shots` needs the preinstalled Playwright + Chromium (headless WebGL via
SwiftShader). When `artifacts/shots/*.png` from `pnpm shots` exist it also
checks that the app's 3D view of the golden house matches the renderer demo
pixel for pixel.

## Routes

| Route | Rendering | Served by |
|---|---|---|
| `/` | prerendered at build time | static asset |
| `/studio` | `ssr: false`; the build prerenders only the HTML shell (head + a loading fallback) | static asset (`studio.html`) |
| `/s/$id` | `ssr: 'data-only'`: the Worker runs a trivial loader so the `<head>` carries title / description / `og:*` metadata; the body renders on the client | Worker |
| `/api/health` | server route, `{ ok: true }` | Worker |
| `/api/chat` | server route: `POST` relays one Chat Completions call (counting credits on the owner's key), `GET` says whether a server key exists, the sign-in methods, who is signed in and the caller's credits | Worker |
| `/api/turns` | server route: `POST` saves one conversation turn record, `PATCH` flags it undone or redone (task 020, "Conversation records") | Worker |
| `/api/auth/*` | Better Auth (email code, Google, session, sign-out), answered by `src/server.ts` before TanStack Start | Worker |
| `/auth-done` | end of the Google popup (`public/auth-done.html`): tells the studio and closes | static asset |

Static assets are matched before the Worker runs, so the landing page and
the studio never cost Worker CPU. The share route does no work beyond
string formatting (well inside the 10 ms free-tier budget).

## Code map

- `src/routes/` file routes; `src/routeTree.gen.ts` is generated by the
  router plugin (committed so `typecheck` works before a build).
- `src/studio/Studio.tsx` layout chosen by the owner (task 015; the
  approved prototype is `docs/design/studio-layout-prototype/`). The house
  is never covered or squeezed by controls (only the translucent recent
  strip, opened on purpose, lies over it); the 3D canvas keeps its size and
  the house re-frames into what the controls leave free. Desktop: house name
  top-left, 3D / 平面 / 图册 top centre, the toolbar top-right (`tools.tsx`)
  with its panel as a card under it, one input bottom centre. Visible by
  default: the house name, the mode switch, four tools and the input
  (history, text, send): 9 widgets / 11 elements (`scripts/controls.mjs`
  counts them, `shots` asserts the limits). Escape closes one thing at a
  time (site panel, tool panel, recent strip, then walking); a click on the
  drawing closes the panel and the strip. Pinned, the conversation is a
  360 px column on the left and the canvas resizes beside it. Phones
  (< 768 px wide or < 520 px high): `PhoneDock.tsx`.
- `src/studio/tools.tsx` the toolbar (视角 / 楼层 / 日照 / 走进去; plan mode:
  楼层 and zoom). Desktop: icons whose label slides out to the left on
  hover, keyboard focus and while the tool is in use (its panel open, the
  sun on: the time, a cut set: the level, a view chosen: its name,
  walking: "走进去 ×", which exits). The panels: 视角 (the nine presets as a
  small plan diagram, eye level, reset), 楼层 (cutaway with each floor's
  height in 3D, the plan level in 平面), 日照 (play, time, sun direction and
  height, the five dates, "位置与朝向" rows that open the location and
  orientation panels in place with a way back, sunrise / noon / sunset in
  clock time, off; closing keeps the sun on). Focus moves into a panel
  opened from the keyboard and back to its tool on Escape.
- `src/studio/PhoneDock.tsx` phone bottom: toolbar (labels while they fit,
  below ~300 px only the active tool's), input above it, the house above
  both. A tool opens a bottom sheet fitted to its content (max 45% of the
  screen) that slides up; the toolbar rides on its top edge, another tool
  swaps the content, the active tool or a drag down (handle or heading
  area, > 70 px or a flick) closes it; the input hides while a sheet is
  open (owner's decision) and the house re-frames above it in step with
  the slide (`SHEET_MS`). Pinned: a half-height sheet with the
  conversation and the input; a tool swaps it, closing brings it back.
  Sideways: toolbar and input share the bottom row and the sheet stands
  above the toolbar on the left.
- `src/studio/engine.ts` (lazy chunk) three.js + kernel + viewer, orbit
  controls (never below the ground, zoom between ~0.55x and 5x of the
  preset, eye level orbits outside the house, pan clamped near the plot),
  framing inside the floating chrome (`setInsets`: alternative insets
  around the top row, the title, the input or the phone's bottom stack and
  an open panel card; the one showing the house largest wins; a change
  re-frames with the preset transition, or in the phone sheet's duration,
  and re-aims a transition already running; a house swapped in during a
  transition lands on its target; the studio frames the house with its
  trees and entourage and a smaller white margin than the renderer's, since
  the insets already keep it clear of the controls; `?frame=full` keeps the
  renderer's framing); the eye-level preset looks from
  the south-east instead when a tree hides the facade's centre from the
  south-west: `treeHidesFacade` in `@opensu/furnish`, the sheets' rule),
  double-click / double-tap
  resets the view, animated preset transitions (orbit morph between parallel views,
  short dissolve to / from the eye-level perspective; a cutaway clips at
  once and the camera tilts to the steeper cutaway axonometric), sun study
  (`setSun`), render on demand.
- `src/studio/chrome.tsx` the title and project menu (place, orientation,
  templates, reset, language, AI settings, about), the mode switch, the
  first-visit hints just above the input (看看阳光 / 走进去 / 出图册; the
  first interaction of any kind dismisses them for good in `localStorage`
  `opensu.hints.v1`); `useSunPlayer` sweeps sunrise..sunset in 8 s.
- `src/studio/SitePanels.tsx` where the house is (city search in Chinese,
  pinyin or English; "use my location", asked only on a tap, rounded to
  0.01 deg and named after the nearest listed place, whose time zone it
  takes; manual latitude / longitude) and which way it faces (a compass
  dial, 5 deg snaps, compass-relative presets with the sunny side first,
  computed from the latitude). Both apply `update_site` through
  `applyEdit` in `chat-store.ts`: validated, one undo step on the same
  history as the assistant's turns, listed in the conversation, autosaved.
  A template picked from the project menu (or a reset) starts whole, in
  presentation light, at the default view, and asks for the place (or skip).
  A new place, time zone or orientation refreshes the sun strip, the slider
  range and the shadows at once (the clock time is kept while it is
  daylight there, else clamped).
- `src/lib/places/` the built-in place list (lazy chunk, ~370 KB gzip,
  loaded on first use; no network at runtime), see "Place list" below.
  `src/lib/site.ts` display helpers (the default "杭州附近（默认）" /
  "Near Hangzhou (default)", compass wording, country names from `Intl`).
- `src/studio/WalkHUD.tsx` walk mode (走进去 in the toolbar, "走进去 ×" or
  Escape exits): a hint pill, level chips (jump to a level's stair top), the floor plan
  as a mini-map with position and heading, a touch joystick;
  `walk-bridge.ts` connects it to the lazy engine (`engine.enterWalk`,
  `exitWalk`, `onWalk`, `walkMove`, `walkToLevel`). Choosing a view or a
  cutaway ends the walk; the sun study stays available.
- `src/studio/SheetGallery.tsx` + `sheet-data.ts` (lazy chunk) the sheet
  set: thumbnails as each sheet is ready, large preview (arrows, swipe),
  download one or all, Web Share API with files where available.
- `src/lib/sun.ts` date presets (seasons of the site: 冬至 is 21 June in the
  southern hemisphere) and time formatting; `@opensu/render/sun` is the
  renderer's solar module alone (no three.js). The sun study uses the
  site's IANA `timeZone` when set (offset for the date from `Intl`, daylight
  saving included), else `utcOffsetHours` (default 8).
- `src/studio/house-data.ts` (lazy chunk) model, resolver, golden sample,
  derived facts; `plan-data.ts` (lazy chunk) SVG plans.
- `src/studio/PlanView.tsx` plan fitted to the free viewport, pan (drag),
  zoom (wheel, pinch, double click, buttons).
- `src/chat/` the assistant: `ChatPanel.tsx` (the input: while a turn runs
  a light travels round its rim (one rotating conic gradient and one
  breathing shadow, transform / opacity only; still with reduced motion)
  and the placeholder gives way to the phase, "正在思考… / 正在修改房子… /
  正在回复…"; its history button opens the recent strip above it: the last
  exchange and its changes card with undo, 80% white, no blur, at most ~35%
  of the screen, with "pin"; the pinned conversation (desktop column, phone
  sheet); a short note with undo after a turn while the conversation is out
  of sight), `SettingsSheet.tsx` (bring-your-own key),
  `chat-store.ts` (chat state; runs `@opensu/agent` from a lazy chunk and
  pushes house changes into the studio store), `messages.ts` (its zh / en
  strings), `settings.ts` (key storage, request headers).
- `src/server/chat-relay.ts` the `/api/chat` relay (no app imports; checked
  by `scripts/relay-check.mjs`); `src/server/quota.ts`, `config.ts`,
  `visitor.ts`, `auth.ts` and the Worker entry `src/server.ts`: accounts and
  the daily quota (see "Accounts and quota"). `src/chat/account.ts` and
  `SignIn.tsx`: the sign-in sheet.
- `src/server/turns.ts` (`/api/turns`) and `src/chat/turn-record.ts`: saved
  conversation turns and the conversation export (see "Conversation
  records").
- `src/lib/store.ts` the zustand store. The house model is the single source
  of truth: model -> resolve -> kernel -> render / plan.
- `src/lib/i18n.ts` zh (default) and en dictionaries.
- `src/styles.css` UI tokens (the only place chrome colours, radius,
  shadow and type are defined) + Tailwind v4. Nothing uses a backdrop
  filter (the built CSS has none; `@source not inline` keeps Tailwind from
  generating one from prose): surfaces are opaque white with a soft shadow and a
  hairline (a blur under a caret or a running indicator re-filters the WebGL
  canvas every frame, very costly with software GL; task 014). Indicator
  animations are transform / opacity on small boxes.
- `public/hero-t1.webp`, `public/og-default.png` the landing hero and the
  default link preview: real renders of the default house (T1), made by
  `pnpm --filter @opensu/web hero` (`scripts/hero.mjs`); re-run and commit
  them when the default house or the renderer's style changes. Set
  `VITE_SITE_URL` at build time for absolute `og:image` URLs on the landing.

## Place list

`src/lib/places/places-data.ts` is generated by
`scripts/places/fetch-places.mjs` (run by hand; the output is committed):

- China: every prefecture-level division of mainland China, the county-level
  units provinces administer directly, the four municipalities and Hong
  Kong / Macau (372 places) from [Wikidata](https://www.wikidata.org),
  released under CC0 1.0. Pinyin derived with `pinyin-pro` (MIT, a dev
  dependency of the script; not bundled). Time zone Asia/Shanghai (UTC+8
  everywhere in mainland China).
- Elsewhere: the 18 000 largest places (down to about 30 000 inhabitants)
  of [GeoNames](https://www.geonames.org) `cities15000` with
  `admin1CodesASCII` region names and their IANA time zones, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): "Contains data
  from GeoNames (geonames.org), CC BY 4.0". Simplified Chinese names of the
  larger ones (> 100 000 inhabitants) from Wikidata labels (CC0), matched
  by GeoNames id. Coordinates rounded to 0.01 deg.

`scripts/places/check-places.mjs` spot-checks 41 places against the other
source (Chinese places against GeoNames, the rest against Wikidata); the
location panel credits both sources.

## Size budgets

`pnpm build` prints gzip sizes and fails when a budget is exceeded:
initial JS for `/studio` < 200 KB, the lazy viewer chunk < 300 KB, the lazy
assistant chunk (TanStack AI + the OpenAI-compatible adapter) < 150 KB,
the lazy place list < 400 KB. It
also reports the Worker bundle (`dist/server`) and fails if it contains
three.js or the agent / provider SDK: the lazy imports of the studio are guarded with
`import.meta.env.SSR`, so the server build never emits the viewer, model,
plan or sheet chunks.

## AI assistant

**Status: verified only against a local scripted stub. No real model has
been called from this code; nothing here says anything about how well a
real model edits houses.**

### Architecture

- Browser: `@opensu/agent` runs TanStack AI's `chat()` (agent loop, SSE
  parsing, tool-call assembly, tool execution) with
  `openaiCompatibleText` from `@tanstack/ai-openai/compatible`, whose fetch
  is pointed at `/api/chat`. The tools (`edit_house`, `get_house`,
  `new_house`) run here, on the model package, and every kept edit updates
  the studio at once; the 3D view swaps the house in and plays
  `viewer.playGrow()` (levels rise in sequence, ~1.5 s; a new house grows
  from the ground, an edit from the lowest changed level).
- Worker (`src/server/chat-relay.ts`): picks the key and model, parses the
  small request body only to set `model` / `stream: true` (and an output cap
  on the owner's key), forwards it, and returns the provider's response
  body untouched. The stream is never parsed or re-encoded. One hook,
  `checkCredits`, is where per-user credits / rate limits will go.

Why not `useChat` from `@tanstack/ai-react` with a connection adapter: its
connection adapters (`fetchServerSentEvents`, `fetchHttpStream`, `stream()`)
consume TanStack's own AG-UI `StreamChunk` events, which a TanStack server
handler (`toServerSentEventsResponse(chat(...))`) produces. Our Worker
relays the provider's raw OpenAI SSE instead (CPU budget), so the client
runs `chat()` itself. Docs read: <https://tanstack.com/ai/latest/docs/chat/connection-adapters.md>,
the `ai-core` skills shipped in `@tanstack/ai@1.4.0` (`tool-calling`,
`middleware`, `custom-backend-integration`). The tools use `.server()`
implementations even though they run in the browser: in this setup the
"server" of `chat()` is the browser.

### Configuration

Worker variables (Cloudflare secrets in production; for `pnpm dev` put
them in `apps/web/.dev.vars`, git-ignored; `vite preview` reads
`dist/server/.dev.vars`, copied there at build time):

| Variable | Meaning |
|---|---|
| `OPENROUTER_API_KEY` | owner's key; base URL `https://openrouter.ai/api/v1` (wins over OpenAI) |
| `OPENAI_API_KEY` | owner's key for OpenAI or any OpenAI-compatible server |
| `OPENAI_BASE_URL` | with `OPENAI_API_KEY`; default `https://api.openai.com/v1` |
| `OPENSU_MODEL` | model id; defaults below |

```sh
pnpm dlx wrangler secret put OPENROUTER_API_KEY   # production
pnpm dlx wrangler secret put OPENSU_MODEL         # optional
```

Default model: `anthropic/claude-sonnet-5.5` on OpenRouter (strong tool
calling; listed with `tools` and `tool_choice` support in OpenRouter's
`/api/v1/models` on 2026-11-11; $2 / $10 per M input / output tokens), and
`gpt-6.1-sol` with `OPENAI_API_KEY` (taken from OpenRouter's `openai/`
listing; not checked against OpenAI's own model list). Change it with
`OPENSU_MODEL`; any model that supports `tools` on
<https://openrouter.ai/models?supported_parameters=tools> works with the
relay. With the owner's key the relay always uses the configured model and
caps output at 4096 tokens per call.

### Bring your own key

The assistant's settings sheet (slider icon) takes a key, a provider
(OpenRouter, OpenAI, or another https OpenAI-compatible base URL) and an
optional model. They are stored only in this browser (`localStorage`
`opensu.ai`) and sent per request in `x-opensu-key` / `x-opensu-base-url`
headers to `/api/chat`, which uses them instead of the owner's key and
forwards only `Authorization: Bearer <key>` to the provider. The relay
never logs, stores or echoes keys; base URLs must be `https://` without
credentials. "Remove my key" deletes it from the browser.

### Verification (what was and was not done)

- `scripts/chat-stub.mjs`: a scripted OpenAI-compatible server (SSE text
  and tool-call deltas, OpenRouter-style keep-alive comment, HTTP errors).
  It recognises fixed sentences and replays canned answers. It is not a
  model.
- `scripts/chat-e2e.mjs` (`pnpm --filter @opensu/web chat`): the built app
  in workerd with the relay pointed at the stub. The four suggestion chips
  (zh and en) each have their own scripted answer for T1. "把北侧房间加深
  600" -> text streams before the tool call -> edit applied (area +13.3 m²,
  3D pixels change, grow plays; the indicator reads thinking / editing /
  writing as the turn goes and is gone when it completes) -> undo restores
  area and pixels exactly; undo and redo survive a reload; a
  wrong id is rejected and repaired; a hopeless edit gives up after 3
  repairs with the house unchanged; HTTP 429 and "no key" show calm inline
  messages; the BYO key goes in a header (intercepted in the browser, since
  the relay only forwards to https); every upstream call carried the server
  key and the configured model; the key never appears in the Worker log.
  Screenshots at 1440 x 900 and 390 x 844.
- `scripts/relay-check.mjs`: the relay function in Node with the upstream
  mocked: key selection, BYO, refused base URLs, no header leaks, byte-for-
  byte pass-through, and a CPU estimate (about 0.4-0.5 ms per request with a
  ~45 KB body in Node's V8; workerd has no local per-request CPU readout, so
  the 10 ms free-tier limit can only be confirmed on Cloudflare).
- Not verified: any real provider or model (no credentials here), real
  OpenRouter / OpenAI streaming quirks beyond what the stub imitates,
  token counts and cost, CPU time on Cloudflare, the BYO path through the
  relay to a real https provider, behaviour on real phones / WeChat.

## Accounts and quota

Task 019. Anyone can use the site; the owner's model key is metered:
without an account a visitor gets a small daily trial, signed in a larger
daily allowance; a visitor's own key (bring your own key, above) is never
limited. Sign-in is one flow for new and returning people: an email and a
6-digit code, or Google; a new address or Google account becomes an
account silently. There are no passwords (hashing one does not fit the
free tier's 10 ms CPU).

### How it works

- **Storage**: one D1 database (binding `DB`), migrations in `migrations/`
  (`0001_auth.sql`: Better Auth's `user`, `session`, `account`,
  `verification`, generated from Better Auth 1.7.15 and checked against it
  by `scripts/auth-check.ts`; `0002_quota.sql`: `quota_counter`,
  `quota_turn` and a trigger). The deploy workflow creates the database if
  missing and applies the migrations before deploying.
- **Auth** (`src/server/auth.ts`, mounted by `src/server.ts` at
  `/api/auth/*`): Better Auth with its built-in D1 dialect, the email OTP
  plugin (6 digits, stored hashed, 10 minutes, 5 attempts) and Google.
  Codes are sent with Resend's HTTP API from `AUTH_EMAIL_FROM`. Limits: 5
  codes per address per hour, 20 sends per IP per hour, 20 sign-in attempts
  per IP per 10 minutes, 60 auth requests per IP per minute (atomic D1
  counters through Better Auth's `customStorage`). Session in an http-only
  cookie (`opensu.session_token`, 60 days, renewed daily) with Better Auth's
  signed 5-minute cookie cache, so most session reads need no query. The
  Better Auth instance is built in the Worker's global scope with a GET-only
  warm-up, so its one-time CPU (tens of ms) counts against the 1 s startup
  limit, not a visitor's request.
- **Quota** (`src/server/quota.ts`, called from the relay's `checkCredits`
  only for the owner's key): one user message is one credit. The browser
  sends a turn id (`x-opensu-turn`) with every model call of a message; the
  first call of a turn takes the credit, later calls of the same turn are
  free up to `QUOTA_CALLS_PER_TURN`. Counters per subject (the signed-in
  user, or the anonymous visitor's signed http-only cookie `opensu_v`), per
  IP (`cf-connecting-ip`, IPv6 per /64) and for the whole site, per day in
  `QUOTA_TZ`. One SQL statement per model call: `INSERT INTO quota_turn ...
  SELECT ... WHERE <turn exists> OR (<subject, IP and site counters under
  their limits>) ON CONFLICT DO UPDATE SET calls = calls + 1 WHERE calls <
  cap RETURNING calls`; a trigger bumps the three counters in the same
  statement. SQLite runs it atomically, so concurrent requests cannot pass a
  limit (tested with 40 interleaved requests). A refusal reads the counters
  once more to say why (429 `quota_exhausted` / `quota_turn_limit`). When
  the site limit is reached the owner's key stops for everyone; own keys go
  on. Rows older than three days are deleted now and then (primary-key range
  deletes). On a database error the owner's key is refused
  (`quota_unavailable`, fail closed).
- `GET /api/chat` reports `auth` (`email`, `google`), `user` (the email),
  `quota` (`kind`, `limit`, `remaining`, `resetAt`, `reason`) and `limits`.
- **Studio**: the project menu has the account entry (sign in, or the email
  and sign out; hidden when no sign-in method is configured). The sign-in
  sheet (`src/chat/SignIn.tsx`) is a glass popover that grows out of the
  control that opened it (desktop) or the inset bottom sheet (phone). The
  input shows the credits left when 3 or fewer remain; out of credits, the
  exchange shows a calm note with what to do (sign in, the reset time, or
  your own key) and the relay is not called. Google uses a popup that lands
  on `/auth-done`; if popups are blocked the page goes to Google and back
  and the draft is kept in `sessionStorage` for the trip.

### Configuration

Worker variables and secrets (the deploy workflow sets them from GitHub
secrets and variables; for local runs put them in `apps/web/.dev.vars`).
Every one is optional; a deploy without them keeps working: sign-in is
hidden and the anonymous limits apply (counted per IP when there is no
`BETTER_AUTH_SECRET` to sign the visitor cookie).

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `SITE_URL` | variable | none | public URL (`https://opensu.009003.xyz`); Better Auth's base URL and trusted origin, the Google redirect URI and the cookies derive from it. Sign-in needs it |
| `BETTER_AUTH_SECRET` | secret | none | 32+ random characters (`openssl rand -base64 32`); signs sessions and the visitor cookie. Sign-in needs it |
| `RESEND_API_KEY` | secret | none | Resend API key ("sending access" is enough); email codes need it and `AUTH_EMAIL_FROM` |
| `AUTH_EMAIL_FROM` | variable | none | sender on your verified domain, e.g. `openSU <code@mail.opensu.009003.xyz>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | none | "Continue with Google" appears only with both |
| `AUTH_ENABLED` | variable | on | `false` hides sign-in even with the secrets set |
| `QUOTA_ENABLED` | variable | on | `false` turns the quota off (the owner's key is then unlimited) |
| `QUOTA_USER_DAILY` | variable | 10 | credits per signed-in account per day |
| `QUOTA_ANON_TRIAL` | variable | 3 | credits per anonymous visitor per day |
| `QUOTA_IP_DAILY` | variable | 60 | credits per IP per day (all subjects) |
| `QUOTA_SITE_DAILY` | variable | 500 | credits per day for the whole site |
| `QUOTA_CALLS_PER_TURN` | variable | 8 | model calls one message may make |
| `QUOTA_TZ` | variable | `Asia/Shanghai` | IANA zone where the day rolls over at midnight |
| `AUTH_TEST_HOOK` | local only | off | `1`: codes are logged and readable at `/api/auth-test/code` instead of emailed (honoured only for requests to localhost; never set in production) |

Malformed numbers or an unknown zone fall back to the defaults.

**Turning it off (self-hosting, AGPL)**: set `AUTH_ENABLED=false` and
`QUOTA_ENABLED=false`, or simply leave the auth secrets unset. Without D1,
remove the `d1_databases` block from `wrangler.jsonc` and set
`QUOTA_ENABLED=false` (with the quota on and no database the owner's key is
refused rather than left unmetered).

### Owner setup

Do these once, then push (the workflow does the rest). Nothing here goes
into the repository or a chat.

1. **Cloudflare API token**: the existing `CLOUDFLARE_API_TOKEN` was made
   from the "Edit Cloudflare Workers" template. Edit it (My Profile -> API
   Tokens) and add **Account / D1 / Edit** for your account. The workflow
   uses it to find or create the database `opensu`
   (`scripts/d1-ensure.mjs`) and to apply the migrations; without it the
   deploy fails at "D1 database and migrations" and the previous version
   stays live.
2. **Site address**: GitHub -> Settings -> Secrets and variables -> Actions
   -> Variables: `SITE_URL` = `https://opensu.009003.xyz`. Add the custom
   domain to the Worker in the Cloudflare dashboard (Workers -> opensu-web
   -> Settings -> Domains & Routes) if it is not there yet.
3. **Better Auth secret**: Secrets: `BETTER_AUTH_SECRET` = the output of
   `openssl rand -base64 32`. Changing it later signs everyone out.
4. **Resend** (email codes):
   - resend.com -> Domains -> Add domain. Use a subdomain, e.g.
     `mail.opensu.009003.xyz` (Resend recommends a subdomain).
   - Add the DNS records Resend shows (copy the exact values from its
     Records tab; in Cloudflare DNS set them to "DNS only", not proxied):
     a TXT record `resend._domainkey.mail` (DKIM), an MX record `send.mail`
     -> `feedback-smtp.<region>.amazonses.com` priority 10 and a TXT record
     `send.mail` -> `v=spf1 include:amazonses.com ~all` (SPF / return path).
     Recommended: a TXT record `_dmarc` -> `v=DMARC1; p=none;`. Wait until
     Resend shows the domain as verified.
   - Resend -> API Keys -> create one with "Sending access" for that
     domain. Secrets: `RESEND_API_KEY`. Variables: `AUTH_EMAIL_FROM` =
     `openSU <code@mail.opensu.009003.xyz>`.
   - Free plan: 100 emails a day, 3,000 a month (each sign-in sends one).
5. **Google** (optional): Google Cloud console -> APIs & Services ->
   OAuth consent screen (External; app name openSU; support email; the
   `email` and `profile` scopes only) -> Credentials -> Create OAuth client
   ID -> Web application. Authorized JavaScript origin
   `https://opensu.009003.xyz`; authorized redirect URI
   **`https://opensu.009003.xyz/api/auth/callback/google`** (that is
   `SITE_URL` + `/api/auth/callback/google`). Secrets: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`. Publish the consent screen ("In production") so
   accounts outside your test users can sign in.
6. **Numbers** (optional): Variables `QUOTA_USER_DAILY`, `QUOTA_ANON_TRIAL`,
   `QUOTA_IP_DAILY`, `QUOTA_SITE_DAILY`, `QUOTA_CALLS_PER_TURN`, `QUOTA_TZ`
   only if you want other values than the defaults above.
7. Push. Then check: the studio's menu shows "登录"; a code arrives; in the
   Cloudflare dashboard (Workers -> opensu-web -> Observability) look at the
   CPU time of `/api/auth/*` and `/api/chat` requests (see "Free tier" below:
   the numbers here are Node estimates).

A secret or variable removed from GitHub stays on the Worker until you run
`pnpm dlx wrangler secret delete NAME` in `apps/web`.

### Free tier (checked 2026-11-14)

- Workers Free: 10 ms CPU per request (network waits do not count), 1 s
  startup, 100,000 requests a day, 50 subrequests (D1 queries count) per
  request, 64 MiB uncompressed script size
  (<https://developers.cloudflare.com/workers/platform/limits/>).
- D1 Free: 5 million rows read and 100,000 rows written a day, 500 MB per
  database, 10 databases; over a daily limit D1 queries fail until 00:00
  UTC (the owner's key is then refused, own keys go on)
  (<https://developers.cloudflare.com/d1/platform/pricing/>). One counted
  turn writes about 5 rows (turn row and three counters) and each further
  model call 1; 500 turns a day with 8 calls each stay under 10,000 writes.
- Resend Free: 100 emails a day, 3,000 a month, 10 requests per second
  (<https://resend.com/docs/knowledge-base/account-quotas-and-limits>).

CPU, measured by `scripts/auth-check.ts` (Node's V8 with D1 replaced by
Node's SQLite and the time inside SQLite subtracted, since D1 runs it
remotely; process CPU, which also counts V8's background compiler and GC
threads, so it errs high). Medians / p90 of warm requests; "first" is the
first such request after the startup warm-up:

| Path | Median | p90 | First |
|---|---|---|---|
| send a code | 1.7 ms | 2.2 ms | 13 ms |
| sign in with the code | 3.2 ms | 9 ms | 21-25 ms |
| read the session (cookie cache) | 0.8 ms | 1.3 ms | 6-7 ms |
| `/api/chat` POST, anonymous, new turn (30 KB body) | 0.7 ms | 1.4 ms | |
| `/api/chat` POST, signed in, new turn | 1.4 ms | 2.3 ms | |
| `/api/chat` GET status, signed in | 1.0 ms | 2.2 ms | |
| startup: build Better Auth + warm-up | 18-29 ms + 36 ms | | |

The relay alone stays at about 0.6 ms (`scripts/relay-check.mjs`). The
first sign-in on a fresh isolate and rare GC spikes (max 14-32 ms seen)
may exceed 10 ms in this approximation; whether Cloudflare counts them the
same way can only be seen on Cloudflare. The client retries a failed code
request once.

## Keys saved with the account

Task 022. A signed-in user can save their own OpenRouter, OpenAI or
Anthropic key with the account and pick which one the assistant uses. The
key held in the browser (above) stays for visitors who are not signed in.

- **Table** `account_key` (`migrations/0004_account_keys.sql`): user,
  provider, the key encrypted, its last 4 characters, the model (empty = the
  default), `chosen` (the key in use; none = the free allowance), times.
- **Encryption** (`src/server/keys.ts`): AES-256-GCM (Web Crypto) with a key
  derived by HKDF-SHA-256 from the Worker secret `KEYS_SECRET`; the user id
  and provider are bound in as additional data. A wrong secret or a copied
  row fails closed (`account_key_unreadable`, no call is made). The browser
  only ever gets the provider, the hint and the model; keys are never logged
  or put in turn records.
- **Routes** `/api/keys`: `GET` list, `PUT` save or replace, `PATCH` model or
  `{active}`, `DELETE`. Signed-in users only; writes need the site's origin
  (`SITE_URL`) and JSON, and are limited to 30 per user per hour
  (`quota_counter`). Without `KEYS_SECRET` (or without sign-in) every route
  answers 404 `keys_off`, `GET /api/chat` reports `keys: false` and the
  studio does not offer it.
- **Relay**: `x-opensu-account-key: <provider>` makes the Worker decrypt the
  caller's key and call the provider's OpenAI-compatible Chat Completions
  endpoint with it (Anthropic: `https://api.anthropic.com/v1`, see
  <https://platform.claude.com/docs/en/api/openai-sdk>; a 32000-token output
  cap is added when the request names none). No quota; the turn record says
  `ownKey: true`. It never falls back to the site's key.
- **Studio**: a pop-up button at the pinned conversation's input and in the
  recent strip's header shows what is in use ("免费额度" or the provider) and
  opens a menu: the free allowance, each saved key (hint and model, an info
  button to change the model, replace or delete), the key in this browser,
  "添加密钥". After sign-in a key held in the browser is offered once for
  saving ("保存到账号，在其他设备也能用"); it is never uploaded without that.
- **Default models** (checked 2026-11-15): OpenRouter
  `anthropic/claude-sonnet-5.5`, OpenAI `gpt-6.1-sol` (OpenAI's models page:
  the balanced choice), Anthropic `claude-opus-5-5` (Anthropic's models
  overview: "start with Claude Opus 5.5").
- **Not verified**: no real provider was called; OpenRouter, OpenAI and
  Anthropic were stood in for by the scripted stub (`KEYS_TEST_UPSTREAM`,
  honoured only for requests to localhost). Anthropic describes its
  OpenAI-compatible layer as mainly for testing, and ignores `strict`.

CPU (`scripts/auth-check.ts`, same method as above): save 2.2 ms median,
list 2.0 ms, choose 2.1 ms, a relayed chat call with decryption 2.5 ms.

**Owner setup**: GitHub -> Settings -> Secrets and variables -> Actions ->
Secrets: `KEYS_SECRET` = the output of `openssl rand -base64 32` (a
different value from `BETTER_AUTH_SECRET`). Changing it later makes every
saved key unreadable (people add them again); leave it unset to keep the
feature off.

## Conversation records

Task 020. Every finished assistant turn is saved in D1 so the owner can see
where the assistant did not do what people meant. No opt-in, no feedback
buttons; the About page says so in one sentence (Chinese and English).

- **Table** `turn_record` (`migrations/0003_turns.sql`): one row per turn
  id (the id the browser sends in `x-opensu-turn`): `at` (server time, ms),
  `who` (`u:<user id>` or `v:<visitor id>`, identified like the quota),
  `conversation` (one id per chat in the browser, autosaved; a new chat gets
  a new one), `own_key`, `model`, `undone` and `record` (the browser's JSON
  as sent).
- **The record** (`src/chat/turn-record.ts`), built in the browser from the
  chat store: the user's message; the turn's parts in order (text pieces,
  tool calls with their arguments and results, including rejected batches
  and their errors, and the applied changes); the final text; status (`ok`,
  `gave-up`, `aborted`, `error`) with the error or the last validation
  errors; start time and duration; model and key kind; app version
  (`<package version>+<commit>`); the house after the turn. Never the
  visitor's API key (it is also replaced by `[key]` should anything echo
  it). Sizes measured with real agent turns (`scripts/turn-fixtures.ts`):
  about 13 KB for one edit on the sample house, about 70 KB for the largest
  template built from a blank plot in one turn.
- **Sending**: `POST /api/turns` when a turn ends (success, error, give-up
  or stop), for every user including own-key users; undo and redo send
  `PATCH /api/turns` `{"turn", "undone"}`. Fire-and-forget: a failure is
  never shown and never blocks the chat (the record of that turn is then
  lost).
- **Server** (`src/server/turns.ts`): refuses bodies over 256 KB (413) and
  anything that is not a record with a valid turn id (400), counts writes
  per IP per day with the quota's counter (200; then 429), keeps within a
  site-wide daily byte budget (below), and stores the text as sent. A resend of a turn id replaces its row (only by whoever
  wrote it); the undo flag is kept. About 1-3 ms of CPU (table below).
  Rows older than `TURN_RECORDS_DAYS` are deleted on about one write in
  fifty.
- **Log**: every `POST /api/chat` logs one JSON line
  (`{"msg":"chat","turn","caller","key","quota","model","upstream","ttfbMs"}`;
  Workers Logs / Observability): the turn id, `user` or `anon` (checked
  when the quota counts; otherwise read from which cookie is present),
  `owner` or `own` key, the quota's answer, the model, the provider's HTTP
  status and the ms until its response headers. No message content, keys
  or email.
- **User export**: the project menu's "导出对话" / "Export conversation"
  downloads one JSON file built in the browser (no server call):
  `{app, exportedAt, conversation, turns, house}`, the turns as in their
  records (without a house each, plus `undone`; edits made in the studio
  appear as `{manual: true, changes}`), and the current house. Disabled
  while the conversation is empty.

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `TURN_RECORDS` | variable | on | `false`: nothing is saved (`/api/turns` answers 204 and stores nothing; so it does without a database) |
| `TURN_RECORDS_DAYS` | variable | 30 | days a record is kept |
| `TURN_RECORDS_DAILY_MB` | variable | 15 | site-wide MB of records stored per quota day; beyond it records are dropped silently |

Self-hosters who do not want this set `TURN_RECORDS=false` (and change the
sentence on the About page, `landing.records` in `src/lib/i18n.ts`, which
also names the 30 days).

**Owner export** (`scripts/turns-export.mjs`): reads the database with
wrangler (the same login or `CLOUDFLARE_API_TOKEN` as a deploy, with D1
access) and writes JSON Lines, one turn per line
(`{turn, at, who, conversation, ownKey, model, undone, record}`), to
`artifacts/turns/` (git-ignored):

```sh
cd apps/web
node scripts/turns-export.mjs                                  # the last 7 days (UTC), remote database
node scripts/turns-export.mjs --from 2026-11-01 --to 2026-11-15
node scripts/turns-export.mjs --only undone,error,gave-up      # any of these
node scripts/turns-export.mjs --local [--persist-to <dir>]     # the local database
node scripts/turns-export.mjs --out some/file.jsonl
```

Free tier: a record is one row (plus its index entry and two counters) in
D1's 100,000 written rows a day. Storage: D1 Free allows 500 MB per
database. Records are stored up to a site-wide budget per quota day
(`TURN_RECORDS_DAILY_MB`, default 15 MB: 1.5 times the normal maximum of
500 turns at about 20 KB; 30 days of it stay under 500 MB), counted
atomically in KB in `quota_counter` (`<day>|turns-kb`). Over the budget a
record is dropped silently (the browser still gets 204; the Worker logs
one line per isolate, `{"msg":"turns","budget":"full"}`). Undo flags do not
count. So neither one IP (200 writes a day) nor many can fill the database,
which would also stop the quota counters. Lower the budget or
`TURN_RECORDS_DAYS` if other data needs the room.

CPU of `POST /api/turns`, measured like the table above by
`scripts/auth-check.ts` with the realistic records:

| Path | Median | p90 |
|---|---|---|
| anonymous, 13 KB record | 0.9-1.0 ms | 1.1-1.8 ms |
| anonymous, 70 KB record | 1.4 ms | 1.6-1.8 ms |
| signed in, 70 KB record | 2.0 ms | 2.2-6.9 ms |
| signed in, 256 KB record (the cap) | 3.2 ms | 3.4-3.9 ms |
| undo flag (`PATCH`) | 1.4-1.5 ms | 1.8-3.8 ms |

## Deployment

Deployment follows the Cloudflare guide for TanStack Start
(<https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/>):
`@cloudflare/vite-plugin` builds the Worker (`dist/server`) and the static
assets (`dist/client`, including the prerendered pages); `wrangler.jsonc`
points `main` at `src/server.ts` (our entry around TanStack Start's).

`.github/workflows/deploy.yml` deploys on a push to `main`:
install, find or create the D1 database and apply `migrations/`
(`--remote`), build, `wrangler deploy`, then one `wrangler secret bulk` with
the secrets and variables that are set. Owner setup: see "Accounts and
quota".

By hand: `pnpm dlx wrangler login`, then in `apps/web`:
`node scripts/d1-ensure.mjs && pnpm exec wrangler d1 migrations apply DB
--remote && pnpm build && pnpm exec wrangler deploy`. Do not commit the
database id `d1-ensure.mjs` writes into `wrangler.jsonc`.

Locally: `pnpm exec wrangler d1 migrations apply DB --local` once (in
`apps/web`), and put `SITE_URL=http://localhost:5173`,
`BETTER_AUTH_SECRET=<any 32+ characters>` and `AUTH_TEST_HOOK=1` in
`.dev.vars` to try sign-in without email (the code is printed in the
terminal).

Self-hosting is the same on your own Cloudflare account.
