# UI style: night capsules

The owner chose this direction on 2026-11-13 (direction 4 of the
"four reference directions" preview). It covers the studio chrome
only: buttons, panels, input, chat, menus. The drawing itself follows
`docs/VISUAL_SPEC.md` and does not change.

In one line: a few small, opaque, near-black capsules float on the white
architectural drawing. They grow into panels when needed and shrink back
when done. One bright colour, ginkgo yellow, marks the sun and the main
action.

## References

Products with the same idea (dark, opaque chrome floating on bright
content):
- iPhone Dynamic Island: a black capsule that expands into a panel and
  collapses again.
- Raycast's command window, Vercel's floating toolbar, macOS screenshot
  and screen-recording bars: dark compact bars over arbitrary content.
- Figma UI3: floating tools at the bottom of a canvas. Its forum
  feedback is a warning: a floating bar that is too dark or too big gets
  in the way of the work.

Written guidance this document borrows from (read these before changing
the rules):
- Apple HIG, Live Activities (Dynamic Island):
  https://developer.apple.com/design/human-interface-guidelines/live-activities
- Apple HIG, Materials:
  https://developer.apple.com/design/human-interface-guidelines/materials
- Vercel Geist, Materials (elevation roles for surfaces):
  https://vercel.com/geist/materials
- Figma, "Our approach to designing UI3":
  https://www.figma.com/blog/our-approach-to-designing-ui3/

## Rules

1. **The drawing is the subject.** Chrome takes the least room and the
   least attention that still works. Do not add anything whose only job
   is to draw the eye to the chrome (HIG, Live Activities).
2. **Capsule, then panel.** Every control lives in a capsule. A capsule
   expands into a panel in place (the sun capsule becomes the sun panel)
   and collapses back when closed, like the Dynamic Island's compact and
   expanded presentations. When idle, only the input capsule and the
   toolbar capsule remain.
3. **One level of surface.** A panel is one dark surface. Nothing inside
   it gets its own box, border or shadow. If a child needs more lift, it
   becomes its own floating surface (Geist: never stack two materials).
4. **Opaque, no glass.** Surfaces are solid. No backdrop blur (it costs
   3-5x per frame on our renderer, and Geist rejects glass effects).
5. **Concentric shapes, even margins.** Inner rounded shapes follow the
   outer radius minus the padding; pills are fully round. Content keeps
   the same margin from every edge and never runs into a rounded corner
   (HIG).
6. **Separate with space.** Group with spacing first. Where a divider is
   needed, use a hairline inset from both edges, never edge to edge (HIG:
   inset shape or line, not to the edge).
7. **Readable at a glance.** Key values are large and medium weight or
   heavier; small text is rare. Body text on dark is medium weight, not
   regular (HIG). Long text is limited: the chat shows the latest exchange
   only; older turns open on request.
8. **One bold colour on black.** Black surfaces carry one brand colour,
   ginkgo yellow, for the sun, the play button, the send button and the
   working glow. Everything else is white or grey text (HIG: bold colour
   on the black background builds recognition).
9. **Lowest elevation that reads.** Shadows only separate the surface
   from the drawing. Use the smallest one that works; a capsule gets less
   than a panel (Geist).
10. **Key line on dark scenes.** When the background behind a capsule is
    dark (walk mode at dusk, a dark plan colour), draw a 1 px key line in
    a light, low-contrast tone so the capsule's edge stays visible (HIG).
11. **Not everything is dark.** The house name and area are plain dark
    text on the white drawing, not a capsule. Sheets in the gallery stay
    white paper.

## Tokens

All values live in `apps/web/src/styles.css` as CSS custom properties.
These are the starting values; tune them there only.

Colour (chrome is dark in both the light and dark page theme):

| Token | Value | Use |
|---|---|---|
| `--chrome` | `#1c1c1e` | capsule and panel surface |
| `--chrome-raised` | `#2c2c2e` | pressed state, assistant text block |
| `--chrome-control` | `#3a3a3c` | selected segment, slider track |
| `--chrome-line` | `rgba(255,255,255,.10)` | inset hairline, key line |
| `--chrome-text` | `#f2f2f7` | primary text and icons |
| `--chrome-text-2` | `#aeaeb2` | secondary text, idle icons |
| `--chrome-text-3` | `#8e8e93` | captions, placeholders |
| `--accent` | `#ffd60a` | sun, play, send, working glow |
| `--accent-ink` | `#1c1c1e` | icons and text on the accent |
| `--canvas-ink` | `#1b1c1e` | text written directly on the drawing |

Text on `--chrome` must reach 4.5:1 contrast; check `--chrome-text-3`
before using it below 13 px.

Shape and space:

| Token | Value |
|---|---|
| capsule height | 40 desktop / 44 phone (input 52) |
| capsule radius | half the height |
| panel radius | 24 |
| panel padding | 20 desktop / 16 phone |
| inner rounded rect radius | panel radius minus padding (min 8) |
| spacing scale | 4, 8, 12, 16, 20, 24 |
| gap from screen edge | 20 desktop / 12 phone, plus safe-area insets |

Type (Inter with the system CJK face; digits tabular):

| Role | Size / line | Weight |
|---|---|---|
| Big value (sun time) | 38 / 1 | 600 |
| Panel title, chat text | 14 / 22 | 500 |
| Row value, chip | 13 / 18 | 500 |
| Caption | 12 / 16 | 500 |

Elevation:

| Surface | Shadow |
|---|---|
| capsule | `0 4px 16px rgba(0,0,0,.18)` |
| panel, chat | `0 16px 48px rgba(0,0,0,.25)` |
| phone sheet | `0 -8px 40px rgba(0,0,0,.25)` |

Motion: a capsule morphs into its panel in about 240 ms (ease-out); with
`prefers-reduced-motion` it fades instead. The working state is the
yellow glow on the input capsule's edge, nothing else moves.

## Components

| Component | Rest | Active |
|---|---|---|
| House name and area | dark text on the drawing, top left | opens the house menu (a dark panel) |
| View switch (3D / plan / sheets) | capsule, top centre | selected segment on `--chrome-control` |
| Toolbar | one capsule, top right (phone: bottom) | the tool's segment shows its value, e.g. "10:00" |
| Panels (view, level, sun) | hidden | the tool's capsule expands into a panel below it (phone: bottom sheet with the toolbar riding on top) |
| Input | capsule, bottom centre | yellow edge glow while the assistant works |
| Chat | hidden | latest exchange above the input on `--chrome`; a change reads as one line with its area delta and Undo |
| Menus, location picker | hidden | dark panel; list rows separated by inset hairlines |
| Toasts | none | small capsule above the input, disappears by itself |
| Gallery sheets | white paper | unchanged |

## Do and don't

- Do keep the idle screen to two capsules plus the name text.
- Do let the sun panel's yellow be the brightest thing in the chrome.
- Don't put a dark box inside a dark panel, or a border around a row.
- Don't use blur, gradients or glows other than the working glow.
- Don't show more than one exchange of chat at a time without a tap.
- Don't make the chrome bigger to make it "feel premium"; size is
  attention taken from the house.

## Open questions

- Dark chrome in the page's light theme is deliberate; check it still
  separates from the drawing when the page itself is dark.
- Walk mode: the interior render is light grey; confirm the capsules
  read well there and add the key line if they do not.
