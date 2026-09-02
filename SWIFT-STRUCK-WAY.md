# The Swift Struck way, global habits for every build

> This is the **canonical, public copy** of the Swift Struck global habits. It lives in
> the base repo so it **travels with every fork**, anyone who clones the base (or reuses
> the `new-app` skill) gets it without needing anything from the author's machine. A
> mirror may exist at `~/.claude/SWIFT-STRUCK-WAY.md` for pre-clone reading; if the two
> ever differ, **this repo copy wins**.

These are the habits common to EVERY Swift Struck project. Project-specific canon
(architecture, laws, data model) lives in each repo. Read that repo's CLAUDE.md and
README first. This page is what stays true across all of them.

## The two prime directives
1. **Stay lean.** Add the least code that solves the problem; reuse existing seams;
   never add a dependency, worker, table, or abstraction you don't need. Too much
   code is a defect.
2. **The laws are machine-checked, not aspirational.** Agreed rules live as data in a
   registry, are written in a human law-book (RULES.md), and each is enforced by a
   real test. Rule + registry entry + check land together, or the build goes red. A
   rule with no working check is not a law.

## Voice
Warm, plain, sentence case, no jargon, no emoji. Write for a 45–55-year-old manager.
One glossary per app is the single source of product terms. Use those exact words in
UI copy and never invent a synonym. When handing the owner shell commands, give
paste-safe blocks (no `#` comment lines, their shell breaks on them) and say which
directory to run them in.

## The library is lego
UI primitives and collections come from Swift Struck UI. Apps assemble screens from
them and never hand-roll a second copy of a library component locally. If a primitive
needs changing, flag the gap (the app's UI-GAPS list) and fix it in the library, once,
rather than working around it on each screen that hits it.

**Where the library lives is a per-app decision, and it changed here — twice.** The
default is
the shared package, `github.com/alaap-swift-struck/swift-struck-ui`, installed from npm,
so a fix lands once and every product inherits it. This app took the other road on
2026-08-22 and **vendored** its copy into the repo at `shared/ui/` (imported as
`@shared/ui/…`), because it is being re-themed to a design kit that changes what a
component IS, not only what colour it is — and a token remap cannot turn a bordered
button into a borderless one. On 2026-08-25 the fork settled into its final shape:
`shared/ui/` is a **pinned** copy of the kwapso design kit,
`github.com/Kwapso/kwapso-ui-ux`, at the tag in `shared/ui/VERSION.json`, pulled by
`scripts/sync-design.mjs`, with a hand-edit under it turning the build red
(`web/test/vendored-kit.test.ts`). So this app does NOT edit its components in
place: a kit change is made upstream in `Kwapso/kwapso-ui-ux`, tagged, and pulled — a
new upstream, chosen deliberately, not the old package regained.

**The rule that holds in every arrangement: a vendored copy is never pushed back.**
Other Swift Struck products are live on the old package, and nothing here is
PR'd or "synced back" to it. If you find a genuine bug from that lineage, report
it there in its own words; kwapso's own fix goes through `Kwapso/kwapso-ui-ux`.

## The ship pipeline
Local → GitHub → staging (deploy ends with an automated smoke that must pass) →
the quality gates, lean_mean_check (score 92 or better), story_checks_out,
security_sentry (no critical/high), and a clean error store, → reset data only if
the owner asks (destructive; confirm scope) → production, always owner-gated →
merging `main` means "this is what production runs". `npm run check` (types + full
test suite) must be green before any commit; deploy order is realtime-first.

## Parallel lanes, when several sessions work one repo
Multiple Claude sessions (lanes) may work the same project at once, and often share
ONE checkout — so treat the working tree as shared ground, not your own. The habits
that keep that safe:
- **Briefs travel in the repo, not in chat memory.** `.session-notes/lanes/` is the
  tracked mailbox: a lane hands another its brief (and gets its reply) as a file
  there, so the handoff survives every session ending.
- **Verify HEAD before you commit.** Another lane can switch branches or land
  commits under you mid-task; re-check `git log`/`git status` against what you
  started from, and rebase your intent rather than clobbering theirs.
- **Code-writing lanes isolate in worktrees.** A lane that edits source takes a git
  worktree of its own; doc-only or read-only lanes may share the main checkout.
- **A prompt handed to another lane must stand alone** — its own setup, paths and
  context inside it, executable without this conversation.

## Security and data habits
- **Act-as-user everywhere.** Every automation surface, the AI agent, imports,
  the MCP tools, acts AS the signed-in user through the same gated endpoints. No
  separate robot role, no privilege it wouldn't have in the UI.
- **Every state-changing route gates.** No write ships without a permission gate
  (requireRight / the gated wrapper / an admin key), or a reviewed identity gate for
  the teamless/ownership cases. This is a machine-checked law (the gating seam), not a
  convention.
- **Deactivate, never delete.** Master records are switched off, not erased; data
  and audit history survive. Every write carries an audit block (actor + timestamp).
- **Validate at the boundary.** Never trust a request body; bad input is a clean
  400, never a 500.
- **Generated, not written.** Anything an agent "knows" about the app's
  capabilities is generated from the app's own catalogs and glossary, so the UI and
  the agent can never disagree.
- **Secrets are never printed, echoed, or committed.** They go in via
  `wrangler secret put` (or the platform equivalent) and live locally only in
  git-ignored `.dev.vars` files.
- **One cloud account per product**, and every worker, database, and bucket carries the
  product's name prefix, the prefix is the project grouping. **Cloudflare is the
  recommended stack** (the base is native to it and `new-app` stands it up turnkey); the
  base can be ported to any top-10 provider by swapping ~4 seam files. See the app's
  `PLATFORMS.md` for the per-provider map.

## Reset and confirm conventions
Destructive operations always confirm scope first, and production is always named
explicitly. Never bundled silently into "both". A reset wipes rows but keeps schema
and migrations; after one, re-seed what the app needs (catalogs, first team) before
calling it usable. Dangerous or bulk actions in-app follow the same rule: one clear
confirm before the act.
