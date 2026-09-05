# COSTS.md — what this app costs to run

**Written 2026-09-05.** Every price below was read off the vendor's own public page on
that date and is repeated as data in [`shared/workers/pricing.ts`](shared/workers/pricing.ts),
which is what the code and the scripts compute from. **Nothing here was measured by
spending**: no billed model call, no benchmark run, no assistant turn was made to produce
this file. The measured figures come from tables the app already writes.

Before this file the repository held **no price at all** — `grep -rn '\$' *.md` returned
nothing, and every cost fact lived in a source comment or a test, in neurons and units
rather than money.

**Re-read the prices together, or not at all.** When a vendor changes one, change it in
`shared/workers/pricing.ts`, move `PRICES_READ_ON`, and re-run
`node --experimental-transform-types scripts/ai-spend.mjs` — the estate's real spend is
computed from those constants, so a stale rate is a wrong answer rather than a stale
comment.

---

## 1 · Every surface that bills — the whole list

Nine, and there is no tenth. Each one names the feature behind it and where it is called.

| # | surface | what it is for | where it is called | included / free |
|---|---|---|---|---|
| 1 | **Workers AI — the assistant** | every agent turn (`@cf/moonshotai/kimi-k2.6`) | `model.ts` (`env.AI.run`), through `selectModel` | 10,000 neurons/day per account |
| 2 | **Workers AI — knowledge answers + inline text** | R23's composed answer, summaries (`llama-4-scout`) | `shared/workers/model-text.ts` | same pool |
| 3 | **Workers AI — embeddings** | one vector per knowledge chunk (`bge-m3`) | `knowledge.ts` `embed()` | same pool |
| 4 | **Vectorize** | the account-wide knowledge index (R26) | `knowledge-vectors.ts` upsert/query/delete | 50M queried + 10M stored dims/month |
| 5 | **Resend (email)** | login codes, invites, member notices, client ticket + to-do mails, the growth alarm, the nightly ops digest | `shared/workers/notify.ts` | 3,000/month **and** 100/day |
| 6 | **Workers + D1** | every request and every write | everywhere | 10M requests, 50M row-writes, 5 GB |
| 7 | **R2** | uploaded files: knowledge documents, ticket attachments, learning media, brand assets | `storeImageDataUrl` and the bucket writes R40 censuses | 10 GB, 1M Class A ops, **zero egress** |
| 8 | **Durable Objects** | the realtime `TeamChannel` | `workers/realtime` | 1M requests, 400,000 GB-s |
| 9 | **Anthropic** | **development only**, from `scripts/` — `i18n-translate.mjs`, `agent-routing-bench.mjs` (historic), `kb-bench.mjs`, one backfill | never from a worker | none — the owner's PERSONAL key |

**Surface 9 is the one that had never been written down anywhere.** No worker in this
repository calls Anthropic; `no-quiet-downgrade.test.ts` asserts the adapter cannot come
back. But four scripts still bill the owner's own account, and one of them
(`i18n-translate.mjs`) has rate-limited it before. It is a development cost, not the
product's, and it belongs on the list precisely because a surface nobody has written
down is the one that surprises somebody.

### The prices, with their sources

| surface | price | source | read |
|---|---|---|---|
| Workers AI, over the free tier | $0.011 / 1,000 neurons; **10,000 neurons/day free** | developers.cloudflare.com/workers-ai/platform/pricing | 2026-09-05 |
| `@cf/moonshotai/kimi-k2.6` | $0.950 / M in · $4.000 / M out (86,364 / 363,636 neurons per M) | same | 2026-09-05 |
| `@cf/openai/gpt-oss-120b` (prior engine) | $0.350 / M in · $0.750 / M out (31,818 / 68,182) | same | 2026-09-05 |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | $0.270 / M in · $0.850 / M out (24,545 / 77,273) | same | 2026-09-05 |
| `@cf/baai/bge-m3` (embeddings) | $0.012 / M in (1,075 neurons per M) | same | 2026-09-05 |
| Vectorize | $0.01 / M queried dims (50M/mo incl.) · $0.05 / 100M stored dims (10M incl.) | developers.cloudflare.com/vectorize/platform/pricing | 2026-09-05 |
| Resend | free 3,000/mo **and** 100/day; Pro $20/mo → 50,000; overage $0.90 / 1,000 | resend.com/pricing | 2026-09-05 |
| Workers Paid plan | $5/mo; requests $0.30/M over 10M; D1 writes $1.00/M over 50M; D1 storage $0.75/GB-mo over 5 GB | `~/.claude/skills/cloudflare_usage/references/pricing.md` (from developers.cloudflare.com/workers/platform/pricing) | dated 2026-07 |
| R2 | $0.015/GB-mo over 10 GB; Class A $4.50/M over 1M; Class B $0.36/M over 10M; **egress $0** | same | dated 2026-07 |
| Durable Objects | $0.15/M requests over 1M; $12.50/M GB-s over 400,000 | same | dated 2026-07 |
| Anthropic (scripts only) | not priced here — it is not the product's budget, and no worker can reach it | — | — |

