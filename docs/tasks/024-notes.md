# Task 024 - progress notes

Working notes for the UI audit (`apps/web/scripts/ui-audit.mjs`, rules in
`ui-audit-rules.mjs`). Output goes to `artifacts/audit/` (never committed).

## Status

- [x] Harness: built preview + chat stub + local D1 + sign-in / keys test
      hooks; DPR 3 contexts with the 3D canvas at 1x (`?dpr=1`); measuring
      screenshots at CSS scale, crops at device scale.
- [x] DOM rules and pixel rules (see the rule table below).
- [ ] Full matrix run, false-positive tuning, eye passes.
- [ ] Smoke + allow-list (only if stable over three runs and < 2 min).
