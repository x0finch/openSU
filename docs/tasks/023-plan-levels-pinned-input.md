# Task 023 - Levels stay registered in plan; pinned input and plan polish

From the owner's screenshot of the live site (2026-11-15, desktop about
2000 px wide, plan view, second floor, conversation pinned, 楼层 panel
open, free allowance on `deepseek/deepseek-v4.1-flash`).

## 1. Switching level does not move the plan

Task 021 let a level switch re-frame the plan. The owner finds that the
drawing jumps, and he is right: floors of one house must stay registered
(same scale, same position), the way Apple Maps keeps the map still when
you change floor indoors, and the way an architect overlays floor plans.

- Switching level in plan keeps the plan transform exactly (scale and
  offset): a wall that is above another wall is drawn on the same pixels.
  Check: the outer north-west corner of the house has the same screen
  position on every level, with the 楼层 panel open and closed, pinned
  and unpinned.
- The fit therefore frames the union of all levels (their drawings with
  dimension chains and title), not the current level alone. Fit, a new
  house, a template and pin / unpin still frame as in task 021.
- The level title under the plan ("二层平面图") may change text; it must
  not shift the drawing.

## 2. Stray "二层平面图" badge

A small dark badge reading "二层平面图" floats at the top right of the
drawing, over the 11100 dimension. Find what it is (a tooltip that stays,
a label of the levels control, an SVG title) and remove it or make it
behave; the plan already carries its title below.

## 3. The pinned conversation's input

At the pinned width the input holds four things (picker "免费额度",
placeholder, "今天还剩 3 次", send) and the placeholder wraps to two
lines. It also reads as a dark card set inside the sidebar card, between
strong rules, which breaks the owner's rule (no card inside a card).

- One line always. The remaining-uses hint leaves the input: show it in
  the picker's menu on the free-allowance row (trailing text), and keep
  the existing behaviour when the allowance is used up. Say if the hint
  is asserted somewhere and what you changed.
- The input is a field of the sidebar, not a card in it: use the field
  style of the glass module (`.lg-field` or the primitive behind it), no
  second elevated surface, no shadow. Header and footer separators are
  the module's hairline, not a bright rule. Compare with the Messages
  input bar; say what you matched.
- Check at 1280, 1440 and 2000 px wide, Chinese and English.

## 4. Assistant text

- The reply contains Markdown list lines ("- 一层: …") shown as raw text.
  Render the small subset the model actually produces (paragraphs, simple
  lists, bold) with a tiny renderer of our own, no new dependency; never
  HTML from the model.
- Half-width punctuation in Chinese replies ("600 mm,从", "一层:"). Add a
  line to the system prompt asking for full-width Chinese punctuation and
  short replies (lead with the result, then any warning such as "北侧院子
  只剩 0.5 m"); do not post-process the text. Keep the prompt change small
  and run the agent package tests.

## 5. Room labels on the plan

On the second floor 主卧, 次卧, 起居室 and 过厅 have no English subtitle
while 主卫, 卫生间 and 露台 do; 过厅 sits on the stair wall and 次卧 is
pushed into the door swing. Find the rule (probably a size threshold) and
make it consistent: either every label of a drawing has its subtitle or a
label that does not fit drops it cleanly, and labels avoid door swings
and stairs where the room has space. `docs/VISUAL_SPEC.md` applies; if
this needs more than a contained change in `packages/plan`, stop and
report instead.

## 6. Check, do not assume

After one finished turn on the free allowance the input still said
"今天还剩 3 次" (the anonymous limit is 3). Find out whether the hint
refreshes after a turn; fix it if it is stale, or explain why 3 was right.

## Constraints and checks

- `CLAUDE.md`, `docs/UI_STYLE.md`, `docs/VISUAL_SPEC.md`; glass
  primitives only, the static glass check passes; tokens unchanged.
- Extend the still-house checks for section 1. Screenshots under
  `artifacts/task023/` (1440x900 and 2000x1100: plan on each level with
  the panel open, pinned input idle and with text, the picker menu with
  the hint, a reply with a list; phone 390x844 for the input and reply).
- `pnpm -r typecheck` and `pnpm -r test` pass, one clean full run on the
  final tree.

## How to work

Scope note first. Small local commits; do not push (a push to `main`
deploys; the lead pushes after review). Report honestly what was skipped
or not verified.
