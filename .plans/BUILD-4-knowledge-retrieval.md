# Build 4 — the knowledge base's retrieval, measured

**This document is the evidence.** The code comments in
`workers/content/src/lib/knowledge*.ts` cite it by name; if a number here and a
number there disagree, this one is wrong and should be re-measured, because the
harness that produced it is kept and it runs in about four minutes.

The brief was the owner's: *"one of the most powerful, accurate knowledge bases
we ever built"* — better than NotebookLM — with 5–7 extra seconds per query and
$4–5/month more explicitly authorised. **Trust before speed.**

---

## 1 · The harness

`kb-book-test.mjs` (kept in the session scratchpad; it depends on nothing in the
repo but `knowledge-text.ts`, which it imports so the "before" arm really is the
shipped code, down to the int8 quantisation).

| | |
|---|---|
| corpus | 7 whole public-domain books — Moby-Dick, Pride and Prejudice, Frankenstein, On the Origin of Species, The Art of War, A Tale of Two Cities, The Republic |
| size | 5,564,863 characters → **7,441 chunks** with the shipped chunker |
| embeddings | **real** — Workers AI `@cf/baai/bge-m3`, 1024 dimensions, over the REST door |
| questions | **142**, in two sets |
| — generated | 120. A seeded random sample of chunks; a model was asked for a question that chunk answers and told not to reuse its distinctive words. Ground truth is the chunk it came from, so it is objective and n is large. |
| — hand-written | 22. Written by a person about things these books are known for, each anchored to a phrase the harness VERIFIES exists in the corpus and matches at most 6 chunks — a bad anchor stops the run rather than quietly becoming ground truth. |

**Reading the numbers.** `recall@6` is "was the right passage in the six an answer
carries". `precision@6` has a ceiling below 100% and it is printed beside it: most
questions have exactly one gold chunk, so six returned passages can be at best
one-sixth gold (16.7%). MRR is the usual mean reciprocal rank.

Both arms were given the IDENTICAL chunk set — which flatters the old design,
since in production it could not have ingested these books at all (see §5).

---

## 2 · The headline

```
                                recall@1   recall@6   precision@6   MRR
  BEFORE — as shipped             16.9%      46.5%     7.7% of 19.1%  0.279
  AFTER  — as now shipped         35.9%      62.7%    10.6% of 19.1%  0.457
```

On the 120 paraphrased questions: recall@6 **52.5% → 69.2%**, recall@1 **20.0% →
41.7%**. On the 22 hard hand-written ones: recall@6 **13.6% → 27.3%**, and
recall@1 **0.0% → 13.6%** — the old design never once put the right passage first.

**And the number that says why.** On **40 of 142 questions (28.2%)** the right
passage was never handed to the old design's vector stage at all: the lexical
prefilter did not contain it and the newest-chunks top-up did not reach it. No
ranking change inside that architecture could have found those. The prefilter was
not a performance choice, it was a ceiling.

---

## 3 · What was tried, and what each idea was actually worth

Every row is the SAME corpus, questions and embeddings, changing one thing.

```
  (a) SEVEN WHOLE BOOKS — 7 large records
                                    recall@1  recall@6   MRR
  BEFORE — shipped today              16.9%    46.5%    0.279
  vector alone                        38.0%    62.7%    0.473
  vector, chunk knows its source      36.6%    62.7%    0.461
    + lexical as an EQUAL peer        25.4%    53.5%    0.347
    + lexical at 1/4 weight           27.5%    62.0%    0.408
    + lexical only when exact         35.9%    59.9%    0.443
  router NARROWS to top 1 record      19.7%    34.5%    0.252
  router NARROWS to top 3             31.7%    49.3%    0.383
  router PREFERS top 3 records        23.9%    55.6%    0.359
  + cross-encoder re-rank (pool 24)   19.0%    47.9%    0.288
  + cross-encoder re-rank (pool 50)   15.5%    41.5%    0.241
  THE SHIPPED PIPELINE                35.9%    62.7%    0.457

  (b) THE SAME TEXT AS 250 SMALL RECORDS — the shape the real base has
  vector alone                        38.0%    62.7%    0.473
  vector, chunk knows its source      14.1%    38.7%    0.227
  vector, chunk knows its NAME only   31.7%    59.2%    0.414
  router NARROWS to top 1 record       7.7%    10.6%    0.092
  router NARROWS to top 10            17.6%    23.9%    0.197
```

