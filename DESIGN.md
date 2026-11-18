---
name: openSU
description: Smoky liquid-glass chrome floating over a white architectural illustration; one bold colour, ginkgo yellow.
---

<!--
Written from the shipped code (apps/web/src/glass/, apps/web/src/styles.css,
packages/render/src/style/tokens.ts, packages/plan) and the owner's specs.
Deliberately carries no token values: the values live in the files named
below and would drift if copied here. When this file and those sources
disagree, the sources win; fix this file.

Sources of truth:
- docs/UI_STYLE.md: the chrome (liquid glass capsules), its rules, starting
  values and components. Owner's direction, 2026-11-13.
- docs/VISUAL_SPEC.md: the drawing (3D illustration, floor plans, sheets).
- packages/render/src/style/tokens.ts: every colour, line width, light and
  shadow value of the drawing (3D renderer).
- apps/web/src/glass/material.ts: every number of the glass material (tint,
  saturation, brightness, rim, ink per tone, radii, motion).
- apps/web/src/styles.css (@theme): the app's UI tokens (ink levels, accent,
  hairline, type sizes, radii, font stack).
- packages/plan: plan colours and line weights (see VISUAL_SPEC "Floor plans").
-->

# Design System: openSU

## Overview

**Creative North Star: "Smoked glass on the architect's sheet"**

The subject is a crisp, white architectural illustration in the SketchUp
tradition: black feature lines, three grey tone bands, neutral shadows and
a few saturated plants. Everything the user touches floats on top of it as
a small number of dark, smoky Apple Liquid Glass capsules that bend the
drawing at their rims and grow into panels in place when needed. The
interface is meant to feel like a calm tool laid on a drawing, not an app
with a drawing inside it.

Density is deliberately low. The idle studio shows the house name as plain
text on the drawing, the view switch, the toolbar and the input capsule;
everything else is one tap away and flows back when done. The landing page
is a light, editorial page (white, ink type, the rendered house) with no
glass at all.

Rejected (owner): milky glass, glass on glass, boxes inside panels, more
than one exchange of chat at once, any colour besides ginkgo yellow as an
accent, game-engine looks in the drawing (sky, grid, fog, gloss).

**Key Characteristics:**
- One level of glass; separation by space and inset hairlines.
- Capsule to panel: controls grow into their panels and merge with them.
- Smoky dark glass with light ink is the default in every view.
- One bold colour, used for the sun, play, send and the working glow.
- The drawing is never covered by more chrome than the task needs.

## Colors

Two palettes that never mix: the drawing's (tokens.ts and VISUAL_SPEC)
and the chrome's (material.ts and styles.css).

### Primary
- **Ginkgo Yellow** (`--color-accent` in styles.css; the drawing's ginkgo
  in tokens.ts `entourage.ginkgo`): the sun, the play button, the send
  button, the working glow on the input's rim, and unseen-reply dots. The
  same yellow as the ginkgo trees, so the accent belongs to the drawing.
  UI_STYLE names a brighter target (`#ffd60a`) that is not yet applied.

### Neutral
- **Smoke** (`TONES.dark.tint` in material.ts): the tint of every glass
  surface, at the control and text-surface densities defined there.
- **Glass Ink / Glass Ink 2** (`TONES.dark.ink`, `ink2`): text and icons on
  glass. Inside glass the app's ink levels are remapped to these
  (glass.css `.lg`), so `ink-3` equals `ink-2` on glass.
- **Page Ink** (`--color-ink`, `--color-ink-2`, `--color-ink-3`): text on
  white (landing page, sheets gallery captions).
- **Canvas Ink** (`--color-canvas-ink`): text written straight on the
  drawing (house name and area).
- **Paper** (`--color-page`, tokens.ts `stage.background`): the white page
  and the 3D stage.
- **Hairline / Wash** (`--color-hairline`, `--color-wash`; on glass
  `--lg-separator`, `--lg-row-hover`, `--lg-row-active`): dividers and
  row states.

### Named Rules
**The One Voice Rule.** Ginkgo yellow is the only saturated colour in the
chrome. Everything else is ink on smoke or ink on paper.

