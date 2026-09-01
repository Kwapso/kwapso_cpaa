// THE BOOK TEST — measured recall and precision for the knowledge base's
// retrieval, BEFORE (the shipped lexical-prefilter design) and AFTER (the
// Vectorize design), over the same corpus, the same embeddings and the same
// questions.
//
// A retrieval change with no numbers is an opinion. So this runs BOTH pipelines
// end to end, in one process, against seven whole public-domain books — 5.9 MB
// of text, ~6,500 chunks — using the REAL embedding model (Workers AI bge-m3
// over the REST door) rather than a stand-in.
//
// It imports the SHIPPED functions (chunkText, tokenise, questionTerms, the
// quantised codec) so the "before" arm really is what is deployed today, down to
// the int8 rounding.
//
// Steps (each cached to disk, so a re-run costs nothing):
//   export CLOUDFLARE_API_TOKEN=$(security find-generic-password -s cf-token-kwapso -w)
//   mkdir -p .kb-bench/books && cd .kb-bench/books
//   for id in 2701 1342 84 1228 132 98 1497; do
//     curl -sLO "https://www.gutenberg.org/cache/epub/$id/pg$id.txt"; done
//
//   node --experimental-strip-types scripts/knowledge-retrieval-bench.mjs all
//     corpus    → chunk the books
//     embed     → embed every chunk (cached to disk; a re-run is free)
//     questions → build the question set (cached)
//     measure   → run every variant over 7 whole books, print the table
//     records   → the same text re-cut into 250 small records, which is the
//                 shape the real knowledge base has
//
// `.kb-bench/` is git-ignored: it holds several hundred megabytes of cached
// float32 vectors and books nobody needs in the repo.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflareCredentials } from "./lib/cf-credentials.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const BOOKS = process.env.KB_BOOKS || join(HERE, "..", ".kb-bench", "books")
const CACHE = process.env.KB_CACHE || join(HERE, "..", ".kb-bench", "cache")
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true })

const REPO = process.env.KB_REPO || join(HERE, "..")
const TEXT_LIB = join(REPO, "workers", "content", "src", "lib", "knowledge-text.ts")

const { account: ACCOUNT, token: TOKEN } = cloudflareCredentials()
const EMBED_MODEL = process.env.KB_EMBED_MODEL || "@cf/baai/bge-m3"
const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
const RERANK_MODEL = "@cf/baai/bge-reranker-base"

const { chunkText, tokenise, questionTerms, encodeEmbedding, decodeEmbedding, similarity } =
  await import(TEXT_LIB)

/* ------------------------------- the corpus ------------------------------- */

const TITLES = {
  "pg2701.txt": "Moby-Dick; or, The Whale",
  "pg1342.txt": "Pride and Prejudice",
  "pg84.txt": "Frankenstein; or, The Modern Prometheus",
  "pg1228.txt": "On the Origin of Species",
  "pg132.txt": "The Art of War",
  "pg98.txt": "A Tale of Two Cities",
  "pg1497.txt": "The Republic",
}

/** Gutenberg wraps every text in a licence header and footer. Neither is the
 * book, and both would answer questions about "the project" identically in every
 * file — which would flatter any retriever that matched on them. */
function stripGutenberg(raw) {
  const start = raw.indexOf("*** START OF THE PROJECT GUTENBERG")
  const end = raw.indexOf("*** END OF THE PROJECT GUTENBERG")
  const body = raw.slice(start === -1 ? 0 : raw.indexOf("\n", start) + 1, end === -1 ? raw.length : end)
  return body.replace(/\r\n/g, "\n").trim()
}