Four of my own ideas were measurably wrong. Each is recorded where it would
otherwise be re-added:

- **Fusing lexical and vector as equals costs 9 points.** The word match's hundred
  best guesses at an ordinary question are long chunks full of ordinary words, and
  an equal vote puts them above the passage that answers it. Shipped: a tenth of a
  vote, and only when the question contains something exact.
- **Embedding a chunk with its record's summary in front of it costs 24 points**
  at record shape. Thirty chunks sharing a 400-character preamble resemble each
  other more than they resemble any question. With just the record's NAME it is
  neutral at book shape and −3.5 at record shape. Not shipped.
- **Letting the router touch the ranking is worse in every configuration** — as a
  preference (−7) and catastrophically as a narrowing (−28 to −52). A router is a
  GUESS about which notebook, and a guess in front of the search can hide the
  answer completely. Shipped: the summaries are built and searched, and what they
  find rides the ANSWER (`records`) rather than the ranking.
- **The only re-ranker Cloudflare offers makes it worse** (`@cf/baai/bge-reranker-base`:
  62.7% → 47.9% at pool 24, → 41.5% at pool 50; the v2 / large / jina model ids all
  return "no route for that URI"). Not shipped. The seam it would slot into is
  `rankPassages`, and the latency budget for it is still unspent.

## 4 · The relevance floor

A vector search always returns something, so "we have nothing on this" had to
become a decision with a number behind it. Measured against 142 answerable and 16
deliberately unanswerable questions:

```
  answerable questions      min 0.507   5th pct 0.550   median 0.624
  unanswerable ones         max 0.519   95th pct 0.505  median 0.459

  floor   answerable still answered   unanswerable correctly refused
  0.40             100%                          13%
  0.45             100%                          38%
  0.50             100%                          88%
  0.55              95%                         100%
```

Shipped: **0.50** — the last floor that costs nothing. It belongs to the MODEL,
not to the app, so it is `KNOWLEDGE_MIN_SCORE` and it is measured again whenever
`KNOWLEDGE_EMBED_MODEL` changes.

## 5 · The ceiling, which is a separate failure

Retrieval quality was only half of it. In production the old door refused any
source body over `TEXT_LIMITS.long` — 20,000 characters, about eight pages — and
the chunker silently stopped at 200 chunks after that. So of this 5.5 MB corpus,
the old design could have ingested **0.36%** of it, and would have said nothing
about the rest. Two whole books really were refused on staging.

Now: the door accepts 1.5 MB of text (~600 pages) as a bound parameter, refuses
anything larger IN WORDS with both numbers and saves nothing, and indexes what it
accepts in resumable 300-chunk slices. A 300-page contract goes in whole, inside
the request that added it, and is answerable from page 270 —
`workers/content/test/knowledge-ceiling.test.ts` does exactly that.

## 6 · What would change my mind

- **A measurement on the agency's own material.** This corpus is seven English
  novels; the real one is bilingual German/English tickets, transcripts and mail.
  The contextual prefix in particular is argued for exactly where this corpus is
  weakest — three hundred tickets that all say "we tried again and it still
  failed". The harness takes any corpus.
- **A stronger re-ranker on Workers AI.** The budget for it is authorised and
  unspent, and the seam is one `env.AI.run`.
- **A bigger hand-written set.** 22 questions is 4.5 points per question; the
  hand-written column should be read as a direction, not a measurement.
- **Chunk overlap**, which was not tried at all and is the cheapest remaining
  idea: a fact split across a chunk boundary is currently in neither chunk.

---

## GHOST IDS IN THE VECTOR INDEX — measured 27 Aug 2026, NOT fixed

The largest un-repaired defect in retrieval, written down here because the lane
that found it routed around it rather than fixing it, and the next person will
otherwise re-derive it from scratch.

