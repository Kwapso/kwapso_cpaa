// THE DOCS MUST AGREE WITH THE ROSTER ON DISK.
//
// Earned by: a doc sweep that had to correct "seven workers" and "one public door"
// in fourteen places at once, two months after the eighth worker (the client
// portal's front door) shipped. Every one of those sentences was true when it was
// written. None of them was checked, so none of them was updated — and a runbook
// that says "delete the seven workers" leaves a public address live.
//
// So the roster is DERIVED, never listed here: the worker names come from
// `workers/` on disk, and which of them are public comes from each
// `wrangler.jsonc`'s own `workers_dev` flag. Add a worker and this test's
// expectations move on their own; the docs that disagree go red the same day.
//
// Deliberately NARROW. It reads two claim shapes and no others:
//   1. a COUNT OF WORKERS  — "eight workers", "8 workers", "8-worker split"
//   2. a COUNT OF PUBLIC DOORS — "two public doors", plus the handful of stale
//      phrasings that used to say there was one
// It does not police every number in every doc. A check that shouts about prose
// gets switched off, and a check that is off is worse than no check at all.
//
// A genuine SUBSET claim ("the six workers that bind the core DB") is legitimate
// and stays legitimate — it is a reviewed line in SUBSET_CLAIMS below, with the
// reason, exactly like every other deny-list in this codebase.

import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(p, "utf8")

/** Every worker on disk — the roster, derived. */
const WORKERS = readdirSync(join(ROOT, "workers"))
  .filter((d) => {
    try {
      return statSync(join(ROOT, "workers", d, "wrangler.jsonc")).isFile()
    } catch {
      return false
    }
  })
  .sort()

/** A worker is PUBLIC unless its own config switches the public URL off. Absence
 * is the dangerous direction, so absence reads as public — the same way
 * Cloudflare treats it.
 *
 * PER SETTING, not per file. Every worker here declares `workers_dev` once at the
 * top level (production) and again under `env.staging`, so asking only "does the
 * word false appear anywhere?" let a worker be opened in ONE environment and
 * still read as closed — production wide open, the test green, and the docs
 * cheerfully saying two public doors. A single `true` anywhere makes it public. */
const isPublic = (w: string) => {
  const cfg = read(join(ROOT, "workers", w, "wrangler.jsonc"))
  if (/"workers_dev"\s*:\s*true/.test(cfg)) return true
  return !/"workers_dev"\s*:\s*false/.test(cfg)
}

const PUBLIC_WORKERS = WORKERS.filter(isPublic)

/** Docs this check reads: the canon in the repo root, plus the skills that stand a
 * fork up (a skill with a stale count builds a broken product). */
const DOCS = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".md")),
  join("skills", "README.md"),
  join("skills", "new-app", "SKILL.md"),
  join("web", "e2e", "README.md"),
]

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
}
const toNumber = (s: string) => WORDS[s.toLowerCase()] ?? Number(s)

/** What counts as a CLAIM. Stripped before matching, in this order:
 *  - fenced code blocks — a shell transcript printing "12 workers" is output, not a
 *    claim about the roster;
 *  - WHITESPACE, collapsed to single spaces. A markdown paragraph wraps wherever it
 *    hits the margin, and the reader hears one sentence either way — so the check has
 *    to read it that way too. Without this, "gateway stays the\n  single public door"
 *    was invisible to every pattern below: the one stale security claim in the repo
 *    sat in AGENT-MODULES-PLAN.md for a month, under the very check written to catch
 *    it, because a line break landed in the middle of it. Collapsing here (before the
 *    quote strips, not after) also means a QUOTE that wraps is still read as a quote;
 *  - short QUOTED phrases, `like this` or "like this" — the same reason the source
 *    scans strip comments before matching (CONVENTIONS.md, "writing a check that can
 *    fail"): the docs that explain this very check have to be able to quote the stale
 *    sentences it forbids. Capped at 60 characters so a whole paragraph can't hide
 *    inside a pair of quotes;
 *  - markdown emphasis — so `**8 Workers**` reads as `8 Workers`. */
