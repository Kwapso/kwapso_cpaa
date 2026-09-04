# CLAUDE.md. Read this first

You are working on **the Kwapso System**, the multi-tenant SaaS base by Kwapso, the reusable Cloudflare-hosted foundation (auth, teams, member roles, invites, tickets, the knowledge base, dropdown management, CSV import, and an in-app AI agent) that every future app is built on. This file is the entry point for any agent working in this repo. It does not duplicate the docs, it tells you the **rules you must follow** and **where the canon lives**.

## The two prime directives

1. **Stay lean.** This codebase is deliberately small and well-layered. Add the least code that solves the problem; reuse the existing seams; don't introduce a dependency, a worker, a table, or an abstraction you don't need. "Too much code" is a defect here.
2. **Obey the Laws of the Base** (below). They are not suggestions, they are machine-checked. A change that breaks one turns the build red.

## The Laws of the Base (enforced, not aspirational)

The laws live in **[RULES.md](RULES.md)** (the human law-book) and are pinned to data in **`shared/rules/registry.ts`**. They are enforced by tests that read the source straight off disk, break a law and `npm run check` fails:

- **Every mutation publishes a live change.** Any non-GET route that changes state must call `publishChange` (cache-first + row-level live-sync, patch the changed row, never refetch the list). Enforced by `workers/*/test/publish-seam.test.ts` (tenancy, content, data-ops; auth's user-channel publishes and mcp's caller-private token rows are the reviewed exceptions. CACHING rule 5). See [CACHING.md](CACHING.md).
- **Every record detail exposes Overview + Activity tabs**, via the library `TabsView` + `ActivityFeed`. Enforced by `web/test/rules.test.ts` (`record-detail-tabs`).
- **No hand-rolled tab strips / toggles**, collection tabs use the library `TabsView`. (`no-handrolled-toggles`)
- **Every form renders through the shared `FormShell`.** (`forms-use-formshell`)
- **One generic record-activity read path.** (`generic-activity-path`)
- **The glossary is the single source of product terms**, `shared/glossary.ts`, one clear, brief definition each. Use those words in UI copy; never invent a synonym. (`glossary-wellformed`)
- **The agent knows what the app can do**, its system prompt carries a capability brief GENERATED from the import/export catalog + the glossary, so the UI and the agent can never disagree about a capability. (`agent-app-parity`, `workers/data-ops/test/agent-parity.test.ts`)
- **Input is validated at the boundary, and it is scanned (R20).** Never trust request bodies. Use `shared/workers/validate.ts` (`requireText` / `optionalText` / `queryText`: type-check, strip NUL bytes, cap length, throw the `GuardError` the workers map to a clean 400). Bad input is a 400, never a 500. The rule is **positional**: every body field must sit where something is CHECKING it (a validator's first argument, a `typeof` operand, `Array.isArray`/`Number`, a literal comparison, an allow-list `.includes`), a truthiness guard is not a type check and a cast is not a check at all; and a body is never destructured at the read. The QUERY string is held to the same positional rule by its own call-site census beside the body one, every `searchParams.get` must sit inside a checker, because "the query half is locked" used to mean the helper's behaviour was locked (`workers/content/test/validate.test.ts`), which is a different sentence from "every door uses it". (Both censuses are `validated-bodies` in `web/test/rules.test.ts`; the helpers' own behaviour stays in `workers/content/test/validate.test.ts`.)
- **Shipping the code ships the capability (R13)**, every module is an import TargetDef or a reviewed exemption, and the catalogue self-heals against the code on read (a fresh environment's picker is never empty; an owner's OFF stays off). (`catalog-coverage`)
- **No unbounded list endpoint, and no capped GROWING one (R14)**, every `list*`/`search*` read carries a hard cap from `shared/workers/limits.ts`, said in a comment; a collection that GROWS with use (`GROWING_COLLECTIONS`) must PAGE by key instead, opaque cursor + exact total + `hasMore` through `pagedJson`, with a client that can reach page two. (`bounded-lists`)
- **Every published resource reaches a listener (R15)**, the live registry (`web/lib/live-resources.ts`, or the portal's `PORTAL_LISTENERS`) or a reasoned `DEAF_EXEMPT` entry. A paged list's rows live in a cache key with its cursor in a sidecar, so the same registry keeps it live. R15's old `useLiveRefetch` clause is retired (RULES.md says why). (`live-collections`)
- **Every collection shows its count exactly once (R16)**, an exact server COUNT(*) through the one `formatCount` seam; tab badge wins, `CollectionHeading` stands down via the arbitration context. (`counted-collections`)
- **State transitions are idempotent (R17)**, the current-status predicate rides the UPDATE; zero rows moved = no activity row, no ping. (`idempotent-transitions`)
- **A cross-module read carries the caller's rights (R18)**, the team activity feed subtracts denied modules; every `relatedTable` resolves through `ACTIVITY_GATE_MAP` or a pinned exemption. (`activity-gate-coverage`)
- **Agent/MCP filter parity (R19)**, a tool on a list door exposes + forwards every filter the door parses, derived from the door's own source. (`agent-filter-parity`)
- **Every state-changing route gates (R10).** Any non-GET route opens with a permission gate, `requireRight` (or the `gated`/`gatedBody` wrapper / `requireAnyImportRight` / `adminGuard`), except a reviewed identity-gated write (teamless onboarding, own-pointer, ownership) that gates on `whoAmI`. The security counterpart to R1: enforced by a per-worker `gating-seam` suite (beside `publish-seam`) that reads handler source off disk, and the EXTERNAL machine surface (mcp) has its own suite asserting every non-GET route opens with token/user verification. No ungated door can ship, on either surface. (`gating-seam`)
- **A door on the agency's own material refuses a client login. AT THE DOOR (R21).** The client portal's gateway forwards a named allow-list and leaves the agency's doors out; the agency gateway forwards **by prefix**, and a client login is an ordinary team member holding an ordinary role. So every door the portal withheld was being served to the same person at the other hostname. Every route a Client-role caller can pass must refuse a portal caller, resolve the account fence, be a door the portal itself opens, or be a reasoned exemption. Nothing hand-listed: rights from the seed, routes from each `ROUTES` table, gates from handler source. **Enumerate by what a client can REACH, never by what a module owns**, that substitution is how it leaked the second time. (`client-reachable-doors`)
- **Agent/MCP body-field parity (R22)**. R19's sentence about the other half of the request. A tool on a WRITE door exposes and forwards every field that door reads off the **body**, derived from the door's own `body.<field>` reads and proved by RUNNING the tool's `buildBody`, not by reading it. R19 inspected only the query string, so four write tools offered a narrower contract than their door accepted for six weeks under a green build. (`agent-body-parity`)
- **An answer from the knowledge base carries its sources (R23).** Retrieval never writes prose, it hands back the passages and the sources they came from, and the assistant composes the reply with those in front of it. `found`, `passages` and `citations` are ONE decision in ONE seam (`knowledgeAnswer`): no citation means no passage and a sentence the assistant must say instead of inventing one. No door assembles that response by hand, the same shape as R14's `pagedJson`. The compartment searched, and the REASONING that chose it, ride the same object. (`cited-answers`)

- **An internal number cannot reach the client's side (R24).** What our own hour costs
  (`internal_rates`) and the margin computed from it live in ONE file,
  `workers/tenancy/src/lib/internal-money.ts`, and the check DERIVES the doors that call
  into it from that file's own exports: none of them is on the portal gateway's surface,
  every one opens with `refusePortalCaller`, and nothing in `web-portal/` names the
  internal table or those doors. SCOPE's ruling has no exceptions clause, so the defence
  is not a condition somebody can invert: a condition can be inverted and a permission can
  be granted, an import cannot be forgotten. The ACCOUNT rate card (what a client *is
  charged*) is a separate table and a separate file for the same reason.
  (`internal-money-never-in-portal`)
- **The vector index NARROWS; the team's database DECIDES (R26).** The knowledge
  base searches ONE account-wide Vectorize index, so two properties that used to
  be free are bought back explicitly. Tenancy is a PARTITION, every call passes
  `namespace: guard.teamId`, built in one function from the guard, and Vectorize
  applies a namespace before the search. And nothing readable comes out of the
  index: it is asked for ids and scores only (`returnValues:false`,
  `returnMetadata:"none"`), and every passage is read back out of the team's own
  database under the caller's own fence. A wrong label costs a relevant passage;
  it cannot produce one the caller may not read. (`vector-fence`)
- **A savings figure never renders without saying what it is made of (R25).** Every screen
  on either front door that shows a saving renders `SAVINGS_CAPTION` from
  `shared/workers/savings.ts`, word for word, the times are agreed estimates, the
  subtraction is arithmetic, and the screens are derived from the payload they read.
  (`savings-caption`)
- **Described contracts (R27)**, every `backticked` identifier in a tool description
  names something real: an argument the tool's own schema declares, a query param or
  body field its door reads (the same door census R19/R22 stand on), a field its
  response actually carries (the `pagedJson` contract + the door's own extras, the
  handler's `json({…})` literals, the row fields the module's libs map off a database
  row, R23's `knowledgeAnswer` seam), another tool's name, or a reasoned
  `DESCRIPTION_VOCABULARY` entry, rot-checked, so an unused or derivable entry turns
  the build red. R19/R22 prove the wiring and never the prose; on 2026-08-16 a
  description with a false promise, two invented parameters and a fake filter passed
  a green build, because the words a developer actually reads were the one unchecked
  surface. Identifiers, not sentences, an invented NAME can no longer ship.
  (`described-contracts`)
- **The translation catalogue cannot rot (R28).** `shared/i18n-strings.json` is
  EXACTLY the set of user-visible English sentences the two front doors say, in
  EXACTLY the languages `LANGUAGES` declares,
  derived by re-running the one shared definition of what a person reads
  (`scripts/lib/i18n-source.mjs`). That definition answers TWO questions and both
  are derived: which POSITIONS a person reads (the seven), and which FILES —
  `appFiles()`, **the front doors' own import closure. A file is walked because a
  front door imports it, not because of the folder it sits in.** A sentence
  MISSING from the catalogue ships in English to somebody who chose German,
  silently, on a screen that looks finished, because English is the key. An entry
  matching no string in the app is an ORPHAN and goes red too: nothing breaks
  today, which is why it rots into a record of what the app used to say while
  being translated on every build. A file under `web/`, `web-portal/` or
  `shared/` that says something and that the walk never opens is UNREACHABLE and
  goes red as well — censused off the DISK, not off the graph, with a reasoned
  `UNWALKED_OK` line the only way out. And the call site may not disagree with the
  definition: `t("of")` declares a string to be copy that `isUserVisible` refuses,
  so it is translated nowhere — write the whole sentence with a `{hole}` in it,
  which is also the only shape a translator can reorder. Earned twice: the
  pipeline is build-time, so "is the catalogue current?" was the assumption it all
  rested on; then "current against WHAT?" — `formatRelative` in `shared/web/` had
  been saying "5d ago" in English to nine call sites on both front doors, beside a
  German sentence, for a year. A translation on disk for a language the app no longer speaks
  is the fourth failure, added 2026-08-20 when the list was cut to four: the one
  array in `shared/i18n.ts` was the only place a language was decided for
  everything DERIVED from it, and never for the two files that ACCUMULATE. Run
  `npm run lang` before you commit — extract, then prune — and both deploy
  scripts refuse on a stale catalogue. (`catalogued-strings`)
- **The page has one width, and a screen does not get its own (R29).** Each front
  door owns exactly ONE page container, `web/components/app-shell.tsx` at
  `max-w-none` and `web-portal/components/portal-shell.tsx` at `max-w-3xl`
  (narrower on purpose), and no other component sets a page-level width. A page
  container is identified POSITIONALLY, as R20 identifies a checked field: one line
  carrying `mx-auto`, `w-full` and a `max-w-*` together, which is the signature of a
  centred content column and of nothing else, so a dialog, a sheet, a door card or a
  capped line of prose keeps its own measure and is never caught. Exceptions are data
  in `SCREEN_WIDTH_EXEMPT` with a reason each, rot-checked, so a pin whose file no
  longer sets a width turns the build red and the list can only shrink. Earned by six
  screens capping themselves at 60% of the room they had, one of them the shell's own
  loading skeleton, under a green build, because a width is invisible to every other
  check here. (`one-page-width`. UI-RULEBOOK N8)
- **Two radii, one named exception, and no third box (R31).** A rectangular
  surface is `rounded-[var(--radius)]`, a pill is `rounded-pill`, and a sheet that meets the
  bottom of the screen is `rounded-t-[var(--radius)]` — five spellings of one value were five
  decisions where there is one. Bare `rounded` is 4px and is deliberately outside
  the rule. **The exception is `rounded-select` (6px), on the mark of a selection
  control**, because at `rounded-[var(--radius)]` a checkbox is a lozenge and at
  `rounded-pill` it is a radio button; the design kit rules exactly this and
  calls it the one named exception. It is DATA in `RADIUS_EXCEPTION` with its
  reason, rot-checked so an exception nothing uses turns the build red. The kit
  names a second (4px on a bar) which is NOT defined here until something draws
  one. A third BOX radius is still forbidden. Every step from `sm` to `3xl` resolves to the same 24px again — the vendored
  library defined four different `calc()`s when it landed, and the reskin's shape
  stage pinned them all back to one `--radius`, which is what let R31's scope
  exemption for `shared/ui/` be deleted the same day it was written.
  (`two-radii`. UI-RULEBOOK N9)
- **Every extracted position asks for its translation (R33).** R28 makes the
  catalogue match the code; this makes the code READ the catalogue. Every
  position the one shared definition reports must sit inside a `t(...)` call —
  the same walk R28 stands on, read the other way round. Two ways out: a
  `label:`/`helpText:` on an object that spreads a FIELD CONFIG is translated on
  the way to the screen by `shared/web/field.tsx` (positional, because `t` is a
  hook and a field config is a module-level constant — those words genuinely
  cannot be wrapped where they are declared), held shut by an IMPORT BAN on the
  library `Field`; and a copy TABLE read back through `t` elsewhere is data in
  `TRANSLATED_WHERE_READ` with the call that reads it, rot-checked. Earned by
  666 of 2,001 extracted positions being translated into every language the app
  speaks, every build, and never asked for — every form field label in the app among them.
  (`wrapped-strings`)
- **Every colour resolves through a token (R32).** No Tailwind colour ramp and no
  hex literal in `web/`, `web-portal/` or `shared/`: what a colour MEANS has a
  token (`warning`, `success`, `destructive`, `chart-1`…`chart-5`), and a mark
  comes from the chart series. The six files that legitimately hold a literal —
  the branding seam, the email template, the two OS-level theme files, Google's
  own mark and a canvas fill — are data in `PALETTE_LITERAL_OK`, rot-checked.
  Earned by three breaches nobody would have filed as bugs: colour drift is only
  visible in aggregate, and nobody sees the aggregate. (`closed-palette`.
  UI-RULEBOOK N5)
- **The glossary is the dictionary the SCREENS speak (R34).** R6's second
  clause, finally read by something. `glossary-wellformed` reads the glossary
  FILE and never a line of copy, so for a year "use those words in UI copy;
  never invent a synonym" was enforced by nobody — and the app shipped green
  calling one thing "Permissions" on the Roles screen and "access rights" on two
  others, plus "teammate", "cost card" and "Portal login". So every user-visible
  English sentence (`shared/i18n-strings.json`, which R28 makes exactly that set)
  is read for a known synonym, from a NARROW deny-list that is data
  (`GLOSSARY_SYNONYMS`) with reasoned, rot-checked exemptions. Narrow on purpose:
  a word earns a line only when it can mean nothing else here — "client" is the
  relationship, "option" is in the glossary's own definition, "request" is an
  HTTP call on three screens. (`glossary-in-copy`)
- **Every switch on the permission matrix decides something (R36).** The grid
  gives a module four boxes whether or not four decisions exist behind them, so
  an inert box looks exactly like a live one and an owner who ticks it is told
  they granted something. Offered is DATA (`MODULE_OFFERED_RIGHTS`, exceptions
  only, each with its reason); consulted is DERIVED from all FOUR places a right
  is asked for — a literal `requireRight` pair, the MCP `TOOL_GATES` strings,
  every `ACTIVITY_GATE_MAP` module (read) and every import `TARGETS` module
  (create). It fails BOTH ways, and asked-but-unoffered is the dangerous half:
  that door refuses everybody, Admin included, and Admin is locked. Earned when
  fifteen of eighty-eight boxes turned out to decide nothing, one whole module
  (`screens`) had four boxes and no door, and two purged modules still held rows
  six weeks on. (`offered-rights`)
- **A link inside the app never leaves the shell (R37).** The whole post-auth app
  is ONE client-resolved shell that mounts once; a bare `<a href="/t/…">` throws
  the document away, re-runs every module and replays the boot mark. So an
  in-app destination is written with `<InAppLink>` (a real anchor — middle-click,
  copy-address and screen readers all still work; only the plain left click is
  intercepted into the soft-navigation bus) or carries that interception inline.
  Checked as a census OFF THE DISK of every component's anchors, classified by
  where each href points. Earned three times by one class of bug, green each
  time. (`in-app-anchors`)
- **The kit supplies the UI, and nothing else does (R39).** No file in `web/`,
  `web-portal/` or `shared/web/` imports a UI package. `shared/ui/` is the one
  source of a control, a structure, a glyph and a toast; its own dependencies
  (Radix, sonner, recharts) are ITS to import and the app reaches them THROUGH
  it — `@shared/ui/controls/sonner/sonner`, never `sonner`. The deny-list is
  DERIVED from what the kit's own source imports, so a dependency it adds
  tomorrow is covered without editing the law. Exceptions are data in
  `UI_PACKAGE_EXEMPT` with a reason each, rot-checked, so the list can only
  shrink — and each one names a GAP IN THE KIT to fix upstream. Earned by the
  icon swap: 96 kit glyphs were not enough, so six files reached for lucide and
  the app carried a second pack of 3,924 glyphs; when the art became Iconoir,
  thirty-seven names kept drawing the OLD pack beside the new one, same screen,
  green build. (`kit-supplies-the-ui`)
- **A stored file must reach a person (R40).** Every call that puts BYTES in a
  bucket — an `env.<BUCKET>.put(` on a binding the wrangler configs declare as an
  `r2_bucket`, or the one shared seam that does it for you (`storeImageDataUrl`)
  — is claimed by a `STORED_FILES` entry naming the FIELD a person reads the
  reference back through and the front-door FILE that renders it. Both halves
  are DERIVED, and each end is grounded in a different oracle so the check can
  never be a parser agreeing with itself: the write census comes off the wrangler
  configs (which bindings are buckets is a deployment fact, so a Durable Object's
  `storage.kv.put(` is not one), and the render proof comes off the browser —
  bytes reach a person through `href`, `src` or `picture`, directly or through a
  `const` assigned from `safeHref`/`safeSrc`, and through nothing else. **A field
  that only ever reaches a form's values is not a read**, and that subtraction is
  the whole discriminator. Earned by three instances of one bug, every one green:
  a story's attachments rendered by no screen at all; a document a CLIENT
  uploaded through the portal shown to the agency as an unclickable filename; and
  a task's `file_url`, write-only from the day it shipped. In all three the door
  answered 200 and the bytes were in R2 — everything worked except the last step,
  which is the only one a person experiences. (`reachable-bytes`)
- **A picked file is either sent or refused, never dropped (R41).** R40's
  sibling, and the boundary is the point: R40 asks whether a STORED file reaches
  a person, so where nothing is stored it is silent — and this is the worse half,
  because R40's failures at least leave the bytes in the bucket. A create dialog
  cannot upload while somebody types (R2 storage is addressed by the record's id,
  and on a create there is not one yet), so the files WAIT and are hung on
  whatever `onSubmit` hands back. Every dialog that defers like that is a
  `DEFERRED_UPLOAD_FORMS` line naming the maker whose id it needs, rot-checked;
  every CREATE call site of it, censused off the disk, must actually RETURN that
  id. A site passing the record's id is an EDIT and is skipped, read from the same
  prop the dialog switches on. Narrow on purpose: the fault is a DISCARDED RESULT,
  not a missing call, so there is nothing absent to look for. Earned by three of
  four `<StoryFormDialog>` create sites awaiting `createStoryFrom` and throwing
  the id away — story created, success toast, file gone, nothing to recover from.
  (`picked-files-are-sent`)
- **Every accepted source type resolves to a declared reader, on every door (R42).**
  One table (`workers/content/src/lib/source-readers.ts`) maps a type to an
  ORDERED list of readers, with a declared unreadable list beside it so "we
  cannot read this" is a decision somebody wrote down. Both doors ask it — the
  upload door and the Drive lane — and **no door chooses its own**, which is the
  load-bearing clause. Earned when the app had two readers and no table: a PDF
  uploaded through the app read properly and the same PDF in a Drive folder came
  out as gibberish, every PDF in the base scoring zero on any test of whether it
  held words. Nobody chose that; each door picked a reader at the moment it
  needed one, months apart. The next format is one table entry rather than an
  archaeology exercise across two doors. (`declared-readers`)
- **Every module a person can see, the assistant can answer about — and what is
  not in the corpus says why (R47).** Two clauses over one census, derived from
  the permission matrix itself. Each module offering a `read` right resolves to a
  KNOWLEDGE KIND that mirrors it, a GATED READ TOOL on the agent's own catalogue
  (its module read off the handler's own gate pair, through the same door census
  R19/R22/R27 stand on), or a reasoned `ASSISTANT_BLIND_MODULES` line. And the
  clause with the teeth: a module reachable ONLY by tool declares in writing why
  its material is not in the searchable corpus (`CORPUS_EXEMPT`, rot-checked, so
  a module that gains a kind loses its excuse). Earned when the owner asked "what
  is Alex's full name?" and nothing in the base said who his own colleagues are —
  `staff_profiles` carries a `user_id` and no name, and the names live in the
  global core database. The first draft asked only "is it reachable at all" and
  came back 21 of 22 green, which is why the failure was invisible: a tool
  answers when the model knows to call it, and a vague question reaches the
  corpus. The money settles the shape — internal rates and the margin are
  reachable by tool on the R24-fenced doors and must never sit in a corpus that
  has one gate and cannot fence per module. (`assistant-coverage`)
- **The toolbar, search included, is a default — never a per-screen choice
  (R48).** Every collection/data-view screen shows a search box UNLESS a
  named, reasoned entry says otherwise. Every `BASE_RECIPES` entry with a
  `CollectionConfig` must have `searchable: true`, or be named in
  `TOOLBAR_EXEMPT`; every `<ToolbarRow>` call site across both front doors
  must pass a `search` prop, or be named in the same registry. Both censuses
  are derived off disk and rot-checked both ways. Earned when Tasks' Calendar
  tab and the Triage queue each drew a toolbar with a button and no search
  box, reasoned only in a comment nothing read at build time — the client's
  own correction: "the toolbar, including the search, should be absolutely
  everywhere we have a data view or a collection view. Stop hardcoding this.
  Just write it as a rule." (`toolbar-shows-search`)
- **Never toolbar on an empty collection — not even the create button
  (R50).** `<ToolbarRow>` and `<PagedFind>` take a required `empty`/
  `restingEmpty` prop and return nothing at all when it is true, before any
  other slot (search, filters, sort, view, or `actions`) is considered.
  R48's own two censuses only ever asked whether `search` was present, never
  whether `actions` agreed with it, so a search box could be correctly
  gated on an empty collection while a lone create button kept floating
  above it — the client's own words, "once again, when empty collection no
  toolbar at all — fix everywhere and set as a rule," after the same shape
  recurred eight times over. `EMPTY_TOOLBAR_EXEMPT` is the reasoned,
  rot-checked way out; empty today. (`empty-toolbar`)

A law cannot be added without its check (`registry-integrity`). When you add a rule, add it to RULES.md **and** the registry **and** a check, or the build fails.

## Before you build, the planning ritual

Answer these seven, in order, *before* you write code. It's the thinking that keeps a change in-rule and lean, the antidote to the failure mode that bit us (a change that looked fine but broke an unstated invariant, or rebuilt a seam that already existed).

1. **Say it in one glossary sentence.** What changes, in [the glossary's](shared/glossary.ts) words. Never a synonym. No word for it yet? That's a glossary decision first (Law R6).
2. **Which Laws bite?** Walk R1–R51: a bespoke toolbar (`<ToolbarRow>`) → its gap to the content below it is the row's own baked-in margin, never a per-screen wrapper (R49), and it draws NOTHING AT ALL — search, filters, sort, view or its own create button — while the collection it narrows holds zero rows, through the row's own required `empty` prop rather than a per-slot gate a caller can forget (R50); it reads a request body → every field through the validation seam, positionally (R20); a client login could reach it at the agency origin → it decides about portal callers at the door (R21); it mutates → gate (R10) + publish (R1) + a reachable listener (R15); renders a form → FormShell (R4) + draft (R7); a collection → tabs (R2/R3/R8), a bounded read, or real keyset paging if it GROWS (R14), and an exact, once-only count through the one seam (R16), and any screen showing ONE of its records reads that record BY ID rather than finding it in the loaded page (R38); shows a RECORD anywhere — a picker option, a collection row, a row nested inside another record's screen — it carries that record's own face (R35); it draws ANYTHING → the control, the glyph and the toast come from the kit and no other package (R39); it STORES A FILE → the field it lands on is claimed in `STORED_FILES` and rendered by a real screen, an `href`/`src`/`picture` and never a form value (R40); it lets somebody PICK a file before the record exists → the create call site hands the new id back, or the file is dropped in silence (R41); a screen → ONE page width, and the pin deleted by the commit that fixes it (R29), `rounded-[var(--radius)]` or `rounded-pill` and no third radius (R31), and every colour through a token and never a Tailwind ramp or a hex (R32); a deactivate/reactivate or status move → the idempotent predicate + zero-row silence (R17); writes activity → its relatedTable resolves through the gate map (R18); a new module → an import TargetDef or a reasoned exemption (R13); touches the agent/MCP → capability parity (R9), every door filter exposed + forwarded (R19), every BODY field too (R22), a description whose every backticked identifier names something real (R27), the confirm rule, and — if it adds a tool to one machine surface only — a named reason on the other, or the missing tool wired (R43); calls an external service → a fetch timeout (R11); runs on a cron → record failures (R12); answers from the knowledge base → the one answer seam, citations and all (R23), and its search is namespaced and its words come from D1 (R26); it READS A FILE INTO the knowledge base → both doors ask the one reader table, or refuse honestly and say so (R42); it draws a screen from the vendored kit's `compositions/` → that exact composition is either adopted for real or has a reasoned, rot-checked exemption on file, never left undecided (R45); it uses any of the kit's `components/` or `foundations/` → that exact part is either REACHED for real — directly, through another adopted part, or through a CSS `@import` a JS-only census cannot see — or has a reasoned, rot-checked exemption on file (R46); **it sends a person an email → that send is classified in the census, and if it names a record it carries a button to it, at the recipient's OWN front door (R30)**; **says a single word to a person → that sentence is in the catalogue (R28), which means running `node scripts/i18n-extract.mjs` before you commit, AND the place it is said asks for its translation (R33): `t("…")` at the position, or a field config rendered through `shared/web/field.tsx`, AND it uses the glossary's word rather than a synonym for it (R34)**. Name them now, not in review.
3. **Which seams do I reuse, not rebuild?** The data door (`shared/workers/d1-rest`), gating (`requireRight`), validation (`shared/workers/validate`), `publishChange`, `FormShell`, the recipe engine, the tool catalog. If you're writing what a seam already does, stop.
4. **What's the smallest shape?** A route on an existing worker (not a new worker); a column (not a table); a recipe (not a bespoke screen); a flag (not a code path). "Too much code is a defect."
5. **What could break?** Name the failure path *before* the happy path: tenant isolation, ≥1 admin, a unique pending invite, a never-negative balance, a concurrent write, a partial failure, a hung fetch. Validate at the boundary; make retryable writes idempotent.
6. **What test locks it?** The seam/rule test that catches the regression. A new invariant → write the test first (red), then make it green. A green test must never assert the *wrong* intent (that's how the agent-confirm gap hid).
7. **Gate before ship.** `npm run check` + the quality trio (lean/story/security), and, for anything security-shaped, a **fresh, no-prior-context review** (a clean clone, independent eyes). An incumbent review rationalises what's already there.

## Build style, how code here is written

- **Workers (8):** six private brains, auth; tenancy (teams, members, Member roles + permissions, invites, the screen-recipe store, **the customer spine**, accounts, contact links, portal logins, **process maps** and **the money**: the three rate cards + margin — what a client is charged, what our own hour costs, and the per-role cost card); realtime; content (tickets + **the WORK ENGINE**, stories, sprints, work logs, to-dos, tasks, triage and meetings, + **the knowledge base**, with a 15-minute sweep and a morning digest, + the per-person Google connections + the agency's own housekeeping); data-ops (import + AI agent); mcp (the external machine surface: personal access tokens → team-pinned sessions → MCP tools over the same gated doors; reached only through the agency gateway at `/mcp` + `/api/mcp/*`), under **two public doors**: `gateway` (the agency app, `web/`, routes `/api/*` by prefix) and `portal-gateway` (the client portal, `web-portal/`, forwards a named allow-list only). **Only those two are public**; every other worker sets `workers_dev:false` + `preview_urls:false`, so no public route can reach `/internal/*`, the agent, or the act-as-user surface. Per-team D1 databases reached over the REST door (`CF_D1_TOKEN`); the global core DB via the native `env.DB` binding. Shared worker code lives in `shared/workers/` (gating, http, validate, …).
- **Worker handler shape:** a declarative `ROUTES` table (each route tagged read / mutation / housekeeping) → gate with `requireRight` from `shared/workers/gating` → team-DB CRUD via `d1Query` / `d1ExecScript` + `sqlString` + `ulid` → `publishChange` → return. Throw `GuardError(status, code, msg)`; the central catch maps it to a response.
- **Deactivate, never delete** (data + audit survive). Keep an audit block (actor + timestamp) on every write.
- **Permissions are the spine.** The AI agent **acts AS the signed-in user through the same gated endpoints** and never exceeds their rights. There is no separate agent role.
- **The screen engine:** `/t/<teamId>/<module>/<id>` is one client-resolved shell (`web/components/deep-link-screen.tsx`); recipes in `web/lib/screens.ts`; nav in `web/lib/pages.ts`. Tickets also has a clean top-level URL (`/tickets`). There is ONE ticket module and no help section: the section's URL segment and label say **tickets**, while the permission module, the tables, the API path and the MCP tool names are still `help` on purpose (the one seam is `MODULE_PERMISSION` in `web/lib/screens.ts`; DATA-MODEL.md § *help + help_threads* says why each stays). Don't "finish the rename". Engine-expressible screens → a recipe; bespoke screens → a host-composed component (like `role-detail.tsx`).
- **The UI library is the kwapso design system, vendored and PINNED.** `shared/ui/` is `github.com/Kwapso/kwapso-ui-ux` at the tag in `shared/ui/VERSION.json`, pulled by `scripts/sync-design.mjs` — imports look like `@shared/ui/components/button/button`. **The layout changed at v1.1.0 and the app moved to it on 2026-08-27**: `controls/` and `structures/` are ONE `components/` (114 parts), `tokens/`, `icons/` and `motion/` sit under `foundations/`, whole-screen templates stay in `compositions/`, and `lib/` stays at top level. Nothing inside those folders was renamed — not one basename changed — so the move was a codemod over 671 import sites, every rewritten specifier resolved against the tree on disk before it was written (`scripts/kit-layout-codemod.mjs`). **Neither front door lists `@source` lines any more**: the kit ships its own scan in `foundations/tokens/tokens.css`, so importing the tokens brings it, and the hand-kept list that had silently omitted `compositions/` is gone. It is a DEPENDENCY: a hand-edit under `shared/ui/` turns the build red (`web/test/vendored-kit.test.ts` recomputes the content hash), so a kit change is made upstream in Kwapso/kwapso-ui-ux, tagged, and pulled — OPERATIONS.md § "The design system" has the three-command loop. The old library's config-driven BEHAVIOUR (screen renderer, collection frame, filter bar, the rules engine, the Notes editor) lives app-side in `shared/web/screen-engine/` and draws through kit parts. **Five of those share a NAME with a kit part and none of them duplicates one** — an audit on 27 Aug 2026 matched on filename and reported 4,122 lines of shadowed kit code that does not exist. `visibility` here evaluates config rules; the kit's is an `IntersectionObserver`. `notes` here is a contentEditable editor; the kit's is a read-only stack of remark rows. `CollectionFrame` here takes `config`/`data`/`renderItems`; the kit's takes `eyebrow`/`heading`/`count` — a different LAYER, not a competing implementation. Every one of them already draws through kit controls. Before proposing to fold one into its namesake, read both signatures: the names collide and the jobs do not. A this-app-specific control still belongs in `web/components/`, never in `shared/ui/`.
- **Voice:** warm, plain, sentence case, no jargon, no emoji. Write for a 45–55-year-old manager. Use the glossary terms. See `shared/glossary.ts`.
- **Action buttons carry an icon** (from `@shared/ui/foundations/icons` — the kit draws 1,512 Phosphor glyphs under Phosphor's own names, and nothing else supplies an icon; ~`size-3.5`, before the label): edit = `PencilSimple`, switch off / deactivate = `Power`, remove = `UserMinus`, revoke = `Prohibit`, create = `Plus`, import = `UploadSimple`. Destructive actions use the destructive (red) colour + a confirm. Keep the icon-for-action mapping consistent across the app; on narrow screens icon-only is acceptable.

## Where the canon lives. Read before building

Start with **[README.md](README.md)** (the doc map), then:

- **[ARCHITECTURE.md](ARCHITECTURE.md)**, the locked decisions (workers, the live layer, the Durable Object code-vs-runtime model). Do not relitigate without the user.
- **[OPERATIONS.md](OPERATIONS.md)**, how it builds, ships, and resets.
- **[CACHING.md](CACHING.md)**, cache-first + row-level live-sync (every screen follows it).
- **[CONCURRENCY.md](CONCURRENCY.md)**, race-safety (atomic writes, unique indexes, when a Durable Object is the lock).
- **[ERROR-HANDLING.md](ERROR-HANDLING.md)**, the one logging seam, the error boundary, never-swallow.
- **[DATA-MODEL.md](DATA-MODEL.md)**, every table (global core + per-team).
- **[SEARCH.md](SEARCH.md)**, the layered search / filter model.
- **[ROADMAP.md](ROADMAP.md)**. HISTORY, not a plan: the build record of the Phase-C round (closed 2026-07-02) and the contracts its phases plugged into. Don't read it for current state, that's README.md → BASE-MANUAL.md. Open work lives beside the thing it's open on (UI-GAPS.md, EDGE-CASES.md, AGENT-MODULES-PLAN.md, BASE-IMPROVEMENTS.md).

**The manual, to build on the base, or rebuild it from zero:**

- **[BOOTSTRAP.md](BOOTSTRAP.md)**, the day-zero, command-by-command runbook to stand the WHOLE base up on a fresh Cloudflare account (core DB + migrations → R2 buckets → secrets/vars → realtime-first deploy → seed → first team → verify). The concrete "rebuild from nothing" answer.
- **[BASE-MANUAL.md](BASE-MANUAL.md)**, how the base works AND *why*: the eight workers, the two-tier database, the permission spine, how a new module and the base influence each other, how to change foundational code + how a change ripples, **how to fork the base for a new product (§5)**, and **how each subsystem scales (§6)**. Read this to understand the whole.
- **[BUILD-A-MODULE.md](BUILD-A-MODULE.md)**, the end-to-end golden-path checklist to add a team module (table → permissions → worker → web → detail → tests).
- **[CONVENTIONS.md](CONVENTIONS.md)**, the code + comment house style (handler shape, data doors, gating, validation, deactivate-not-delete).
- **[UI-CONVENTIONS.md](UI-CONVENTIONS.md)**, how screens are built (library-is-lego, recipe vs bespoke, the enforced UI Laws, the action-icon mapping, the voice).
- **[DURABLE-OBJECTS.md](DURABLE-OBJECTS.md)**, the realtime Durable Object (`TeamChannel`), the code-vs-runtime model, and when a DO is the lock vs plain atomic D1.
- **[EDGE-CASES.md](EDGE-CASES.md)**, the non-obvious traps (static-export reload, list-cache-as-detail-source, REST-door round-trips, the confirm model, streaming, and more).
- **[AGENTIC-IMPORT.md](AGENTIC-IMPORT.md)**, the agent-driven multi-table import (normalize → map → order interdependent tables → resolve foreign keys → reject honestly → write through the gated door). How to declare an import target + references for a new module.
- **[MCP.md](MCP.md)**, the external machine surface for developers: how an outside tool connects (token → `Bearer` on `/mcp`), the opt-in tool catalogue, the act-as-user/one-team/live-role security posture, and the cost model (reads/exports/import writes = free endpoint hits; only `agent_chat`/`agent_confirm`/`plan_import` — the import's planning step — draw the team's AI quota, a role without the agent right spends zero AI). **[mcp-quickstart.md](mcp-quickstart.md)** is the one-page version to hand an outside developer.
- **[SCOPE.html](SCOPE.html)**, the product's scope of work, chapter by chapter. Every "SCOPE ch.NN" reference in these docs points here: what kwapso is for, the account fence, the two front doors, what a client may see. Product decisions live here; this file is the book the rules defer to. (**[kwapso-the-system-explained.html](kwapso-the-system-explained.html)** is the plain-language owner walkthrough beside it.)
- **[glide/README.md](glide/README.md)**, the legacy Glide catalogue: the two apps kwapso ran on before this one, how to pull their rows, and the field reconciliation (`glide/RECONCILIATION.md`). `glide/data/` is git-ignored, it is customer data.

**The two front ends.** `web/` is the AGENCY app (served by `workers/gateway`); `web-portal/` is the CLIENT PORTAL (served by `workers/portal-gateway`). They are two permission-gated views of the same rows. Never copies, never synced. The portal has its own workspace and its own suites, including the account-fence test that walks every door it names through to the function behind it.

## Working agreement

- **`npm run check` must stay green** (the lint, then TypeScript across every workspace, then the full test suite including the rule + seam tests). Run it before you commit. It is the gate. The lint (`npm run lint`, oxlint, ~15ms over the whole repo) runs FIRST because it is the cheapest of the three: dead imports, unused dependencies in a hook's array, a React hook rule broken. Its first clean run found an `ErrorBoundary` imported into the root layout and rendered nowhere.
- **Ship gate** (before `/ship-staging`): `npm run check`, then the quality skills, `lean_mean` (≥ 92), `story_checks_out`, and `security_sentry` (no critical/high), then deploy. Adversarially verify your own findings.
- **Deploy order is realtime-FIRST**, then auth → tenancy → content → data-ops → mcp → gateway → portal-gateway. Both gateways go last, for the same reason: each service-binds the domain workers it forwards to. Production is owner-gated (apply new core + team migrations first). See OPERATIONS.md.
- **Commit messages** end with the Co-Authored-By line. Branch off `main`; don't commit straight to it.
- **Resetting data:** `node scripts/reset-all.mjs <staging|production|both>` (destructive; schema + migrations survive). Confirm production explicitly.

If a request conflicts with a Law of the Base or a locked decision in ARCHITECTURE.md, say so and propose the in-rule way. Don't quietly break the rule.