**The Two Palettes Rule.** Drawing colours come only from tokens.ts and
packages/plan; chrome colours only from material.ts and styles.css. No
component hard-codes either (exception: Google's sign-in button, whose
colours are Google's brand rules, in glass.css).

## Typography

**Body Font:** Inter Variable with the system CJK face (PingFang SC,
Hiragino Sans GB, Noto Sans SC, Microsoft YaHei and others; the stack is
`--font-sans` in styles.css). One family for everything.

**Character:** a neutral, Apple-adjacent sans; Chinese carries the
interface, Latin digits are tabular (`tnum`) wherever values change.

### Hierarchy
The roles are set in docs/UI_STYLE.md ("Type") and the utility sizes in
styles.css (`--text-2xs` to `--text-base`):
- **Big value** (UI_STYLE: 40 / 1, bold): the sun time in the sun panel.
- **Panel and chat text** (UI_STYLE: 14.5 / 23, medium to semibold): the
  conversation, panel rows, the input.
- **Row value, chip** (13 / 18, medium).
- **Caption** (12 / 16, medium): notes, data sources, hints.
- **Landing display** (34 px phone, 48 px desktop, semibold, -0.02em):
  the landing headline only.

### Named Rules
**The Glanceable Value Rule.** Key values (time, area, level) are large
and medium weight or heavier (UI_STYLE rule 8).

## Layout

- Studio: a full-bleed drawing with chrome pinned to the edges (gap from
  the screen edge and safe areas per UI_STYLE "Shape and space"). Desktop:
  house name top left with "分享" on its line, view switch top centre,
  the toolbar alone at the top right, input bottom centre; panels flow out
  of the toolbar, right edges aligned. The account lives in the project
  menu (task 029); the avatar is on `/projects` only.
  Phone: the top row is the name and the view switch (share is the
  project menu's first row); the toolbar becomes a bottom tab-bar capsule; panels open as a
  sheet above it with detents (`GlassSheet`); the input hides while a
  panel is open.
- The pinned conversation is a left column on desktop and a bottom sheet
  on phone; the drawing re-frames into the remaining area (task 021:
  floating panels never move the house, the pinned column does).
- Spacing scale and panel padding: UI_STYLE "Shape and space".
- Landing: a 1200 px container, hero as a two-column grid from `lg`
  (copy left, render right), a three-column feature row, a quiet footer.

## Elevation & Depth

Depth comes from the glass itself, not from shadows on content: the rim
bends and disperses the drawing behind it, a thin catch light and bevel
mark the edge, and one soft shadow lifts the whole surface. There is only
one level. Two glass shapes closer than the merge distance join with a
smooth union, so a panel reads as part of its capsule.

Two backends draw the same material: the WebGL composite in the 3D canvas
(refraction) and a CSS fallback (`backdrop-filter` with tint, rim light and
bevel, only in glass.css). `prefers-reduced-transparency` makes it opaque.

### Named Rules
**The One Level Rule.** Glass never sits on glass, and nothing inside a
panel gets its own box, border or shadow.

**The Tint Floor Rule.** Readability is fixed by raising the text
surface's tint, never by making the glass milky.

## Shapes

- Capsules are fully round; panels and the text surface use the radii in
  material.ts (`GLASS.radiusPanel`, `radiusText`).
- Inner shapes are concentric: inner radius = outer radius minus padding.
- Selection inside glass is a plate (`.lg-plate`, round) or a lens (a
  denser, movable glass pill in segmented controls).
- Paper stays paper: sheets in the gallery are white rectangles with a
  hairline, not glass.

## Components

All chrome comes from `apps/web/src/glass/` (`index.ts` exports); screens
compose these and do not style surfaces themselves.

### Buttons
- **Glass button / button group** (`GlassButton`, `GlassButtonGroup`,
  `GlassGroupButton`): icon capsules; names beside icons only on the first
  visit; the active tool shows its value (for example the sun time).
- **Accent button**: the send and play buttons are solid ginkgo circles
  with dark icons.
- **Plates** (`.lg-plate`, the only hover state on glass): the plate takes
  the control's own shape (round ends for buttons, the row's or tile's own
  corners), a wash on hover and a stronger wash when pressed or selected,
  one transition; buttons resting on a wash (`data-filled`) take the
  stronger wash on hover. Icon buttons in a row with text buttons share
  their height (`GlassIconButton`). Focus is a 2 px ink outline.
- **Tooltip** (`GlassTip`, the only tooltip): below the control, one delay,
  one offset, its own plate and ink (never the panel's ink).

### Segmented control
- **View switch and phone tab bar** (`GlassSegmented`): a capsule with a
  glass lens over the selected segment that lifts, magnifies and slides
  when dragged.

### Inputs / Fields
- **Input capsule** (`GlassInputBar`): the compose field, the most
  prominent control; a yellow light travels round its rim while the
  assistant works.
- **Field inside glass** (`.lg-field`): a quiet well with a hairline; it
  brightens on focus; the caret is yellow. Sign-in code boxes use a thin
  ring instead.

### Panels, menus, sheets
- **Anchored surface** (`GlassPopover`, task 025): the one primitive for
  every menu, toolbar panel and popover. It takes an anchor, a placement
  (`below-start`, `above-center`, ...) and an attachment: `joined` (touches
  the anchor's glass and merges with it: the toolbar panels, in 3D and plan
  alike) or `float` (the module's gap away: menus, sign-in). The module
  places it (`anchor.ts`: at the anchor, flipped or shifted only to stay on
  screen, inside the glass surface it was opened from when it fits), grows
  it out of its control with the spring (a rounded rectangle on every
  frame, content fading in with it) and flows it back.
- **What lies under an open surface**: a floating surface over the pinned
  conversation makes it step aside (fades out, inert), unless it is a menu
  opened from inside it (`GlassTextSurface stepAside`). Nothing else is
  restyled.
- **Menu** (`GlassMenu`, `GlassMenuItem`): rows separated by inset
  hairlines, touch scrubbing.
- **Sheet** (`GlassSheet`): phone panels with a grabber and detents.
- **Text surface** (`GlassTextSurface`): the recent exchange and the
  conversation, at the denser text tint.
- **Toast** (`GlassToast`): a small capsule above the input that leaves by
  itself.
- **Sign-in invitation** (`SignInInvite`, task 029): the toast's place, a
  48 px capsule with one line (two on phones), "登录" and close; shown
  once a signed-out visitor's first change has landed, never over another
  surface.

### Switch
- **On / off** (`GlassSwitch`, task 028): a track that fills with the
  glass ink when on and a knob that slides; no accent colour. Named by the
  row's label (the share surface's "任何拿到链接的人都可以查看").

### Slider
- **Sun time** (`GlassSlider`): a rail with a yellow fill and a glass
  thumb that lifts while dragged.

### Signature: the conversation in the input
After a turn the result appears as one line in the input capsule
("已修改：… 撤销") for a few seconds; the latest exchange opens above the
input on request (recent strip) and the full conversation pins to the
side.

## Do's and Don'ts

### Do:
- **Do** keep the idle studio to the name text, the view switch, the
  toolbar and the input.
- **Do** let a capsule grow into its panel and flow back.
- **Do** separate with space first, then inset hairlines.
- **Do** take every chrome number from material.ts or styles.css and every
  drawing number from tokens.ts.
- **Do** check text on glass for 4.5:1 over the drawing
  (`scripts/glass-contrast.mjs`).

### Don't:
- **Don't** put glass on glass, or a box, border or shadow inside a panel.
- **Don't** use CSS `backdrop-filter` outside glass.css, or over the WebGL
  canvas.
- **Don't** add a second accent colour or use yellow for anything besides
  the sun, play, send and the working glow.
- **Don't** show more than one exchange of chat without a tap.
- **Don't** state quota numbers bluntly in copy.
- **Don't** change the drawing's look from the UI side; VISUAL_SPEC and
  tokens.ts own it.
