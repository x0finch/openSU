-- Share links (task 028, src/server/share.ts): a project the owner shares
-- carries a random token (16 bytes, base64url; not the project id). The
-- token is the only thing that grants a read of the house without a
-- session. Null = not shared; turning sharing off clears it, turning it on
-- again makes a new one. `shared_at` is when it was turned on (ms, 0 = not
-- shared).
alter table project add column share_token text;
alter table project add column shared_at integer not null default 0;

create unique index project_share on project (share_token) where share_token is not null;
