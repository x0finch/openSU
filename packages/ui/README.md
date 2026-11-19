# src/ui: the base components

Every control and surface of the app lives here (task 029). The folder is
organised like shadcn/ui: one file per component, small composable parts,
variants as props, no feature knowledge inside. It is not shadcn or Radix:
our glass is drawn on the canvas layer (`surface.tsx`, `registry.ts`) and
placed by our own anchoring (`anchor.ts`).

## The rule

Everything outside this folder only applies these components. A feature
file may compose them (`<Popover><PopoverHeader>...`) and lay out its own
content inside a body (flex, gaps, margins, text sizes of its content);
it never sets a radius, a hover or focus state, a focus ring, a shadow, a
backdrop, a surface's padding or a surface title's size, never uses the
base's own classes (`lg-plate`, `lg-field`, ...), never draws a tooltip
and never positions a floating surface. `scripts/ui-check.mjs` enforces
it (part of `pnpm test`); its exceptions are listed in the script with
their reasons.

The one responsive rule is in the base too: on phones (narrower than 768
px or lower than 520 px, `use-phone.ts`) a Popover is a Sheet.

## Components

| File | Components | Variants and parts |
|---|---|---|
| `button.tsx` | `Button`, `ButtonLink`, `buttonClass`, `ButtonArrow`, `GoogleButton` | `variant`: glass, plain, tinted, quiet, accent, ink, paper, paper-tinted, paper-ink, link, canvas; `size`: xs 28, sm 32, md 40, lg 48 (glass: `height` in px); `icon` (alone: a circle; `dim` sets its diameter), `label`, `tip`, `full`, `strong`, `danger`, `busy`, `row`, `tile`, `selected` (the pressed plate), `inverted` (ink fill) |
| `icon-button.tsx` | `IconButton` | a round icon button on the plate, with its tooltip |
| `toolbar.tsx` | `ToolbarGroup`, `ToolbarButton` | the toolbar capsule and its tools (name as tooltip, value of a tool in use) |
| `segmented.tsx` | `Segmented` | `variant`: segments (view switch), tabs (phone tool bar) |
| `popover.tsx` | `Popover`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription`, `PopoverBody`, `PopoverFooter`, `PopoverAction`, `SheetContent` | `size`: tool 330, dialog 380; `role`: dialog, group; `PopoverHeader` `onClose`, `back`; `PopoverTitle` `hidden` (the untitled variant: the sun panel's clock is its heading); `PopoverFooter` `note`; `PopoverAction` `kind`: primary (one, full width, ginkgo), secondary (plain) |
| `anchored.tsx` | (internal) the anchored glass surface Popover and Menu are built on: placed by `anchor.ts` at the module gap, grows away from its anchor | |
| `menu.tsx` | `Menu`, `MenuItem`, `MenuLabel`, `MenuSeparator` | `MenuItem` `icon`, `detail`, `danger`; `MenuLabel` `title`/`sub` (who is signed in), `title`/`detail` (an allowance), `small` (a status line) |
| `sheet.tsx` | `Sheet` | the phone form: grabber, detents (`large`, `fixed`) |
| `switch.tsx` | `Switch` | |
| `slider.tsx` | `Slider` | the sun time |
| `choice.tsx` | `Choice` | radio chips |
| `row.tsx` | `Row` | a full-width row inside a panel |
| `field.tsx` | `Input`, `Field`, `CodeInput`, `NameInput` | `Input` `size` sm/md/lg, `mono`, `icon`; `Field` `label`, `hint` |
| `input-bar.tsx` | `InputBar`, `InputField`, `PromptText` | the compose capsule, the pinned field, their text |
| `tooltip.tsx` | `Tooltip` | the only tooltip |
| `toast.tsx` | `Toast` | `action` (a button at its end) |
| `notice.tsx` | `Notice`, `NoticeAction` | a capsule with a line and its actions (the sign-in invitation, the view-only bar) |
| `text-surface.tsx` | `TextSurface` | `stepAside` |
| `bar.tsx` | `Bar` | a capsule row; `start`/`end`: text or control (insets) |
| `hud.tsx` | `HudPanel`, `HudInset`, `HudKnob` | walking: `kind` text/control, `small`, `inset` none/xs/sm/md/pill/row |
| `card.tsx` | `TileLink`, `TileButton`, `Tile`, `TileMark`, `PaperSheet`, `PaperSheetImage`, `SheetPlaceholder`, `PageDots` | paper surfaces (`/projects`, the gallery) |
| `separator.tsx`, `spinner.tsx`, `dot.tsx`, `badge.tsx`, `skeleton.tsx`, `avatar.tsx`, `glyphs.tsx` | `Separator`, `Spinner`, `Dot`, `Badge`, `Skeleton`, `Avatar`, `CloseGlyph`, `BackGlyph` | small marks |
| `turn.tsx` | `Turn`, `DisclosureRegion` | an assistant turn in the conversation |

Internals: `surface.tsx` (`Glass`, `GlassLayer`, the press light),
`registry.ts` and `material.ts` (the glass and its numbers), `anchor.ts`
(placement, what lies under an open surface), `spring.ts`, `util.ts`,
`use-phone.ts`, `glass.css` (the material's CSS backend and the classes
the components use).

## Attachment

Every surface floats at the module gap (`GLASS.anchorGap`, 8 px) from its
anchor; a control inside a glass bar is measured from the bar's edge. A
surface grows away from its anchor and closes the same way (docs/UI_STYLE.md,
"Attachment").
