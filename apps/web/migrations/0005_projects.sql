-- Projects kept with the account (task 027, src/server/projects.ts): one row
-- per project. `id` is 22 random base64url characters (not guessable).
-- `name` is the name the user gave ('' = not renamed: the browser shows the
-- house's own title). `summary` is what the list shows besides the name (a
-- small JSON text built by the browser: house name, style, plot, area,
-- storeys); the list query reads it and never the two large columns.
-- `revision` starts at 1 and grows by one with every save of the house; a
-- save names the revision it was based on. `house` and `chat` (the
-- conversation) are JSON text as the browser sent them; the server does not
-- parse them. Times in ms. Rows go with their user.
create table project (
  id text not null primary key,
  user_id text not null references "user" ("id") on delete cascade,
  name text not null default '',
  summary text not null default '{}',
  revision integer not null default 1,
  created_at integer not null,
  updated_at integer not null,
  house text not null,
  chat text not null default ''
);

create index project_user on project (user_id, updated_at);
