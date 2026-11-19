# Task 031: `@opensu/ui`, a Liquid Glass component library on Base UI

## The owner's brief

> The component library is not coupled to the business. It focuses on
> Apple's Liquid Glass style and follows shadcn's best practice.
> It is a separate module, so it can later be split out and published.
> Build it on Base UI; the phone drawer on Vaul.

Task 029 put the components in `apps/web/src/ui/` but hand-wrote their
behaviour (placement, focus, dismissal, open and close motion). The defects
found on the live site come from that hand-written part. This task moves
the folder into its own package and replaces the hand-written behaviour
with Base UI primitives, keeping our look.

## Before writing code

Read the current docs of Base UI (`@base-ui/react` on npm; confirm the
package name and latest stable version yourself) and Vaul, for: Popover,
Menu, Dialog, Tooltip, Switch, Slider, Toggle group / Tabs, Field, Input,
Toast, Separator, and how they expose placement (`side`, `align`,
`sideOffset`), `--transform-origin`, `data-starting-style` /
`data-ending-style`, `data-side`, `keepMounted`, portals and focus
management. Also read how shadcn/ui's Base UI variants compose these
(file per component, `data-slot`, variants as props, `cn`), and copy that
organisation. Do not work from memory. Pin exact versions. Both must be
MIT; add them to `THIRD_PARTY_NOTICES.md`.

## Part 1: the package

- `packages/ui`, name `@opensu/ui`, one file per component, exported from
  `src/index.ts`, plus its stylesheet. `apps/web` imports components only
  from `@opensu/ui`; `apps/web/src/ui/` is deleted.
- Boundaries, enforced by a static check that runs in `pnpm test:fast`:
  - no import from `apps/*` or from any other `@opensu/*` package (the
    glass types it needs, `GlassMaterial` and `GlassShape`, are defined in
    the ui package; `packages/render` conforms to them structurally or the
    app adapts at the boundary, without ui importing render);
  - no three.js; peer dependencies are `react` and `react-dom` only, plus
    Base UI and Vaul as dependencies;
  - no product text: every string, label and `aria-label` comes in through
    props (a component may take a `labels` prop with English defaults for
    things like "Close");
  - no stores, router, auth, fetch, or `window.__studio`.
- Components that carry product knowledge do not belong in the package and
  move to the app, composed from package parts: at least `turn.tsx`
  (the assistant turn), `GoogleButton`, `hud.tsx` if it is walk-mode
  specific, and the paper tiles of `/projects` if they are not generic
  cards. Decide each by one test: would a stranger's app use it unchanged?
- Tokens: the UI's own tokens (glass material numbers, radii, spacing,
  type sizes, motion, colours of controls) live in the ui package as CSS
  variables with one TypeScript mirror where code needs numbers. The scene's
  tokens stay in `packages/render/src/style/tokens.ts`. Values do not
  change in this task. Update the token rule in `CLAUDE.md` to name both
  homes and what belongs in each.
- The glass has two backends today: CSS (`backdrop-filter`) and the canvas
  pass that the app's renderer draws from the shapes the registry reports.
  The package must work alone with the CSS backend; the canvas backend is
  an optional hook the app plugs in (a provider that receives shapes). Keep
  both working in the app.
- A `README.md` in the package: what it is (the brief above, in one
  paragraph), install and use, the component table, the rule that apps
  only apply components, the glass backends. No docs site, no publishing
  setup, no versioning work, no licence change in this task.

## Part 2: behaviour from Base UI

Rebuild on Base UI, keeping the public API of our components as close to
task 029's as is reasonable (shadcn naming where they differ):

- Popover (Header, Title, Description, Body, Footer, Action), Menu (Item,
  Label, Separator), Tooltip, Switch, Slider, Segmented, Field / Input,
  Toast, Separator, Dialog where we have a modal.
- Sheet (phone) on Vaul: grabber, detents, drag to dismiss. A Popover
  still becomes a Sheet on phones inside the package.
- Delete what Base UI replaces: `anchor.ts` placement, the hand-written
  focus and dismissal code, the open/close driver in `anchored.tsx`. Keep
  `spring.ts` only if a motion still needs it after the items below.
- Motion, the owner's requirement from task 029 Part 4: a surface starts
  at the edge of its anchor facing it, grows away from the anchor, and
  leaves the same way; it is never drawn over its anchor's bar on any
  frame. With Base UI this is `--transform-origin` plus the starting and
  ending styles; mirror by `data-side`. Honour `prefers-reduced-motion`.
- A closed surface is unmounted (or inert and without `aria-modal`) as
  soon as it is hidden; it must not depend on animation frames arriving
  (run 2 of CI showed a closed sheet staying mounted for seconds on a
  machine that produces few frames).
- Keyboard and screen reader behaviour is whatever Base UI gives; do not
  re-implement it. Remove our own tooltip intent code if Base UI's delay
  group covers it (a tooltip must still not show on focus moved by code).

## Part 3: three defects seen on the live site (2026-11-18)

1. The sun panel has no title and no close button while views and share
   have both. Every Popover has the same header: a title and a close
   button. The sun panel's clock is body content under that header.
   Remove the `hidden` title variant unless another surface truly needs it.
2. On desktop, opening any toolbar panel collapses the toolbar's labels to
   icons and narrows the bar. Find out whether that was intended before
   task 029 (git history). If not intended, the toolbar keeps its labels
   while a panel is open. If it was intended, say where it was decided and
   leave it; report either way.
3. On phones (390x844) with the views sheet open, the bottom tool bar is
   pushed above the sheet, the prompt is covered, and the model shows
   through a gap under the tool bar. Follow iOS: a sheet rises over the
   bottom bars; nothing rides on top of it. The bars stay where they are,
   under the sheet and its scrim.

## Out of scope

New components, new visual design, token value changes, publishing,
licence. The landing page's and `/projects`' layout.

## Evidence the lead accepts by

- Comparison sheets (one image each, zh): every surface open at 1440x900
  and at 390x844, side by side: views, levels, sun, share (signed out and
  signed in), project menu, account menu, sign-in, keys. Same header,
  close box, inset, radius and gap on all of them.
- Frame strips (8 frames each of open and of close) for views, sun, share
  and the project menu on desktop, and one sheet on phone: no frame over
  the bar; the surface grows away from the anchor.
- The boundary check's output, and a table: each old file in
  `apps/web/src/ui/` -> where it went (package, app, deleted and replaced
  by which Base UI primitive).
- Bundle size before and after from `scripts/size-report.mjs`.
- `pnpm test:fast` passes locally; the browser suites you touched pass
  locally; the rest is the pull request's job. Update the suites' selectors
  where the DOM changed, without weakening what they assert; list every
  check whose assertion text you changed and why.
- `docs/tasks/031-notes.md`: decisions, what moved to the app and why,
  anything Base UI or Vaul could not do and what you did instead, what is
  not verified.

Work in this order and commit after each: package move with boundaries
(no behaviour change) -> Base UI per component -> Vaul sheet -> motion ->
the three defects -> evidence. If the whole is too large to finish well,
stop after a completed step and report, rather than leave a half-migrated
tree.
