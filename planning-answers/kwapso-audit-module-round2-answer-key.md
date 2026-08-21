# Audit module · round two — answer key and reconciliation

Written 2026-08-21, before the round-2 form went out. Two things live here: the
private key for the seven comprehension checks, and the full reconciliation of
round one that the form is built on.

Round-one exports are beside this file:
`kwapso-audit-module-round1-aurora-2026-08-21.json` and
`kwapso-audit-module-round1-alaap-k-2026-08-21.json`. Source for the call
decisions is the 19 Aug meeting transcript (Gemini notes, 60 pages).

---

## 1 · The seven checks, and what a wrong answer means

A failed check is never a failed respondent. It is a design instruction: the
screen has to make that distinction obvious, because a smart person reading
carefully got it wrong.

| id | right answer | a wrong answer means |
|---|---|---|
| `chk-wave2` | **Two waves** | The wave/sprint boundary has not landed. If either of them picks "two sprints" or "one wave with two sprints", the word is not doing its job and the UI has to show the containment (a wave card with its sprints nested inside it) rather than relying on the label. |
| `chk-extract` | **Nothing — the draft is not the record** | The confirm step is not believed. If the draft feels like it is already saved, people will not review it properly. The screen must look like a proposal, not like a record — different background, an explicit "nothing has been saved yet" line, and a single obvious confirm. |
| `chk-tools` | **€240 — the price on that date** | Time travel is understood for steps but not for money. Then the date control must visibly change the prices on screen too, not just the steps, or the number will be quietly wrong and nobody will notice. |
| `chk-baseline` | **Smaller by 20 minutes** | The negative-saving rule has not landed, even though both ticked it in round one. The savings panel then has to show the subtraction, not just the total — added time as its own line with a minus in front. |
| `chk-money` | **What our own hour costs us, and the margin** | Confusion between the three rate cards. The rate screens must be labelled by whose money it is, in the heading, not by table name. Note both of them got the round-one version of this right, so a miss here would be a real regression. |
| `chk-wave-price` | **€24,000 — what they were sold** | The sold-price / internal-split distinction is not clear. If either misses it, the wave screen must show the two numbers with different weight, and the internal one must never appear on the portal side. |
| `chk-portal2` | **Nothing she could not reach in the portal** | The client fence is thought of as a permission rather than a wall. Worth catching: if the person who owns the product believes an extra tick box can widen a client's world, the roles screen is mislabelling what it does. |

### The sync half — five more checks (chapters 11–18, added 21 Aug)

| id | right answer | a wrong answer means |
|---|---|---|
| `chk-two-kinds` | **The email only** | The two-tier split has not landed. App records always sync; only Google material is a choice. If this is missed, the settings screen must separate the two visually rather than listing eight services in one list. |
| `chk-services` | **His calendar and his Gmail** | The point of chapter 12 was missed — that Drive and Chat ask permission per item while Calendar and Gmail take everything. This is the check most likely to be failed, and failing it is the argument for the four per-service switches. |
| `chk-mail` | **No — the supplier is not a known contact** | The invisible Gmail rule is not understood, which is itself the finding: nobody can be expected to know a rule that exists only in the code. Whatever replaces it must be visible on the screen where you connect. |
| `chk-ownership` | **Nothing — the email is Alex's alone** | The private/shared line is not understood. If either of them expects Aurora to get the answer, that is a strong vote for `own-default` option two and it should be read as one. |
| `chk-chain` | **Only for Alex** — and "Yes, from the email" is *also* true | Deliberately two-true. "Yes, from the email" shows they understood that sources are independent but not that the email is private. Picking "No, removing the meeting removes everything" means the chain is imagined to exist, which is exactly what chapter 18 exists to correct. |

### Aurora's three items from 21 Aug

- **Stakeholders grouped by project lead and project operator** → `stakeholder-grouping`, chapter 03.
  Today an app's Stakeholders tab shows Ours and Theirs with the lead and main contact badged;
  this turns a boolean into a named role. Both `app_staff` and `app_stakeholders` already carry the flag.
- **Validation and refinement must not overlap** → `wave-no-overlap`, chapter 07. Proposed as a rule
  for that pair specifically rather than a blanket no-overlap, which would be wrong within a month.