const prose = (src: string) =>
  src
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .replace(/`[^`\n]{1,60}`/g, " ")
    .replace(/"[^"\n]{1,60}"/g, " ")
    .replace(/\*\*?/g, "")

const NUM = "one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2}"

/** REVIEWED SUBSET CLAIMS — a count of SOME workers, which is true and must stay
 * sayable. Keyed by the exact phrase, with the reason. If you reword one of these
 * the test goes red: re-read the sentence, then re-approve it here. */
const SUBSET_CLAIMS: { doc: string; phrase: string; why: string }[] = [
  {
    doc: "CONVENTIONS.md",
    phrase: "two workers",
    why: "the shared/ rule — 'if two workers would write it the same way, it lives in shared/'. A pair, not a roster.",
  },
  {
    doc: "ERROR-HANDLING.md",
    phrase: "six workers",
    why: "the workers that BIND THE CORE DB and so can record their own crashes — neither gateway does.",
  },
  {
    doc: "BOOTSTRAP.md",
    phrase: "three workers",
    why: "the workers carrying CF_ACCOUNT_ID (tenancy, content, data-ops) — the per-team D1 REST callers.",
  },
  {
    doc: "BASE-MANUAL.md",
    phrase: "two workers",
    why: "'one of the two workers with a public URL' — the public pair, which this test verifies separately.",
  },
  {
    doc: "BASE-MANUAL.md",
    phrase: "three workers",
    why: "the workers whose mutation routes the publish seam covers (tenancy, content, data-ops) — R1's own scope, not the roster.",
  },
]

const allowedSubset = (doc: string, phrase: string) =>
  SUBSET_CLAIMS.some((s) => s.doc === doc && s.phrase.toLowerCase() === phrase.toLowerCase())

describe("docs agree with the roster on disk", () => {
  it("the roster itself is readable, and exactly two doors are public", () => {
    // If this fails, the repo changed shape and every expectation below is moot —
    // fix this first. Two public doors is the LAW (one per front end): a third
    // public address would be a third route onto /internal/*, the agent and the
    // act-as-user surface.
    expect(WORKERS.length, "workers/ must hold at least the six brains + two doors").toBeGreaterThanOrEqual(8)
    expect(PUBLIC_WORKERS).toEqual(["gateway", "portal-gateway"])
  })

  it("no doc states a worker count that disagrees with workers/ on disk", () => {
    const expected = WORKERS.length
    const wrong: string[] = []

    for (const doc of DOCS) {
      const src = prose(read(join(ROOT, doc)))
      // "eight workers" / "8 workers" / "8-worker split" / "eight-worker shape"
      const re = new RegExp(`\\b(${NUM})[ -](workers\\b|worker[- ](?:split|shape|count))`, "gi")
      for (const m of src.matchAll(re)) {
        const n = toNumber(m[1])
        if (n === expected) continue
        const phrase = `${m[1].toLowerCase()} workers`
        if (allowedSubset(doc, phrase)) continue
        wrong.push(`${doc}: "${m[0].trim()}" — there are ${expected} workers on disk (${WORKERS.join(", ")})`)
      }
    }

    expect(
      wrong,
      `A doc names a different number of workers than workers/ holds. Either the doc is stale ` +
        `(fix the sentence) or it is a deliberate SUBSET claim (add it to SUBSET_CLAIMS with a reason):\n` +
        wrong.join("\n")
    ).toEqual([])
  })

  it("no doc states a public-door count that disagrees with the wrangler configs", () => {
    const expected = PUBLIC_WORKERS.length
    const wrong: string[] = []

    for (const doc of DOCS) {
      const src = prose(read(join(ROOT, doc)))
      const re = new RegExp(`\\b(${NUM})[ -]public[ -](?:door|gateway|address|front door)s?\\b`, "gi")
      for (const m of src.matchAll(re)) {
        if (toNumber(m[1]) === expected) continue
        wrong.push(`${doc}: "${m[0].trim()}" — ${expected} workers are public (${PUBLIC_WORKERS.join(", ")})`)
      }
    }

    expect(
      wrong,
      `A doc names a different number of public doors than the wrangler configs allow:\n` + wrong.join("\n")
    ).toEqual([])
  })

  it("no doc still says a single worker is the only public one", () => {
    // The phrasings the sweep had to correct. They carry no number, so the count
    // check above cannot see them — and each one reads as a security guarantee,
    // which is exactly the kind of sentence that must not be quietly wrong.
    //
    // This one also reads the WRANGLER COMMENTS, not just the .md files. Five of
    // them said "only the gateway is public" — and a config comment is where that
    // rule is read at the exact moment someone is deciding whether to add a public
    // route, so it is the last place that should be out of date.
    const STALE = [
      /\bthe only public door\b(?!s)/i,
      /\bone public door\b/i,
      /\bthe single public door\b/i,
      /\bonly the gateway is public\b/i,
      /\bthe single front desk\b/i,
      /\bthe single public address\b/i,
      /\bthe only worker with a public URL\b/i,
    ]
    const wrong: string[] = []
    const CONFIGS = WORKERS.map((w) => join("workers", w, "wrangler.jsonc"))
    for (const doc of [...DOCS, ...CONFIGS]) {
      const src = prose(read(join(ROOT, doc)))
      for (const re of STALE) {
        const m = src.match(re)
        if (m) wrong.push(`${doc}: "${m[0]}" — ${PUBLIC_WORKERS.length} doors are public (${PUBLIC_WORKERS.join(", ")})`)
      }
    }
    expect(
      wrong,
      `A doc still describes ONE public door. Say how many there really are, and keep the ` +
        `reason the rule exists: no public route may reach /internal/*, the agent, or the ` +
        `act-as-user surface.\n` + wrong.join("\n")
    ).toEqual([])
  })
})
