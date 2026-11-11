# @opensu/agent

The house-design assistant: system prompt, tools, turn controller and the
built-in starting points. No DOM; the network is whatever adapter the
caller passes in (the app passes one that talks to its `/api/chat` relay).

## Run

```sh
pnpm --filter @opensu/agent test       # turn controller against a scripted model
pnpm --filter @opensu/agent starter    # validates the starter house, prints describeHouse
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
   - `new_house({ template: 'starter' | 'blank', plotWidth?, plotDepth? })`
     replaces the house.
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

## Starter house (`src/starter.ts`)

Our own design, not the golden reference: plot 16.8 x 18 m, house 12 x 10.2 m
on a 300 mm module, two storeys (3.3 m + 3.0 m), gable roof 26 deg east-west.
Ground floor: living room, open entry hall and an elder's bedroom to the
south; dining, kitchen, U stair in the middle bay, a lobby with bathroom and
a study to the north. Upper floor: master bedroom, family room onto a balcony
that shelters the front door, second bedroom; two bathrooms (one stacked over
the ground-floor one), a kids' room and a study to the north. 244.8 m²
interior. It is built from `blankHouse()` with `STARTER_COMMANDS` (the same
commands the assistant uses) and validates with no errors and no warnings
(`test/starter.test.ts`).

## Tests

`test/turn.test.ts` drives the real adapter with a scripted fetch that
returns Chat Completions SSE (`test/scripted.ts`): happy path, repair round,
give-up path, several batches = one undo step, history trimming, `new_house`,
HTTP errors (401 no_key / 401 / 429 / 502), an error chunk inside a 200
stream, and the bring-your-own-key header. These test our loop, not a model.
