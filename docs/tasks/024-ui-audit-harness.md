# Task 024 - A UI audit that finds problems without being told where

The owner pointed at one input bar and it had eight defects; the lead's
review and a third-party design review had named four. Whole-screen
screenshots checked against a spec do not find alignment, spacing and
state defects. This task builds the tooling that does, runs it over the
whole interface, and reports. It changes no product UI.

## 1. Measured checks (the primary instrument)

A script (`apps/web/scripts/ui-audit.mjs`, run by hand and as `--smoke`
in `pnpm test` once its rules are stable) that opens every surface and
state below and measures the DOM. Each rule reports element, state,
viewport, measured values and a cropped screenshot.

- Row alignment: in every control row (capsules, the input, panel
  headers, menu rows, tab bar) the visual centres of the children are on
  one line (within 1 px), or share a baseline for text of mixed sizes.
- Insets: left and right padding of a capsule or field are equal (within
  1 px) unless a round button is inset concentrically; equal top and
  bottom.
- Single-line controls never wrap: placeholders, labels, buttons, tabs,
  menu rows, at every width and in both languages.
- Shape: a capsule's radius is half its height; nested corners are
  concentric (inner radius = outer radius - gap).
- Centring: the mode switch at the screen centre; the house or plan
  centred in its framing area, the same point in 3D and in plan.
- Nothing overlaps or is clipped: text against its container, focus
  rings against neighbouring text, panels against each other, sheets
  over other glass.
- Text: minimum sizes from `docs/UI_STYLE.md`; a placeholder is dimmer
  than entered text; contrast measured on rendered pixels (the canvas
  glass, not the DOM background).
- States: a control that cannot act looks unable to act (send with empty
  input, save with missing fields, out of quota); selected states use
  one treatment across sibling panels.
- Hit targets: at least 44 px on phone, 28 px on desktop.
- Consistency: one concept has one label (collect all visible strings per
  language and flag near-duplicates); colours and radii outside the
  tokens.

Say for each rule how many false positives it produced and how you
tuned it; a rule that cannot be made reliable is listed as "by eye".

## 2. The state matrix

Surfaces: landing; studio 3D, plan (each level), sheets; each tool
panel; site panels; project menu; conversation idle, focused, with text,
with long text, working, finished turn, a reply with a warning, an
error, recent strip, pinned; quota nearly used and used up; sign-in each
step and its errors; key picker, add key, saved key, the browser-key
sheet, the offer after sign-in; walk mode; sun study on and off.

Each at: desktop 1280x720, 1440x900, 2000x1100; phone 390x844 and
landscape; Chinese and English; signed out and signed in; both glass
backends (WebGL and the CSS fallback). Skip combinations that cannot
differ and say which.

## 3. A contact sheet for human eyes

For every control and panel in every state, a crop at 3x device pixels
with a 1 px grid of guides for its centre line and insets, written to
`artifacts/audit/` with an `index.html` that groups them by component.
Where Apple has a direct equivalent (Messages input bar, Maps place
card, a pop-up menu, a sheet with detents, a tab bar), state the
reference and the differences in words; do not store third-party images
in the repo.

## 4. Review passes on the crops

After the measured checks, look at every crop yourself in separate
passes, one lens per pass: alignment; spacing and rhythm; states and
affordance; text and copy; consistency between siblings. Record what the
measurements missed, then say which new rule would have caught it.

## Deliverable

A findings list: id, component, state, viewport, what is wrong, measured
evidence, crop file, severity, found by (rule name or which eye pass).
Include a self-test: confirm the audit reports all eight known defects
of the pinned input (wrap, card in card, bright rule, quota hint in the
input, children on four different centre lines, unequal left and right
insets, placeholder as bright as text, send looks active when empty) and
the off-centre mode switch; if it misses one, fix the audit.

## Constraints

- No change to product UI, tokens or copy. Scripts and docs only.
- Do not add `ui-audit.mjs --smoke` to `pnpm test` while it fails on
  known defects: add it with an explicit allow-list of the known finding
  ids, so new defects fail and fixed ones must be removed from the list.
- `artifacts/` is never committed. Small local commits, no push.
