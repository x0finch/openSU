# UI style: liquid glass capsules

The owner chose this direction on 2026-11-13: direction 4 of the "four
reference directions" preview (floating capsules that grow into panels),
with Apple's Liquid Glass as the material. The material follows
glasswork (Lumno's liquid glass), which the owner confirmed as the look
they want. It covers the studio chrome only: buttons, panels, input,
chat, menus. The drawing itself follows `docs/VISUAL_SPEC.md` and does
not change.

In one line: a few small, smoky glass capsules float on the white
architectural drawing. Their edges bend the drawing behind them like a
thick glass slab. They grow into panels when needed and shrink back when
done. One bright colour, ginkgo yellow, marks the sun and the main action.

Prototype (private artifact, the source of truth for the look until the
studio is restyled): https://claude.ai/artifact/Sdtn6tagoeo5jDKcJqdAtH

## References

The material:
- glasswork, MIT, by Kubai087: https://github.com/kubai087/glasswork
  (`glass.css` for the material, `lens.js` for the rim curve,
  `refract.js` for the WebGL backdrop). Our numbers come from here.
- glisse, MIT, by Kelvin Zhang: https://github.com/0kzh/glisse. A second
  opinion; its refraction only works in Chromium, so we do not use it
  directly.
- Apple's own footage: the WWDC25 Liquid Glass newsroom videos (Music
  tab bar and mini player, playback controls).

Written guidance (read these before changing the rules):
- Apple HIG, Materials (Liquid Glass, regular and clear variants):
  https://developer.apple.com/design/human-interface-guidelines/materials
- Apple HIG, Live Activities (Dynamic Island: capsule to panel):
  https://developer.apple.com/design/human-interface-guidelines/live-activities
- Vercel Geist, Materials (one surface level, lowest elevation):
  https://vercel.com/geist/materials
- Figma, "Our approach to designing UI3" (floating tools on a canvas):
  https://www.figma.com/blog/our-approach-to-designing-ui3/

## How it is rendered

The house is already drawn into our own WebGL canvas, so the glass is
drawn there too, in the same pass, the way glasswork's `refract.js` does
it for Safari and iOS:

1. The canvas draws the scene. Inside each glass shape it draws the scene
   again, bent at the rim, blurred, saturated and lifted.
2. The DOM element on top holds the text and icons. It has a transparent
   background and no `backdrop-filter`.
3. Shapes are rounded rectangles; two shapes close together merge with a
   smooth union, so a panel can flow out of its capsule.

No CSS `backdrop-filter: url()` (Chromium only) and no SVG displacement
maps. If WebGL2 is missing, fall back to a plain CSS frosted surface with
the same tint, blur and rim (no refraction).

## Rules

1. **The drawing is the subject.** Chrome takes the least room and the
   least attention that still works (HIG, Live Activities).
2. **Capsule, then panel.** Every control lives in a capsule. A capsule
   expands into a panel in place (the sun capsule becomes the sun panel)
   and flows back when closed. When idle, only the input capsule and the
   toolbar capsule remain.
3. **One level of glass.** Glass never sits on glass. Nothing inside a
   panel gets its own box, border or shadow (Geist; HIG: Liquid Glass is
   the navigation layer only, never the content layer).
4. **Clear glass, not milky.** The tint is thin; the glass looks bright
   because it saturates and lifts what is behind it. Only the rim bends;
   the middle shows the drawing undistorted.
5. **Readable first.** A surface that holds body text (panel, chat) gets a
   higher tint floor than a capsule, so text reaches 4.5:1 over the line
   drawing. Raise the tint before adding blur.
6. **Concentric shapes, even margins.** Inner rounded shapes follow the
   outer radius minus the padding; capsules are fully round.
7. **Separate with space.** Group with spacing first. Where a divider is
   needed, use a hairline inset from both edges.
8. **Readable at a glance.** Key values are large and medium weight or
   heavier. The chat shows the latest exchange only; older turns open on
   request.
9. **One bold colour.** Ginkgo yellow for the sun, the play button, the
   send button and the working glow. Everything else is ink.
10. **Smoky glass by default.** The owner chose dark, smoky capsules
    (direction 4), so dark glass with light ink is the default in every
    view. Light glass stays defined in the material but is not used by
    default.
11. **Not everything is glass.** The house name and area are plain text
    on the drawing. Sheets in the gallery stay white paper.

## Tokens

Material values live in one place in the studio code (the glass module),
not scattered in CSS. These are the starting values, from glasswork.

Material:

