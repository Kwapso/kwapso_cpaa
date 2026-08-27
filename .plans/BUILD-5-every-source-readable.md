# Broad goal — read every source Gemini Notebook reads

Set by the owner 2026-08-27, as a STANDING goal beside accuracy, not a request:

> If Gemini Notebook can read different data sources, so should you. If it can
> read YouTube videos, so should you. If it can read Loom or teller video links
> and get the transcript, so should you. … figure out all the features and
> figure out a robust, scalable, powerful, effective, optimised way to include
> them in our RAG vector system.

So the measure is not a feature list we finish. It is: **a person puts a thing in
front of the knowledge base and the knowledge base can read it.**


> ## CORRECTED 2026-08-27, hours after writing. Items 1, 3 and 5 below were WRONG.
>
> This plan was written from a census of what the base HOLDS and never opened the
> upload door. `kwapso-cpaa-b2` did, and found the real defect, which is not a
> missing reader:
>
> **THERE ARE TWO READERS FOR THE SAME FORMAT, AND WHICH ONE A FILE GETS IS
> DECIDED BY WHICH DOOR IT WALKED IN THROUGH.**
>
> · UPLOAD (`knowledge-files.ts:246`) → `env.AI.toMarkdown` — Cloudflare's own.
>   Reads PDF, jpeg/png/webp/svg/gif/bmp (with description), html, xml, xlsx/xls,
>   docx, ods, csv, numbers. **No pptx.**
> · DRIVE (`google-api.ts:696`) → `extractFileText` → the hand-rolled `pdfText`.
>   PDF comes out as glyph indices; `image/*`, `video/*`, `audio/*` are `opaque`.
>   **But it DOES read pptx** (`OFFICE_EXTS = [".docx", ".xlsx", ".pptx"]`).
>
> So they are COMPLEMENTARY, and between them this base can already read nearly
> everything the table below calls missing — it just cannot read it from both
> doors. Verified off the source, not taken on report.
>
> **What that corrects:**
> · ITEM 1 — a 150-250 line CMap parser is NOT needed and must not be built. The
>   working PDF reader already exists; the Drive path does not ask it.
> · ITEM 3 — `.pptx` is not missing. It is the one case where the hand-rolled
>   reader is AHEAD, because the converter does not list PowerPoint.
> · ITEM 5 — images→vision is not new work. It ships today on uploads and is
>   `opaque` on Drive.
>
> **And it makes the registry a repair rather than a precaution.** The failure
> this plan says to avoid — "ten formats each bolted on where it was convenient"
> — HAS ALREADY HAPPENED, with two. Nobody decided a Drive PDF should be read
> worse than an uploaded one; that is what you get when the reader is chosen at
> the call site instead of declared. R42 is therefore: **every accepted type
> resolves to a declared reader on EVERY door, or to an honest refusal — and no
> door chooses its own.**
>
> **One rule in this plan is also wrong.** "Reading is not free and must not be
> synchronous" is too strong: `extractFile` calls `toMarkdown` ON the request
> with a 20-second timeout, and that is right — the person is standing there, and
> the door's honest "kept but not searchable" message depends on having tried.
> The rule that survives both cases is **a read must be idempotent and
> re-runnable**. The sweep gets that from windowing and the hash-skip (proved in
> `d32ad4fe`: change what a reader returns, the body empties, the hash stops
> matching, the source re-chunks); the upload gets it by leaving a row a later
> sweep can read again. Expensive readers — vision, transcription — still belong
> on the sweep, for cost and latency, without making the upload door mute.
>
> **The corrected order** is: (1) make both doors ask the same declared table —
> which repairs PDFs and Drive images at once and needs no new reading code;
> (2) a web page by URL, still the widest genuine gap; (3) Loom/YouTube, subject
> to the dependency decision below; (4) audio; (5) diagrams inside PDFs.
>
> **And the dependency decision is ONE question, not two.** This plan put Loom
> ahead of YouTube as the safe one because its transcript needs no auth. No auth
> is not the same as supported: `GetVideoSSR`/`FetchVideoTranscript` is an
> undocumented internal API that can change without notice or version, which is
> the same class as YouTube's `timedtext` and a different class from
> `toMarkdown`, which is Cloudflare's own and already in the stack. Put it to the
> owner once: **may the knowledge base depend on endpoints nobody promises us?**

