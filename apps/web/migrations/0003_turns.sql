-- Conversation turns (task 020, src/server/turns.ts): one row per finished
-- assistant turn, written by POST /api/turns from the browser. `turn` is the
-- id the browser also sends in `x-opensu-turn`; a resend of the same turn
-- replaces its row. `who` is "u:<user id>" or "v:<visitor id>" (as in the
-- quota's counters). `at` is the server's time in ms; rows older than
-- TURN_RECORDS_DAYS go now and then (range delete on `turn_record_at`).
-- `undone` is set when the user undoes the turn's changes (cleared on redo).
-- `record` is the browser's JSON, stored as sent.
create table turn_record (
  turn text not null primary key,
  at integer not null,
  who text not null,
  conversation text not null,
  own_key integer not null,
  model text not null,
  undone integer not null default 0,
  record text not null
);

create index turn_record_at on turn_record (at);