**The measurement**, against `kwapso-knowledge-staging`, team
`01KZWXFD86N0K3RZRBHKMKRWYS`:

| question | neighbours over the floor | how many exist in D1 | first survivor |
|---|---|---|---|
| "What did we agree in the week recap?" | 100 of 100 | **15** | rank 17 |
| across the 20-question bench, earlier | 306 | 255 | — (17% ghosts) |

A ghost is a vector whose `source_id` is not in `knowledge_sources` at all — not
retired, absent. Re-indexing replaces a source's chunks with new ids and the old
vectors are not always removed, so the index accumulates them.

**Why it is not merely cosmetic.** R26 makes a ghost SAFE to meet: it reads back
as no row, never as somebody else's paragraph. It does not make it free. A ghost
is still a nearest neighbour, so it takes a slot at the top of the ranking, and
the top of the ranking is the worst place to lose slots. On the question above it
consumed 16 of the ranking pool's 24 places and the base refused a question it
holds two 96-chunk transcripts of.

**What was done instead.** `RANKING_POOL` was raised from 24 to 100 — the whole
candidate list — so the pool is a budget for attrition rather than a guess. That
routes around the ghosts and does not repair them; every one still costs a slot.

**What repairing it needs.** Vectorize has no "list every id" call, so the ghosts
cannot be enumerated from the index. The two honest routes are a full re-index
(every live chunk re-upserted by id, which overwrites, and the orphans left to be
deleted by derived id from a source census) or a rebuild of the index. Both are
the full re-index reserved for the chunk-first ingestion branch, which is why
this was left alone.

**How to watch it.** `scripts/kb-bench.mjs` can be extended with a flag that
reports, per question, how many hits over the floor read back as no row — about
fifteen lines. A lane whose job is moving this percentage should add that in its
first commit rather than half way through, so the number is tracked from the
start rather than measured once.

---

## READING A PDF PROPERLY — scoped 27 Aug 2026, then RETRACTED the same day

> **DO NOT BUILD WHAT THIS SECTION RECOMMENDS.** Everything below about a
> `/ToUnicode` CMap parser is correct about WHY the Drive lane's PDFs are glyph
> indices and wrong about what to do, because it was written without opening the
> upload door. Kept rather than deleted, because the diagnosis is still the
> reason the right fix works — and because a scope that was confidently wrong is
> worth leaving legible.
>
> **THE READER ALREADY EXISTS AND IS ON THE OTHER DOOR.** `extractFile`
> (`knowledge-files.ts`) converts an uploaded file with `env.AI.toMarkdown`, and
> its `CONVERTIBLE_MIMES` covers application/pdf, five image types, html, xml,
> xlsx/xls, docx, ods/odt, csv and numbers. It is proven on real material: a
> comment there records tuning it on "the first real document put through this
> door — a one-page runbook".
>
> So a PDF UPLOADED is read properly, and the same PDF sitting in a Drive folder
> goes to the hand-rolled `pdfText` and comes out as rubbish. Two readers for one
> format, and which one a file gets is decided by which door it walked through.
> Nobody chose that; it is what happens when the reader is picked at the call
> site instead of declared.
>
> They are also COMPLEMENTARY, which is the part that makes a registry pay for
> itself immediately rather than eventually: `toMarkdown` reads PDFs and images
> and cannot read `.pptx`; `file-text.ts` unzips `.pptx` correctly and cannot
> read a PDF or an image at all. Between them the base can nearly cover its own
> list today — it simply cannot do it from both doors.
>
> **The fix is a declared source-resolver registry** (see
> `.plans/BUILD-5-every-source-readable.md`): one table mapping type to reader
> with an ordered fallback, both existing readers registered against it, and both
> call sites asking the table instead of choosing. No new READING code for PDF or
> images. Smaller than the parser below, and every line of it deletes a decision
> rather than adding one.
>
> It is also the same lesson as everything else in this round: `toMarkdown`
> exists, works, and the Drive lane never asks it — *a predicate nobody calls is
> not a guard*. A declared table is what makes "was this reader asked, for this
> type, on this door?" answerable off the disk, which a call-site `if` can never
> be.

### The original scope, kept for its diagnosis

