# Product

<!-- impeccable:product-schema 1 -->

Written by an agent from the repository (`CLAUDE.md`, `docs/DECISIONS.md`,
`docs/STATUS.md`, `docs/UI_STYLE.md`, `docs/BACKLOG.md`, the task specs and
the code). Nobody was available to interview; every inference is listed under
"Assumptions to confirm" at the end. The docs above stay authoritative; this
file summarises them for design work and must not contradict them.

## Platform

web

## Users

- Primary: people in China planning a self-built house (自建房) on their own
  plot (宅基地), typically a two- or three-storey rural or small-town house,
  who are not architects. They describe what they want in plain Chinese and
  need to see, check and share the result. Evidence: the Chinese-first UI,
  the plot / floor-area vocabulary on sheets, the 堂屋 and shrine-table
  findings in `docs/BACKLOG.md`, the "一键发小红书、朋友圈" sheet hint.
- Secondary: the people they share the design with (family, a builder, a
  local designer), who mostly see exported sheets and share links on a
  phone, often inside WeChat.
- Self-hosters: anyone who deploys their own copy to Cloudflare (AGPL).

## Product Purpose

openSU is an AI-assisted design tool for self-built houses: describe a
house, get a parametric model, see it as a clean architectural illustration,
walk through it, study sunlight, and share it. "Open" means shareable and
self-hostable.

Success is the three aha moments in `docs/DECISIONS.md`:
1. a sentence becomes a house;
2. dragging the time slider shows sunlight sweeping the rooms;
3. one click exports a shareable sheet (axonometric on top, coloured plan
   below).

## Positioning

- The house is a semantic, parametric model (site, grid, levels, rooms,
  openings, stairs, roofs). The AI edits it only through validated
  commands; it never emits geometry. Every edit can be undone.
- The engine, not the AI, decides how it looks: one curated architectural
  illustration style (SketchUp-tradition line drawing, white page, crisp
  shadows, stylised planting), so every house looks professional.
- Physically placed sun for the house's real location and orientation.
- Open source (AGPL-3.0) and deployable to one's own Cloudflare account.

## Operating Context

- Desktop browser for designing; phones (including the WeChat in-app
  browser) for viewing, sharing and light edits. The 3D view is WebGL2.
- The studio (`/studio`) has three views: 3D, plan (平面) and sheets
  (图册), four tools (视角, 楼层, 日照, 漫游), a conversation with the
  assistant, and a project menu (location, orientation, templates,
  language, AI connection, conversation export, about).
- The assistant runs on the site owner's key with a small daily free
  allowance (anonymous visitors less than signed-in users), or on the
  user's own API key (OpenRouter, OpenAI, Anthropic), kept in the browser
  or, when signed in, encrypted with the account.
- Sign-in is by email one-time code or Google; no passwords.
- Sheets are produced in the browser as 1500 x 2000 PNGs for social
  sharing.

## Capabilities and Constraints

- Units: millimetres in the model, metres in the scene; X east, Y north,
  Z up.
- The server stays trivial (Cloudflare Workers free tier, 10 ms CPU per
  request). Geometry, validation, rendering and image export run in the
  browser.
- Budget: whole house under 150k triangles and 150 draw calls; render on
  demand.
- Region profiles, one product: China first (Chinese UI, English
  available), then an international metric profile, then the US.
- Conversation turns are stored on the server for 30 days to improve the
  assistant; the landing page says so.
- Not yet built or undecided: share links (`/s/$id`), style presets,
  interior decoration, double-height spaces, real-device performance
  numbers, the final product name outside China.

## Brand Commitments

- Name: openSU. The name refers to SketchUp (a Trimble trademark); it must
  be confirmed before marketing outside China (`docs/DECISIONS.md`).
- Owner's binding visual direction (not open for redesign): Apple Liquid
  Glass chrome in smoky dark glass floating over the white architectural
  illustration, Apple layout and interaction conventions, ginkgo yellow as
  the single bold colour. Details in `docs/UI_STYLE.md` and DESIGN.md.
- Owner's copy rules: keep things simple; do not state quota numbers
  bluntly; calm, factual tone (the assistant explains consequences with
  facts, e.g. sunlight, and offers a recommended variant).
- Owner's layout rule: no card inside a card.
- All code, docs and issues in English; the UI is Chinese first with an
  English translation.

## Evidence on Hand

- Three original template houses (T1 default "白墙坡顶小院", T2, T3) and
  real renders of T1 for the landing page (`apps/web/public/hero-t1.webp`,
  `og-default.png`).
- No testimonials, customers, usage numbers or press exist. Do not invent
  them.
- The golden-sample reference images under `.reference/` are third-party
  and must never be shown or committed.

## Product Principles

1. The drawing is the subject; the chrome recedes until needed.
2. Say it in a sentence, check it with your eyes: every AI edit is visible,
   validated and undoable.
3. Facts over persuasion: area, dimensions and sunlight are stated
   plainly, including the bad news.
4. Calm by default: few controls visible, progressive disclosure, one
   exchange of chat at a time.
5. Works where the audience is: a phone in WeChat matters as much as a
   desktop.

## Accessibility & Inclusion

- Text on glass must reach 4.5:1 over the line drawing
  (`docs/UI_STYLE.md` rule 5; checked by `apps/web/scripts/glass-contrast.mjs`).
- `prefers-reduced-motion` replaces the spring morphs with fades;
  `prefers-reduced-transparency` makes glass opaque.
- Touch targets are at least 44 px on phones (the `hit` utility).
- No further standard (for example a WCAG level target) is recorded.

## Assumptions to confirm

- The primary user is the homeowner planning their own house, not a
  professional designer serving them. Inferred from the docs and copy; no
  user research is recorded.
- Secondary audiences (family, builders) mainly consume sheets and links
  on phones and in WeChat. Inferred from `docs/DECISIONS.md` (WebGL2 for
  WeChat) and the sheet hint; not stated as a user decision.
- Typical house: two to three storeys on a rural or small-town plot.
  Inferred from the templates and the BACKLOG evaluation; city townhouses
  are also mentioned.
- The users are not expected to know what an API key is; the own-key path
  is for enthusiasts. Inferred; not stated anywhere.
- No accessibility standard beyond the contrast floor, reduced motion,
  reduced transparency and 44 px targets has been chosen.
- The landing page's job is to get a visitor into the sample project
  (its only call to action), not to collect sign-ups.
- Platform recorded as `web` (mobile web included); there is no native
  app.
