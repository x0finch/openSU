# Task 016 - Fixes from the second independent QA pass

Evidence (read-only): `/tmp/claude-0/-home-user-openSU/f1de07ab-a8ee-5b54-b716-9130516e7d12/scratchpad/qa2-shots/`
(file names quoted below). Two findings are design questions waiting for
the owner and are NOT part of this task: the readability and height of
the translucent recent strip, and the hover expansion moving neighbouring
toolbar icons. Do not change either.

1. Planting ignores the house when the hemisphere changes: moving T1/T2/T3
   to Sydney puts the large tree in front of the main glazing (in T1 it
   grows through the balcony) and a person appears in an odd pose on the
   balcony (`f-t1-sydney*.png`, `f-t2-sydney.png`, `f-t3-sydney.png`,
   `d-zoom-person.png`). Planting must be decided by the house (its open
   courtyards, glazing and entrance), must never stand in front of main
   glazing or inside a balcony/terrace volume, and must not depend on
   latitude. People are placed only on walkable outdoor floor, clear of
   furniture and rails. Changing location or orientation never moves
   plants or people. The orientation text must not say "朝正南" style
   phrases that contradict the sun side; phrase by compass.
2. Sun study at the edges of the world (`d-tromso-winter.png`,
   `d-london-winter.png`): polar day and polar night are stated in words
   ("极昼", "极夜"), with no sunrise/sunset times, no slider when the sun
   never rises (the house is shown in presentation light with a note),
   and a full-day slider in polar day; no clock text past 24:00 (use next
   day wording or clamp at 23:59 with a note); when the time is clamped to
   sunrise/sunset the render matches (no sunlit house below the horizon);
   slider ticks never collide; sunrise/sunset identical in the slider and
   the text.
3. Pinned conversation on desktop clips the drawing at the right canvas
   edge and the roof sits under the toolbar (`h-5-pinned.png`,
   `h-8-giveup.png`). Framing must include the ground shadow and entourage
   in its bounds, in every state and viewport.
4. The house is drawn off-centre and its shadow is cut at the screen edge:
   desktop idle is centred ~143 px right of the input; on every phone and
   the 820 tablet the drawing touches the right edge; the landing hero's
   shadow is cut by a hard vertical edge (`a-t1-1440x900-idle.png`,
   `a-t1-390x844-idle.png`, `a-t1-820x1180-idle.png`, `k-landing.png`).
   Centre the subject (house + shadow + entourage) in the free area with
   an even margin; re-render the landing hero and OG image with the full
   shadow.
5. English UI does not fit the sun panel (`k-lang-en-sun-crop.png`):
   truncated season names, place and orientation. Every string in both
   languages fits its control at all supported widths without truncating
   the key fact; add a check that no text in the panels is clipped.
6. Phone walk: the exit cue is clipped when the sun is on ("走进去 ›" at
   360, no "×" at 320; `g-360-walk-toolbar.png`, `g-320-walk-toolbar.png`).
   The exit must always be visible and tappable; walk level chips get
   44 px targets. While walking, the toolbar shows only what applies to
   walking (no view / cut labels; `b-walk-desktop.png`).
7. The change toast ("已修改：… 撤销") floats over the drawing above the
   input (`d-1440-orientation-dragged.png`). Show that summary inside the
   input bar itself (as the calm-UI task specified: a one-line summary
   with undo in the bar), not as a separate element over the house.
8. Working phrase: in a real stub turn only "正在回复…" ever shows.
   "正在思考…" and "正在修改房子…" must appear during those phases, each
   for long enough to read; the e2e must observe them from a real turn,
   not by setting the phase by hand.
9. Eye-level presets and walk start points: the eye-level view of every
   template is dominated by the perimeter wall and gate, and the walk
   starts wedged in a door frame with black mullions filling the screen
   (`m-t1-*`, `m-t2-montage*`, `m-t3-montage*`, `j-t1-*`). Eye level:
   stand inside the plot (inside the fence) when a fence exists, on the
   side that shows the main facade or the courtyard, clear of trees. Walk
   start: a spot with at least ~1.5 m of clear floor ahead, facing the
   longest open sightline into the main room. Check all three templates
   and the golden sample.
10. Orientation changes keep the camera but break the composition (shadow
    runs off the edge after "正东"; `e-t1-正东.png`): re-frame after
    orientation or location changes. The orientation dial's focus ring
    follows its round shape.
11. `/s/<unknown id>` must not present itself as "白墙坡顶小院"; show a
    neutral not-found design page. Pinned phone sheet and the 320 px strip
    must not scroll their first message under the header
    (`g-small-montage*`).
12. Polish: wrapped "日落 17:03"; English capitalisation consistency;
    downloaded sheet files carry the house name; the location panel
    clears a stale "not found" note; camera zoom/pan limits must keep the
    house on screen (`j-t1-zoom-in-max.png`, `j-t1-pan-far.png`); the 3D
    north badge must not look like a button; keep the conversation input
    available in the sheets view.

Acceptance: clean checkout build, typecheck, tests, all shots scripts,
layout-check and chat e2e pass; golden-sample render shots unchanged
within noise except where items 3, 4, 9 change framing on purpose (say
which); before/after screenshots per item at the relevant viewports; new
automated checks for items 1, 2, 3/4 (subject bounds inside the free
area with margin, all templates, all viewports), 5 and 8.