Asked for as a scope, not an implementation. The short version: **we already read
PDFs, and the missing piece is one specific thing.**

### What exists

`pdfText` in `workers/content/src/lib/file-text.ts` walks every
`stream … endstream`, inflates it, skips any stream with no `Tj`/`TJ` operator,
and scrapes the `( … )` literals out of the ones that draw text. That is the
right shape and it is about 40 lines.

### Why every PDF in this base still came out as mojibake

A PDF literal is bytes **in the font's own encoding**. When a document embeds a
SUBSET of a font — which is what InDesign, Word and every browser's "print to
PDF" produce — those bytes are glyph INDICES, not characters, and `(\x03\x11\x2f)`
is three glyphs of a font we do not have rather than three letters. Scraping the
literal gives exactly the printable-ish rubbish these rows hold.

The map back is the font's `/ToUnicode` CMap, an object inside the PDF that says
"glyph 3 is V, glyph 17 is o". Nothing reads it today. That single absence
explains why not one PDF in the agency's base extracts — 0.000 letter-shaped
tokens on all of them, powers of attorney and vectorised logos alike.

### What it would take

- **Find each page's fonts** (`/Resources /Font`), then each font's `/ToUnicode`
  stream. The stream is already inflatable by the code above.
- **Parse the CMap**: `beginbfchar` / `endbfchar` pairs and `beginbfrange` /
  `endbfrange` triples. It is a small, well-specified grammar — the whole of it is
  perhaps 80 lines, and the existing `drawnStrings` becomes "decode with this
  map" instead of "take the bytes".
- **Track which font is current** in the content stream (`/F1 9 Tf` selects it),
  because a page usually has several.

Roughly 150–250 lines of parsing beside what is there, no dependency, no WASM,
and it runs in a Worker exactly as the inflate already does. The alternative — a
vendored PDF library — is megabytes of WASM for a job that is this specific.

### What RE-INGESTS, and what does not

The question that decides whether this is a lane or a lane plus a migration. It
is a lane.

**Nothing is re-uploaded and nothing is re-filed by hand.** Every walk of the
Drive lane re-hydrates each file through `driveFileText`, and hydration REPLACES
the body — so the walk after this ships reads the same PDF, gets sentences where
it used to get glyph indices, computes a different content hash, and the
hash-skip stops skipping. `indexSource` then re-chunks it from the new text. The
row keeps its id, its compartment, its fence and its history.

**But only for files the walk still reaches**, and that is the one thing to get
right. The lane is `windowed` with a cursor over `modifiedTime`: a PDF nobody has
touched since it was filed sits behind the cursor. The windowed rewind re-walks
from the start when it catches up, so it is reached eventually — but the honest
mechanism, and the one every other change in this round used, is to BUMP
`textVersion` on the drive lane. That invalidates the stored cursor, the sweep
walks the window from the beginning, and every file is re-decided once. It is one
line and it is the difference between "the good ones drift back over days" and
"all of them, on the next tick".

**The cost of that bump** is one re-download of every file in the window, each
bounded by `DRIVE_BYTES_CAP` (8 MB) and the per-tick slice. 339 files were in the
owner's window on 20 Aug. That is a real, one-off cost paid over several ticks,
and it is the same cost the calendar and meeting bumps in this round already
paid.

**The rows are still there to re-fill**, which is why no prune was run — see the
self-healing note below. A retired row is one this work cannot reach.

### What happens when the CMap is absent or malformed

Three cases, and the rule is the same in all three: **fall back, never throw.**

- **No `/ToUnicode` at all.** Common for a font with a standard encoding, where
  the literal bytes ARE the characters and today's behaviour is already correct.
  So: no CMap means decode as now (Latin-1), which is exactly what the working
  path does today.
- **A `/ToUnicode` that does not parse**, or covers only part of the font. Decode
  every glyph the map covers and leave the rest as they are. A partial decode is
  a better answer than none, and the guard downstream is what decides whether the
  result is worth keeping — which is the point of having `readsLikeWords` in
  front of it: a half-decoded page that still reads as geometry is refused on its
  own merits rather than by this layer guessing.
