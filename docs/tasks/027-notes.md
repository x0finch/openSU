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

### "My projects" (superseded by the amendment, below)

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

## After the amendment (owner, 2026-11-18)

The popover / sheet list was built first (commit e4479e4) and removed when
the spec was amended; the server and the sync logic stood and were
extended.

### Decisions, each after a precedent

| Question | What we do | Precedent |
|---|---|---|
| Where the file browser lives | `/projects`, a page of its own (paper, like the landing page): a grid of cards, 2 columns on phones, up to 5 at 1440 | Figma "Recents", Canva "Projects", Google Docs home |
| Card | 4:3 thumbnail, the name, "edited ... ago" (only that: the facts line was dropped from the card) | Figma ("Edited 3 minutes ago"), Google Docs ("Opened ...") |
| Card actions | a "..." button beside the text, the same menu on right click: Open, Rename, Duplicate, Delete | Google Docs (⋮ beside the date), Figma (right click / "...") |
| Rename on the page | the name becomes a field in place; Enter or leaving the field saves, Escape cancels | Figma, Google Drive inline rename |
| New project | the first card; it opens the templates as cards above the grid (rendered in this browser the first time, cached for the page); a template opens the studio at `/studio?new=<t>`, which makes the project and replaces the address with `?p=` | Google Docs' "Start a new document" template strip; Canva's template chooser |
| New project in the studio | "新建项目" in the project menu makes a project from the default template at once and opens it (no chooser) | Figma "New design file", Google Docs File > New |
| Duplicate in the studio | makes "<name> 副本" and opens it, in the same tab (a new tab is blocked after an async request) | Google Docs "Make a copy" (opens the copy; it uses a new tab) |
| Delete | asks once in place on the card ("删除这个项目？" / 删除 / 取消), then the card goes and a toast "已删除「…」 撤销" stays 6 s; the DELETE is sent when it ends (or when the page is left) | Figma / Google Drive "moved to trash · Undo" (no trash page here, by the spec) |
| The open project in the address | `/studio?p=<id>`; the first open replaces the entry, a switch (new, duplicate) pushes one; back / forward open the project named | Figma and Google Docs file URLs |
| An address the account cannot open | a plain page "找不到这个项目" with "回到我的项目" (and "登录" when signed out); nothing else is opened | Google Docs "You need access" / Figma "File not found" |
| Rename in the studio | "重命名" in the project menu turns the title into a field in place | Figma (double click on the file name), Google Docs (title field) |
| Way back | "所有项目" in the project menu, "我的项目" in the account menu, both to `/projects` (the pending save is sent first) | Figma "Back to files" |
| Signed-in landing link | "打开工作台" goes to `/projects` | Figma / Canva open on the file browser |
| Thumbnail | the default view (`axo-se`), 480 x 360, WebP (JPEG where WebP cannot be encoded), quality 0.82; rendered with its own offscreen WebGL context when the browser is idle, 15 s after the last saved change, at most once a minute; a project without one gets one when opened | Figma / Canva thumbnails update after edits, not live |
| Thumbnail storage | its own column (`thumb`, `thumb_type`, `thumb_at`), never read with the JSON; `GET /api/projects/:id/thumb?v=<thumbAt>` with `private, max-age=31536000, immutable`; the list carries `thumbAt` | |

### What was built (final)

- Server: `migrations/0005_projects.sql` (with the thumbnail columns; not
  deployed yet, so edited in place), `src/server/projects.ts`
  (`projectsRoute`, `thumbRoute`), routes `/api/projects`,
  `/api/projects/$id`, `/api/projects/$id/thumb`; `GET /api/chat` reports
  `projects: {max, maxKb}` or null. `PROJECTS_ENABLED`, `PROJECTS_MAX`,
  `PROJECT_MAX_KB` (README, deploy workflow).
- Sync: `src/lib/project-sync.ts` (one module, injected I/O),
  `src/lib/projects.ts` (the app's side: API, browser-copy link, the swap of
  house + conversation + undo history, the address, thumbnails),
  `src/studio/thumb.ts` (lazy: the offscreen render), `src/lib/autosave.ts`
  (the one place that tells an edit from a load), `src/lib/toast.ts`.
- UI: `src/projects/ProjectsPage.tsx` + `src/routes/projects.tsx`
  (prerendered like `/studio`; `/projects` added to the Worker's page list
  and `assets.run_worker_first`), `src/studio/ProjectMissing.tsx`, the
  project menu (`src/studio/chrome.tsx`), the account menu slot
  (`src/chat/AccountEntry.tsx`, its toast generalised as `StudioToast`).
- Signed in, the project menu no longer has "换一个模板" and "恢复为模板"
  (both replaced the open house); templates are on the page's "新建项目".
  Signed out (or projects off) the menu is as before plus "所有项目".

### Tests

- `scripts/projects-test.ts` (server, 7 tests), `scripts/project-sync-test.ts`
  (sync, 17 tests: debounce, conflict with and without local edits, first
  sign-in adoption, untouched template not adopted, sign-out and back, another
  account, failures and back-off, switch / create / rename / duplicate /
  delete, thumbnails and their throttle, the address, deleting from the page).