function buildCorpus() {
  const sources = []
  const chunks = []
  for (const file of readdirSync(BOOKS).filter((f) => f.endsWith(".txt")).sort()) {
    const text = stripGutenberg(readFileSync(join(BOOKS, file), "utf8"))
    const title = TITLES[file] || file
    // The SHIPPED chunker, with its cap lifted — the cap itself is measured
    // separately (the ingest table), not smuggled into the retrieval numbers.
    const pieces = chunkAll(text)
    const sourceId = `S${sources.length + 1}`
    sources.push({ id: sourceId, title, chars: text.length, chunks: pieces.length })
    pieces.forEach((t, seq) => chunks.push({ id: `${sourceId}:${String(seq).padStart(5, "0")}`, sourceId, seq, text: t }))
  }
  return { sources, chunks }
}

/** chunkText stops at MAX_CHUNKS_PER_SOURCE (200). To chunk a WHOLE book with
 * the shipped boundaries, it is fed one slice at a time and the pieces joined —
 * the boundaries are the shipped ones, the ceiling is not. */
function chunkAll(text) {
  const out = []
  const SLICE = 150_000
  for (let i = 0; i < text.length; i += SLICE) out.push(...chunkText(text.slice(i, i + SLICE)))
  return out
}

/* ------------------------------- embeddings ------------------------------- */

async function cfPost(path, body, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      const json = await res.json()
      if (!json.success) throw new Error(JSON.stringify(json.errors))
      return json.result
    } catch (e) {
      if (attempt >= tries) throw e
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

const EMBED_BATCH = 100

async function embedAll(texts, label) {
  const out = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH)
    const res = await cfPost(`/ai/run/${EMBED_MODEL}`, { text: batch })
    out.push(...res.data)
    if (i % 1000 === 0) process.stderr.write(`  ${label}: ${i + batch.length}/${texts.length}\n`)
  }
  return out
}

/** Vectors on disk as float32, so a 6,500 × 1024 matrix is 26 MB rather than a
 * 200 MB JSON file that takes a minute to parse. */
function saveVectors(name, vectors) {
  const dim = vectors[0].length
  const buf = Buffer.alloc(8 + vectors.length * dim * 4)
  buf.writeUInt32LE(vectors.length, 0)
  buf.writeUInt32LE(dim, 4)
  vectors.forEach((v, i) => v.forEach((x, j) => buf.writeFloatLE(x, 8 + (i * dim + j) * 4)))
  writeFileSync(join(CACHE, name), buf)
}

function loadVectors(name) {
  const buf = readFileSync(join(CACHE, name))
  const n = buf.readUInt32LE(0)
  const dim = buf.readUInt32LE(4)
  const out = []
  for (let i = 0; i < n; i++) {
    const v = new Float32Array(dim)
    for (let j = 0; j < dim; j++) v[j] = buf.readFloatLE(8 + (i * dim + j) * 4)
    out.push(normalise(v))
  }
  return out
}

