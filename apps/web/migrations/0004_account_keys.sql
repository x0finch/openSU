-- API keys saved with the account (task 022, src/server/keys.ts): one row
-- per user and provider ("openrouter", "openai" or "anthropic").
-- `secret` is the key encrypted with AES-256-GCM under a key derived from
-- the Worker secret KEYS_SECRET ("v1.<iv>.<ciphertext>", base64url; the user
-- id and provider are bound in as additional data, so a row copied to
-- another user or provider does not decrypt). The full key is never
-- returned to the browser: only `hint` (its last 4 characters) and `model`
-- (empty = the provider's default). `chosen` marks the key the assistant
-- uses (at most one per user; none = the site's free allowance). Times in ms.
-- Rows go with their user.
create table account_key (
  user_id text not null references "user" ("id") on delete cascade,
  provider text not null check (provider in ('openrouter', 'openai', 'anthropic')),
  secret text not null,
  hint text not null,
  model text not null default '',
  chosen integer not null default 0,
  created_at integer not null,
  updated_at integer not null,
  primary key (user_id, provider)
) without rowid;
