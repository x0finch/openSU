-- Daily quota on the owner's model key (task 019, src/server/quota.ts).
--
-- quota_counter: one row per counter. Keys start with the quota day (or
-- the UTC hour for rate limits) so old rows go with a primary-key range
-- delete: "2026-11-14|u:<user id>", "2026-11-14|v:<visitor id>",
-- "2026-11-14|ip:<ip>", "2026-11-14|site", "2026-11-14T07|otp-email:<address>".
create table quota_counter (key text not null primary key, n integer not null) without rowid;

-- quota_turn: one row per counted user message ("<day>|<subject>|<turn id>"),
-- with the number of model calls it made.
create table quota_turn (key text not null primary key, day text not null, subject text not null, ip text not null, calls integer not null) without rowid;

-- A new turn takes one credit from its subject, its IP and the site, in the
-- same statement as the insert (atomic).
create trigger quota_turn_count after insert on quota_turn
begin
  insert into quota_counter (key, n) values
    (new.day || '|' || new.subject, 1),
    (new.day || '|ip:' || new.ip, 1),
    (new.day || '|site', 1)
  on conflict (key) do update set n = n + 1;
end;
