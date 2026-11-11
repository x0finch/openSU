# Task 013 - Calm studio UI, and site location / orientation

The owner's feedback: too many buttons, too many states laid out flat; it
puts pressure on the user. Today about 30 controls are visible at once on
desktop, all with equal weight. Target: about 8 visible by default, with a
clear primary action. Progressive disclosure, organised by what the user
wants to do, not by feature.

## Part 1 - layout (desktop first, then phone)
Default state shows only: house name (with a quiet "more" menu), the mode
switch (3D / 平面 / 图册), the prompt bar, and four secondary buttons:
视角, 楼层, 日照, 走进去. Nothing else is permanently visible.

1. Prompt bar: the assistant's input is a calm bar at the bottom centre,
   always present in 3D and plan modes. It is the most prominent control
   on screen. Typing or focusing expands the conversation as a panel
   anchored to the bar (desktop: a card above/left that does not cover the
   house: framing insets follow it; phone: a sheet). Collapsing returns to
   the bar, which then shows a one-line summary of the last change with
   undo. Suggestion chips appear only when the bar is focused and empty.
2. 视角: one button opening a compact popover with the nine presets
   (four axonometric corners, eye level, four elevations) as a small
   labelled diagram, plus "复位". The view rail is removed. Free orbit is
   the default interaction; double-click / double-tap resets.
3. 楼层: one button; opens a small strip with 全部 and the levels. The
   button shows the current choice when it is not 全部.
4. 日照: one button; opens the sun strip (play, time slider, time, sun
   angle, one date chip that cycles 冬至 / 春分 / 夏至 / 秋分 / 今天 or
   opens a tiny menu, and the location chip from Part 2). Default date is
   winter solstice. Closing the strip keeps the sun on if the user turned
   it on (the button shows the time), with an explicit off.
5. Only one of 视角 / 楼层 / 日照 is expanded at a time; Escape or tapping
   the drawing collapses it.
6. 走进去 (walk): its own button with that wording.
7. "More" menu next to the house name: language, reset to template, open
   another template, API key settings, about.
8. First visit only: three small hint chips near the prompt bar, "看看阳
   光", "走进去", "出图册", each performing that action; dismissed forever
   after any is used or closed (stored in the browser).
9. Phone: the same model. The prompt bar sits at the bottom; the four
   secondary buttons are a single row above it; strips open above the row.
   No permanently expanded bottom sheet. Landscape keeps it to one row.
10. Fix while here (found during the video recording): a loading state
    when entering the studio from the landing page; the user's message
    bubble must not scroll under the conversation header; a zoomed plan
    must not slide under the title block (clip or fade the plan there);
    no "loading model" flash when opening 图册 if the model is loaded.

All existing capabilities stay reachable; URL state, autosave, framing
insets, walk HUD, and the e2e checks keep working (update selectors).
Keyboard access and labels for every new control; focus is managed when
popovers open and close.

## Part 2 - location and orientation
Sunlight depends on where the house is and which way it faces. Today
every house silently uses 30.3 N, 120.2 E (near Hangzhou), north = up,
UTC+8, and there is no UI for it.

1. Location: a "位置" control (in the sun strip and in the "more" menu)
   with three ways to set it:
   - pick a city from a built-in list (searchable by Chinese name and
     pinyin): at least every Chinese prefecture-level city, with latitude
     and longitude. Use a properly licensed open dataset, keep attribution
     in the repo, and spot-check at least 20 cities against an independent
     source. Bundle it as a lazy chunk (not in the initial JS).
   - "use my location" via the browser geolocation API, only on an
     explicit tap, with the permission explained; coordinates stay in the
     browser and in the house data, and are rounded to 0.01 deg.
   - manual latitude / longitude.
   No external network service is called for any of these.
2. Time: China uses UTC+8 everywhere; keep `utcOffsetHours` 8 by default
   and show the clock time. In the sun strip, show solar noon for the
   chosen place so western locations make sense (e.g. solar noon in
   Urumqi is around 14:00 clock time).
3. Orientation: a "朝向" control: a compass dial to rotate true north
   relative to the plot (`site.northDeg`), with snap to 5 deg and common
   presets (正南, 南偏东 15, 南偏西 15 ...), described in everyday terms
   ("大门朝南偏东 15 度"). The north arrow in 3D and plans follows.
4. Both edits go through `update_site` commands (undoable, autosaved).
   The assistant can do the same from a sentence ("我家在成都，房子朝南
   偏东 15 度"): add the city lookup as a tool or resolve the city in the
   client before sending; cover it in the stub e2e.
5. New houses: the new-house flow asks for (or lets the user skip) the
   location; the default remains the current one, shown explicitly as
   "杭州附近（默认）" so it is never a hidden assumption.
6. Sheets show the location and orientation in the facts when the user
   has set them.

## Acceptance
- Clean checkout: install, build, typecheck, test, all shots scripts and
  the chat e2e pass; size budgets hold; Worker unchanged in kind.
- Count of visible interactive controls in the default desktop state
  <= 9 and phone <= 8 (assert it in a Playwright check).
- Screenshots at 1440x900, 1024x700, 820x1180, 390x844 and 844x390 of:
  default state, each strip/popover open, conversation expanded, walk,
  plan, sheets, first-visit hints, location picker, orientation dial.
  They must look calm and designed: one clear primary action, consistent
  spacing, nothing overlapping the house.
- Sun results change correctly with location and orientation: unit or
  e2e checks that winter-solstice noon sun elevation is ~20.8 deg in
  Harbin, ~36.3 deg near Hangzhou, ~43.4 deg in Guangzhou, and that
  rotating north by 90 deg rotates the shadows by 90 deg.
- Golden-sample render shots unchanged within noise.
