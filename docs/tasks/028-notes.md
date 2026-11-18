# Task 028 - notes: share links

## Scope (written before the change)

### What I read

`CLAUDE.md`, the spec, `docs/UI_STYLE.md`, `DESIGN.md`, `docs/DECISIONS.md`,
the notes of tasks 025-027. Code: `src/server/projects.ts`, `config.ts`,
`quota.ts` (`bump`), `src/server.ts` and `wrangler.jsonc` (the page list),
`src/lib/projects.ts`, `src/lib/project-sync.ts`, `src/lib/autosave.ts`,
`src/studio/useDerived.ts`, `Studio.tsx`, `chrome.tsx`, `PhoneDock.tsx`,
`tools.tsx` (the sun panel's place rows), `src/chat/ChatPanel.tsx`
(`ChatInput`), `AccountEntry.tsx`, `SignIn.tsx`, `account.ts`,
`src/projects/ProjectsPage.tsx`, `src/glass/primitives.tsx`, `glass.css`,
`scripts/projects-test.ts`, `auth-check.ts`, `account-e2e.mjs`,
`ui-audit.mjs`, `glass-check.mjs`.

### Server

- `migrations/0006_share.sql`: `project.share_token` (text, null = not
  shared) with a partial unique index, and `project.shared_at` (ms, 0).
- Owner routes, `src/server/projects.ts` (same rules as the other project
  writes: signed in, this site's origin, scoped by `user_id`, the write
  counter): `POST /api/projects/:id/share` turns sharing on (a new token of
  16 random bytes, base64url, when there is none; the same one while it is
  on), `DELETE /api/projects/:id/share` clears it. The project meta (list,
  read, save) gains `share` (the token or null), so the owner's list knows
  what is shared. A duplicate is never shared.
- Public routes, `src/server/share.ts`, no session: `GET /api/share/:token`
  answers `{name, updatedAt, house}` (the house as stored, put into the
  JSON as text, never parsed; no conversation, no owner, no project id) and
  `GET /api/share/:token/thumb` the thumbnail. One statement each plus the
  per-IP counter, in one D1 batch. "Cache briefly": a short-lived cache
  would keep a turned-off link working for its lifetime, which the spec's
  precedent rules out ("turning it off makes the address stop working at
  once"), so the read is revalidated instead (`no-cache` + ETag of the
  revision and name; a 304 skips the house). The thumbnail by token is
  cached 5 minutes (a link preview's crawler; the image says nothing a
  title does not).
- Link preview: `src/server.ts` already serves `/studio` through the
  Worker. With `?s=` it reads `name, summary, thumb_at` for the token (one
  indexed read) and rewrites the prerendered page's title, description and
  `og:*` tags (`src/server/share.ts` `sharePreviewHtml`, plain string
  handling on the ~4 KB head, so it runs and is measured in Node the same
  way as on workerd; HTMLRewriter would need the Workers runtime for the
  test). `og:image` is the thumbnail by token. CPU measured in
  `scripts/auth-check.ts`.
- Off everywhere when projects are off (`projects_off`, and the preview
  leaves the page as it is).

### Client: one module per side

- `src/lib/share.ts`: the share API calls (via the project sync, so the
  list updates), the share surface's store (`openShare`), the viewer's
  store and loader (`useViewOnly`, the one flag), "make my own copy".
- `src/studio/Share.tsx`: `ShareButton`, `ShareHost` (the one surface:
  `GlassPopover` on desktop, `GlassSheet` on phones; also mounted on
  `/projects`), `ViewOnlyBar`.
- `GlassSwitch` in `src/glass/primitives.tsx` (there is no switch yet).

### View-only: one flag

`useViewOnly()` is true from the first render when the address has `?s=`.
What reads it, and only these:

- `ChatInput` returns the `ViewOnlyBar` instead of the prompt (one place
  covers desktop, phone, sheets view and landscape).
- `useAutosave` does nothing (no restore, no save, no edit hooks):
  the viewer's own browser copy is never read into the page nor written.
- `useDerived` does not put the saved house on screen; the shared one is
  put there by the loader (`quietly`, an empty conversation, no undo).
- `useProjectSync` does not start (the shared house is never adopted, the
  link of the viewer's own project is never touched).
- The project menu shows only the account, language and about rows.
- The sun panel's place and orientation rows are text, not buttons.
- `useHouseName` shows the shared project's name.
- The share button is absent.

### Decisions, each after a precedent

| Question | What we do | Precedent |
|---|---|---|
| Where Share lives (desktop) | a "分享" capsule right of the toolbar, left of the avatar, 48 px like the account button | Figma, Google Docs, Canva: "Share" at the top right next to the avatar |
| The surface | anchored under the button (`GlassPopover below-end`), sheet on phones | Canva's Share dropdown under its button; Canva / Docs mobile share sheets |
| Access control | one switch "任何拿到链接的人都可以查看" | Google Docs "General access: Anyone with the link"; Canva "Collaboration link"; HIG toggles |
| Copy | "复制链接", toast "已复制链接"; phones with Web Share: the system share sheet | Figma / Docs "Link copied"; Docs and Canva mobile use the system share sheet |
| Off, then on again | the old address dies, a new one is made | spec (Google Docs keeps it; we do not, so a leaked link can be killed) |
| Phone placement (my choice) | a 36 px round share button in the top row, left of the account button (the row exists: no new height) | Google Docs and Figma iOS: share icon in the top bar beside the avatar / more |
| Phone placement (alternative) | a "分享" row in the project menu, nothing in the header | Canva mobile: Share inside the "..." menu |
| Signed out / local project | the same surface: one line, "登录"; after sign-in (the house adopted) the surface opens | Figma "Log in to share" |
| Viewer | the real studio; editing absent; a quiet bar "<name> · 仅查看" with "创建我的副本" | Figma "View only" chip and "Duplicate to your drafts"; Docs "View only" and "Make a copy" |
| Copy signed out | the shared house becomes this browser's project; asks once if an edited one would be replaced | Docs' "Make a copy" dialog (one question) |
| Shared mark on cards | a small link icon after the name | Google Drive's "shared" icon beside the file name |
| Share from the browser page | "分享" in the card menu, the same surface | Google Drive / Figma file browser: right click > Share |
| Off or unknown link | the existing not-found page: "这个链接已不再分享" | Google Docs / Figma "file not found" pages |

### Also fixed

The local card on `/projects` and the studio title used different
fallbacks: `houseTitle(lang, null)` (no saved house yet) gave the style
title "现代坡顶自建房" while the studio showed the default template's name.
One function, `projectTitle(lang, name, house)` in `src/lib/projects.ts`,
used by both; without a house it is the default template's name.

### Out of scope

The old `/s/$id` placeholder route (a "share pages are under construction"
stub from an earlier task) is left as it is; the share address is
`/studio?s=`.

## What was built

- Server: `migrations/0006_share.sql`; `shareRoute` in
  `src/server/projects.ts` (`POST/DELETE /api/projects/:id/share`), the
  project meta's `share`; `src/server/share.ts` (`sharedRoute` for
  `GET /api/share/:token` and `/thumb`, `sharePreview` and
  `sharePreviewHtml` for the link preview); `src/server.ts` rewrites
  `/studio?s=` only (the page list and `run_worker_first` already cover
  `/studio`). Routes `src/routes/api/projects.$id.share.ts`,
  `share.$token.ts`, `share.$token.thumb.ts`.
- Browser: `src/lib/view-only.ts` (the flag), `src/lib/share.ts` (surface
  state, copy, the viewer's loader, make a copy), `src/studio/Share.tsx`
  (`ShareButton`, `ShareHost`, `ViewOnlyBar`), `GlassSwitch`
  (`src/glass/primitives.tsx`, `glass.css`), `LinkIcon`. The sync gained
  `share(id, on)` (`project-sync.ts`); `projects.ts` gained
  `projectTitle`, `createProjectFrom`, `localHouseEdited`, `keepAsLocal`;
  `autosave.ts` `replaceSaved`. `ProjectMissing` covers a link that is off,
  unknown or cannot be read.
- The flag is read in exactly these places: `ChatInput` (the bar),
  `useAutosave` / `savedHouse` / `restoreChat`, `useDerived`,
  `useProjectSync`, the project menu (`edit`), `SiteRow`, `useHouseName`
  (through the shared store) and `ShareButton`.
- Phone: the share button is a 36 px round button left of the account
  button in the top row (44 px to touch; 8 px apart); the header's height
  is unchanged (both buttons on the name's line). While the share sheet is
  open the dock steps aside, as it does for sign-in.

### Phone alternative (described, not built)

A "分享" row in the project menu (under the house name) and nothing in
the header: no new control on screen, but sharing is two taps away and
hidden behind the name, which Canva mobile does and Figma / Google Docs
do not. Not built, no screenshot (it would have needed a second code
path).