- `scripts/auth-check.ts`: CPU of the routes at 414 KB (README).
- account-e2e `projects` (in `--smoke`): see the header of the script.
- ui-audit states `account-project-menu`, `account-projects-page`,
  `account-projects-menu`, `account-projects-new` (the first two in
  `--smoke`).

### Audit of the new states (d1440-zh in smoke; d1440-en, d1280-zh, p390-zh, p390-en and the CSS twins with `--only account-project --no-motion`)

- Fixed on the way: the logo link's hit area on the page, the language
  toggle 44 px on phones, the delete question cut on phones, the limit line
  cut.
- Open: `hit-target` on menu rows on phones (40 px, `GlassMenuItem`'s
  height, shared with every menu: the open item from task 026, now also on
  the new project-menu rows and the card menu); `text-truncated` of long
  emails and "Near Hangzhou (default)" in the menus (P2, existing);
  `text-size` of the 11 px "文" glyph (existing); `row-align` 1.3 px in the
  prompt (existing).

### Not done, not verified

- Thumbnail cost on real hardware: under SwiftShader one render takes about
  3.6 s of main-thread time (16 KB WebP; it builds the geometry and compiles
  shaders in a fresh WebGL context). It waits for 15 s of quiet and an idle
  browser, at most once a minute, but on a slow phone it may still be a
  visible hitch; not measured on a real GPU. Reusing the studio's own
  renderer would avoid the shader compile; not done.
- The flaky account-e2e check "the email field is focused on arrival"
  (phone): the field was focused on a fixed schedule up to 1.2 s while the
  sheet stays hidden until its first spring frame; under load (SwiftShader
  drawing the first 3D frame on a 2x phone) that frame can come later, so
  every retry hit a hidden field. Now retried every 80 ms until it takes (up
  to 6 s). This is the likely cause from reading the code; it was not
  reproduced on demand (no CPU throttling run).
- No trash page; a delete is final once its toast has gone.
- Several tabs on one browser editing the same project: the last to save
  wins inside the browser (the revision check holds across devices).
- Template names are data in Chinese (`TEMPLATE_META`); the English pages show
  them in Chinese, as the project menu did before.
- The projects page has no pagination (20 projects by default).
- Opening `/studio?p=<id>` shows the browser's cached house for a moment
  before the named project arrives.

## Review fixes (lead, 2026-11-18)

1. **The page uses the window.** Content up to 1280 px, centred, the same
   container as the header; cards in `repeat(auto-fill, minmax(240px, 1fr))`
   (two columns under 640 px), the template cards in the same grid; card
   name 15 px, the "edited" line 13 px at that scale. Measured by the e2e:
   4 columns of 282 px over 1200 px at 1280, 1440 and 2000 wide (the content
   stops at 1280; Google Docs and Figma also cap the grid's width).
2. **One account entry.** `/projects` uses the studio's `AccountButton`,
   `AccountMenuHost` and `SignInHost` (the separate dark "登录" button is
   gone; the one-line invitation stays). On the page the account menu shows
   neither "我的项目" (the page you are on: Figma's account menu has no link
   to the file browser, and the file browser does not show "Back to files")
   nor "我的密钥" (the key picker lives in the studio; there is nothing to
   open it into on the page). Signing in on the page runs the same sync as
   the studio (`useProjectSync({ page: true })`): an edited house of this
   browser becomes a project; an untouched one opens or makes nothing.
   No rule of `docs/UI_STYLE.md` is broken by a glass capsule on paper:
   rules 1-3 (drawing first, capsule then panel, one level of glass) hold;
   rule 11 and DESIGN.md keep the *landing page* and the gallery sheets
   free of glass, and the projects page is an app page, not the landing.
   The page already used the glass menu and toast.
3. **Thumbnails from the studio's renderer.** `IllustrationViewer.renderView`
   (packages/render) draws one frame of the default view at 480 x 360 into
   an offscreen multisampled target with the scene and programs as they
   are (encoded like the canvas, as the glass target is: no shader compile,
   no second context), restores the user's camera, line widths and
   billboards at once, and reads the pixels back on a GPU fence
   (`readRenderTargetPixelsAsync`). When the default view needs another
   presentation sun, the shadow map is drawn for the capture and again for
   the next visible frame, which looks the same. It returns nothing while
   walking, in a cutaway, in the sun study or during the grow transition;
   the sync asks again a minute later.
   - Before (a second renderer, `OffscreenView`): about 3.6 s of main thread
     per thumbnail under SwiftShader (1440 x 900 page, idle).
   - After, main-thread time of the synchronous parts (issuing the frame,
     copying the pixels back), under SwiftShader: 5 ms in the e2e run, 16 ms
     (desktop, from another view, so with the sun switch) and 7 ms (phone
     390 x 844) in an idle page; the image is ready 0.4-2 s later (the fence,
     then the WebP encoding, both off the main thread in Chromium).
   - The visible frame: a screenshot before and after a capture from
     another view (axo-nw) is pixel-identical, desktop and phone.
   - Plan- or sheets-only sessions (the 3D view never shown): no thumbnail;
     it is drawn the next time the 3D view exists. I chose that over any
     second renderer, which is the cost the review rules out. The template
     cards on `/projects` have no pictures for the same reason (the spec:
     "if cheap").
