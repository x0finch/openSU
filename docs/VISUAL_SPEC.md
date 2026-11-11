# Visual spec

The look is architectural illustration in the SketchUp tradition: fresh,
precise, calm. White dominates; a few saturated accents (plants) carry the
colour. It must never look like a default game-engine scene.

Values below are starting points; the style task tunes them and then they are
locked in `packages/render/src/style/tokens.ts`.

## 3D

### Stage
- Background pure white `#FFFFFF`. No sky, no horizon, no grid, no fog.
- Ground is invisible except for the shadows it receives.
- No tone mapping; sRGB output. White walls in sun must reach ~`#FFFFFF`.

### Light and shade
- One sun (directional). Flat, matte shading; no specular highlights on
  walls, roofs, wood.
- Three clearly separated wall tones: sunlit ~`#FFFFFF`, facing away
  ~`#D2D2D2`, in cast shadow ~`#A6A6A6`. Shadows are neutral grey, never
  blue or brown.
- Cast shadows are crisp with a slight softening (1-3 px at 1x), no acne,
  no peter-panning, no visible shadow-map stair-steps.
- Ambient occlusion: optional and very subtle. It must not dirty white walls.

### Lines
- Every real geometric feature edge is drawn: dark `#2A2A2A`, constant
  screen width ~1.2 px (at 1x), anti-aliased, hidden lines removed.
- Silhouette / outer profile slightly heavier (~2 px) if achievable cleanly.
- No lines on smooth or coplanar tessellation seams. No z-fighting, no
  broken or flickering segments.
- A thin horizontal line marks each floor level on facades.

### Materials (flat colours, subtle pattern only where noted)
| Element | Colour | Note |
|---|---|---|
| Wall render | `#FFFFFF` | |
| Roof tile | `#4B4845` | fine tile-row pattern, low contrast |
| Roof fascia / soffit | `#A46A42` | wood |
| Wood accent panels, slats, decking | `#A9703F` | faint grain / slat lines |
| Window and door frames | `#34373A` | thin (50-60 mm) |
| Glass | `#8B9196` at ~55% opacity | flat, no environment reflections |
| Canopies, slab edges, copings | `#55585B` | thin slabs 100-150 mm |
| Glass balustrade | `#70767B` at ~45% opacity | thin dark top rail |
| Gate, metal railing | `#2E3033` | vertical bars |
| Paving | `#E9E7E3` | only where needed |

### Entourage (this is half of the "professional" feel)
- Trees are stylised: thin pale trunk and branches, foliage as many small
  flat unlit leaf cards in a single saturated colour. Ginkgo `#F2D40F`,
  red maple `#E12A1C`, green maple `#6DB23A`, bamboo `#5C9C3A` (clumps of
  thin stalks). They cast dappled shadows.
- People are flat black silhouettes (billboards), one or two, in motion.
- Car: very low detail, white body, black glass.
- Entourage never hides the architecture's key lines.

### Cameras
- Bird's-eye views use parallel (orthographic) projection, ~35 deg elevation,
  looking at a corner.
- Eye-level views use perspective with vertical lines kept vertical
  (two-point), FOV ~35 deg.
- Elevations are orthographic, straight on.
- Generous white margin around the subject.

### Sun study and level cutaway
- Physical sun: same tone bands; glass passes sunlight, frames cast.
  Interior floors use the warm plan floor tone `#DAD7D2`; shadows on them
  use a lifted tone (`#BEBEBE`) so interiors stay readable while sun
  patches stand out.
- Cutaway: walls cut at 1.25 m above the level floor; cut tops flat mid
  grey `#9A9A9A` (the plan's wall fill) with their outline. Stairs stay
  whole; site and garden are never cut. Cutaway axonometrics look down
  steeper (50 deg).
- Cutaway with the physical sun: hidden parts shade the inside of the house
  only, never the garden or the ground outside.
- Furniture: white-model volumes with edge lines, accents in warm wood
  (tables), light textile grey (sofas, beds, rugs), dark details (screens,
  hobs); cut at the section plane like the walls.

### Walk mode (eye level inside)
- First person, 1.6 m eye, ~65 deg vertical field of view, horizontal view
  axis by default (verticals vertical).
- Calm light interior: white surfaces out of the sun `#E6E4E0`, ceilings
  `#EEECE8`, floors in shade `#D2CEC8`, warm sun patches; window glass
  light from inside so the garden reads; no people silhouettes close up.

## Floor plans (SVG)
- Walls: mid-grey fill `#9A9A9A` with dark outline `#3A3A3A`; exterior walls
  and interior walls share the style, cut clean at openings.
- Room floor: warm light grey `#DAD7D2`. Outdoor paving `#DDD3C4`, timber
  deck tone for terraces, lawn `#DCE7D4`. White page background.
- Furniture: white fill, thin grey lines, very soft drop shadow.
- Doors show swing arcs (thin). Windows show as thin double lines in the wall.
- Labels: Chinese room name in dark grey, small uppercase English underneath,
  centred in the room, never overlapping lines or other text.
- Dimension chains outside the plan on all four sides: two tiers (segments,
  total), thin lines, oblique tick marks, numbers in mm.
- North arrow top-left, title centred below.
- Line-weight hierarchy is mandatory: wall outline > furniture > dimensions.

## What "ugly" means here (reject on sight)
- Default grey materials, visible grid/axes helpers, dark or coloured
  backgrounds, glossy highlights, blurry or noisy shadows, aliasing, lines
  that z-fight, text overlapping text, uniform line weights, empty scenes
  with no entourage.