## Where we stand — measured, not assumed

The base holds 4,022 live sources. Fourteen kinds, and thirteen of them are
MIRRORS of our own tables (ticket 2,046 · email 431 · story 327 · task 256 ·
meeting 224 · account 132 · sprint 110 · message 93 · contact 87 · event 47 ·
app 28 · process 15 · todo 1). Exactly ONE kind is a thing a person brought:
`document`, 225 sources and 4,302 chunks — the largest chunk count in the base.

So the whole "bring your own material" surface is one kind, and it is the one
that does not work.

### What `document` actually reads today

READABLE (`knowledge-files.ts`): pdf · docx · xlsx/xls/xlsb/xlsm · ods · odt ·
numbers · csv · tsv · json · xml · yaml/yml · md · txt · log · rtf · html/htm.

`file-text.ts:74` — **`image/*`, `video/*` and `audio/*` are classified
`opaque`**: accepted, stored, never read. There is no OCR, no vision call, no
transcription anywhere in `workers/content/src/lib/`.

And PDF, the format most of that surface is, is READ AND WRONG. `pdfText` walks
and inflates the streams correctly; it is defeated by subsetted fonts, where a
literal is glyph INDICES rather than characters and the map back is the font's
`/ToUnicode` CMap, which nothing reads. Every PDF in the base scores 0.000 on
letter-shaped tokens — the powers of attorney exactly like the logo artwork.

## The gap against Gemini Notebook

| It reads | We do |
|---|---|
| PDF text | read, and wrong — the CMap fix is scoped |
| PDF diagrams and images | nothing |
| Images, incl. handwriting and brochures | stored, never read |
| YouTube (captioned) | nothing |
| Loom / video links | nothing |
| Audio | stored, never read |
| A web page by URL | **no paste-a-URL path exists at all** |
| Google Docs/Sheets/Slides, Drive URLs | partly, via the Google lane |
| .docx, .xlsx, .ods, .odt, csv, md, txt, html | yes |
| .pptx | missing — same machinery as .docx |
| ePub | missing |
| Deep Research (agentic web research → report + sources) | nothing, and it is a FEATURE not an ingest |

## The architecture this needs — one seam, not ten special cases

The failure to avoid is ten formats each bolted on where it was convenient. The
shape already half-exists and should be finished deliberately:

**A SOURCE RESOLVER REGISTRY.** One declared table mapping a source — bytes plus
a declared type, or a URL — to the reader that turns it into text. Each reader is
small, independently testable, and DECLARED rather than discovered. Three
properties fall out of that and none of them survives the bolt-on approach:

1. **One place to add a format.** The next one is an entry plus a reader.
2. **A law can stand on it (R42 candidate).** Every accepted source type resolves
   to a reader or to an honest refusal. The vocabulary already exists — the door
   has a "stored, not searchable" state and `indexableText` returns nothing for a
   file it could not read. Today that state is reachable and under-used; a law
   makes it the only alternative to reading.
3. **The 2026-08-27 lesson is designed in**: a predicate nobody calls is not a
   guard. The registry is what makes "was this asked?" checkable off the disk.

**Reading is not free and must not be synchronous.** Vision and transcription are
per-file model calls with real cost and real latency. They belong behind the
existing sweep, not on the upload request — the sweep is already windowed,
already rewinds, already hash-skips. The upload stores and marks; the sweep
reads. That also means a failed read is retried rather than lost, and a new
reader can re-read what an old one could not (which is exactly what the PDF fix
needs for the 225 documents already stored).

**Every reader states its own boundary.** A scanned page has no text layer; that
is OCR and a different order of expense. Saying so in the reader is what stops
the next person assuming it was covered.

## Order, by value over effort

1. **PDF text** — the CMap fix. 150–250 lines, no dependency, at ingest. Repairs
   the largest kind in the base. Scoped already.
2. **A web page by URL** — we have the HTML reader; there is no door that accepts
   a URL. Smallest gap with the widest use.