**Placeholders used: none.**

---

## 2 · What one action costs

### The measurement everything rests on

The assistant re-sends its whole preamble — the system prompt plus the tool catalogue —
on every model call in a turn. Reproduce it in one command, which makes no model call:

```
$ node scripts/measure-preamble.mjs
tools in catalogue  165
tool JSON           107,064 chars  (~28,011 tokens)
system prompt       25,464 chars  (~6,662 tokens)
PREAMBLE            132,528 chars  (~34,672 tokens)
ungated tools       52 of 165 carry no declared gate, so every caller gets them
trim FLOOR          63,659 chars  (~16,655 tokens)
```

Two independent checks agree with the 34,672:

- the **provider's own tokenizer**, recorded in `agent-routing-bench.mjs`'s header on
  29 Aug 2026: 775,265 input tokens over 22 one-call questions = **35,239 per step** (1.6% apart);
- the **account meter**, recorded in the same file on 30 Aug: ~880 neurons per question
  on gpt-oss-120b, which at 31,818 neurons/M input is ~27,700 tokens — the same order,
  for a catalogue that has grown since.

### One agent reply — **measured**, not estimated

`agent_usage_log` records the tokens the provider reported for every command
(core migration 0027). Read on staging, 2026-09-05, over the last 90 days
(`node --experimental-transform-types scripts/ai-spend.mjs --days 90`):

```
assistant commands  183 across 1 team
AI units metered    504
input tokens        7,194,070
output tokens         105,145
cache-read tokens   7,724,103
COST                $14.59      (~1,326,628 neurons)
per command         $0.0797
per AI unit         $0.0290
NOTE  56 of 183 commands carry no token counts (pre-0027 rows)
```

`$14.59 ÷ 127 commands that DO carry tokens = $0.1149 per reply.` The published-rate
estimate for a typical three-step turn is `$0.1093`, so the meter and the rate card agree
to within 5%.

**Worst case, from the code's own ceiling.** `MAX_STEPS = 12` (`agent.ts`), each step
re-sending 34,672 tokens, with tool results accumulating at `RESULT_CHARS = 2000`
characters (≈523 tokens) apiece:

```
input   12 × 34,672 = 416,064  + 523 × (1+…+11) = 34,518  → 450,582 tok × $0.950/M = $0.4280
output  12 ×    400 =   4,800                                        tok × $4.000/M = $0.0192
                                                          WORST TURN  =  $0.447
```

**The assistant is the most expensive action in the system by two orders of magnitude,**
and roughly 90% of a short turn's cost is preamble the question never needed.

### One signup

One login-code email; the D1 writes and Worker requests sit far inside the plan.

```
1 email × $20 / 50,000 (Resend Pro marginal) = $0.0004
```

At the owner's standing estimate of 1,000 signups/month: **$0.40/month.** The email is
the entire cost.

### One import

`plan_import` makes exactly one model call and passes **no tools**
(`selectModel(env).complete(messages, [])`, `import-agent.ts`), so the 107 KB catalogue
is not sent. `catalogPrompt` is not exported, so the prompt size here is **estimated,
not measured** — roughly 8,000 input and 1,000 output tokens:

```
8,000 × $0.950/M + 1,000 × $4.000/M = $0.0076 + $0.0040 = $0.0116 per import
```

At 500 imports/month: **$5.80/month.**

### One knowledge question

```
question embedding        ~20 tok × $0.012/M          = $0.0000002
Vectorize, two-stage      2,048 dims × $0.01/M        = $0.0000205
composed answer (only when `compose` is set, ANSWER_MAX_TOKENS = 900):
  ~4,000 in × $0.270/M + 900 out × $0.850/M           = $0.0018450
                                             TOTAL   ≈ $0.0019
```

