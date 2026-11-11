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