function normalise(v) {
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/* -------------------------------- questions ------------------------------- */
//
// TWO SETS, because one of them could be gamed and the other could be too small.
//
//  • GENERATED (the large one). A seeded random sample of chunks; a model is
//    asked for a question that chunk answers, told NOT to reuse its distinctive
//    words. Ground truth is the chunk it was generated from — objective, and
//    N is large enough for the numbers to mean something.
//  • HAND-WRITTEN (the small one). Questions written by a person about things
//    these books are known for, anchored to a phrase that is VERIFIED to exist
//    in the corpus — the harness refuses to run if an anchor is not found, so a
//    remembered-but-wrong anchor cannot silently become ground truth.

/** A gold set bigger than this is not ground truth, it is a theme — and any
 * retriever scores well against a theme. The harness refuses rather than
 * quietly reporting a flattering number. */
const MAX_GOLD_CHUNKS = 6

const HAND_WRITTEN = [
  // Every question is phrased the way somebody who had NOT read the book would
  // ask it, and never contains its own anchor — otherwise it measures nothing
  // but the word-match.
  { q: "how does the man telling the whaling story introduce himself at the start?", anchor: "call me ishmael" },
  { q: "what is said about the colour of the great sea beast, and why it frightens people?", anchor: "the whiteness of the whale" },
  { q: "where does the traveller stay before he finds a ship to sail on?", anchor: "spouter-inn" },
  { q: "what happens to a vessel that loses its masts in the storm?", anchor: "dismasted" },
  { q: "what does the opening line claim a rich unmarried man must be needing?", anchor: "a single man in possession" },
  { q: "what news about the big house nearby does the wife bring her husband?", anchor: "netherfield park is let at last" },
  { q: "what did the proud gentleman say about the young woman when asked to dance with her?", anchor: "she is tolerable" },
  { q: "how much money a year does the rich newcomer supposedly have?", anchor: "ten thousand a year" },
  { q: "what did the student gather around him on the night his creature first breathed?", anchor: "instruments of life" },
  { q: "what was the weather like on the night the creature was brought to life?", anchor: "a dreary night of november" },
  { q: "what must you understand to be safe in a hundred battles?", anchor: "know the enemy and know yourself" },
  { q: "what does the strategist call the highest skill — winning how?", anchor: "supreme excellence" },
  { q: "what is every military campaign founded on, according to the strategist?", anchor: "all warfare is based on deception" },
  { q: "how hidden should your intentions be before you move?", anchor: "let your plans be dark" },
  { q: "who does the philosopher say must govern before a city can be well run?", anchor: "philosophers are kings" },
  { q: "what story about a shepherd who could turn invisible is used to test whether anyone would stay honest?", anchor: "the ring of gyges" },
  { q: "who wrote the book explaining how living things change over time?", anchor: "charles darwin" },
  { q: "what is the breeding that people do on purpose called, as opposed to what nature does?", anchor: "artificial selection" },
  { q: "which ants capture others and make them work?", anchor: "slave-making instinct" },
  { q: "why is the fossil record too incomplete to show every step?", anchor: "the imperfection of the geological record" },
  { q: "how does the story set during the revolution open?", anchor: "it was the best of times" },
  { q: "what does the man say to himself as he goes to die in another man's place?", anchor: "far, far better thing" },
]

async function buildQuestions(corpus, { count = 120 } = {}) {
  const chunks = corpus.chunks
  // The hand-written half is checked FIRST — a bad anchor should cost a second,
  // not the whole generation run.
  const hand = []
  for (const item of HAND_WRITTEN) {
    const needle = item.anchor.toLowerCase()
    if (item.q.toLowerCase().includes(needle))
      throw new Error(`a hand-written question contains its own anchor: "${item.q}"`)
    const gold = chunks.filter((c) => c.text.toLowerCase().includes(needle)).map((c) => c.id)
    if (!gold.length) throw new Error(`hand-written anchor never appears in the corpus: "${item.anchor}"`)
    if (gold.length > MAX_GOLD_CHUNKS)
      throw new Error(`hand-written anchor "${item.anchor}" matches ${gold.length} chunks — that is a theme, not ground truth`)
    hand.push({ q: item.q, goldChunkIds: gold, kind: "hand", anchor: item.anchor })
  }

  // Seeded so the sample — and therefore every number below — is reproducible.
  let seed = 20260812
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const picked = new Set()
  const generated = []
  while (generated.length < count && picked.size < chunks.length) {
    const i = Math.floor(rand() * chunks.length)
    if (picked.has(i)) continue
    picked.add(i)
    const chunk = chunks[i]
    // A chunk too short to carry a fact makes a question nothing can answer.
    if (chunk.text.length < 500) continue
    const res = await cfPost(`/ai/run/${CHAT_MODEL}`, {
      messages: [
        {
          role: "system",
          content:
            "You write ONE short question that the given passage answers. Rules: ask it the way a person would who has NOT read the passage; do not quote the passage; avoid reusing its rare or distinctive words where an ordinary word will do; never mention 'the passage' or 'the text'. Reply with the question alone.",
        },
        { role: "user", content: chunk.text.slice(0, 1500) },
      ],
      max_tokens: 60,
    })
    const q = String(res.response || "").trim().replace(/^["']|["']$/g, "").split("\n")[0]
    if (q.length < 15 || q.length > 220) continue
    generated.push({ q, goldChunkIds: [chunk.id], kind: "generated", sourceId: chunk.sourceId })
    if (generated.length % 20 === 0) process.stderr.write(`  questions: ${generated.length}/${count}\n`)
  }

  return [...generated, ...hand]
}

/* ------------------------------- the two arms ----------------------------- */

const WANT = 6 // DEFAULT_PASSAGES — what one answer carries

/** BEFORE — the shipped design, exactly.
 *
 * Stage one is LEXICAL and it is a PREFILTER: the inverted index is read for the
 * question's terms, capped at CANDIDATE_CAP rows, and topped up to the cap with
 * the compartment's NEWEST chunks. Stage two — the vector — only ever sees what
 * stage one handed it. */
function retrieveBefore(index, question, qVec) {
  const CANDIDATE_CAP = 200
  const VECTOR_WEIGHT = 0.7
  const terms = questionTerms(question, 24)
  const lexScores = new Map()
  for (const term of terms)
    for (const [chunkId, weight] of index.postings.get(term) ?? [])
      lexScores.set(chunkId, (lexScores.get(chunkId) ?? 0) + weight)
  const lexical = [...lexScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_CAP)
    .map(([chunk_id, lex]) => ({ chunk_id, lex }))
  const seen = new Set(lexical.map((c) => c.chunk_id))
  // …topped up with `ORDER BY id DESC` — the newest chunks in the compartment.
  const topUp = []
  for (let i = index.chunks.length - 1; i >= 0 && lexical.length + topUp.length < CANDIDATE_CAP; i--)
    if (!seen.has(index.chunks[i].id)) topUp.push({ chunk_id: index.chunks[i].id, lex: 0 })
  const candidates = [...lexical, ...topUp].slice(0, CANDIDATE_CAP)
  const topLex = Math.max(1, ...candidates.map((c) => c.lex))
  // The stored vector is QUANTISED to int8, so the "before" arm pays the
  // rounding the shipped codec pays.
  return candidates
    .map((c) => {
      const stored = index.quantised.get(c.chunk_id)
      const vector = similarity(index.quantisedQuestion(qVec), stored)
      return { id: c.chunk_id, score: VECTOR_WEIGHT * Math.max(0, vector) + (1 - VECTOR_WEIGHT) * (c.lex / topLex) }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, WANT)
}

const RRF_K = 60
const CANDIDATES_TO_RERANK = 25
/** How much a record-level hint may move a chunk. Small on purpose: the router
 * PREFERS records, it does not narrow to them, so a wrong hint costs ranking and
 * can never hide the answer. */
const RECORD_PRIOR_WEIGHT = 0.6

function lexicalArm(index, question, topK) {
  const scores = new Map()
  for (const term of questionTerms(question, 24))
    for (const [chunkId, weight] of index.postings.get(term) ?? [])
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + weight)
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([id]) => id)
}

/** The vector arm: exact cosine over every chunk, standing in for Vectorize's
 * approximate search — the same ranking to within its recall. `vectors` is
 * whichever embedding set the variant is testing. */
function vectorArm(index, qVec, vectors, topK, allowed) {
  return index.chunks
    .map((c, i) => ({ id: c.id, score: dot(qVec, vectors[i]) }))
    .filter((r) => !allowed || allowed.has(r.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => r.id)
}

/** THE RECORD-LEVEL ROUTER. Every source carries a short summary of itself; the
 * summaries are searched first, and the records that come back become a PRIOR on
 * their own chunks. This is the "the agent already knows what each notebook
 * contains" half — and the reason "how does the story about the revolution
 * open?" stops being answered out of a different book. */
function recordPrior(index, qVec, topRecords = 3) {
  return index.summaryVectors
    .map((v, i) => ({ sourceId: index.sources[i].id, score: dot(qVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topRecords)
}

/** WEIGHTED reciprocal-rank fusion. The weight is the whole question here: the
 * first sweep fused the two arms as equals and that COST ten points of recall
 * against the vector arm alone — the word match's hundred best guesses on an
 * ordinary question are mostly long chunks full of ordinary words, and given an
 * equal vote they outrank the passage that actually answers it. */
function fuse(lists, priors) {
  const fused = new Map()
  for (const { ids, weight = 1 } of lists)
    ids.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + weight / (RRF_K + i + 1)))
  if (priors)
    for (const [id, bonus] of priors) if (fused.has(id)) fused.set(id, fused.get(id) + bonus)
  return [...fused.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

/** Does this question contain something a person typed EXACTLY — a reference, an
 * error code, an invoice number, a quoted phrase? That is the only case the
 * lexical arm is better at than the vector, and it is recognisable: a token with
 * a digit in it, or one long enough to be a name rather than a word. */
function hasExactTerm(question) {
  return questionTerms(question, 24).some((t) => /\d/.test(t) || t.length >= 12)
}

async function rerank(index, question, candidates, pool) {
  if (candidates.length < 2) return candidates
  const byId = new Map(index.chunks.map((c) => [c.id, c.text]))
  const top = candidates.slice(0, pool)
  const res = await cfPost(`/ai/run/${RERANK_MODEL}`, {
    query: question,
    contexts: top.map((c) => ({ text: (byId.get(c.id) || "").slice(0, 1200) })),
  })
  const ordered = (res.response || []).map((r) => top[r.id]).filter(Boolean)
  return [...ordered, ...candidates.slice(pool)]
}

/** One variant = one set of switches, so every number in the report is the value
 * of ONE decision rather than of a bundle. */
async function runVariant(opts, index, questions, qVectors, label) {
  const out = []
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i].q
    const qVec = qVectors[i]
    if (opts.before) {
      out.push(retrieveBefore(index, q, qVec))
      continue
    }
    const vectors = opts.contextShort ? index.titleVectors : opts.context ? index.contextVectors : index.vectors
    // THE ROUTER AS A NARROWING rather than as a preference: the summaries are
    // searched, the best few records win, and the chunk search happens INSIDE
    // them. This is "open the right notebook" as the owner described it — and
    // the thing a preference cannot do, which is make the search smaller.
    const allowed = opts.routerNarrow
      ? new Set(
          recordPrior(index, qVec, opts.routerNarrow).flatMap((r) => index.bySource.get(r.sourceId) ?? [])
        )
      : null
    const lists = [{ ids: vectorArm(index, qVec, vectors, 100, allowed), weight: 1 }]
    const lexWeight = opts.lexicalOnlyWhenExact && !hasExactTerm(q) ? 0 : (opts.lexical ?? 0)
    if (lexWeight > 0) lists.push({ ids: lexicalArm(index, q, opts.lexicalTopK ?? 100), weight: lexWeight })
    let hits = fuse(lists, opts.router ? priorMap(index, qVec) : null)
    if (opts.rerank) hits = await rerank(index, q, hits, opts.rerankPool ?? CANDIDATES_TO_RERANK)
    out.push(hits.slice(0, WANT))
    if (opts.rerank && i % 50 === 0) process.stderr.write(`  ${label}: ${i}/${questions.length}\n`)
  }
  return out
}

function priorMap(index, qVec) {
  const records = recordPrior(index, qVec)
  const bonus = new Map()
  records.forEach((r, rank) => {
    const value = RECORD_PRIOR_WEIGHT / (RRF_K + rank + 1)
    for (const c of index.bySource.get(r.sourceId) ?? []) bonus.set(c, value)
  })
  return bonus
}

/* -------------------------------- the numbers ----------------------------- */

function measure(results, questions) {
  let hit = 0
  let hit1 = 0
  let precision = 0
  let ceiling = 0
  let rr = 0
  for (let i = 0; i < questions.length; i++) {
    const gold = new Set(questions[i].goldChunkIds)
    const got = results[i].map((r) => r.id)
    const rank = got.findIndex((id) => gold.has(id))
    if (rank >= 0) {
      hit++
      rr += 1 / (rank + 1)
      if (rank === 0) hit1++
    }
    precision += got.filter((id) => gold.has(id)).length / WANT
    // PRECISION HAS A CEILING HERE and it is not 100%: most questions have ONE
    // gold chunk, so six returned passages can be at best one-sixth gold. The
    // ceiling is reported beside the figure, because a precision@6 of 15% next
    // to a ceiling of 17% is a good result and looks like a terrible one.
    ceiling += Math.min(gold.size, WANT) / WANT
  }
  const n = questions.length
  return {
    n,
    recallAt1: hit1 / n,
    recallAt6: hit / n,
    precisionAt6: precision / n,
    precisionCeiling: ceiling / n,
    mrr: rr / n,
  }
}

const pct = (x) => `${(x * 100).toFixed(1)}%`

function report(label, m) {
  console.log(
    `  ${label.padEnd(30)} recall@1 ${pct(m.recallAt1).padStart(6)}  recall@6 ${pct(m.recallAt6).padStart(6)}  precision@6 ${pct(m.precisionAt6).padStart(6)} of ${pct(m.precisionCeiling)}  MRR ${m.mrr.toFixed(3)}`
  )
}

/* ---------------------------------- steps --------------------------------- */

/* ------------------- the corpus, re-shaped as MANY RECORDS ----------------- */
//
// SEVEN WHOLE BOOKS IS THE WRONG SHAPE FOR TWO OF THE QUESTIONS BEING ASKED.
//
// The knowledge base this is being built for holds ten to fifteen emails a day,
// four or five call transcripts a week, tickets, accounts, stories: THOUSANDS of
// small records, not seven enormous ones. Two design decisions only make sense
// at that shape, and measuring them at book shape would be measuring the wrong
// thing:
//
//   • the CONTEXTUAL PREFIX (a chunk embedded with its record's name in front)
//     is worth nothing when a chunk's own vocabulary already says which of seven
//     very different books it is from, and is worth a great deal when three
//     hundred tickets all say "we tried again and it still failed";
//   • the RECORD ROUTER is meaningless when preferring one record in seven means
//     preferring a seventh of everything.
//
// So the same 7,441 chunks are re-grouped into ~250 records of about thirty
// chunks each — roughly a chapter, and roughly the size of a long ticket thread
// or a call transcript. Each record takes its title from its own first line,
// which is exactly where a ticket's title comes from. Same chunks, same
// questions, same gold answers: only the record structure changes.

const CHUNKS_PER_RECORD = 30

function reshapeAsRecords(corpus) {
  const sources = []
  const chunks = []
  for (const book of corpus.sources) {
    const own = corpus.chunks.filter((c) => c.sourceId === book.id)
    for (let i = 0; i < own.length; i += CHUNKS_PER_RECORD) {
      const slice = own.slice(i, i + CHUNKS_PER_RECORD)
      const id = `R${sources.length + 1}`
      const opening = slice[0].text.replace(/\s+/g, " ").trim()
      const stop = opening.search(/[.!?]/)
      sources.push({
        id,
        title: (stop > 10 ? opening.slice(0, stop) : opening.slice(0, 90)).slice(0, 90),
        summary: opening.slice(0, 400),
        chars: slice.reduce((a, c) => a + c.text.length, 0),
        chunks: slice.length,
      })
      // The chunk KEEPS its id, so every gold answer still points at the same
      // piece of text — only which record owns it changes.
      for (const c of slice) chunks.push({ ...c, sourceId: id })
    }
  }
  return { sources, chunks }
}

const step = process.argv[2] || "all"
const corpusPath = join(CACHE, "corpus.json")

if (step === "corpus" || step === "all") {
  const corpus = buildCorpus()
  writeFileSync(corpusPath, JSON.stringify(corpus))
  console.log("CORPUS")
  for (const s of corpus.sources) console.log(`  ${s.title.padEnd(42)} ${String(s.chars).padStart(9)} chars  ${String(s.chunks).padStart(5)} chunks`)
  console.log(`  ${"TOTAL".padEnd(42)} ${String(corpus.sources.reduce((a, s) => a + s.chars, 0)).padStart(9)} chars  ${String(corpus.chunks.length).padStart(5)} chunks\n`)
}

if (step === "embed" || step === "all") {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"))
  if (!existsSync(join(CACHE, "chunks.f32"))) {
    console.log(`EMBEDDING ${corpus.chunks.length} chunks with ${EMBED_MODEL}`)
    saveVectors("chunks.f32", await embedAll(corpus.chunks.map((c) => c.text), "chunks"))
  } else console.log("EMBEDDING  cached")
}

if (step === "questions" || step === "all") {
  if (!existsSync(join(CACHE, "questions.json"))) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf8"))
    console.log("BUILDING QUESTIONS")
    const questions = await buildQuestions(corpus)
    writeFileSync(join(CACHE, "questions.json"), JSON.stringify(questions, null, 1))
    console.log(`  ${questions.length} questions\n`)
  } else console.log("QUESTIONS  cached")
}

if (step === "measure" || step === "records" || step === "all") {
  const asRecords = step === "records"
  const whole = JSON.parse(readFileSync(corpusPath, "utf8"))
  const corpus = asRecords ? reshapeAsRecords(whole) : whole
  const tag = asRecords ? "-records" : ""
  const questions = JSON.parse(readFileSync(join(CACHE, "questions.json"), "utf8"))
  const vectors = loadVectors("chunks.f32")

  // The inverted index, built with the SHIPPED tokeniser.
  const postings = new Map()
  const bySource = new Map()
  corpus.chunks.forEach((c) => {
    for (const [term, weight] of tokenise(c.text)) {
      if (!postings.has(term)) postings.set(term, [])
      postings.get(term).push([c.id, weight])
    }
    if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, [])
    bySource.get(c.sourceId).push(c.id)
  })
  // …and the quantised store the "before" arm reads.
  const quantised = new Map()
  corpus.chunks.forEach((c, i) => quantised.set(c.id, decodeEmbedding(encodeEmbedding([...vectors[i]]))))

  // THE CONTEXTUAL EMBEDDING — the same chunk, embedded with its source's own
  // name in front of it. What is STORED and what is SHOWN stay the chunk; only
  // the vector knows which book the sentence is from.
  const firstChunk = new Map()
  for (const c of corpus.chunks) if (!firstChunk.has(c.sourceId)) firstChunk.set(c.sourceId, c.text)
  // The SHIPPED summary shape (knowledge-summary.ts): what it is called, what
  // kind of thing it is, and its own opening words.
  const summaryOf = (s) =>
    `${s.title} — a document. ${(s.summary ?? firstChunk.get(s.id) ?? "").slice(0, 400)}`
  const summaryById = new Map(corpus.sources.map((s) => [s.id, summaryOf(s)]))

  if (!existsSync(join(CACHE, `chunks-context${tag}.f32`))) {
    console.log("EMBEDDING the chunks again, each with its record's name in front")
    saveVectors(
      `chunks-context${tag}.f32`,
      await embedAll(
        corpus.chunks.map((c) => `${summaryById.get(c.sourceId)}\n\n${c.text}`),
        "context"
      )
    )
  }
  // …and one summary per record, which is what the router searches.
  if (!existsSync(join(CACHE, `chunks-title${tag}.f32`))) {
    const titleById = new Map(corpus.sources.map((s) => [s.id, s.title]))
    console.log("EMBEDDING the chunks with only their record's NAME in front")
    saveVectors(
      `chunks-title${tag}.f32`,
      await embedAll(corpus.chunks.map((c) => `${titleById.get(c.sourceId)}\n\n${c.text}`), "title")
    )
  }
  if (!existsSync(join(CACHE, `summaries${tag}.f32`))) {
    console.log(`EMBEDDING one summary per record (${corpus.sources.length} records)`)
    saveVectors(`summaries${tag}.f32`, await embedAll(corpus.sources.map(summaryOf), "summaries"))
  }

  const index = {
    chunks: corpus.chunks,
    sources: corpus.sources,
    bySource,
    vectors,
    contextVectors: loadVectors(`chunks-context${tag}.f32`),
    titleVectors: loadVectors(`chunks-title${tag}.f32`),
    summaryVectors: loadVectors(`summaries${tag}.f32`),
    postings,
    quantised,
    quantisedQuestion: (v) => decodeEmbedding(encodeEmbedding([...v])),
  }

  if (!existsSync(join(CACHE, "questions.f32"))) {
    console.log("EMBEDDING the questions")
    saveVectors("questions.f32", await embedAll(questions.map((q) => q.q), "questions"))
  }
  const qVectors = loadVectors("questions.f32")

  const VARIANTS = [
    ["BEFORE — shipped today", { before: true }],
    ["vector alone", {}],
    ["vector, chunk knows source", { context: true }],
    ["  + lexical as an EQUAL peer", { context: true, lexical: 1 }],
    ["  + lexical at 1/4 weight", { context: true, lexical: 0.25 }],
    ["  + lexical only when exact", { context: true, lexical: 1, lexicalOnlyWhenExact: true, lexicalTopK: 20 }],
    ["vector, chunk knows its NAME", { contextShort: true }],
    ["  + lexical gated, weight 0.1", { contextShort: true, lexical: 0.1, lexicalOnlyWhenExact: true, lexicalTopK: 10 }],
    ["router NARROWS to top 1 record", { routerNarrow: 1 }],
    ["router NARROWS to top 3", { routerNarrow: 3 }],
    ["router NARROWS to top 10", { routerNarrow: 10 }],
    ["THE SHIPPED PIPELINE", { lexical: 0.1, lexicalOnlyWhenExact: true, lexicalTopK: 10 }],
  ]
  const results = {}
  for (const [label, opts] of VARIANTS) results[label] = await runVariant(opts, index, questions, qVectors, label.trim())

  const slices = [
    ["ALL", questions.map((_, i) => i)],
    ["generated (paraphrased)", questions.map((q, i) => (q.kind === "generated" ? i : -1)).filter((i) => i >= 0)],
    ["hand-written (hard)", questions.map((q, i) => (q.kind === "hand" ? i : -1)).filter((i) => i >= 0)],
  ]
  console.log(
    `\nRETRIEVAL — ${corpus.chunks.length} chunks from ${corpus.sources.length} whole books, ${questions.length} questions, ${EMBED_MODEL}\n`
  )
  for (const [label, idx] of slices) {
    const qs = idx.map((i) => questions[i])
    console.log(`${label}  (n=${qs.length})`)
    for (const [label] of VARIANTS) report(label, measure(idx.map((i) => results[label][i]), qs))
    console.log("")
  }

  // What the prefilter actually costs: how often the right chunk was never even
  // handed to the vector stage, so no ranking change could have found it.
  let unreachable = 0
  for (let i = 0; i < questions.length; i++) {
    const gold = new Set(questions[i].goldChunkIds)
    const lex = new Map()
    for (const t of questionTerms(questions[i].q, 24))
      for (const [id, w] of postings.get(t) ?? []) lex.set(id, (lex.get(id) ?? 0) + w)
    const reachable = new Set([...lex.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([id]) => id))
    // …plus the newest chunks the top-up drags in, which is CANDIDATE_CAP minus
    // what the word match already found (and nothing at all when it found 200).
    const room = 200 - reachable.size
    for (const c of room > 0 ? corpus.chunks.slice(-room) : []) reachable.add(c.id)
    if (![...gold].some((id) => reachable.has(id))) unreachable++
  }
  console.log(
    `THE PREFILTER'S CEILING: on ${unreachable}/${questions.length} questions (${pct(unreachable / questions.length)}) the right passage was never handed to the vector stage at all — no ranking change inside the old design could have found it.\n`
  )
}