**57× cheaper than an agent turn**, which is exactly what the two-model design intended.

### A month, per tenant

At the owner's standing volume estimate (24 Aug 2026 — an **estimate**, not a
measurement): 1,000 signups, 500 imports, 20,000 assistant replies per month.

| line | arithmetic | per month |
|---|---|---|
| assistant replies | 20,000 × $0.1093 | **$2,186** |
| …if every reply hit `MAX_STEPS` | 20,000 × $0.4470 | $8,940 |
| imports | 500 × $0.0116 | $5.80 |
| signup emails | 1,000 × $0.0004 | $0.40 |
| knowledge questions (say 20,000) | 20,000 × $0.0019 | $38 |
| plan base | — | $5 |
| everything else (requests, D1, R2, DO) | inside the included allowances at today's volume — see §4 | $0 |
| | | **≈ $2,235/month** |

**One line is 98% of the bill.** Any cost work that is not about the assistant's preamble
is rounding.

---

## 3 · What the scheduled work costs

Three crons. None of them makes an unbounded model call, and each exits cheaply when
there is nothing to do.

| cron | frequency | worst-case work per tick | cost per tick |
|---|---|---|---|
| **knowledge sweep** (`workers/content`) | every 15 min | `CRON_TEAM_CAP` = 200 teams × `INGEST_SOURCES_PER_TICK` = 25 sources | **$0 on a quiet tick.** Unchanged text is skipped on a content hash *before* any embedding call, so a tick with no new material makes no model call at all. A tick that re-embeds a full 25-source slice of ~5,000-char sources is `25 × 5,000 / 3.82 = 32,700 tok × $0.012/M ≈ $0.0004`. |
| **Google autopilot** (same tick) | every 15 min | `GOOGLE_SWEEP_PEOPLE_PER_TICK` people × `TRANSCRIPT_SWEEP_PER_PERSON`, `TRANSCRIPT_ATTEMPT_CAP` | Google's APIs are free at this volume; the cost is the embeddings a captured transcript then produces, priced in the row above. |
| **morning digest** (same worker) | daily | one email per staff member on a team with nobody on triage duty, capped at `SEND_FAN_CAP` = 100 recipients | `n × $0.0004`, so at most `100 × $0.0004 = $0.04/day` = **$1.20/month per team**. A 20-person agency is $0.24/month. This is the one job whose work grows with TEAM SIZE rather than with what changed — but it grows to a stated ceiling, past which the extra recipients are dropped and named in the log rather than silently sent to. |
| **nightly retention + size check + ops digest** (`workers/tenancy`) | daily, 03:10 UTC | `RETENTION_DELETE_CAP` × `RETENTION_PASSES_PER_TICK` deletes, `CRON_GROWTH_CAP` = 200 upserts, `CRON_ALERT_CAP` = 50 alarms, plus ≤ 4 bounded SELECTs and at most one digest email | D1 writes: ~250 rows = `250 / 1M × $1.00 = $0.00025`. Email: at most `1 + recipients × $0.0004`. **Under a cent a day.** |

**Nothing here scales with the dataset.** Every one is a rotating, bounded window with a
cursor; `teamSlice` warns in the log when the estate outgrows one tick.

---

## 4 · Storage, egress and what nothing deletes

### Measured, 2026-09-05 (read-only, against the live account)

**R2 — 138 MiB across nine buckets, 368 objects.**

```
kwapso-glide-archive-staging     78.71 MiB   194 objects
kwapso-internal-media-staging    32.42 MiB    59 objects
kwapso-media-staging             26.85 MiB   115 objects
every production bucket           0.00 MiB     0 objects
```

Against a 10 GB included allowance that is **1.3% used**, and every production bucket is
empty because the product is not live on it yet.