- **A CMap stream that will not inflate.** Same as a content stream that will not
  inflate today: skip it, keep going. `pdfText` already has that shape and it
  should not gain a second one.

The failure mode this must NOT have is throwing: `driveFileText` runs inside an
uncaught loop over a whole named folder, and one awkward file taking the sweep
down with it is a bug this codebase has already had once and fixed (the 403 note
in `driveFileText` records it).

### The scanned page, stated rather than discovered

A scanned document has NO text layer — it is an image of a page. There is nothing
to decode, no CMap to read, and no amount of this work reaches it. `pdfText`'s
own comment already says an empty result there is the true one, and after this
change it stays true: the file will still score zero on `readsLikeWords` and will
still be refused.

**That is the boundary of this lane, and it should be said to the owner in
advance rather than found afterwards.** Two of his PDFs are the test: if
`Confia-Vollmacht_Unternehmen.pdf` and `Confia-Vollmacht_privat.pdf` read as
German after the change, they were digital documents and the work is done. If
they still read as nothing, they are scans of signed paper — which is entirely
likely for a signed power of attorney — and answering from them is an OCR
question with a different cost, a different provider and a different privacy
conversation, because the page would have to leave Cloudflare.

### What it costs and where it belongs

At INGEST, where extraction already happens: once per file, inside the same
bounded read (`DRIVE_BYTES_CAP`, 8 MB) and the same slice budget of 400 streams.
Not a sweep — nothing about it changes after the file does, and a sweep would pay
the cost again on every tick for no new answer.

### What it does NOT solve

A SCANNED page has no text layer at all, and no CMap work reaches it. That is
OCR, it is a different order of expense, and `pdfText`'s own comment already says
an empty result there is the true one.

### How to know it worked

The twelve PDFs of five chunks or more in `scripts/prune-unreadable-files.mjs`'s
dry run are the test set, and two of them — `Confia-Vollmacht_Unternehmen.pdf`
and `Confia-Vollmacht_privat.pdf` — are documents whose content is known to be
real German prose. Today they score 0.000 on `readsLikeWords`. If they clear it
after the change, the feature works; if they still fail, they are scans and
belong to the OCR question instead.

**This is why "retire the unreadable files" is not a substitute for extraction.**
Retiring one loses nothing that was ever answerable — but it loses the ROW, and
the row is what a re-extraction would re-fill.

---

## THE PATTERN THIS WHOLE ROUND KEPT FINDING

An instrument that is right about what it checks and silent about what matters.
It appeared at **three levels in one day**, each one measuring the level below and
each one wrong in the same way:

1. **The app.** Retrieval scored a placeholder and a transcript identically,
   because it ranked on similarity and they are equally similar.
2. **The bench measuring the app.** `kb-bench` scored those questions PASS,
   because its key matched a cited TITLE — and an empty placeholder for a meeting
   and the 92-chunk transcript of that meeting have the same title.
3. **The answer key measuring the bench.** Two of six `every citation on topic`
   failures were the key itself demanding the word in a TITLE, so the row
   understates the base.

And a fourth, in a test written to close the first three: a source census that
looked for an identifier in a file **without stripping comments**, so the comment
explaining why the call was there kept it green after the call was deleted. Seven
checks in `web/test/rules.test.ts` had that shape, three of them standing on Laws
of the Base.

### A principle this codebase has now reached twice, by different routes

`knowledge-google.ts` (the `forgetGoogleKind` note) puts it like this: *"A
person's decision is not enforced by a `deactivated_at` that must survive every
future housekeeping pass — it is enforced by the read never happening. A flag can
be flipped back by a pass nobody thought about; a read that does not occur cannot
be undone."*

R24 arrived at the same thing from the other end, about money: an internal rate
is kept off the client's side by an IMPORT that does not exist, not by a
condition that could be inverted or a permission that could be granted. *"A
condition can be inverted and a permission can be granted, an import cannot be
forgotten."*

Two laws now rest on it independently, and it was nearly broken a third time on
27 Aug: a prune that switched 131 rows off would have been undone by the next
walk, because the flag it set was one the sweep is entitled to flip back. What
made the artwork harmless in the end was not a flag at all — it was the read
returning nothing.

