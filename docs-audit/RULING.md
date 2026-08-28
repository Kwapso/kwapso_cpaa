# The ruling — recorded 2026-08-27, before the audit began

The owner's words, verbatim:

> "Kwapso's UI/UX rules have the final authority."

## What that means for this repo

`shared/ui/docs/` is a vendored, hash-pinned copy of the kwapso design system's own
law-book (RULES.md, BUILD-A-COMPONENT.md, TOKENS.md, BUILD-A-SCREEN.md,
ARTIFACT-MAP.md — 3,378 lines). It is the STANDARD.

Where any of the following disagrees with the kit's law-book, **the kit wins**:

- `UI-CONVENTIONS.md`
- Any Law of the Base in the UI family — R29 (one page width), R31 (two radii),
  R32 (closed palette), R35 (record face), R37 (in-app anchors), R39 (kit supplies
  the UI) — and any of their checks in `web/test/rules.test.ts`
- Any comment, docstring or convention note anywhere in this repo that states a
  UI rule

These rules were written when the app drew its own UI. Since the design swap they
are a **second opinion on somebody else's subject**.

## What is NOT overturned

The ruling is about UI/UX. It does not touch R1, R10, R14, R20, R21, R26 or any
other rule about data, gating, tenancy, validation or the account fence. A UI rule
that also carries a security clause keeps the security clause.

## The disposition each app-side rule receives

Every app-side UI rule is classified as exactly one of:

- **(a) Same thing said twice** — the kit says it too. Ours is redundant. It may
  stay as an enforcement mechanism (the kit ships no test runner for this app),
  but its WORDS must not be the authority.
- **(b) Narrower and still useful** — the kit is silent or general; ours adds a
  this-app-specific constraint that does not contradict. Keeps.
- **(c) CONTRADICTING the kit** — ours says something the kit says differently.
  Ours is **wrong** and must change.

Nothing is deleted in this lane. The table is produced, and the report stops.
