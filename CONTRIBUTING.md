# CONTRIBUTING.md — your first change

This document has one job: walk you from a fresh clone to a change that is
committed, in-rule, and provably not broken. It assumes you have never touched
this codebase.

It is deliberately not a tour. [README.md](README.md) is the map, and
[CLAUDE.md](CLAUDE.md) is the law. This is the path *through* them the first
time, in the order the work actually happens.

**Who this is for.** Today one person has written nearly all of this
(`.github/CODEOWNERS` records that plainly). So the reader this file is really
written for is the second person — a colleague, a stranger inheriting it, or an
AI agent — arriving with the repository and nothing else. If that is you: the
documentation is unusually deep here, and it is meant to be read, not skimmed.
It is what stands in for the person who is not there.

---

## 0 · Get it running (about a minute)

```bash
git clone https://github.com/Kwapso/kwapso_system.git
cd kwapso_system
npm install
npm run check
```

`npm run check` is **the gate** — lint, then TypeScript across all ten
workspaces, then every test. A clean clone should reach **exit code 0**. If it
does not, stop: something is wrong with the checkout or the toolchain, and no
change you make on top of a red gate can be trusted.

You need **Node 22** (`.nvmrc`, `package.json` `engines`, and what CI runs) and
npm 10+. Nothing else — no cloud account, no secrets, no database. Everything
above runs entirely on your machine.

To see it:

```bash
npm run dev         # the agency app  → http://localhost:3000
npm run dev:portal  # the client portal → http://localhost:3001
```

One test file skips itself and **that skip is green**:
`workers/content/test/knowledge-backfill.test.ts` measures the knowledge base
against real customer history that is git-ignored on purpose, so it is absent
from every clone. A skip anywhere else is not green — investigate it.

---

## 1 · Before you write code: the planning ritual

[CLAUDE.md](CLAUDE.md) opens with seven questions to answer **before** writing
anything. Do not skip them because the change looks small — the failure mode
they exist for is precisely the change that looked fine and broke an unstated
invariant.

The two that catch the most:

**Say it in one glossary sentence.** `shared/glossary.ts` is the single source
of product words (Law R6, machine-checked). If there is no word for what you
are adding, that is a glossary decision *first*. Never invent a synonym — Law
R34 reads the app's own copy for known synonyms and will turn the build red.

**Ask which Laws bite.** There are 38 of them ([RULES.md](RULES.md)), they are
machine-checked, and they are not advisory. The common ones, by what you are
touching:

| You are… | The Laws that bite |
|---|---|
| adding a non-GET route | R10 gate · R1 publish a live change · R15 a listener that hears it |
| reading a request body | R20 — every field through the validation seam, *positionally* |
| rendering a form | R4 FormShell · R7 draft |
| adding a collection | R14 bounded or properly paged · R16 exact count, once · R2/R3/R8 tabs |
| showing one record | R38 read it BY ID, never find it in a loaded page |
| saying any word to a person | R28 catalogue it · R33 wrap it in `t(…)` · R34 use the glossary's word |
| touching the agent or MCP | R9 parity · R19 filters · R22 body fields · R27 honest descriptions |
| a screen's layout | R29 one page width · R31 two radii · R32 every colour a token |

If you cannot tell whether a Law applies, `shared/rules/registry.ts` names each
one and points at the check that enforces it. Read the check — it is the
authority, not the prose.

---

## 2 · Make the change

Branch off `main`. **Never commit straight to `main`.**

```bash
git checkout -b fix/the-thing-that-was-wrong
```

Where the change goes, by kind, is the table in
[README.md](README.md) § *The documents* — and for a whole new module,
[BUILD-A-MODULE.md](BUILD-A-MODULE.md) is the end-to-end golden path with a
real worked example. Do not invent plumbing: every seam you need already
exists (the data door, `requireRight`, the validation helpers,
`publishChange`, `FormShell`, the screen recipes).

Two house rules that surprise people:

**Too much code is a defect.** This codebase is deliberately small and
well-layered. Add the least that solves the problem. A bug fix does not need
surrounding cleanup; three similar lines beat a premature abstraction.

**Comments carry the *why*, never the *what*.** Read almost any file here and
you will find long comments explaining what was tried and rejected, what a bug
report actually said, what a number cost. That is the house style and it is
load-bearing — it is how a decision survives the person who made it. What you
must not write is a comment restating the code.

---

## 3 · Prove it

```bash
npm run lang    # ONLY if you added or changed a user-visible sentence
npm run check   # always — this is the gate
```

`npm run lang` re-extracts every user-visible English string into
`shared/i18n-strings.json` and prunes it. Law R28 fails the build if the
catalogue and the code disagree, and both deploy scripts refuse on a stale
catalogue — so run it before you commit, not after the build goes red.

**Never run `scripts/i18n-translate.mjs` yourself.** It spends the owner's
Anthropic key per run. Extraction (`npm run lang`) is free and is what the gate
needs; translation is a separate, deliberate act.

If you changed a Law, or anything a Law names, you need **all three**: the rule
in RULES.md, the entry in `shared/rules/registry.ts`, and a check that enforces
it. `registry-integrity` fails the build otherwise.

**And write the check so it can actually fail.** Every source-scan here strips
comments before matching (the comments in this repo discuss the very seams
being scanned), matches a *call* rather than a word, and carries a tripwire
asserting it matched something at all. Then prove it: break the code on
purpose, watch the check go red, and put it back. A check that has never failed
is a check you have not tested. Several laws here needed three attempts before
they bit, and the files say so.

---

## 4 · Commit

Commit messages here are longer than most projects' and that is on purpose:
the subject says what changed, and **the body says why, including what was
tried and rejected**. Read `git log` for a page or two before writing your
first — the convention is obvious once you see it.

```
fix: the module that never saved

THE OWNER: "the ticket modules are not getting saved."

The ticket detail's edit handler REBUILT the payload field by field, and
`moduleId` was not among them. No error, a green "Ticket updated", and the
field came back unchanged.

TypeScript could not see it: a handler accepting FEWER properties is
assignable to one that supplies more, so the narrow parameter type HID the
omission instead of reporting it.

Co-Authored-By: Your Name <you@example.com>
```

- **Subject:** `type: lowercase sentence`. Types in use are `feat`, `fix`,
  `docs`, `chore`, `security`. Keep it descriptive — the median subject in this
  repo is 72 characters, not 20.
- **Body:** the reasoning. If a person reported the bug, quote them.
- **Last line:** the `Co-Authored-By:` trailer.

---

## 5 · Ship it

Deploying is documented in [OPERATIONS.md](OPERATIONS.md), and both commands
are plain npm scripts you can run yourself:

```bash
npm run deploy:staging
```

Staging shows **`main`** and nothing else, so whatever reaches it must already
be merged — otherwise the next person to deploy silently replaces your work
with theirs. Merge first, then deploy.

Production is **owner-gated**: do not deploy it without being asked to.

If a deploy goes wrong, [RUNBOOK.md](RUNBOOK.md) has the rollback commands, in
the correct order, plus the named triggers for when rolling back beats fixing
forward. Read it *before* you need it.

---

## When the docs cannot answer you

The bar this documentation set is held to is written into README.md: someone
with only this repository should be able to understand the base, rebuild it,
edit it safely, and extend it. **If you hit something the docs cannot answer,
that gap is a bug in the docs.** Fix it in the same change, in the document
that owns the topic — README.md § *One topic, one owner* says which one that
is.