| | Light glass | Dark glass |
|---|---|---|
| tint colour | white | rgb(30 30 34) |
| tint, capsule | 14% (glasswork range 6-22%) | 30% |
| tint, text surface | 42% | 55% |
| blur | 2 px (panel morph up to 6 px) | same |
| saturation | 1.8 | 1.6 |
| brightness | 1.06 | 0.80 |
| ink | rgba(0,0,0,.86), secondary rgba(60,60,67,.7) | rgba(255,255,255,.94), secondary rgba(235,235,245,.64) |

Rim refraction (same for both):

| | Value |
|---|---|
| rim width | 40 px, or a 3.5th of the short side if smaller |
| edge offset | 1.1 rim widths, sampled inward |
| falloff | (1 - depth / rim) ^ 2.6 |
| dispersion | red +15%, blue -15% |
| merge distance | 14 px smooth union |

Rim light and shadow (light glass; dark glass in brackets):

| | Value |
|---|---|
| catch, top left | 1.5 px, white 100% (46%) |
| catch, bottom right | 1.5 px, white 60% (18%) |
| inner line | 0.5 px, white 30% (6%) |
| bevel bands | 6 px inside: top white 50%, left 22%, right 12%, bottom black 6% (about a third in dark) |
| outer hairline | 0.5 px, black 12% (28%) |
| shadow | 0 4px 16px black 10% (0 4px 14px 22%) |

Colour outside the glass:

| Token | Value | Use |
|---|---|---|
| `--accent` | `#ffd60a` | sun, play, send, working glow |
| `--accent-ink` | `#1c1c1e` | icons and text on the accent |
| `--canvas-ink` | `#1b1c1e` | text written directly on the drawing |

Shape and space:

| Token | Value |
|---|---|
| capsule height | 48 desktop / 44 phone (input 56) |
| capsule radius | half the height |
| panel radius | 30 (chat 26) |
| panel padding | 22 desktop / 16 phone |
| spacing scale | 4, 8, 12, 16, 20, 24 |
| gap from screen edge | 18 desktop / 12 phone, plus safe-area insets |

Type (Inter with the system CJK face; digits tabular):

| Role | Size / line | Weight |
|---|---|---|
| Big value (sun time) | 40 / 1 | 700 |
| Panel and chat text | 14.5 / 23 | 500-600 |
| Row value, chip | 13 / 18 | 500 |
| Caption | 12 / 16 | 500 |

Motion: a capsule flows into its panel with a critically damped spring
(stiffness about 170, roughly 300 ms); the shape, radius, blur and tint
all follow the spring, and the panel's content fades in over the last
half. With `prefers-reduced-motion` it fades instead. The working state
is the yellow glow on the input capsule's edge; nothing else moves.

## Components

| Component | Rest | Active |
|---|---|---|
| House name and area | ink on the drawing, top left | opens the house menu (a glass panel) |
| View switch (3D / plan / sheets) | capsule, top centre | selected segment as a slightly denser glass lens |
| Toolbar | one capsule, top right (phone: bottom) | the tool's segment shows its value, e.g. "10:00" |
| Panels (view, level, sun) | hidden | flows out of its tool's capsule (phone: sheet above the toolbar) |
| Input | capsule, bottom centre | yellow edge glow while the assistant works; hidden on phone while a panel is open |
| Chat | hidden | latest exchange above the input as a text surface; a change reads as one line with its area delta and Undo |
| Menus, location picker | hidden | glass panel; rows separated by inset hairlines |
| Toasts | none | small capsule above the input, disappears by itself |
| Gallery sheets | white paper | unchanged |

## Do and don't

- Do keep the idle screen to two capsules plus the name text.
- Do let the rim bend the drawing; that bend is what makes it glass.
- Don't stack glass on glass, or put a box inside a panel.
- Don't make the glass milky to fix readability; raise the text
  surface's tint floor instead.
- Don't use CSS `backdrop-filter` for the glass in the studio; it differs
  across browsers and the canvas already has the scene.
- Don't show more than one exchange of chat at a time without a tap.

## Open questions

- Frame rate on real phones (one iPhone, one Android). The prototype has
  an automatic test; until we have numbers, plan a fallback that keeps the
  glass static (or switches to plain frosted) while the camera moves.
- Adaptive density: glasswork thickens the tint where the background is
  busy and switches to dark glass over dark areas. Worth adding once the
  basic material ships.
- Ink blending: glasswork multiplies dark text into light glass and adds
  light text onto dark glass. Not done yet.
- If we copy glasswork code (not just numbers), keep its MIT notice in a
  `THIRD_PARTY_NOTICES` file; AGPL allows MIT code.
