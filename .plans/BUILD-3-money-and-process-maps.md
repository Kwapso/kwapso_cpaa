# Build 3 — process maps, versions, and the money

**For a fresh agent with no prior context.** Read `CLAUDE.md` first, then this,
then `SCOPE.html` on process maps, savings and commercials.

**This can start NOW, in parallel with the work engine.** It hangs off apps,
processes and steps — not off tickets. The one place it touches the work engine
is the story's `step` field, and `.plans/BUILD-1-work-engine.md` §2 already
declares that field as required. Build against that declaration; if the work
engine lane has not landed it yet, build your side and say so.

---

## 0 · The rules

- `CLAUDE.md` holds the Laws of the Base, **R1–R34**, machine-checked.
- **`npm run check` must exit 0**, captured unpiped: `npm run check > /tmp/x.log 2>&1; echo $?`. A piped run reports the pipe's status and has read green over a failing build in this repo.
- **Every test proven to bite**: break the thing, watch it go RED, restore, quote the red output. Watch the specific trap this codebase keeps hitting: `expect(indexOf(x)).toBeLessThan(indexOf(y))` passes LOUDEST when `x` is absent, because `indexOf` returns −1. Assert presence first — `workers/tenancy/test/grant-ceiling.test.ts` has the helper that does it right.
- **`@kwapso/ui` is a separate repo.** Never edit it from here.
- **Never commit anything under `glide/`** — real customer data.
- **Stay lean.** A column beats a table; a recipe beats a bespoke screen.
- **Deactivate, never delete.**

## 1 · What this is for, in the owner's own words

> *"The numbers stop being believable"* — one of the three things he named as
> what would make him quietly abandon this and go back to a spreadsheet.

Everything below serves that sentence. A savings figure a client cannot drill
into is worse than no figure, because the first time they question it and nobody
can answer, the whole app loses credibility.

## 2 · The shape (settled in SCOPE — do not re-decide)

**App → Process → Step.** An App is the built system (the thing with a URL and a
stage). A Process is a way of working inside it. A Step is one part of that.

**Versions.** A process is versioned. **v1 is the pre-kwapso baseline** — how
they worked before we touched anything. Every later version is what we changed
it to.

**A new version is cut automatically when a sprint completes, plus a manual
button** (the owner confirmed both).

**A story must name the step it changes, or explicitly say it changes none, and
it cannot close without doing so.** That is the hook everything here hangs on.
It is required, not optional, and not "for now".

## 3 · The savings maths

**Savings = the v1 duration minus the latest version's duration**, multiplied by
how often the step runs. Drillable **App → Process → Step**, so a client asking
*"where does 208 hours come from?"* gets an answer three clicks deep.

**The caption is part of the feature**, settled in SCOPE and non-negotiable:
*the inputs are agreed estimates, the subtraction is arithmetic.* A client who
understands that trusts the number. A client who thinks we measured it with a
stopwatch stops trusting everything the day one figure looks wrong.

**Regressions.** Internal dashboards **always** show them — a step that got
slower is information. The portal shows a regression **only with a staff
explanation attached**. Build the attachment; do not build a filter that hides
them.

## 4 · The commercials

- **Flat prices live on the sprint row**: `sold_price` + currency. A **blueprint
  is a priced planning sprint**, not a fourth sprint type.
- **Support and hourly pricing come straight from the work logs.**
- **Margin = revenue − (logged seconds × internal rates) − tool costs.**
- **Account rate cards and internal rate cards never mix.** Two different things
  that both look like "a rate"; keep them apart in the schema, not just in the UI.
- **Engagement type is a LABEL, never an object** (SCOPE retired it as an entity;
  do not reintroduce it).
- **There is no billing module.** Nothing here issues an invoice.

## 5 · What a client sees — and the one absolute

The owner's ruling: **value for everyone; what they bought only for the accounts
where he switches it on.** So a per-account flag governs price visibility, and
the savings/impact view is on by default.

**Internal rates and margin NEVER render in the portal, under any flag, ever.**
Not behind a permission, not behind a feature toggle, not for an admin viewing
the portal. Make that structurally true — a portal projection that cannot carry
the field — rather than a condition someone can invert later.

Precedent to copy exactly: `workers/tenancy/src/lib/accounts.ts` `toAccount` now
has a portal projection that strips the agency's commercial status and audit
block. Same pattern, same reason. Read it before you write yours.

**A client may comment on a process map** (one of the six things a contact can
do). Comments are a conversation, not an edit.

## 6 · The laws this will trip

- **R1** every mutation publishes a live change · **R10** every non-GET route gates · **R20** every body field through the validation seam, positionally.
- **R14** processes, versions, steps and work logs all GROW — they page by key with an opaque cursor, exact total and `hasMore`, and the client must reach page two.
- **R15** every published resource reaches a listener; a portal-visible one must be scope-stamped or the fence discards the ping.
- **R16** exact server counts through the one `formatCount` seam · **R2/R3/R4/R8** record detail = `TabsView` + `ActivityFeed`, forms through `FormShell`.
- **R21** any door a client login can reach at the AGENCY origin decides about portal callers **at the door**.
- **R9/R19/R22** the assistant and MCP see every new capability, with every door filter AND every body field exposed and forwarded.
- **R6** every new word goes in `shared/glossary.ts` first. SCOPE ch.02 has the vocabulary — port it, do not invent.

## 7 · Order

1. Glossary. 2. App / Process / Step / Version tables and doors. 3. The version
cut (automatic on sprint completion + the manual button), idempotent per R17.
4. The savings calculation and its drill-down. 5. Rate cards, both kinds, kept
apart. 6. Margin, internal only. 7. The portal projection and the per-account
price flag. 8. Client comments on a process map.

## 8 · Done looks like

`npm run check` exits 0 with every new law carrying its check; a client can drill
a savings figure to the step; a regression is visible internally and explained in
the portal; no permutation of flags renders a margin in the portal, proved by a
test; and the quality gates (`lean_mean_check` ≥ 94, `security_sentry` no
critical or high) pass.

## 9 · Report back with

The diff per step; every test with its **sabotage-verified red output**; the
schema decision that keeps the two rate-card kinds apart; and anything in this
document that turned out to be wrong when you read the code — it was written from
the owner's answers and from source, and either can be stale.
