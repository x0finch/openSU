# Task 025 - One popover, one hover state, one tooltip

From the owner's screen recording of the live site (2026-11-16, desktop,
real GPU, conversation pinned). Four defects, one cause: menus, panels,
hover states and tooltips are positioned and styled where they are used
instead of by one component. Count on the current tree: anchored surfaces
are positioned in `chat/KeyPicker.tsx`, `chat/SignIn.tsx`,
`studio/chrome.tsx`, `studio/SitePanels.tsx`, `studio/Studio.tsx`,
`studio/WalkHUD.tsx` and `studio/PlanView.tsx`; about 20 `hover:bg-*`
classes live outside `src/glass/`.

## The four defects

1. Project menu (click the house name): while it opens and closes, the
   glass is drawn as a clipped polygon (a trapezoid, then a triangle) and
   the pinned conversation behind it turns pale. The shape must be a
   rounded rectangle on every frame.
2. Pinned conversation header: the "new conversation" icon button gets a
   rounded-square hover plate, "取消固定" next to it gets a capsule. Its
   tooltip is white text on a white plate (the tooltip ink variable
   resolves to the panel's light ink inside dark glass).
3. Key picker in the pinned field: the menu opens about 300 px to the
   right of its button, outside the sidebar, over the house. A menu opens
   at its anchor.
4. Plan toolbar: the levels panel opens detached, a separate capsule
   under the toolbar; in 3D the views panel is joined to the toolbar
   (one shape with a neck). Same toolbar, same kind of panel, two
   behaviours. Mid-animation the plan panel is an empty capsule.

## What to build

One primitive in `src/glass/` for every anchored surface (pop-up menu,
toolbar panel, key menu, project menu, sign-in popover, site panels):

- Inputs: the anchor element, a placement (below-start, below-end,
  above-start, ...), whether it is joined to the anchor's glass (the
  toolbar panels) or floats with the module's gap (menus). Nothing else
  positions an anchored surface.
- Placement follows Apple's pop-up menus: at the anchor, aligned to its
  leading edge, flipped or shifted only to stay on screen, never further
  than the gap from the anchor. Inside the pinned sidebar a menu stays
  within the sidebar's width when it fits.
- One open and close animation (the module's spring), with the glass
  shape a rounded rectangle from the first frame to the last, content
  fading in with it. Reduced motion: no scale, a short fade.
- While a floating surface is open, what is under it is not restyled
  except by the rule that already exists (the sidebar fades and is inert
  under the project menu); say what that rule is and apply it in one
  place.

One hover / pressed state for controls on glass: the plate takes the
control's own shape (capsule for capsule buttons, circle for round icon
buttons), one fill, one transition. Icon-only buttons in a row with text
buttons use the same height. No `hover:bg-*` outside `src/glass/`.

One tooltip: readable on paper, on glass, and inside dark panels (fix the
ink so it does not inherit the panel's); one delay, one offset.

Then move every caller to these, delete the local positioning and hover
code, and extend the static glass check so it fails on: positioning an
anchored surface outside `src/glass/`, and `hover:bg-*` or a tooltip
outside `src/glass/`.

## The audit must be able to see this class of defect

The audit (task 024) missed all four: it does not hover, and it looks at
one still per state. Add to `apps/web/scripts/ui-audit.mjs`:

- A hover pass: hover every control; rules: the tooltip's contrast on
  rendered pixels is at least 4.5:1; hover plates of sibling controls in
  one row share one shape and height.
- An anchor rule: an open menu or panel is within the module's gap of its
  anchor and overlaps it on the cross axis; a joined panel touches its
  toolbar.
- A motion rule: for every surface that opens, capture frames through the
  open and the close (at least 6 each); on every frame the glass outline
  is a rounded rectangle (compare its mask with the rounded-rect of its
  bounding box) and no frame shows an empty surface at full opacity.
- A sibling rule: panels of one toolbar use one attachment in every mode.

Self-test: on the tree before your fix these rules report the four
defects above; show that, then show them gone.

## Constraints and checks

- `CLAUDE.md`, `docs/UI_STYLE.md`, `DESIGN.md`; tokens unchanged; glass
  primitives only. Task 021's still-house rules stay true (floating
  surfaces never move the house).
- The recording was made on a real GPU: check the glass shape in both
  backends (WebGL under SwiftShader and the CSS fallback) and say plainly
  that a real GPU was not available.
- Screenshots and frame strips under `artifacts/task025/` at 1440x900
  and 390x844: each of the four defects before and after, plus every
  other menu and panel open.
- `pnpm -r typecheck` and `pnpm -r test` pass once on the final tree.

## How to work

Scope note first: list every anchored surface and every hover style you
found and where each moves. Small local commits; do not push (a push to
`main` deploys; the lead pushes after review). Report honestly what was
skipped or not verified.
