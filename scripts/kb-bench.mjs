// THE RETRIEVAL BENCH — what the knowledge base actually answers, measured
// against the agency's own material rather than against books.
//
// ── IT MEASURES A BRANCH, WITHOUT DEPLOYING ANYTHING ────────────────────────
//
// That is the whole property, and it is the reason a retrieval change can be
// judged at all. A bench that asked the deployed door would measure whatever is
// deployed — so a change sitting on a branch could not be measured before it
// shipped, and "ship it and see" is a hope, not a gate. Three things make the
// other way possible, and the third is the one nobody guesses:
//
//   • `retrieve` is IMPORTED FROM THE WORKING TREE. The code under test is the
//     file you just edited, not a copy of it and not a deployment of it.
//   • env.KNOWLEDGE_INDEX and env.AI are one small object each — Vectorize and
//     bge-m3 over their REST doors, same index, same namespace, same filter,
//     same model. A Worker gives a binding; Node gives a `fetch`. Nothing else
//     differs, and the fence is exercised rather than asserted.
//   • D1 NEEDS NO STAND-IN AT ALL. `d1Query` already speaks to Cloudflare's REST
//     door, so pointing `cfg` at the real team database means the WORDS come out
//     of the real database under the real reader clause (R26), exactly as they
//     do in production.
//
// So: real code, real index, real embeddings, real rows, real fences — and no
// deploy. Run it on `main`, run it on your branch, read the difference.
//
// ── HOW TO RUN IT ───────────────────────────────────────────────────────────
//
//   node --experimental-transform-types scripts/kb-bench.mjs
//   node --experimental-transform-types scripts/kb-bench.mjs --verbose
//
// `--experimental-transform-types`, NOT `--experimental-strip-types`: the strip
// mode cannot compile the constructor parameter properties in
// shared/workers/gating.ts and dies before the first question. `@shared/*` is
// resolved by scripts/lib/shared-alias.mjs, imported on the first line below.
//
// KB_INDEX / KB_CORE / KB_TEAM point it at another environment; it is read-only
// in every one of them.
//
// ── WHAT IT COSTS ───────────────────────────────────────────────────────────
//
// One embedding call per question (a few thousand tokens, on Workers AI) and one
// Vectorize query each. It never asks for `compose`, so it spends nothing from
// the team's own AI allowance — composing is the only act on this module that
// draws it. The token comes from the Keychain, like every other script here.
// Nothing is written: every statement this runs is a SELECT.
//
import "./lib/shared-alias.mjs"

import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const VERBOSE = process.argv.includes("--verbose")
/** GRADE THE ANSWER TOO — off by default, because it is the half that costs.
 * See "WHAT IT COSTS" above and `composeScore` below. */
const COMPOSE = process.argv.includes("--compose")

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "b5bb3d84a59c029ea5e0fe164dab1cf7"
const TOKEN =
  process.env.CLOUDFLARE_API_TOKEN ||
  execSync("security find-generic-password -s cloudflare-token-kwapso -w").toString().trim()
const CORE = process.env.KB_CORE || "1df02340-fc91-4cac-8ccb-d19528dcd9f7" // kwapso-core-staging
const INDEX = process.env.KB_INDEX || "kwapso-knowledge-staging"
const TEAM_NAME = process.env.KB_TEAM || "Kwapso"

/** THE MODEL PRODUCTION COMPOSES WITH, read out of the worker's own config.
 *
 * The bench and the deployed worker agreed on this by COINCIDENCE until 27 Aug
 * 2026: `cheapText` falls back to `CHEAP_TEXT_MODEL` when `WORKERS_AI_MODEL` is
 * unset, the bench set nothing, and wrangler happened to set the same value. The
 * day somebody changes that var, production moves and a bench relying on the
 * fallback does not — and every ANSWER figure would then describe a system nobody
 * runs, silently, with no test able to notice.
 *
 * So it is read from the config rather than assumed to match. If the file ever
 * stops naming a model this throws, which is the right failure: a bench that
 * cannot say what it is measuring should not produce a number. */
