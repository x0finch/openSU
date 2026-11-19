# @opensu/ui

A component library in Apple's Liquid Glass style, not coupled to any
product: it follows shadcn/ui's practice (one file per component, small
composable parts, variants as props, `data-slot`-like data attributes for
state, `cx` for classes), is built on [Base UI](https://base-ui.com)
(`@base-ui/react`) for behaviour and on [Vaul](https://github.com/emilkowalski/vaul)
for the phone sheet, and is a separate package so that it can later be
split out and published. Behaviour (placement, focus, dismissal, keyboard,
screen readers, open and close states) is Base UI's and Vaul's; the look
(the glass, its numbers, the motion) is this package's.

## Install and use

Peer dependencies: `react` and `react-dom` (19). Dependencies, pinned:
`@base-ui/react` 1.9.0, `vaul` 1.1.2. Inside this monorepo the app depends
on `"@opensu/ui": "workspace:*"` and resolves it to `src/` (Vite alias and
`tsconfig` paths).

The components are written with Tailwind CSS v4 utilities. Import the
stylesheet after Tailwind; it brings the tokens (`@theme`), the two
utilities the components use (`hit`, `tnum`), the glass styles, and an
`@source` for the components:

```css
@import "tailwindcss";
@import "@opensu/ui/styles.css";
```

Wrap the glass part of a page in `GlassLayer` (it sets the material's
custom properties for its tone and holds the portal surfaces render into):

```tsx
import { GlassLayer, Popover, PopoverBody, PopoverHeader, PopoverTitle } from '@opensu/ui';

<GlassLayer tone="dark">
  <button ref={btn} onClick={() => setOpen(!open)} aria-expanded={open}>Views</button>
  <Popover open={open} anchor={() => btn.current} placement="below-center" size="tool" role="group" onClose={() => setOpen(false)}>
    <PopoverHeader onClose={() => setOpen(false)} closeLabel="Close">
      <PopoverTitle>Views</PopoverTitle>
    </PopoverHeader>
    <PopoverBody>…</PopoverBody>
  </Popover>
</GlassLayer>
```

Every string a user reads or hears (titles, labels, `aria-label`s) comes
in through props; the package holds no product text.

## The rule: apps only apply components

An app composes these components and lays out its own content inside a
surface's body (flex, gaps, margins, text sizes of its content). It never
sets a radius, a hover or focus state, a focus ring, a shadow, a backdrop,
a surface's padding or a surface title's size, never uses the package's
own classes (`lg-plate`, `lg-field`, ...), never draws a tooltip and never
positions a floating surface (Popover and Menu take an anchor and a
placement). openSU enforces this with `apps/web/scripts/ui-check.mjs`.

The package's own boundaries are checked by `scripts/boundary-check.mjs`
(the package's `test`, part of the monorepo's `pnpm test:fast`): no import
from an app or another `@opensu/*` package, no three.js, no store, router,
auth or data library, peers `react` and `react-dom` only, dependencies
Base UI and Vaul only, no product text, no `fetch` or app globals.

One responsive rule lives here too: on phones (narrower than 768 px or
lower than 520 px, `use-phone.ts`) a Popover is a Sheet.

## Components

| File | Components | Built on | Variants and parts |
|---|---|---|---|
| `popover.tsx` | `Popover`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription`, `PopoverBody`, `PopoverFooter`, `PopoverAction`, `SheetContent` | Base UI Popover (Root, Portal, Positioner, Popup, Close); Vaul on phones | `size`: tool 330, dialog 380; `role`: dialog (focus kept inside), group (a tool's panel); `placement` side-align; `closeOnOutsidePress`; `initialFocus` / `finalFocus`; `PopoverHeader` (title and close, on every surface) `back`; `PopoverFooter` `note`; `PopoverAction` `kind` primary / secondary |
| `menu.tsx` | `Menu`, `MenuItem`, `MenuLabel`, `MenuSeparator` | Base UI Menu (Root, Portal, Positioner, Popup, Item, Separator) | `MenuItem` `icon`, `detail`, `danger`; `MenuLabel` `title`/`sub`, `title`/`detail`, `small`; touch scrubbing |
| `sheet.tsx` | `Sheet` | Vaul Drawer (Root, Portal, Overlay, Content, Handle) | detents fit and large, `fixed` height, `modal` (scrim) or docked |
| `tooltip.tsx` | `Tooltip` | Base UI Tooltip | `side`; one delay (`TOOLTIP_DELAY`) |
| `switch.tsx` | `Switch` | Base UI Switch | |
| `slider.tsx` | `Slider` | Base UI Slider (the lens thumb is drawn here) | `idle` |
| `segmented.tsx` | `Segmented` | Base UI RadioGroup and Radio (segments) | `variant`: segments, tabs (a tool bar of buttons) |
| `choice.tsx` | `Choice` | Base UI RadioGroup and Radio | radio chips |
| `field.tsx` | `Field`, `Input`, `CodeInput`, `NameInput` | Base UI Field and Input | `Input` `size` sm/md/lg, `mono`, `icon`; `Field` `label`, `hint` |
| `separator.tsx` | `Separator` | Base UI Separator | |
| `button.tsx` | `Button`, `ButtonLink`, `buttonClass`, `ButtonArrow` | | `variant`: glass, plain, tinted, quiet, accent, ink, paper, paper-tinted, paper-ink, link, canvas; `size` xs/sm/md/lg; `icon`, `label`, `tip`, `full`, `strong`, `danger`, `busy`, `row`, `tile`, `selected`, `inverted`, `dim` |
| `icon-button.tsx` | `IconButton` | | a round icon button on the plate |
| `toolbar.tsx` | `ToolbarGroup`, `ToolbarButton` | | a capsule of tools (name as tooltip, value of a tool in use) |
| `toast.tsx` | `Toast` | | `action` (the caller times it) |
| `notice.tsx` | `Notice`, `NoticeAction` | | a capsule with a line and its actions |
| `text-surface.tsx` | `TextSurface` | | `stepAside` |
| `input-bar.tsx` | `InputBar`, `InputField`, `PromptText` | | the compose capsule, the field inside a surface |
| `bar.tsx` | `Bar` | | `start` / `end`: text or control |
| `hud.tsx` | `HudPanel`, `HudInset`, `HudKnob` | | a glass panel pinned to the screen, `kind`, `small`, `inset`; a paper well; a joystick knob |
| `card.tsx` | `TileLink`, `TileButton`, `Tile`, `TileMark`, `PaperSheet`, `PageDots` | | paper cards |
| small marks | `Spinner`, `Dot`, `Badge`, `Skeleton`, `Avatar`, `CloseGlyph`, `BackGlyph` | | |

Internals: `surface.tsx` (`Glass`, `GlassLayer`, `GlassLens`, the press
light), `registry.ts`, `material.ts` and `glass-types.ts` (the glass, its
numbers, its two data types), `floating.ts` (placements, the bar-edge
anchor, what lies under an open surface), `use-floating-box.ts`,
`spring.ts` (the press, the segment lens, the slider thumb), `util.ts`,
`use-phone.ts`, `glass.css` and `styles.css`.

## Motion

A surface opens from the edge of its anchor that faces it and grows away
from the anchor; it leaves the same way, and it is never drawn over its
anchor or the bar the anchor sits in. Base UI gives `--transform-origin`
(on that edge, minus the gap) and marks the first and last frames
(`data-starting-style`, `data-ending-style`); `glass.css` `.lg-pop` is the
transition, its numbers `GLASS.pop*`. A control inside a glass bar is
measured from the bar's edge (`floating.ts` `anchorBox`). Reduced motion:
a fade in place. A closed surface is inert at once and drops
`aria-modal`; it leaves the DOM when its closing transition ends.

## The glass: two backends

- **CSS** (the default, needs nothing): each glass element draws itself
  with `backdrop-filter` and the material's tint, rim light, bevel and
  shadow (`glass.css`, after glasswork, MIT).
- **Canvas** (optional): an app that renders its own canvas (openSU's 3D
  viewer) plugs in with `glassRegistry.attachCanvas({ canvas, setGlass })`.
  The registry measures every glass element (every frame while a
  transition runs) and hands `setGlass` the shapes (`GlassShape[]`) and the
  material (`GlassMaterial`); the elements turn transparent and only carry
  their content. `attachCanvas(null)` goes back to CSS. Because the
  elements are transparent there, nothing in the DOM should lie under a
  glass surface on that backend (it would show through).
