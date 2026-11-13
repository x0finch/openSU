# Backlog

Accepted findings that are not scheduled yet. Lead maintains this file.

## Model schema (do before the AI milestone)
- Opening offsets are measured from the space's overall extent, so editing a
  space's cells silently moves its openings. Anchor openings to the hosting
  edge instead (edge named by its bounding grid lines; offset from that
  edge's start, or `center`).
- `host: { space, side }` is ambiguous when a space has several edges on
  that side (L-shaped rooms). The explicit edge reference above fixes it.
- Cross-level coupling is implicit (stair spaces must align; `spanLevels`
  windows use the wall above). Make validation messages name the other level
  and consider a house-level `stairs` element spanning levels.
- Cascading errors: after `space-overlap`, suppress follow-on errors caused
  by the same overlap ("spans 0 wall segments").
- `outdoor-only` warning has no test.

## Golden sample fidelity
- Carport should extend to the east fence (x 9530-14830 on the drawing).
- Entrance pier / wall between planter and porch (x 11200-11580).
- Canopy over the ground-floor courtyard door on the west side.
- Stair spaces are used differently on the ground floor and above.

## Schema proposals from the kernel task (decide before the AI milestone)
- Corner windows wrapping two faces.
- Canopy voids and off-grid canopies.
- Surface material for outdoor spaces (deck / paving / gravel / lawn).
- Explicit eave / knee-wall height for attic levels (level height currently
  means two things).
- Explicit placement of fence openings and entrance pier.

## Process
- Parallel implementers must not share a working tree (a shared git index
  caused cross-commits once). Use isolated worktrees and let the lead merge.
- Owner's rule (2026-11-13): for every UI idea the owner proposes, the
  lead weighs it against Apple's conventions and interactions and says
  which is better and why, with a recommendation, instead of agreeing by
  default. The owner decides after that feedback.

## Web app (from task 005 review)
- Phone layout: the bottom sheet takes half the screen and the drawing is
  small; default the sheet to a collapsed height.
- The Worker bundle contains the lazy three.js chunk; keep viewer code out
  of the server bundle.
- View-rail icons need tooltips; landing hero should be a real render of
  our own (non-reference) house.
- `packages/render` demo: OrbitControls re-aims the camera before
  `focusPoint()` is read (two-line reorder in `demo/main.ts`).
- Kernel runs on the main thread (~200 ms); move to a worker if it grows.

## Model, after task 009 (resolved: opening anchoring, ambiguous hosts,
## cascading errors, cross-level messages)
Still error-prone for an LLM author:
- Exterior walls split where the outdoor space beyond changes; an opening
  must fit one segment of what is physically one wall.
- Copying a level collides with multi-level windows (manual fix needed).
- Stair flights are implicit; gates, skylights, entourage use absolute mm.
- Attic level height doubles as eave height.
- Ids cannot be renamed; `openTo` is one-sided; new rooms get no roof
  automatically (only warnings).
- `describeHouse(golden)` is ~8.9k characters; measure real token counts
  when the AI is connected and trim if needed.

## App polish (from tasks 008, 010, 011 reviews)
- Starter house is a plain box; needs designed templates.
- Desktop chat panel covers the drawing; reframe the camera around it.
- Grow transition shows hollow wall tops.
- Sofas/armchairs boxy; no upper kitchen cabinets; interior doors have no
  leaves; entrance door leaf is walk-through.
- Portrait phone walk FOV reaches 90 deg (stretched).
- Physical-sun cutaway uses a second light (double shadow work).
- Sheet plans reach ~69% of page width (target 75-80%).
- "Download all" triggers four downloads; no zip. Web Share untested.
- Change-card details are English while summaries follow the user.

## After QA fixes part A
- Phone plan text reaches ~7.5 px (target 10): needs a plan option to drop
  dimension chains on narrow viewports. 1024x700 reaches ~11 px (target 12).
- Phone portrait 3D is width-limited, so white bands remain above/below.
- A thin light streak can remain inside the plot at very low sun in a
  physical-sun cutaway.
- `?sample=` sessions bypass autosave; URL sync uses history.pushState next
  to TanStack Router (works in tests, not deeply tested).
- From the walkthrough recording: no loading state when entering the
  studio; the user's bubble scrolls under the chat header after a reply;
  zoomed plan slides under the project facts; "loading model" flashes when
  opening sheets; stair landing faces a blank wall for a second.

## Internationalisation (see "Regions" in DECISIONS.md)
Prevent-rework items, to do after task 013 merges:
- Display-only units layer (model stays mm): metric now, imperial later;
  plans' dimension chains, sheet facts and the studio read through it.
- Plan and sheet labels follow the UI language (English-only in English;
  sheet words like 自建房 / 宅基地 / 建筑面积 translated); floor naming
  per locale.
Later, per region profile: design rules and room types (garage,
basement, mudroom, pantry ...), construction defaults, site conventions
(no perimeter wall, driveway, porch), original templates, style presets,
entourage, sheet formats (4:5, 2:3), privacy policy when accounts arrive.

## After task 013 (calm UI, location)
- The four secondary buttons (视角 / 楼层 / 日照 / 走进去) are small and
  low-contrast on desktop; the prompt bar could carry more weight.
- The 走进去 hint chip duplicates the button directly below it.
- Sheet place/orientation line is Chinese only; change summaries keep the
  language they were written in.
- On 844x390 the location panel covers the prompt bar while open.
- Not tested: real phones, iOS keyboard hand-off to the conversation,
  the geolocation flow ("use my location" has no automated test).
- Still hard-wired to China (for the region work): default site and
  `DEFAULT_UTC_OFFSET = 8`, sheet/template/level names, mm/m only, the
  system prompt's framing and design rules, landing copy, hint copy
  mentioning Xiaohongshu / WeChat Moments, date chip formats, plan north
  arrow label, 坐北朝南 only valid north of the tropics.

## From the v2 walkthrough recording (recorded before task 013's layout)
- Performance suspicion: while the assistant's looping "working" indicator
  animates, or a focused input's caret blinks, over frosted-glass
  (backdrop-filter) panels, every frame becomes very expensive on software
  GL (screenshots took ~25 s instead of ~0.2 s). Unverified on real
  hardware; check on a low-end phone and consider dropping backdrop-filter
  over the canvas.
- The "working" indicator stays on while the summary is already streaming.
- After a reload the changes card no longer offers undo (history is not
  persisted); the reload shows ~0.5 s of blank page.
- Eye-level SW: the tree hides much of the facade; NE axonometric: the
  crown pokes into the top chrome.
- Walk start faces a dark wall and the title text has no backing over
  dark scenes.
- Phone 3D crops the house close to the left edge.
Re-check each against the task 013 layout before fixing; some may be gone.

## After task 014
- Layout items 4, 6, 9 of task 014 were dropped: the studio layout is being
  redesigned from mockups the owner is choosing between.
- Cold-frame cost: the first frame after a panel opens or the house grows
  takes 11-18 s on software GL with or without blur (probably pending 3D
  work after re-framing). Not caused by backdrop-filter; uninvestigated.
  Steady-state frames are 3-5x cheaper without blur (e.g. working
  indicator 207 ms -> 41 ms, warmed up).
- A redo that cannot be restored after a reload reads as "undone".

## After task 015 (studio layout chosen by the owner)
- Desktop houses render 5-13% narrower than the approved mockups (a larger
  white margin was kept so the ground shadow does not clip when pinned).
- The phone sheet re-frames the house on open/close but does not follow
  the finger during a drag; the closing sheet animates a frozen copy.
- Landscape phone: the sheet stands beside the toolbar instead of carrying
  it; the sun panel scrolls there.
- Changes cards have no per-change area delta (the model has none).
- Design concerns raised by the implementer, for the owner: icon-only
  tools are less discoverable; hover expansion shifts neighbouring icons;
  the phone input is hidden while a sheet is open, so you cannot ask the
  assistant about what the panel shows; the recent strip covers 36-42% of
  the house on phone.
- Not tested on real phones, WeChat, or with the iOS keyboard.

## After task 016 (second QA pass fixes, stopped at a checkpoint)
Task 016 was stopped early. Merged: planting independent of latitude,
polar day/night and after-midnight times, pinned and phone framing with
the ground shadow, English sun panel, walk toolbar, change note in the
input bar, phased working phrases, re-frame after orientation or location
change, neutral page for unknown share ids, polish.
- Item 9 is switched off behind two flags because the result was worse
  than before: `EYE_STAND_ENABLED` (`apps/web/src/studio/engine.ts`; on T1
  the standing point is too close, the roof is cut and the car and a
  person fill the foreground) and `WALK_BEST_START_ENABLED`
  (`packages/render/src/viewer.ts`; on T1 the start faces blank walls).
- Verified on T1 only at 1440, 1024, 820 and 390. Not verified: T2, T3,
  golden; 360, 320 and landscape phone; items 5-8, 11, 12 were not looked
  at in screenshots.
- Not re-run: full `layout-check`, full `ui-shots`, full chat e2e, golden
  render regression. `apps/web/scripts/fit-check.mjs` is not wired into
  `pnpm test`; its Reykjavik sunset check was fixed but not re-run.
- Landing hero and OG image not regenerated after the framing change.
- Check the Sydney sun-study frame: the tree's ground shadow shows but the
  house's own shadow is not visible.
- READMEs not updated for task 016.

## Visual restyle (round 4 mockups, awaiting the owner's choice)
- Mockups only, no product code: studio internals in two directions
  (A1 ruled hairlines, A2 spacing only) and a bento landing grid, made
  with the stageshow skill's rules. Lead recommends A1.
- Walk HUD and first-visit hints were not redrawn.
- Process rule from the owner: one agent at a time; ask before starting
  a task; smallest set of mockups first.

## Real-model evaluation, round 1 (2026-11-13)

Setup: local `vite preview`, the Worker's OpenAI-compatible upstream
pointed at a bridge that answers with Claude Opus through the local
`claude -p` CLI (scratch tool, not committed). The lead played a self-build
client from two Xiaohongshu references (a 14 x 11 m three-storey rural
villa with a shrine table; a 7.5 x 18 m city townhouse with a court and a
double-height space). 5 user turns, 9 model calls, about 2.7 USD, 1 to 3.5
minutes per turn.

Fixed during the run: an empty plot (`new_house` "blank") crashed the
studio (kernel massing with no solids); commit d161b83.

Open findings:
- Renaming a space keeps its old English name: the plan shows 卧室四 over
  FAMILY ROOM and 起居室 over BEDROOM 4. `update_space` with a new
  `name`/`type` should update or clear `nameEn`.
- No shrine table (神桌) furniture. The model cannot draw the one object a
  rural 堂屋 is organised around; add it (against the hall's back wall,
  facing the front door) and let the model ask for it.
- The model cannot see furniture: it claimed an 8-seat table fits where
  the planner placed a 4-seat one. Give the furniture result back in the
  tool result, or stop the model claiming table sizes.
- A two-car garage shows one car.
- Double-height spaces and split levels are not supported; the model said
  so plainly and offered alternatives. Decide whether to add a slab void
  command.
- Model behaviour: reads briefs well, states assumptions and trade-offs,
  honest about limits. Two prompt fixes: ask before removing or moving a
  room the user asked for (it moved a requested ground-floor bedroom
  upstairs unasked); keep replies short (the townhouse reply was about 700
  characters, too long for the one-exchange chat surface).
- A multi-storey build takes 1 to 3 minutes with only "working" showing;
  show what is being built (per level) while it runs.
