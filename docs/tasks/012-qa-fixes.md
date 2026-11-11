# Task 012 - Fixes from the independent QA pass

Evidence screenshots from QA (read-only, may help reproduce):
`/tmp/claude-0/-home-user-openSU/f1de07ab-a8ee-5b54-b716-9130516e7d12/scratchpad/qa-shots/`
(file names are quoted below; `m-*.png` are contact sheets).

Two agents work in separate worktrees. Part A owns `packages/render` and
the studio UI in `apps/web`. Part B owns house content, `packages/kernel`
entourage, `packages/furnish`, `packages/plan` symbols, `packages/sheet`,
the landing page and the sheet gallery component. Stay in your part; keep
edits to shared files small.

## Part A - studio interaction and rendering

A1. Low sun turns the whole page grey (`22-s-slider-nearsunset.png`,
    `22-s-slider-sunrise.png`, `82-deeplink-sun-cut.png`). The page must
    stay pure white at every sun position: the ground only ever shows cast
    shadows. Long shadows near sunrise/sunset fade out with distance
    instead of covering the viewport; no light streaks or shadow leaks.
    "Play a day" must end on a clean frame.
A2. Camera limits: never below the ground plane (polar limit), sensible
    min and max zoom (cannot pass through walls in orbit mode, cannot
    shrink the house to a dot), pan clamped near the plot.
A3. Framing around the chrome: every preset frames the house inside the
    free area left by the floating UI (mode switch, view rail, bottom
    dock, info block, and the chat panel when open; on phone the bottom
    sheet). Opening/closing the chat reframes with a short transition.
    Check at 1440x900, 1024x700, 820x1180, 390x844.
A4. Walk mode, upper floors: ceilings under pitched roofs render in the
    light ceiling tone, never fascia brown (`41-s-walk-二层.png`). Level
    jumps start facing into the room, not at a wall.
A5. Walk on phones: entering walk collapses the bottom sheet; touch look
    sensitivity comparable to mouse; cap the vertical FOV so portrait is
    not stretched; a real landscape layout (844x390) where mini-map,
    joystick, sun control and exit do not overlap
    (`44-s-phone-landscape-walk.png`); Escape exits walk on desktop.
A6. Sun study state is unambiguous: off by default with no date
    highlighted and a clear "日照" toggle; on shows date, time, sun angle
    and exit; no empty slot in the dock.
A7. Selecting eye-level or an elevation must not silently reset the
    cutaway; a preset button is not shown as pressed after the user
    orbits away.
A8. Phone: north arrow in 3D; the drawing uses the free height (no ~350 px
    band of empty white above the sheet); level switching in plan mode
    reachable without expanding the sheet.
A9. Plan legibility: at fitted zoom, room names are >= 12 px on desktop
    and >= 10 px on a 390 px phone (use the plan's `textScale` by
    viewport; keep zero overlaps).
A10. Chat: the give-up message is written for people (in the UI language,
    no raw validator text or internal ids; details behind a disclosure);
    no retry button when retry cannot succeed; very long messages
    collapse; the panel background must not smear bright foliage into a
    stain (reduce blur / raise opacity).
A11. State survives reload: the current house and the chat transcript are
    autosaved in the browser (versioned key, safe on quota errors) with a
    clear "new / reset to template" action; mode, level, view and sun are
    reflected in the URL so back/forward and reload restore them.
A12. Contrast: secondary text meets WCAG AA (4.5:1 for small text) by
    adjusting the UI ink tokens; tooltips are not announced twice; date
    chips reach 32 px height on desktop and 44 px on phone.

## Part B - content, consistency, sheets

B1. Template houses of our own design, at the quality of the internal
    golden sample (rich massing, terraces or decks, canopies, varied
    windows with timber accents, planted gardens, people, a car where
    there is a carport, furniture in every room). They must be original:
    different plots, massing and roof compositions from the reference
    house. Author them as command scripts in `packages/agent`.
    - T1 "白墙坡顶小院" (default): 12 m x 14 m plot, L-shaped two-storey
      house with pitched roofs, a single-storey flat-roofed wing whose
      roof is a terrace, south courtyard with deck, carport.
    - T2 "平顶现代": 10 m x 12 m plot, three storeys, flat roofs with
      setbacks and two terraces.
    - T3 "三合院": 15 m x 15 m plot, U-shaped one-to-two-storey house
      around a courtyard, pitched roofs.
    Each validates with zero errors, and is reviewed in all five 3D views,
    cutaways, plans, sheets and a walk through, many rounds.
    "New house" in the assistant offers the three.
B2. One identity: the default house in `/studio`, the landing hero and the
    OG image are the same house (T1). The landing hero and
    `og-default.png` are real renders produced by a script from T1 and
    committed as static assets. Each house shows its own name in the
    studio, on sheets and in `/s/$id` (no shared hard-coded title).
B3. Furniture never leaves a main room empty: living rooms, entry halls
    and family rooms always get a sensible group; fix the rule that left
    the starter's living room bare (`30-desk-s-plan.png`).
B4. Plan and 3D agree on the site: trees, shrubs, lawn/paving/deck come
    from one shared placement (kernel entourage and plan symbols must
    read the same data), so a tree in the plan is a tree in 3D and vice
    versa (`30-desk-s-plan.png` vs `01-desk-studio-loaded.png`).
B5. Sheets: all plans in a set use one drawing scale chosen so the
    largest level fills 75-80% of the page width and smaller levels are
    not shrunk further (`m-sheets-s.png`); title is the house name; facts
    read "宅基地：12 x 14 m" style (lowercase m, multiplication sign,
    same order as the studio); hero entourage must not hide the facade's
    centre in eye-level sheets.
B6. Sheet gallery on desktop: larger thumbnails centred in the free area,
    no left-weighted sparse grid.
B7. Landing: og tags, tablet layout without a 40% empty band, eyebrow
    letterspacing fixed.

## Acceptance (both parts)
- Clean checkout: install, build, typecheck, test, all shots scripts and
  the chat e2e pass; size budgets hold; Worker bundle unchanged in kind.
- Golden-sample plans and presentation shots unchanged within noise,
  except where an item above changes them on purpose (say which).
- Each item: fixed / not fixed, with a screenshot path as evidence at the
  relevant viewports.
