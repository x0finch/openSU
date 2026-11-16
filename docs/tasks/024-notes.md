# Task 024 - notes: the UI audit

## Status (2026-11-16)

- Last complete full run: 291 states, 2864 raw / 358 de-duplicated
  findings, 66 min. Self-test 10/10 (eight pinned-input defects, the
  off-centre mode switch, house vs plan centre).
- Added after that run and verified only in `--smoke` and d1440-zh runs:
  `accent-use`, `same-label`, `stable-width`, text on the drawing touched
  by glass, insets of text buttons, the unstable-screenshot guard for
  `contrast`, icon buttons with tooltips counted by their box. A second
  full run was in progress when work stopped.
- `--smoke` (d1440-zh, 4 states): 82 s, identical over three consecutive
  runs; added to `pnpm test` with `scripts/ui-audit-allow.json` (24 keys).
- Eye passes done on the input bar (idle, pinned), the pinned column, the
  recent strip, toolbar, mode switch, project menu, key menu, sign-in and
  keys sheets, phone 3D / plan / panels. Not done: landing, sheets gallery,
  walk HUD details, every en / 1280 / 2000 crop.

The audit is `apps/web/scripts/ui-audit.mjs` (driver, matrix, reports) and
`apps/web/scripts/ui-audit-rules.mjs` (the measurements, run in the
browser). Output goes to `artifacts/audit/` (git-ignored, never committed):
`findings.json`, `findings.md`, `index.html` (the contact sheet), `crops/`,
`shots/`.

```
pnpm --filter @opensu/web build                  # the audit runs the built app
node apps/web/scripts/ui-audit.mjs               # whole matrix, about an hour
node apps/web/scripts/ui-audit.mjs --configs d1440-zh --only pinned,plan
node apps/web/scripts/ui-audit.mjs --no-crops    # measurements only
node apps/web/scripts/ui-audit.mjs --smoke       # small set vs ui-audit-allow.json
```

## How it works

- The built app runs in `vite preview` (workerd) with a fresh local D1, the
  scripted chat stub (no model), the sign-in test hook and the keys test
  upstream, as in `account-e2e.mjs`. Turns are real turns against the stub;
  the "working" state is held by delaying `/api/chat` in the page.
- Every context is DPR 3 with the 3D canvas at 1x (`?dpr=1`): DOM text and
  CSS glass are true 3x in the crops; the canvas (drawing and WebGL glass)
  is upscaled. Measuring screenshots are read at CSS scale.
- Per state: DOM rules in the page; then two screenshots (as is, and with
  all text and icons made transparent) go to a separate blank page that
  measures pixels, so the page under test is never disturbed. Contrast,
  fills and rules are measured on the rendered pixels, so the WebGL glass
  and the CSS glass are measured the same way.
