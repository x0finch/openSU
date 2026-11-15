# Task 020 - Save conversations on the server, let users export them

The owner needs to see where the assistant's work did not match what the
user meant. Today conversations live only in the visitor's browser.

Owner's decision (2026-11-15): keep it simple. Save every user's
conversation turns in the database. Users can export their conversation.
No dedicated logging platform, no feedback buttons, no opt-in logic.

(Per-account API keys, earlier called task 020, become task 021.)

## What to build

1. Storage: a new migration with one table for turn records in the
   existing D1 database (`apps/web/migrations/`). One row per finished
   assistant turn: turn id (the id already sent in `x-opensu-turn`),
   time, who (signed-in user id, else the anonymous visitor id), a
   conversation id (one per chat session in the browser; add it if the
   store has none), whether the owner's key or the visitor's own key was
   used, the model, and the record as JSON text.
2. The record, built in the browser from what the chat store already
   holds: the user's message, the turn's parts in order (text pieces,
   tool calls with their commands and results or errors), the final
   text, give-up and error details, duration, app version, and the house
   after the turn. Never the visitor's API key.
3. `POST /api/turns` from the browser when a turn ends (success, error or
   give-up), for every user including own-key users. A later undo or redo
   of that turn updates a flag on the row (undo is the strongest sign of
   a mismatch). Sending is fire-and-forget: a failure never shows an
   error and never blocks the chat.
4. Server side stays trivial (10 ms CPU): check the size (cap the body,
   e.g. 256 KB; say what you chose and why from real record sizes), check
   the turn id format, store the text as is. Identify the caller the same
   way the quota does. Limit writes per IP per day with the existing
   counter (`bump`), so the endpoint cannot be used to fill the database.
   Without a database the endpoint answers 204 and stores nothing; a
   self-hoster can turn it off with one variable (`TURN_RECORDS=false`),
   documented in `apps/web/README.md`.
5. Retention: rows older than 30 days are deleted (variable
   `TURN_RECORDS_DAYS`), with the same occasional-cleanup approach the
   quota uses.
6. One structured log line per `/api/chat` POST (JSON via `console.log`):
   turn id, caller kind, owner or own key, quota result, model, upstream
   status, milliseconds to first byte. No message content, no keys, no
   email.
7. User export: an entry "导出对话" / "Export conversation" in the project
   menu. It downloads one JSON file built in the browser (conversation
   with all turns as in the record, plus the current house and the app
   version). No server call. Disabled when the conversation is empty.
8. Owner export: `apps/web/scripts/turns-export.mjs` reads the remote
   database with wrangler and writes JSON Lines to
   `artifacts/turns/` (git-ignored), with options for a date range and
   "only undone / errored / gave up". Document it in the README.
9. A plain sentence in the About panel, Chinese and English, that
   conversations are saved on the server to improve the assistant and
   kept for 30 days.

## Constraints

- Project rules in `CLAUDE.md`. UI on the glass primitives only; the
  static glass check must pass. No card inside a card (owner's rule from
  task 019).
- Measure the CPU of `POST /api/turns` with a realistic record (extend
  `auth-check.ts` or `relay-check.mjs`) and report it.
- Do not change the quota or sign-in behaviour.

## Checks

- Unit or script tests: a record is stored once per turn id (a resend
  replaces, never duplicates), undo sets the flag, oversize and malformed
  bodies are refused, the per-IP limit, records off, retention cleanup.
- End to end with the chat stub: a turn is recorded for an anonymous
  visitor, a signed-in user and an own-key user; an undo is flagged; a
  failed `POST /api/turns` changes nothing the user sees; the exported
  file contains the turns and the house.
- The owner export script run against the local database.
- `pnpm -r typecheck` and `pnpm -r test` pass. Screenshots under
  `artifacts/task020/` (desktop and phone): the menu with the export
  entry, the About sentence.

## How to work

Scope note first (files to change, the record's shape, measured record
sizes for a small and a large house). If something here does not fit the
code or the free tier, stop and report. Small local commits; do not push
(a push deploys to production; the lead pushes after review). Report
honestly what was skipped or not verified.