**Name it when the next rule needs it: prefer the absence of a read to the
presence of a flag.**

---

The lesson is not "check the code". It is: **when an instrument and a person
disagree, measure the instrument.** Every one of these was found by asking what
the check would say if the thing it guards were deleted — which is the only
question that distinguishes a passing check from a blind one.


---

## R42 — BUILT AND ENFORCED, NOT YET REGISTERED (27 Aug 2026)

**The law: every accepted source type resolves to a declared reader on EVERY
door, or to an honest refusal — and no door chooses its own.**

The table is `workers/content/src/lib/source-readers.ts`; the check is
`workers/content/test/source-readers.test.ts` and it runs in `npm run check`
today. What is NOT done is the ceremony that makes it a Law of the Base, and it
is left undone deliberately: registering it edits **CLAUDE.md**, and that file is
the owner's. A session should not add itself to the law-book on a colleague's
say-so.

Everything needed is below. Applying it is four edits and one command.

1. **`shared/rules/registry.ts`** — after the R39 entry:

   ```ts
   {
     id: "R42",
     dimension: "arch",
     law: "Every accepted source type resolves to a declared reader on EVERY door, or to an honest refusal — and no door chooses its own.",
     checkId: "declared-readers",
     status: "enforced",
   },
   ```

2. **`web/test/rules.test.ts`**, the `known` set in *every enforced law has a
   known check* — add `"declared-readers", // R42: workers/content/test/source-readers.test.ts`.

3. **`RULES.md`** — one row after R39, id `R42`, dimension `arch`, check
   `declared-readers`, status `enforced`, with the paragraph below. It is
   deliberately written for somebody who was not here: the owner authorised this
   law with the words *"I don't know what this means, but if you've done it and
   it makes sense, then go ahead"*, and a law waved through on trust owes its
   reader a plainer explanation than one argued over, not a more technical one.

   > **Earned 27 Aug 2026.** The app had two different pieces of code for reading
   > a file and nothing saying which to use, so the answer depended on which way
   > the file came in. A PDF uploaded through the app was read properly. The same
   > PDF sitting in a Drive folder came out as gibberish — every PDF in the
   > agency's own knowledge base scored zero on any test of whether it held
   > words, the powers of attorney exactly like the logo artwork. Nobody chose
   > that. Each door had picked a reader at the moment it needed one, and the two
   > moments were months apart. Asking one table instead also gave the upload
   > door PowerPoint, which the other reader could always handle, without a line
   > of new reading code.
   >
   > **Why it is a law and not a tidy-up:** *reusability*, which is one of the
   > three standpoints this base is judged on. Adding the next file format is one
   > entry in one table, rather than an archaeology exercise across two doors to
   > find out what each already does — and that is the difference between a base
   > you can fork for a different product and one you can only inherit.
   >
   > **The load-bearing clause is the last one** — *no door chooses its own*. The
   > check censuses both doors off the disk and fails if either names a reader
   > the table did not give it, because a predicate nobody calls is not a guard
   > and a table nobody asks is not a registry.
   >
   > **Provenance.** Written by the session that found the defect, enforced by
   > its own check before it was registered, and held UNREGISTERED until the
   > owner authorised it in his own words. A Law of the Base carrying a session's
   > signature on the constitution it is bound by would be the wrong precedent,
   > and the record of that not happening is worth more than the law.

4. **The `R1–R39` range**, which `doc-claims` will name for you the moment the
   registry moves: `CLAUDE.md`, `README.md`, and BUILD-1/2/3 in this folder.

Then `npm run check`. The check is what fails if any of it is missed — which is
the point of the keystone rule, and the reason this handover is safe to leave
half-applied: the LAW is enforced now; only its entry in the book is pending.

### Why the last clause is the load-bearing one

Two readers existed for years and both were correct. The defect was that neither
door asked anything — each picked at the call site — so the same file got a
different answer depending on which way it came in. The check therefore censuses
both doors off the disk, with comments stripped, and fails if either names a
reader the table did not give it. *A predicate nobody calls is not a guard, and a
table nobody asks is not a registry.*