3. **`.pptx`** — the same OOXML unzip as `.docx`, which works.
4. **Loom, then YouTube.** Loom's transcript is a public GraphQL call, no auth
   (parse the 32-hex id → `GetVideoSSR` + `FetchVideoTranscript`). YouTube has NO
   official API for a video you do not own; it is `timedtext` or a paid service —
   a real dependency decision, and the first one on this list.
5. **Images → vision.** Workers AI has vision models; this is a describe-and-index,
   and it is what makes a photographed document or a diagram searchable.
6. **Audio → transcription.** Workers AI Whisper. Per-minute cost; belongs in the
   spend review before it ships.
7. **PDF diagrams** — extract embedded images and run 5 over them, rather than
   rendering pages, which needs a library this stack should not carry.
8. **Deep Research** — not ingestion. A separate agentic feature; do not fold it in.

## What must not be lost

- **R26** — every read stays namespaced and the words come out of the team's own
  database. A new reader does not get a new fence.
- **R14/R16** — a source of 500,000 words is a paging and counting problem, not
  only a reading one.
- **The substance rule** (2026-08-27) — a chunk that adds no words to its own
  title can never take an answer slot. A bad reader now produces a harmless row
  rather than a confident wrong citation, and that is why this order is safe.
- **Cost.** Every item from 5 down is a per-file model call. `spend_review`
  before, not after.

---

# RULED 2026-08-27 — video, and the refusal that hands back the remedy

The owner settled the dependency question, and then improved the answer.

## The ruling

**No scraping.** The knowledge base does not depend on endpoints nobody promises
us — not YouTube's `timedtext`, not Loom's `GetVideoSSR`/`FetchVideoTranscript`.
Both are undocumented internal APIs; "no auth" is not "supported"; and a silent
break there means videos quietly stop being readable with nobody noticing until
somebody asks a question the video would have answered.

**We transcribe what we can reach, ourselves.** Speech-to-text on infrastructure
already in the stack. It depends on nobody's goodwill, and it is the same
mechanism `audio` needs anyway, so it is one build and not two.

**A video LINK is refused — and the refusal offers the fix.** His design, and it
is better than the one that was on the table:

> it should warn the user that whenever we are trying to import something into
> the knowledge base and it's some kind of video or YouTube link, it gives a hint
> plus a text box to paste the transcript ourselves. Otherwise, it does not
> accept the source.

## Why this is the right shape and not a compromise

Every other unreadable thing in this base failed the same way: it was ACCEPTED,
stored, and quietly never read. That is how 131 files of logo artwork got into
the index, how every PDF scored 0.000, and how `image/*` has been `opaque` since
the beginning. **The person was never told.**

This ruling breaks that pattern at the door. A source is either readable or
REFUSED — and the refusal is not a dead end, because it carries the one thing
that would make it readable. The person is never left with a row that looks
ingested and answers nothing.

That is the same instinct as "stored, not searchable", one step further: the door
does not merely record that it could not read something, it says so to the person
standing in front of it and offers the remedy inline.

## Two distinct pieces of work — do not merge them

**(a) A media FILE we hold → we transcribe it.** An uploaded audio or video file.
Runs on the sweep, not the request (cost and latency, per the idempotent-and-
re-runnable rule above). Per-minute cost: `spend_review` before it ships.

**(b) A video LINK → refuse, hint, offer the box.** No transcription, no fetch,
no scrape. Detect that a URL is a video destination, explain in one plain
sentence that a link to a video cannot be read, and render a paste-the-transcript
field. Pasted text becomes the source's body; nothing pasted means no source.

(b) is small, has no dependency and no per-call cost, and is the half the person
actually feels. It ships first.

## What it must not do

- **Never accept and silently store.** That is the failure this ruling exists to
  end. If it cannot be read and nothing was pasted, there is no source.
- **Never guess a transcript.** An invented one is worse than none, for R23's
  reason: everything else this app shows a person is true.
- **The detection is a hint, not a gate on a domain list.** A URL that is not
  recognised as video but turns out unreadable still refuses honestly — the video
  case just gets a better sentence and the box.
- **New user-visible sentences**, so R28/R33 bite (`node scripts/i18n-extract.mjs`,
  `t(...)` at every position) and R34 means the glossary's word, not a synonym.
