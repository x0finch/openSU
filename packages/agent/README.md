# @opensu/agent

The house-design assistant: system prompt, tools, turn controller and the
built-in starting points. No DOM; the network is whatever adapter the
caller passes in (the app passes one that talks to its `/api/chat` relay).

## Run

```sh
pnpm --filter @opensu/agent test       # turn controller against a scripted model
pnpm --filter @opensu/agent starter    # validates the template houses (see below)
```

## How a turn works (`runTurn`)

1. The system prompt (`SYSTEM_PROMPT`, `src/prompt.ts`) plus the full
   `describeHouse` of the current house (`houseContext`) go out once per
   user turn. Earlier turns are sent as text only (user message, assistant
   reply, a one-line list of the edits), newest 8 (`HISTORY_TURNS`).
2. TanStack AI's `chat()` runs the agent loop with the OpenAI-compatible
   Chat Completions adapter (`createRelayAdapter`, `src/provider.ts`). It
   parses the SSE stream, assembles tool calls and executes the tools.
3. Tools (`src/tools.ts`), executed where the loop runs:
   - `edit_house({ summary, commands })` -> `applyCommands` on the turn's
     working house. Result: `{ ok, applied, warnings?, changed }` where
     `changed` is only the changed lines of `describeHouse` (`describeDiff`);
     on failure `{ ok: false, errors, note }` with the repair attempts left.
     `summary` is one line in the user's language for the changes card.
   - `get_house()` -> the full description (rarely needed).
   - `new_house({ template: 't1' | 't2' | 't3' | 'blank', plotWidth?, plotDepth? })`
     replaces the house (a template, or an empty plot).
4. Every kept batch is reported at once (`house` event), so the drawing
   follows the conversation. Rejected batches go back to the model with the
   validator's messages; after 1 attempt + 3 repairs (`MAX_REPAIRS`) the
   loop stops and the house stays at the last valid state (`gave-up`).
5. At the end the final house is pushed to the `History` once: one undo step
   per user turn (`HouseSession.undo()` / `redo()`).

The tool input check is left to `applyCommands` (its messages name ids,
nearest valid ids and numbers): the tools pass a Standard Schema that
accepts anything but reports the full JSON Schema of the commands to the
model.

HTTP errors of the relay are read in a `wrapFetch` before the SDK turns them
into exceptions and classified (`classifyError`): `no-key` (relay has no key
and none was given), `auth`, `rate-limit`, `upstream` (also errors inside a
200 stream), `network`.

## Template houses (`src/templates/`)

Three houses of our own design (not the golden reference), each a script
of `edit_house` commands applied to `blankHouse()`; each validates with no
errors and no warnings. `templateHouse(id)` builds one, `TEMPLATES` lists
them with their commands, `TEMPLATE_META` (`src/templates/meta.ts`, no
model import, exported as `@opensu/agent/templates-meta`) only names,
summaries and plots. The default house (`DEFAULT_TEMPLATE`, `starterHouse()`)
is T1; `new_house` offers `t1`, `t2`, `t3` and `blank` (`starter` still
means the default).

- **T1 白墙坡顶小院** (default), plot 12 x 14 m, 159.5 m²: an L of a
  two-storey main block across the north (east-west gable, with a
  north-south gable over the east bay whose gable end faces the street)
  and a single-storey wing to the south-west whose flat roof is the master
  bedroom's terrace. South courtyard with a timber deck in front of the
  living room, a carport under a canopy that also shelters the front door,
  garden to the south-west, bamboo along the side and back paths.
- **T2 平顶现代**, plot 10 x 12 m, 160.9 m²: three flat-roofed storeys
  stepping back to the north; a full-width terrace on the second floor
  (roofing the entrance porch) and a roof terrace in front of the top-floor
  tea room. A U stair along the north wall with a landing hall on every
  floor, wet rooms stacked in the west column.
- **T3 三合院**, plot 15 x 15 m, 226.8 m²: a two-storey main hall under an
  east-west gable and two single-storey wings (tea room and kitchen west,
  elders' bedroom east) under mono-pitch roofs falling into the courtyard;
  a timber veranda along the 堂屋, a balcony above it, gate on the axis.

`pnpm --filter @opensu/agent starter [t1|t2|t3] [--describe]` validates
them and prints areas (and the description). `test/templates-quality.test.ts`
checks every template and the golden sample across the pipeline: every
main room furnished, overlap-free plans at screen and sheet text sizes,
the plan and the 3D scene showing the same planting, the triangle budget.

## Tests

`test/turn.test.ts` drives the real adapter with a scripted fetch that
returns Chat Completions SSE (`test/scripted.ts`): happy path, repair round,
give-up path, several batches = one undo step, history trimming, `new_house`,
HTTP errors (401 no_key / 401 / 429 / 502), an error chunk inside a 200
stream, and the bring-your-own-key header. These test our loop, not a model.