- Crops: every glass surface and every finding, 3x, with guides (box,
  centre line, content insets, children's centres). Identical crops of one
  component are written once.

## Rules

| Rule | What is measured | Tolerance |
|---|---|---|
| `row-align` | flex rows (h <= 80) in the chrome: the visual centre of each child (its own shape, else its text and icons; a multi-line block by its first line or its middle; text-only children may share a baseline instead) | 1 px |
| `inset-lr` / `inset-tb` | capsules (`.lg` control), fields, shaped buttons, panel headers: content edge to container edge. Icon-only and round buttons count by their box; text buttons with a clear plate by their ink. A concentric end (inset = (H - h) / 2) lets the other side sit up to 4 px further in | 1 px |
| `wrap` | buttons, menu rows, tabs, radios, labels, capsule text, panel titles; placeholders through a mirror of the field. Lines are counted per block, so a title over a detail is not a wrap | 1 line |
| `text-truncated` | ellipsis or clipped overflow; an input's placeholder wider than its field | 1 px |
| `capsule-radius` | control glass: radius = height / 2 | 1 px |
| `concentric` | a shaped element in the corner zone of a shaped ancestor: radius = outer radius - gap | 2 px |
| `glass-on-glass` | a `.lg` surface inside another (DOM) | - |
| `card-in-card` | the nested surface's fill against the surface around it (pixels, text hidden) | 6 luma |
| `box-in-panel` | background, border or inset ring on anything inside glass that is not a plate, a field, the accent, a selected row or an image | - |
| `hairline` | borders and separators inside glass: 0.5 px, `--lg-separator`, inset from both edges, not on the surface's edge | - |
| `bright-rule` | horizontal lines inside a glass surface brighter than the glass on both sides (pixels, text hidden), named by the border or surface edge that draws them | 36 luma over the mean of both sides (the module hairline measures 24) |
| `field-passive-text` | non-interactive text inside a field or an input capsule (not an overlay standing in for the placeholder) | - |
| `placeholder-dim` | the placeholder rendered, then the same string as entered text rendered; ink strength (98th percentile distance from the field's background) compared | placeholder <= 80 % |
| `disabled-affordance` | a disabled control whose box is mostly the accent colour | 25 % |
| `disabled-same` | a filled round control's mean colour disabled vs enabled (across states) | 24 (sum of RGB differences) |
| `mode-centre` | the mode switch's centre against the screen's | 1 px |
| `subject-centre` | the 3D subject (projected framing points) or the plan sheet against the framing area (the viewer's framed insets) | max(6 px, 3 %) |
| `subject-same-point` | the house's centre in 3D vs the plan's, same configuration and layout (idle; pinned) | max(8 px, 1 % of width) |
| `contrast` | text colour (alpha and opacity applied) over the rendered background with text hidden, 95th percentile toward the ink | 4.5:1, 3:1 for large text |
| `text-size` | text below the caption size (UI_STYLE: 12 px), one finding per component and size | 12 px |
| `hit-target` | interactive elements, the `.hit` pseudo-element included | 44 px phone, 28 px desktop |
| `overlap` | text against text of another element; text outside its glass surface; glass over glass | 2 px |
| `selected-treatment` | the signature (fill, weight, lens, check) of every selected control, per backend | one treatment |
| `label-dupe` | visible strings per language: the same words written two ways, or one edit apart | - |
| `off-token-colour` / `off-token-radius` | colours in the chrome against every colour custom property (resolved in and outside glass); radii against the material, `glass.css` and `styles.css` | 2/255, 0.02 alpha |

## False positives and tuning

Counted on d1440-zh plus its CSS-glass twin (60 states), de-duplicated
findings per rule, first run -> after tuning:

- `contrast` 19 -> 13. Text scrolled under the header or the growing input
  was measured where it is clipped away; text rects are now cut to their
  clipping ancestors, and the background is the 95th-percentile pixel, not
  the single worst one (a rim pixel crossing a line box decided it).
- `overlap` 9 -> 2. The segmented control draws its labels twice in one
  place (3); clipped scrolled text (3); tooltips outside the toolbar (3).
- `row-align` 9 -> 6. A multi-line paragraph with a leading icon, a
  two-line menu row, a clock over its subtitle: a block may now align by
  its first line or its middle.
- `inset-lr` 13 -> 7. Fields whose right end is the text input (3); a
  toolbar whose selected plate showed at one end (icon-only buttons now
  count by their box); a tooltip's text made a button count as labelled.
- `wrap` 3 -> 1. A label stacked over a detail is not a wrap.
- `field-passive-text` 3 -> 1. The whole sign-in form was taken as "the
  field".
- `hit-target` 3 -> 1. A visually hidden switch input; an input inside a
  larger label.
- `label-dupe` 2 -> 1. "漫游" / "漫游 ×" (a close affordance).
- `disabled-same` 2 -> 1. A menu row's mean colour is the row, not the
  text: restricted to filled round buttons.
- `off-token-colour`: the glass material's values are inline on the glass
  layer and were not read on the landing page; now read on a page with
  glass.
- `text-size` 26 -> 7: no false positives, grouped per component and size.

Rules that stay "by eye": focus rings against neighbouring text (seen in
the crops; no rule tabs through every control), optical balance (a 6 px
dot against text), motion, and anything that needs a real GPU (see below).

## What the audit cannot see

- Real-GPU WebGL. Headless Chromium uses SwiftShader; in it the pinned
  input (a glass shape inside the conversation's glass) is not drawn at
  all, while the CSS backend draws it as a near-black card. The owner's
  live screenshot matched the CSS look.
- Motion, springs and the working glow over time; a state is one still.
- Hover (the pointer rests on the page edge), long-press, drag, IME.
- Real phones (safe areas, Safari's toolbar, iOS text rendering).
- Whether a centre line "looks" right optically when the numbers say
  otherwise (a 6 px dot, a chevron).
- States the app does not expose to the driver without product changes
  (no handle for a slow network error, a polar-night site from the UI).