- **The assistant should help plan waves and sprints** → `assistant-plan`, chapter 18. The permission
  already exists — the assistant acts as the signed-in person through the same gated doors — so what
  is missing is the tool and the confirm step, not the right.

---

## 4 · What the sync half is really asking

Four things drive every question in chapters 11–18, and all four were measured on staging on
21 Aug 2026 rather than assumed.

1. **1,501 of 2,735 sources came out of somebody's Google account** — 55% of what the assistant
   reads, almost none of it deliberately chosen.
2. **The four services are scoped four different ways.** Drive: 24 named folders. Chat: 21 named
   spaces. Calendar: hard-wired to `calendars/primary`, no selection possible. Gmail: one implicit
   rule in the code — mail to or from a known contact at one of the accounts.
3. **The private/shared line was never drawn.** All 435 emails and all 471 events carry
   `owner_user_id` and are readable only by their person; 496 of 500 Drive documents carry none and
   are readable by the whole team. Nobody decided that.
4. **471 calendar events and 443 meetings describe the same conversations.** An eighth of the corpus
   is bare calendar titles competing with real passages, which is part of why answers came back thin.

Three limits inside Drive that nobody chose either: **50 files per folder**, **no sub-folder walk**,
and an **8 MB per-file cap** (that last one added 21 Aug, and it is the only one that was a decision).


---

## 2 · Round one, reconciled

**35 agreed · 21 split · 3 where one side left it blank.**

### 2.1 · The tie-breaker

Alaap's rule, given 2026-08-21: **architecture → Alaap; features, UI, how data
is displayed → Aurora.** Every proposed resolution below is built on it, and the
form's first question lets them overturn it. Where the proposal goes against the
rule, it says so and says why.

### 2.2 · The twenty-one splits

| id | Aurora | Alaap | kind | proposed | why |
|---|---|---|---|---|---|
| `audience` | plain English | technical | meta | both — plain body, marked technical asides | not a product decision |
| `role-dept` | exactly one | several | arch | **several** | one-to-many → many-to-many later is a migration; the reverse is deleting a table |
| `tool-fields` | 3 + icon | 6 | feature | **union, extras behind a toggle** | columns are free, form space is not, and Aurora is the one looking at it |
| `tool-cost-history` | not sure | keep dated | arch | **keep dated** | without it, time travel prices March's steps at today's rates |
| `rate-visible` | client sees | client does not | arch/security | **hidden**, with the switch offered | portal visibility is a security decision, but Aurora's reasoning is strong |
| `step-status` | original/changed/removed (+new) | keep/automate/eliminate | feature | **both, as two fields** | not two answers — one is derivable history, one is intent nothing else records |
| `step-cost-live` | recompute live | freeze | arch | **freeze per revision** | a revision records what was true on a date; the rate is part of that |
| `step-tools` | one | several | arch + UI | **several stored, one shown** | Aurora's reason was readability, which is a picture problem |
| `step-frequency` | per month | per-step period | arch | **per-step period** | real cost: every savings sum must normalise to one unit first |
| `what-triggers` | manual only | + story completion | scope | **genuinely contested — escalated** | the call went Aurora's way, with Alex agreeing; Alaap's form reversed it |
| `baseline-def` | earliest per step | one audit date | arch | **audit date on the process** | matches the call, and "earliest per step" lets a typo fix become a baseline |
| `wave-fields` | kind, goal, ref, derived dates, customer | name, customer, price, goal, ref | feature | **union** | Aurora not ticking "a name" reads as an oversight — confirmed in the form |
| `wave-price` | on the wave | sprint → wave rollup | arch | **both, allowed to differ** | the offer number and the internal allocation genuinely are two facts |
| `wave-portal` | name + dates only | full as sold | arch/security | **everything except the sprint split** | they paid the wave price; the split is next door to our margin |
| `portal-detail` | everything but our numbers | + times and frequency | feature | **Aurora's** | it is a display decision and hers already contains his |
| `story-link` | out, leave room | in | scope | **genuinely contested — escalated** | same conflict as `what-triggers`; biggest scope risk to the 25th |
| `cut-order` | 5 items | 7 items | scope | **re-asked with 2 new items** | Alaap's is a superset; the two new items change the arithmetic |
| `flowchart-first` | editable canvas day one | read-only + form | UI vs scope | **read-only first — against the tie-breaker** | justified by Aurora's *own* note on `alex-ready`, not by precedence |
| `alex-ready` | "enter the data, show nothing" (note) | all + live savings | feature | **Aurora's** | she is closest to Alex, and it de-risks the date substantially |
| `migration-risk` | 3 concerns | 4 concerns | — | union | not a decision |
| `stop-using` | 2 + **the AI note** | 4 | — | the note is the finding | see below |