function productionComposeModel() {
  const raw = readFileSync(join(REPO, "workers", "content", "wrangler.jsonc"), "utf8")
  const found = /"WORKERS_AI_MODEL"\s*:\s*"([^"]+)"/.exec(raw)
  if (!found)
    throw new Error(
      "workers/content/wrangler.jsonc no longer names WORKERS_AI_MODEL — the bench cannot know which model production composes with"
    )
  return found[1]
}

const { retrieve } = await import(join(REPO, "workers", "content", "src", "lib", "knowledge.ts"))
const { writeAnswer } = await import(join(REPO, "workers", "content", "src", "lib", "knowledge-compose.ts"))

/* ------------------------------ the REST doors ----------------------------- */

const CF = "https://api.cloudflare.com/client/v4"
async function cf(path, body) {
  const res = await fetch(`${CF}/accounts/${ACCOUNT}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    // R11's spirit: a bench that hangs is a bench nobody runs.
    signal: AbortSignal.timeout(60_000),
  })
  const json = await res.json()
  if (!json.success && json.errors) throw new Error(`${path}: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.result
}

const sql = async (db, statement, params = []) =>
  (await cf(`/d1/database/${db}/query`, { sql: statement, params }))[0].results

/** VECTORIZE, AS THE BINDING LOOKS FROM INSIDE THE WORKER. `searchVectors` is
 * the only caller and it sends exactly one shape — namespace, topK, filter, and
 * neither values nor metadata (R26's second fence) — so this implements that
 * shape and nothing else. NDJSON in, matches out. */
function vectorizeStandIn() {
  return {
    async query(vector, opts) {
      const res = await fetch(`${CF}/accounts/${ACCOUNT}/vectorize/v2/indexes/${INDEX}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          vector,
          topK: opts.topK,
          namespace: opts.namespace,
          filter: opts.filter,
          returnValues: false,
          returnMetadata: "none",
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const json = await res.json()
      if (!json.success) throw new Error(`vectorize: ${JSON.stringify(json.errors).slice(0, 300)}`)
      return { matches: json.result?.matches ?? [] }
    },
  }
}

/** The embedding model, over REST rather than over a binding. Same model id the
 * worker defaults to, so the numbers are on the same scale as production's. */
const AI = {
  async run(model, input) {
    const res = await fetch(`${CF}/accounts/${ACCOUNT}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    })
    const json = await res.json()
    if (!json.success) throw new Error(`ai: ${JSON.stringify(json.errors).slice(0, 300)}`)
    return json.result
  },
}

/* ------------------------------ who is asking ------------------------------ */

const [team] = await sql(CORE, "SELECT id, database_id FROM teams WHERE name = ? LIMIT 1", [TEAM_NAME])
if (!team?.database_id) throw new Error(`no team called "${TEAM_NAME}" with a database`)
const TEAM_DB = team.database_id

// A REAL MEMBER, read out of the real tables — not a synthetic guard. The
// personal and app fences are read off this, so asking as somebody who does not
// exist would measure a knowledge base nobody can see.
//
// TWO DATABASES, because membership and rights live in different ones:
// `team_members` is global core (who is on which team), `role_permissions` is
// the team's own (what that role may do). The bench asks as the first member
// whose role can read the module — never as an invented one.
const members = await sql(
  CORE,
  `SELECT user_id, role_id FROM team_members WHERE team_id = ? AND deactivated_at IS NULL ORDER BY created_at`,
  [team.id]
)
const readers = await sql(
  TEAM_DB,
  `SELECT role_id FROM role_permissions WHERE module = 'knowledge' AND can_read = 1`
)
const canRead = new Set(readers.map((r) => r.role_id))
const member = members.find((m) => canRead.has(m.role_id))
if (!member) throw new Error("no member of this team may read the knowledge base")

const guard = {
  userId: member.user_id,
  teamId: team.id,
  roleId: member.role_id,
  databaseId: TEAM_DB,
}
const cfg = { accountId: ACCOUNT, apiToken: TOKEN }
// `writeAnswer` logs a model failure to the one error seam (ERROR-HANDLING) and
// needs somewhere to put it. Loud rather than silent: a bench that swallowed the
// writer's failures would report a bad answer as a bad PROMPT.
const env = {
  AI,
  // Composed with the model the worker is configured to use, not the library's
  // fallback — see `productionComposeModel`.
  WORKERS_AI_MODEL: productionComposeModel(),
  KNOWLEDGE_INDEX: vectorizeStandIn(),
  DB: { prepare: () => ({ bind: () => ({ run: async () => {}, all: async () => ({ results: [] }) }) }) },
}

/* -------------------------------- the questions ---------------------------- */

const { QUESTIONS } = await import(process.env.KB_QUESTIONS ? resolve(process.env.KB_QUESTIONS) : join(HERE, "kb-bench-questions.mjs"))

/* --------------------------------- scoring --------------------------------- */

/** DID IT ANSWER THE QUESTION? Three shapes, and each is a different claim:
 *
 *   cites  — one of these strings appears in a cited title. The base found the
 *            right document; that is what retrieval is FOR.
 *   refuse — the base must say it has nothing. A question about something that
 *            never happened is not a question with a best-effort answer.
 *   spread — the answer must not be one thing said several ways: at least this
 *            many DISTINCT real subjects among the citations.
 *
 * A question may set more than one. All of them must hold. */
function judge(q, answer) {
  const titles = answer.citations.map((c) => c.title)
  const reasons = []
  if (q.refuse && answer.found) reasons.push(`answered out of ${titles.join(" / ") || "?"}`)
  if (q.cites) {
    const hit = q.cites.some((want) => titles.some((t) => t.toLowerCase().includes(want.toLowerCase())))
    if (!hit) reasons.push(`wanted ${q.cites.join(" or ")}, cited ${titles.join(" / ") || "nothing"}`)
  }
  // AND THE MATERIAL, NOT ONLY THE NAME OF IT. A title key was passing questions
  // whose every passage said nothing — six 2027 placeholders all correctly titled
  // "🧡 Team Assembly", and a calendar invitation correctly titled "Invitation:
  // FluClinic : Task 3144" — because a placeholder and the transcript of the
  // meeting it stands for HAVE THE SAME TITLE. So where a question carries an
  // authored `lead` (things the material actually says), at least one passage must
  // contain one of them. That is the same key, read against the text instead of
  // the label, and it is what makes a hollow pass impossible rather than unlikely.
  if (q.lead) {
    const body = answer.passages.map((p) => p.text).join(" \n ").toLowerCase()
    if (!q.lead.some((w) => body.includes(String(w).toLowerCase())))
      reasons.push(`no passage says any of ${q.lead.slice(0, 4).join(" / ")} — the titles matched, the material did not`)
  }
  if (q.spread) {
    const subjects = new Set(titles.map((t) => t.toLowerCase().replace(/^(invitation|accepted|declined|notes|updated invitation|canceled|cancelled):\s*/i, "").replace(/[“”"]/g, "").trim()))
    if (subjects.size < q.spread) reasons.push(`only ${subjects.size} distinct subjects among ${titles.length} citations`)
  }
  return reasons
}

/* ----------------------------- grading the ANSWER --------------------------- */

/** A PASSAGE THAT SAYS NOTHING BUT ITS OWN NAME AND A DATE.
 *
 * Detected off the MATERIAL rather than off a key, and it had to be: an empty
 * placeholder for a meeting and the 92-chunk transcript of that same meeting have
 * exactly the same title, so no title-based key can tell them apart. That is how
 * the retrieval half scored these questions PASS while the reader was being handed
 * six sentences that between them said only that a meeting is in the diary.
 *
 * Measured on staging 27 Aug 2026: 232 of 458 meeting sources — 51% — are one
 * chunk, dated in the future and contentless. Asked "what came out of the Team
 * Assembly?", all six passages were 2027 placeholders and the 92-chunk transcript
 * of the real August meeting was not among them.
 *
 * The test is deliberately blunt: take the passage, strike out its own title, the
 * dates, and the sentence the mirror wraps every record in, and count what is
 * left. A real chunk is a paragraph; this leaves nothing. */
function hollow(passage) {
  const title = (passage.title ?? "").trim()
  let rest = passage.text ?? ""
  if (title) rest = rest.split(title).join(" ")
  const words = rest
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\b\d{1,2}\s+\w+\s+\d{4}\b/g, " ")
    .replace(/\b\w{3,}\s+\d{1,2},\s*\d{4}\b/g, " ")
    .replace(/is a meeting (of ours|with)[^.]*\./gi, " ")
    .replace(/^Met on[^.]*\./i, " ")
    .replace(/[^A-Za-zÀ-ÿ]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3)
  return words.length < HOLLOW_WORDS
}
/** Informative words a passage must carry before it counts as material at all.
 * A real chunk is a paragraph — hundreds. The placeholders leave zero. Eight is
 * far below anything genuine and far above anything hollow. */
const HOLLOW_WORDS = 8

/** OPENERS THAT ARE NOT ANSWERS. The compose prompt already forbids the first
 * two by name — "Both of these are wrong: opening with 'the material does not
 * directly answer this' and then answering it anyway" — so this measures whether
 * the instruction is being FOLLOWED rather than whether it was written. */
const PREAMBLE =
  /^\s*(the (material|passages|sources|knowledge base|documents|records)\b|based on\b|according to the (material|sources|passages)\b|from the (material|passages|sources)\b|i (could not|couldn't|was unable|looked|searched|found)\b|there (is|are) (no|nothing|not)\b|unfortunately\b|it (appears|seems) (that )?\b|while the\b|although the\b|here('| i)s (a|an|the)? ?(summary|overview|rundown)\b)/i

/** The answer's first sentence — the only one the owner's "beating around the
 * bush" is about. Bulleted or headed answers count their first line. */
function firstSentence(answer) {
  const line = answer
    .split("\n")
    .map((l) => l.replace(/^[#*\->\s]+/, "").trim())
    .find((l) => l.length > 20)
  if (!line) return answer.trim().slice(0, 300)
  const stop = line.search(/[.!?](\s|$)/)
  return stop === -1 ? line : line.slice(0, stop + 1)
}

/** THE PEOPLE WHOSE NAMES APPEAR IN THIS TEAM'S TRANSCRIPTS. Authored, because
 * it is a fact about the agency and not about the pipeline — and short, because
 * the check below only needs to recognise a name when it sees one. */
const PEOPLE = ["Alexander", "Aurora", "Alaap", "Ãlaap", "Ishita", "Chilavert", "Marco", "Tobias"]

/** DID THE ANSWER SAY WHO, and is that person actually in the material?
 *
 * The owner's comparison was NotebookLM: "able to pinpoint who said what, this is
 * where their decision landed, this is what to do next" against our "the team
 * discussed". The names are already in the passages — a transcript carries
 * "Aurora observes…", a chat carries "Chilavert George:" — and the writer was
 * flattening them into a committee.
 *
 * BOTH HALVES, AND THE SECOND IS THE ONE THAT MATTERS. Naming somebody is easy to
 * fake, so this only counts a name the PASSAGES also contain. An answer that
 * attributes a decision to a person who is not in the material scores zero here
 * and should — an invented speaker is worse than none, for the same reason an
 * invented date is: everything else this app shows a person is true. */
function attributes(answer, written) {
  const material = answer.passages.map((p) => p.text).join(" ")
  return PEOPLE.some((who) => written.includes(who) && material.includes(who))
}

/** THE THINGS HE NAMED, one function, all authored or measured off the
 * material — never off the pipeline's own output. */
function composeScore(q, answer, written) {
  const lead = firstSentence(written)
  const wanted = q.topic ?? q.cites ?? []
  // OFF TOPIC IS ABOUT WHAT A CITATION SAYS, NOT WHOSE NAME IS ON IT.
  //
  // This used to be `titles.filter(t => no expected name is in t)` — it asked
  // whether the base cited the source the KEY had named, and printed the answer
  // under "files that were not important", which is a claim about relevance.
  // Those are different questions and the difference is not academic: asked how
  // FluClinic detects a duplicate company, the base cited a ticket titled
  // "Match on Registration Number + Postcode" — verbatim the correct answer —
  // and this scored it off-topic for being a ticket rather than the meeting.
  // The row read 0/6, 0%, and 0% of nothing was wrong with those citations.
  //
  // So a citation is on topic when the expected source is named OR when the
  // material it actually contributed carries one of the answer tokens the key
  // author wrote down by hand off the source text (`lead`). Both halves are
  // authored off the material; neither is taken from the pipeline's output.
  const answerTokens = (q.lead ?? []).map((w) => String(w).toLowerCase())
  const bySource = new Map()
  for (const p of answer.passages)
    bySource.set(p.sourceId, `${bySource.get(p.sourceId) ?? ""} ${p.text ?? ""}`.toLowerCase())
  const offTopic = answer.citations
    .filter((c) => {
      const title = (c.title ?? "").toLowerCase()
      if (wanted.some((w) => title.includes(String(w).toLowerCase()))) return false
      const said = bySource.get(c.sourceId) ?? ""
      return !answerTokens.some((tok) => said.includes(tok))
    })
    .map((c) => c.title ?? "")
  const empty = answer.passages.filter(hollow)
  return {
    // BEATING AROUND THE BUSH — the first sentence answers, or it preambles.
    leads: !PREAMBLE.test(lead) && (q.lead ?? []).some((w) => lead.toLowerCase().includes(w.toLowerCase())),
    // FILES THAT WERE NOT IMPORTANT — every citation is on the question's subject.
    onTopic: offTopic.length === 0,
    // THE BIG JUICY FILE IT SHOULD HAVE TOUCHED — no slot spent on a placeholder.
    earned: empty.length === 0,
    // WHO SAID IT — only asked of a question about a conversation, because a
    // process map has no speakers and demanding one would be asking for fiction.
    attributed: q.conversation ? attributes(answer, written) : null,
    lead,
    offTopic,
    empty: empty.length,
    passages: answer.passages.length,
  }
}

/* ---------------------------------- the run -------------------------------- */

console.log(
  `kb-bench — ${QUESTIONS.length} questions against ${INDEX} (team ${team.id})` +
    `${COMPOSE ? ", grading the ANSWER too" : ""}\n`
)
let passed = 0
const graded = []
for (const [i, q] of QUESTIONS.entries()) {
  const label = `Q${String(i + 1).padStart(2, "0")}`
  let answer
  try {
    answer = await retrieve(env, cfg, guard, {
      question: q.q,
      // Only where there is an answer to write. `retrieve` reaches the writer
      // after `found` is settled, so a question the base refuses costs nothing
      // — which is also why the four refusals here are free.
      compose: COMPOSE ? (material, sources) => writeAnswer(env, q.q, material, sources) : undefined,
    })
  } catch (e) {
    console.log(`${label} FAIL  ${q.q.slice(0, 68)}  — threw: ${String(e).slice(0, 100)}`)
    continue
  }
  const why = judge(q, answer)
  const ok = why.length === 0
  if (ok) passed++
  console.log(
    `${label} ${ok ? "PASS" : "FAIL"}  ${q.q.slice(0, 62).padEnd(64)} ` +
      `${answer.found ? `${answer.passages.length}p/${answer.citations.length}c` : "refused"}` +
      `${ok ? "" : `  — ${why.join("; ")}`}`
  )
  if (VERBOSE && answer.citations.length)
    for (const c of answer.citations) console.log(`      · ${c.title}`)
  if (COMPOSE && answer.found && q.lead) {
    const written = answer.answer
    if (!written) {
      console.log(`     ANSWER  (the writer returned nothing — model unreachable or empty)`)
      graded.push({ label, leads: false, onTopic: false, earned: false })
      continue
    }
    const g = composeScore(q, answer, written)
    graded.push({ label, ...g })
    console.log(
      `     ANSWER  leads:${g.leads ? "yes" : "NO "}  on-topic:${g.onTopic ? "yes" : `NO (${g.offTopic.length}/${answer.citations.length})`}` +
        `  earned:${g.earned ? "yes" : `NO (${g.empty}/${g.passages} say nothing)`}` +
        `${g.attributed === null ? "" : `  who-said-it:${g.attributed ? "yes" : "NO "}`}`
    )
    if (VERBOSE) {
      console.log(`       first sentence: ${g.lead.slice(0, 150)}`)
      if (g.offTopic.length) console.log(`       off topic: ${g.offTopic.join(" / ").slice(0, 140)}`)
    }
  }
}

console.log(`\nRETRIEVAL ${passed}/${QUESTIONS.length}`)
if (COMPOSE && graded.length) {
  const pct = (n) => `${Math.round((100 * n) / graded.length)}%`
  const leads = graded.filter((g) => g.leads).length
  const onTopic = graded.filter((g) => g.onTopic).length
  const earned = graded.filter((g) => g.earned).length
  const all = graded.filter((g) => g.leads && g.onTopic && g.earned).length
  console.log(`ANSWER    ${all}/${graded.length}  — every one of the three below, on the same question`)
  console.log(`  leads with the answer      ${String(leads).padStart(2)}/${graded.length}  ${pct(leads)}   "beating around the bush"`)
  console.log(`  every citation on topic    ${String(onTopic).padStart(2)}/${graded.length}  ${pct(onTopic)}   "files that were not important"`)
  console.log(`  no slot spent on nothing   ${String(earned).padStart(2)}/${graded.length}  ${pct(earned)}   "the big juicy files it didn't touch"`)
  // A FOURTH ROW, over a SMALLER set: only the questions about a conversation.
  // Its denominator is different from the three above on purpose — a process map
  // has nobody to quote, and folding it in would dilute the one thing this row is
  // for.
  const askedWho = graded.filter((g) => g.attributed !== null)
  if (askedWho.length) {
    const said = askedWho.filter((g) => g.attributed).length
    console.log(
      `  says who said it          ${String(said).padStart(2)}/${askedWho.length}  ` +
        `${Math.round((100 * said) / askedWho.length)}%   "pinpoint who said what" (conversations only)`
    )
  }
  // ONE RUN IS NOT A SCORE, for the top line and the first row only. Measured over
  // three consecutive runs of the same code against the same material on 27 Aug
  // 2026: the two rows decided by RETRIEVAL — on topic, and no slot spent on
  // nothing — were identical every time (63% and 88%), because the passages are
  // the same passages. `leads` moved 69/81/81, and the combined line with it
  // (5/16, 7/16, 7/16), because it is the only row that depends on the words the
  // writer chose. So read a change in the bottom two rows as a change in the code,
  // and a change of one or two questions in `leads` as weather.
  console.log(
    "\n  (leads — and the combined line above — vary by a question or two between runs;\n" +
      "   the other two rows are decided by retrieval and do not.)"
  )
}
if (!VERBOSE) console.log("\nre-run with --verbose to see every citation, and every first sentence")
if (!COMPOSE) console.log("re-run with --compose to grade the answer a person actually reads")
process.exit(0)
