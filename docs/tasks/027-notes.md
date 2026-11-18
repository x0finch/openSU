# Task 027 - notes: cloud projects and "My projects"

## Scope (written before the change)

### What I read

`CLAUDE.md`, the spec, `docs/UI_STYLE.md`, `DESIGN.md`, `docs/DECISIONS.md`,
the notes of tasks 025 (one popover, one plate, one tooltip) and 026 (the
account entry and its reserved "我的项目" slot). Code: `src/lib/autosave.ts`
(the one local save), `src/lib/store.ts`, `src/chat/chat-store.ts` (items,
conversation id, undo stacks, `restoreItems`, `newChat`),
`src/studio/chrome.tsx` (`TitleMenu`, `ProjectMenu`, `projectTitle`),
`src/chat/AccountEntry.tsx`, `src/chat/account.ts`, `src/chat/SignIn.tsx`,
`src/chat/KeyPicker.tsx` (desktop popover / phone sheet hosts),
`src/glass/primitives.tsx`, the server modules `keys.ts`, `turns.ts`,
`accounts.ts`, `config.ts`, `chat-relay.ts` (`relayStatus`), the migrations,
`packages/model/src/schema.ts` (`House`), `packages/agent` templates and
`rename_house`, `scripts/keys-test.ts`, `scripts/d1-shim.ts`,
`scripts/account-e2e.mjs`, `scripts/ui-audit.mjs`.

### Where the name lives

The model already has `House.name` (required). The title shows it
(`projectTitle`: the house's own name; only the internal golden benchmark
shows its style title), and the assistant changes it with `rename_house`.
Putting the user's name into `House.name` would make a rename an edit of the
house: an undo step, a card in the conversation, and a full read and write
of a project that is not open. So the user's name is project metadata:

- `name` on the project ('' = not renamed). The title, the list and the
  menus show `name || projectTitle(house)`: the default stays what it is
  today until the user renames, and the assistant's `rename_house` still
  shows while the user has not named the project.
- The model and saved houses are unchanged. The local save gains an
  optional `name` (older saves have none: the default title).

### Data shape

D1, `migrations/0005_projects.sql`, one row per project:

| column | |
|---|---|
| `id` | 22 random base64url characters (128 bits; not guessable) |
| `user_id` | references `user`, on delete cascade |
| `name` | the user's name, '' when not renamed |
| `summary` | what the list shows besides the name, a small JSON text the browser builds (house name, style, plot, area, storeys, attic); at most 1 KB, not parsed by the server |
| `revision` | 1 on create, +1 on every save of the house |
| `created_at`, `updated_at` | ms |
| `house` | the house JSON, as text |
| `chat` | the conversation JSON (`{conversation, items}`), as text, bounded |

Index `(user_id, updated_at)`. The list query reads `id, name, summary,
revision, created_at, updated_at` only.

Routes (`src/server/projects.ts`; `src/routes/api/projects.ts` and
`projects.$id.ts`), signed in only, writes from the site's origin only
(the keys rule), every statement scoped by `user_id`:

- `GET /api/projects`: the list, newest first, and the limits.
- `POST /api/projects`: create `{house, chat, name?, summary}`, or duplicate
  `{from, name}` (copied inside D1, no JSON through the Worker). The count
  limit is in the same statement (`INSERT ... SELECT ... WHERE count < max`).
- `GET /api/projects/:id`: the project with its house and chat.
- `PUT /api/projects/:id`: save `{base, summary, house, chat}`; one
  `UPDATE ... WHERE revision = base RETURNING revision`; nothing returned:
  `409 conflict` with the server's revision, or `404`.
- `PATCH /api/projects/:id`: rename `{name}` (does not change the revision
  or the "changed" time: Finder does not count a rename as a change).
- `DELETE /api/projects/:id`.

House and chat travel as strings inside the JSON body and are stored and
returned as sent: the server checks sizes, ownership and revision, never
parses a house. Limits: `PROJECTS_MAX` (20) and `PROJECT_MAX_KB` (512, house
plus chat), Worker variables like the quota's. `PROJECTS_ENABLED=false`
turns the feature off; it is also off without sign-in or D1, and the
status (`GET /api/chat`) says `projects: null`, so the browser does
exactly what it does today. Task 028 (share links) can add its own token
table referencing `project.id`; nothing here assumes a session for reading
besides these routes.

### The sync logic (one module)

`src/lib/project-sync.ts`: plain TypeScript with injected I/O (the API,
timers, the local cache, the house and conversation of the studio), a
vanilla zustand store for the UI, unit-tested in Node
(`scripts/project-sync-test.ts`). `src/lib/autosave.ts` stays the one place
that notices a change and writes the browser copy; it tells the sync module
about each edit. The browser copy carries the link (`project: {id, user,
revision, dirty}`) so a reload or a lost connection keeps what was not
uploaded.

- Edits: saved locally at once (as today), to the account 3 s after the
  last change and when the page is hidden (`visibilitychange`, `pagehide`).
- A save carries `base`. On `409` with local edits: the local house is saved
  as a new project (a copy, "<name>（副本）"),
  which stays open; one toast says so. Without local edits (checked at
  start and when the page becomes visible again): the server's version
  replaces the open one.
- Failure: retry after 2, 4, 8 ... 60 s, and at once when the browser comes
  back online; one quiet line in the project menu while it is failing.
- First sign-in with a local house: if it was edited (not one of the
  template houses as they come, or it has a conversation), it is created as
  a project and stays open. An untouched template is not adopted (a second
  device would otherwise collect a copy of the default house at every
  first sign-in); then the last project opened on this browser, else the
  most recently changed one, else a new project from the default template.
- Switching: the pending save is sent and awaited, then house, conversation
  and undo history are swapped together (the target opens with an empty
  undo history: undo is not uploaded).
- Sign-out: the pending save is sent first; then the link is dropped and
  the open house stays as the local project.

### "My projects"

One component, `src/studio/Projects.tsx` (`ProjectsHost`, `openProjects`):
a `GlassPopover` at its opener on desktop (under the house name from the
project menu, at the account button from the account menu), a `GlassSheet`
on phones. Content: a title, "新建项目" (opens the templates in place),
then the projects, newest first: a check mark on the open one, the name,
the facts line and the time ("刚刚", "3 分钟前", "昨天", a date). Per row a
"more" button opens the row's actions in place (rename, duplicate,
delete); rename turns the name into a field; delete turns the row into
"删除？/ 取消". No box inside the surface, rows separated by inset
hairlines, 44 px or taller rows on phones.

Entry points: a row "我的项目" in the project menu (signed out it opens the
sign-in surface, whose line then says projects are kept with the account)
and the reserved slot in the account menu.

### Open questions and my answers

1. Name: project metadata, default `projectTitle(house)` (above).
2. The project menu's "换一个模板" and "恢复为模板" both replace the open
   house; signed in with projects on, both rows go: templates are offered by
   "新建项目" (a new project). Signed out (or projects off) they stay.
3. Conflict with local edits: the local version becomes the copy and stays
   on screen (the user keeps what they were looking at); the other device's
   version is untouched in the list.
4. The untouched default house is not adopted at first sign-in (above).
5. The conversation uploaded is the newest items up to 160 KB of JSON,
   without the tool-call records (`calls`, only used by the export); the
   local copy keeps everything as before.
6. Rate: writes are limited per user per hour (600, the quota counter);
   autosave sends at most one save per 3 s of editing.

### Out of scope

Share links (028), thumbnails, several tabs editing one project at once
(the last tab to save wins inside one browser; across devices the revision
check holds).
