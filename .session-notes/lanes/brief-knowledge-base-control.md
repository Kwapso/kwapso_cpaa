# Lane brief: three defects in the knowledge base

You are a build lane on **the Kwapso System** (repo `Kwapso/kwapso_system`), working
alongside a planner session that will verify your claims and sequence the deploy.
Everything below was measured on 3 Sep 2026 against `origin/main` and the live
staging database. Line numbers were opened and checked, not remembered — but
re-verify before you edit, because main moves.

## Setup — do this first, it is part of the job

    cd /Users/alaap_kanchwala_apple/Desktop/kwapso_cpaa
    git fetch origin
    git worktree add ../kwapso-kb-control -b fix/knowledge-base-control origin/main
    cd ../kwapso-kb-control
    npm install

Work in that worktree. Another session shares the primary checkout and switches
branches in it — do not work there, and verify `git rev-parse --abbrev-ref HEAD`
before every commit.

Read `CLAUDE.md` first. Its laws are machine-checked; a change that breaks one
turns the build red.

---

## Defect 1 — the source chips do not stop the live Google tools

**What the owner did.** Unticked the Gmail chip above the assistant's input, then
asked *"what is the latest email i got in my primary inbox?"*. The assistant ran
a live Gmail search and answered from his mail.

**Why.** `injectSources` in `workers/data-ops/src/lib/agent.ts` (around :838-846)
applies the chip list to exactly one tool:

    if (name !== "ask_knowledge" || !sources?.length) return input

The comment above it justifies the narrowing, and its argument is sound as far as
it goes: a chip must not narrow `query_records`, because that is a question about
the app's live rows with its own permission at its own door, and silently
shrinking it would make a count wrong rather than a search narrower.

**That argument does not extend to Google.** There are ~20 live Google tools in
`workers/data-ops/src/lib/tools.ts`, none of them gated by a chip:

| read | line | write | line |
|---|---|---|---|
| `google_mail_search` | 335 | `google_send_mail` | 385 |
| `google_mail_message` | 350 | `google_draft_reply` | 362 |
| `google_chat_messages` | 432 | `google_reply_mail` | 566 |
| `google_chat_spaces` | 654 | `google_label_mail` | 585 |
| `google_drive_files` | 284 | `google_mail_trash` | 604 |
| `google_drive_file` | 299 | `google_chat_post` | 446 |
| `google_calendar_events` | 409 | `google_chat_delete` | 669 |
| `google_meeting_transcript` | 636 | `google_drive_upload` | 313 |
| `google_drive_folder` | 511 | `google_drive_update` | 485 |
| `list_google_connections` | ~269 | `google_drive_trash` | 549 |
|  |  | `google_mail_to_drive` | 527 |

**What is required.** A chip that is OFF makes its live tools unavailable **for
that turn, refused at the door** — not merely omitted from the prompt. The owner's
original ask was *"choose which data sources it should use or which tools it
should call"*; only the first half was built.

**One design question you must decide and write down.** Do the WRITE tools follow
the same chip? Recommendation: yes — somebody who unticks Gmail does not expect
mail sent on their behalf in that conversation. Whatever you decide, the reasoning
goes in `shared/knowledge-chips.ts` beside the existing "steering wheel, not
curation" note, because that file is where the next reader will look.

**Shape.** `shared/knowledge-chips.ts` already maps a chip key to knowledge kinds.
A chip-to-tool map is new. Derive it if you can; if it must be hand-listed,
rot-check it so a Google tool added tomorrow cannot be silently ungated. Prove the
gate by RUNNING it, not by reading it — R22 exists because a `buildBody` that was
only read shipped a narrower contract for six weeks under a green build.

---

## Defect 2 — one Google source, seven rows, and the tool reads a dead one

**What the owner did.** Asked about the FluClinic Google Chat space. The assistant
said it "hasn't been shared with kwapso yet". He replied: *"??? it is a shared
space.."* He was right.

**Measured on the Kwapso staging team database** (`727537f7-653d-4114-af23-332d1aae0f90`):

- `spaces/AAQAT-RDqLA` has **7 rows** in `google_sources` — 6 retired, 1 live.
- **14** distinct `(external_id, service)` pairs are duplicated.
- Chat: 37 rows, 8 live. Drive: 35 rows, 3 live.

**Where.** The insert is `workers/content/src/lib/google.ts:586`. Sharing a source
appears to INSERT a new row rather than reactivate the existing one, so every
toggle leaves a tombstone, and the listing tool can pick a retired duplicate.

**What is required.**

1. Sharing a source that already has a row **reactivates that row**. R17
   (idempotent transitions) is exactly this shape — the current-status predicate
   rides the UPDATE, zero rows moved means no activity row and no ping.
2. The listing tool reports a space as shared when **any** live row exists.
3. A guarded one-off repair for the existing duplicates, run against staging by
   the planner, not by you. Write it; do not run it against production.

---

## Defect 3 — one person, several colleague sources

**What the owner saw**, in his own citation list on one answer: `Alaap K`,
`Alaap Kanchwala` and `Alaap Kanchwala` cited as three separate "About a
colleague" sources — plus a "From a document" source with a **blank title**.

**Where.** Person sources are written at
`workers/content/src/lib/knowledge-ingest.ts:1448` (`kind: "person"`).

**What is required.** One person, one source. Decide the identity key — it should
be the user id, never a display name, because Google mangles display names
upstream and the same person arrives spelled three ways. Write down why.

Separately: a source with an empty title should not be citable as one. Either it
gets a real title or it does not appear in the citation list, because a citation
a reader cannot identify is not a citation.

---

## Constraints

- **`npm run check` must be green.** Read it by EXIT CODE and test counts, never by
  grepping the log — a suite that fails to load reports green. Baseline on main
  right now: exit 0, **3,967 tests**.
- **Every Cloudflare command takes the `cf-exec` prefix.** A bare `wrangler`
  resolves to the wrong company's account. `cf-exec --check` says which account.
- **Never run `scripts/i18n-translate.mjs`.** It spends the owner's personal API
  key and has rate-limited his account before. Run `node scripts/i18n-extract.mjs`
  if you add or change a user-visible sentence.
- **Do not touch `shared/ui/`.** It is hash-pinned; a hand-edit turns the build red.
- **Do not deploy.** The planner sequences deploys; staging mirrors main only.
- **Branch, never commit to main.** Open a PR when done.
- An empty result from a search is the dangerous one. Before believing a zero, ask
  what the query would return if the thing it looks for were definitely there —
  and prove it with a canary.

## Report back

- What you changed, with file and line.
- What you measured before and after, with the command that produced each number.
- Any defect you found and did **not** fix, and why.
- Anything in this brief that turned out to be wrong. It was measured carefully and
  it can still be wrong; say so plainly rather than working around it.
