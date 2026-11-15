# Task 021 - The house stays still; the pinned chat hangs under the name

Two layout corrections from the owner (2026-11-15), weighed against
Apple's conventions by the lead. (Per-account API keys become task 022.)

## 1. Opening a tool panel never moves the house

Today the studio re-frames the drawing into the area a panel leaves free
(`setInsets` in `apps/web/src/studio/engine.ts`, `Viewer3D.tsx`, and the
plan view's equivalent), so the house shifts every time a tool panel
opens or closes, in 3D and in plan. The owner finds this odd, and Apple
agrees: floating glass panels (inspectors, the place card in Maps) lie
over the content and the content does not move; only persistent layout
changes make the content give way.

- Opening, closing or switching a floating tool panel (视角, 楼层, 日照,
  site panel, project menu, sign-in, the recent conversation strip, the
  phone sheet at any detent) does not move, zoom or re-frame the house,
  in 3D and in plan. Not by one pixel: check with frame captures.
- The uncovered area is still known. It is used only when the user asks
  for a framing: choosing a view preset, "fit", switching level in plan,
  opening a template, a new house growing. Then the house is framed in
  the area not covered by what is open at that moment.
- The pinned conversation sidebar is the exception, because it stays:
  pinning and unpinning moves the house once, smoothly (the shared
  spring / existing duration), into and out of the free area.
- Walk mode and sun study keep their own camera rules.

## 2. The pinned conversation hangs under the house name

Today pinning the conversation to the left changes where the house name
sits. The owner wants the name to stay exactly where it is, top left,
with the pinned conversation below it, the way a tool panel hangs under
the toolbar on the right.

- The house name and its facts line do not move or restyle when the
  conversation is pinned or unpinned (same position, size and ink as
  unpinned; check contrast, it stays plain ink on the drawing).
- The pinned sidebar starts below the name block with the same gap the
  right panel has under the toolbar, same inset from the screen edge,
  and runs down to the same bottom inset as before.
- The project menu still opens from the name; with the sidebar pinned it
  opens over the sidebar (glass does not stack on glass: follow the
  existing rule the sign-in sheet uses, or say what you chose).
- The top-centre mode switch stays centred over the drawing as today.
- Phone layout is unchanged (it has no pinned sidebar).

## Constraints

- `docs/UI_STYLE.md` and task 017 section 2b apply; glass primitives
  only, the static glass check passes, no card inside a card.
- Do not change tokens. Do not change chat behaviour.

## Checks

- A script check (extend `shots.mjs` or the chat e2e) that the camera
  (3D) and the plan transform are identical before, during and after
  opening each tool panel, and that they do change once on pin / unpin.
- A check that the name's bounding box is identical pinned and unpinned.
- Screenshots under `artifacts/task021/` (desktop 1440x900 and 1280x720):
  each tool panel open in 3D and plan, pinned conversation in 3D and
  plan, the menu open while pinned. Phone 390x844: sheet at each detent.
- `pnpm -r typecheck` and `pnpm -r test` pass. Two known flaky checks
  are not yours unless the fix is trivial: `shots.mjs` "a new template
  starts whole…" (fixed 600 ms wait) and `chat-e2e` "an older save
  without the turn structure reads as plain text"; if you can make them
  wait on state instead of time in a few lines, do, as a separate commit.

## How to work

Scope note first. If something here does not fit the code, stop and
report. Small local commits; do not push (a push deploys; the lead
pushes after review). Report honestly what was skipped.