**D1 — the estate, from `db_growth` (the app's own nightly readings).**

```
team-01kzwxfd86n0k3rzrbhkmkrwys   131.86 MB   (was 126.71 MB 24h earlier — +5.15 MB/day)
kwapso-core-staging                 5.04 MB   (+0.01 MB/day)
team-01m0thfjc37525m1wd1ppwtpby     2.62 MB
team-01m16pj3dxhnzvpnbdgz9gx22p     1.22 MB
```

At 5.15 MB/day the busiest team database reaches the 80% alarm line (8 GB) in about
**1,530 days**. The alarm and the trend already exist (`sharding.ts`); this is the first
time the number has been written down.

**Vectorize — and this is the line to watch.**

```
9,173 knowledge chunks × 1,024 dimensions = 9,393,152 stored dimensions
```

The Workers Paid plan includes **10,000,000 stored dimensions**. **One team is at 94% of
the whole account's free allowance.** Past it, storage bills `$0.05 per 100M stored
dims/month` — so ten teams this size is `~94M dims = $0.047/month`, which is negligible
in money and worth knowing because it is the only allowance the current estate is close
to. Query cost is trivial: a two-stage search is 2,048 queried dimensions, and the plan
includes 50M/month, i.e. ~24,000 questions a month before a penny.

### Egress

**R2 charges nothing for egress, at all.** Every file this product serves — a client
downloading a ticket attachment, a staff member opening a knowledge document — costs the
Class B operation and the Worker request, and nothing for the bytes. This is the single
most load-bearing fact in this section and the project had never stated it.

### Nothing ever deletes a byte, and that is a decision nobody has made

There is **no `.delete(` and no `.list(` on any R2 bucket in the codebase**, and no
lifecycle rule anywhere. (Canary: the same search finds 10+ `.put(` and `.get(` sites, so
the pattern works — the zero is real.) Combined with deactivate-never-delete,
`KNOWLEDGE_FILE_MAX_BYTES = 25 MB` and `TICKET_FILE_MAX_BYTES = 10 MB`, **every byte ever
uploaded stays forever.**

Today that is 1.3% of an allowance, so it is not urgent — it is *undecided*, which is
different and worse, because the moment it matters the objects are already there.

**The slope, so the decision can be made with a number.** A team that deactivates one
25 MB knowledge document a week leaves `25 × 52 = 1.3 GB/year` of unreachable objects.
Ten such teams pass the 10 GB allowance inside a year and then bill
`13 GB × $0.015 = $0.20/month`, rising. The money is small; the fact that nobody can say
which objects are safe to remove is the real cost.

**This is the owner's call and is deliberately not taken here.** The two questions are:
does a deactivated record's file survive (deactivate-never-delete says the ROW does —
it says nothing about the bytes), and does a hard-deleted team take its bucket prefix with
it? Until they are answered, `wrangler r2 bucket info <name>` twice a week apart is the
measurement, and the numbers above are the first reading.

### Retention that DOES exist

D1 has real, enforced retention, swept nightly and bounded, reporting its own ceiling as
an error row when it cannot catch up: `ERROR_LOG_RETENTION_DAYS = 90`,
`AUTH_RETENTION_HOURS = 24`. R2 has none.

---

## 5 · Retries, failures and what a mistake costs

- **No billed model call is retried automatically, anywhere.** The client's four-retry
  incident on the agent POST is gone from `web/lib/api/`.
- Every retry in the system is bounded by a number in code: `RETRIES = 2` on the data door,
  `TRANSCRIPT_ATTEMPT_CAP`, the realtime client's 15-second backoff ceiling.
- `refundAiUnits` returns exactly the units a thrown model call bought nothing with — and
  since 2026-09-05 a refund that FAILS is recorded rather than swallowed, because a refund
  that never landed is money a customer paid for a turn they did not get.
- **The one unbounded retry left is an embedding outage.** A failed `embed` leaves
  `content_hash` un-stamped, so the sweep re-reads that source every fifteen minutes
  forever with no attempt counter. Each retry costs one embedding batch
  (`$0.012/M input`), so the money is trivial and the silence was not: as of 2026-09-05
  the failure is recorded to the error store with the number of chunks left without a
  vector. **An attempt counter is still wanted** and is a behaviour change, so it is
  written down here rather than made.

---

## 6 · What watches the meter

| watcher | fires | where |
|---|---|---|
| **per-team AI allowance** | *before* the expensive work, race-safe — the cap rides the INSERT's own `WHERE`, checked at the top of every loop iteration | `shared/workers/credits.ts` `consumeAiUnit` |
| **database 80% alarm** | once per NEW alarm, with the trend, by email to `ALERT_TO` | `workers/tenancy/src/lib/sharding.ts` |
| **nightly ops digest** | new + spiking error signatures, and teams at 80% of their AI allowance with no credits behind it, to the same `ALERT_TO` | `workers/tenancy/src/lib/ops-alert.ts` |
| **`scripts/ai-spend.mjs`** | on demand, read-only, in money | this repo |
| **`scripts/measure-preamble.mjs`** | on demand, no model call, with a canary that refuses to print a number it cannot stand behind | this repo |

**Two gaps, both deliberate and both the owner's to close.**

1. **Staging enforces no AI ceiling at all.** `AGENT_NO_DAILY_CAP: "true"` in the staging
   block of content, tenancy and data-ops. The flag exists on purpose so testing is never
   refused, and `credits-invariant.test.ts` keeps it off production. The in-rule fix is an
   **account-level neuron alarm** in Cloudflare, not removing the flag.
2. **Spend is visible in the app only in UNITS**, never in neurons or money. Changing that
   is a UI change.

---

## 7 · The one number that does not reconcile

`model.ts` records, off the account meter, *"16,593 neurons for both runs, about $0.18"*
for two 22-question bench runs — 44 model calls, i.e. **$0.0041 per call**. The published
rate for the same shape is **$0.0345 per call**, 8.4× higher.

Three of this repo's own measurements say the meter reading is the odd one out:

- `measure-preamble.mjs` — 34,672 tokens of preamble per call;
- the bench's own header, from the provider's tokenizer — 35,239 input tokens per step;
- the bench's own note, from the meter six days earlier — ~880 neurons per question on
  gpt-oss-120b **with this catalogue**.

kimi meters 86,364 neurons per M input against gpt-oss's 31,818 — 2.71× — so the same
question should meter roughly **2,400 neurons** on kimi, and 44 of them roughly 105,000,
not 16,593. `agent-routing-bench.mjs --dry` now derives that figure before you agree to
a run: **~65,877 neurons for ONE run.**

**The most likely explanation is the analytics window** — a meter read that missed most of
the calls looks exactly like a cheap run. It is not settled by reasoning. **It is settled
by running a known number of turns and reading `aiInferenceAdaptiveGroups` for exactly
that window.** Until somebody does, treat $0.18 as a floor of unknown depth and the
rate-derived figures in §2 as the ones to plan with.

*(The report that raised this blamed `neurons: usage.neurons ?? 0` in the bench. That
field is real and was fixed to report `null` rather than a silent zero — but nothing has
ever totalled it, so it cannot be the source of the gap. The $0.18 came from the account's
own analytics.)*

---

## 8 · What is still unmeasured, and what would settle it

1. **Whether a turn really costs $0.0345 a step or $0.0041.** → a known number of turns
   against `aiInferenceAdaptiveGroups` for that exact window.
2. **Actual production volumes.** Everything in §2's monthly table is a rate applied to
   the owner's estimate. → `scripts/ai-spend.mjs --production`, or the `cloudflare_usage`
   skill.
3. **What a cached prompt token actually costs on kimi.** Two thirds of September's
   prompt tokens came back cached (measured, §2), and Cloudflare publishes no cached rate
   for this model, so `pricing.ts` charges them at full input rate. Every figure here is
   therefore an **upper bound** on that line. → the account's invoice, or a published
   cached rate.
4. **The import-planning prompt's real size.** `catalogPrompt` is not exported, so
   `$0.0116` per import is estimated. → export it, or log `JSON.stringify(messages).length`
   on one real plan.
5. **R2's growth slope.** One reading exists (§4). → the same command a week later.

---

## 9 · Keeping this file true

- **Prices** live in `shared/workers/pricing.ts` with their source and `PRICES_READ_ON`.
  Change them there; this file quotes them.
- **`workers/data-ops/test/no-quiet-downgrade.test.ts`** reads every `wrangler.jsonc` off
  disk and fails the build if any pins an engine the code does not name, **or** an engine
  `pricing.ts` has no rate for. A cost report computed against the wrong rate card is
  confidently wrong, and it looks exactly like a right one.
- **`workers/tenancy/test/pricing.test.ts`** pins the arithmetic and the published
  constants, so a typo in a rate is a red build rather than a wrong invoice estimate.
- **Re-read the vendor pages together** and move `PRICES_READ_ON` in the same commit.
  A half-refreshed table is worse than a stale one, because nobody can say when the total
  was last true.

**Review this file whenever the assistant's engine changes, whenever a new billing surface
is added, and otherwise every quarter.** Last full review: **2026-09-05**.
