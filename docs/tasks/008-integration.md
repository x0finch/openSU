# Task 008 - Wire sun study, cutaway and sheets into the app; polish

## Goal
The studio becomes the real product surface for milestones 1 and 3: drag
the time slider and watch sunlight move, peel levels off, export the sheet
set. Plus the accepted review fixes below.

## App (`apps/web`)
- Time-of-day slider is live: switches the viewer to physical lighting,
  range sunrise..sunset for the chosen date, date presets (冬至 / 春分 /
  夏至 / 秋分 / 今天), a "play" button that sweeps the day in ~8 s, and a
  clear way back to presentation lighting. Show sun azimuth/elevation and
  the time as small secondary text.
- Level control in 3D: 全部 / 一层 / 二层 / 阁楼 -> `viewer.setCutaway`,
  with the steeper cutaway camera, animated.
- `图册` mode: thumbnails of the sheet set generated in the browser with a
  progress state, tap to preview large, "下载" per sheet and "全部下载",
  and the Web Share API where available (files share) with a download
  fallback. Never block the UI while rendering.
- Phone: the bottom sheet defaults to a collapsed height (drawing gets
  >= 60% of the viewport), expands on drag/tap.
- View-rail icons get tooltips (desktop) and labels (phone).
- Keep viewer code out of the Worker bundle (the server bundle must not
  contain three.js); report the Worker bundle size before/after.
- Size budgets from Task 005 still hold; the sheet code is lazy.

## Render (`packages/render`)
- Physical cutaway readability (lead's decision): when lighting is physical
  and a cutaway is active, interiors must read light and calm so sun
  patches are the hero. Add tokens (do not change existing ones):
  interior floor in shade ~`#CBC8C3`, interior walls not reached by sun use
  the "turned away" tone rather than the cast-shadow tone, sunlit floor
  patches get a slight warm lift (~`#FFF3D9` multiplied over the floor
  tone, i.e. clearly brighter and a touch warm). Outdoor ground shadow from
  hidden upper floors stays (it is useful: it shows when the yard is in
  shade) but uses the light ground-shadow tone.
- Cap cut window frames so no hollow profiles show.
- Fix the demo's OrbitControls ordering bug noted in docs/BACKLOG.md.
- Presentation-mode shots must stay within noise of the current ones.

## Plan / sheet
- `@opensu/plan`: add a `textScale` (or `mode: 'sheet'`) option that
  enlarges labels, dimension figures, title and north arrow together while
  keeping the zero-overlap guarantee (labels may drop the English line
  only as a last resort). `@opensu/sheet` uses it so plan text on sheets is
  roughly the reference's relative size (plan title ~40 px on a 1500 px
  wide sheet) and makes the plan use 75-80% of the page width where height
  allows.
- Elevation hero views on sheets get a thin ground line.

## Acceptance criteria
- Clean checkout: install, build, typecheck, test, all shots scripts pass.
- New app screenshots (desktop 1440x900 and phone 390x844): sun study at
  winter 10:00 in cutaway L1 (sun patches visible on the living-room
  floor, interior light and calm), cutaway L2, sheet gallery, sheet
  preview, phone collapsed sheet. Copy them to the scratchpad path given in
  your brief.
- Playwright checks: slider changes the shadow (pixel diff between two
  times), cutaway hides the roof, the sheet set produces 4 PNG blobs of the
  right size.
- No overlap in sheet plans (reuse the plan overlap check with textScale).
- Worker bundle no longer contains three.js.
- UI still looks designed at both viewports: aligned, consistent spacing,
  nothing clipped.

## Process
Iterate on screenshots, many rounds. Commit locally in your worktree, do
not push. Report what is done, what is rough, sizes, timings.