### 2.3 · The three blanks

- **`chk-rate`** — Alaap left it blank and wrote "my instinct just says this cost
  would belong at the role level, correct?" He is right and it is consistent
  with his own `audit-rate-level` answer. No conflict; it was a moment of
  doubt, not a disagreement. **Answer: role level, on the new third rate card.**
- **`date-control`** — Aurora blank with the note "slider + date field"; Alaap
  picked the slider. Union: **both.** Aurora wins on UI anyway.
- **`chk-savings`** — Alaap blank, "whatever Aurora says". Aurora got it right
  (the R25 caption). **Locked.**

### 2.4 · What neither of them was asked

Ordered by how much each one changes the build.

1. **The data is not typed in — it is extracted by AI from a call transcript.**
   Aurora's note on `stop-using`. This is the primary input and round one
   assumed a form. Chapter 02 of round two exists entirely for this. It also
   explains the call: Alex has a self-built transcript tool whose storage Aurora
   does not trust, and this replaces it.
2. **Branching and rejoining cannot be stored the way steps are stored today.**
   `process_steps.position` is an integer — a straight line. Both of them asked
   for any-number branching *and* rejoining, which needs an edges table. This
   would have been discovered mid-build. Chapter 04.
3. **The permission matrix.** Alaap flagged it himself in a notes box on an
   unrelated question. New module, new rights. Chapter 08.
4. **Twelve processes, ninety-eight steps and twenty-four versions already
   exist** in staging. Retiring versions is a migration, not a fresh start.
   Chapter 05.
5. **Per-step frequency forces unit normalisation** on every savings sum before
   anything can be added up. Chapter 06.
6. **Cycles.** Real processes loop on rejection. A looping graph breaks both the
   renderer and the arithmetic unless it is handled deliberately.
7. **Rate corrections.** If a revision remembers its rate, a mistyped rate is
   wrong forever unless there is a deliberate way to rewrite it.
8. **Deleting a step** versus marking it removed — the codebase is
   deactivate-never-delete, but a typo two minutes old is not history.
9. **Wave with no sprints yet** — the normal case, since the sale comes first.
10. **Whether process maps join the knowledge base** so the assistant can answer
    from them.

### 2.5 · Where the transcript disagrees with a form

Worth watching in round two, because the form is later than the call and
therefore wins on its face — but two of these are decisions three people made
together and one person then changed alone.

- **Build method.** On the call Aurora described picking what a step comes
  **after**. Her form note says pick what comes **before**. Re-asked.
- **Story-to-step linking.** On the call Alex said "not with the connection" and
  Aurora agreed to defer it until tickets and stories are solid. Alaap's form
  ticked it in, twice (`story-link`, `what-triggers`). Escalated rather than
  resolved by precedence, because a two-to-one call decision is not the same
  kind of thing as a split between two form answers.
- **Separate audit app.** Aurora floated it on the call; Alaap declined; both
  forms agree. Settled, recorded as a `decided` card.
- **Versions.** Alaap defended process versions on the call and then agreed to
  dated history. Both forms confirm. Settled.

---

## 3 · What round two must come back with

Four answers unblock the build; everything else can be decided during it.

1. `flowchart-first-2` and `alex-ready-2` — together these decide whether the
   25th is comfortable or impossible.
2. `what-triggers-2` / `story-link` — the largest scope item, and the one where
   the call and a form disagree.
3. `graph-shape` — the table cannot be written until this is answered.
4. `migration-versions` — whether the existing 12 processes are real.
