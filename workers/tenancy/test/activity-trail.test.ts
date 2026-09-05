// THE ACTIVITY ROW ITSELF — what it says, and what nothing may do to it.
//
// The activity SEAM suites beside this one (activity-seam.test.ts, one per
// team-data worker) ask whether a mutation writes a row. This asks whether the
// row is worth having and whether it stays true:
//
//   1 · WHAT KIND of event it was — every sentence the app writes classifies to
//       one of the eight verbs, with no `other` and no guessing, and both
//       vocabulary tables are rot-checked so they can only describe reality.
//   2 · WHERE it came from — both public gateways stamp the surface, and both
//       act-as-user executors carry it on every door they call.
//   3 · THAT IT SAYS BOTH — the one INSERT writes both columns, so a row can
//       never be written without them.
//   4 · APPEND-ONLY — nothing anywhere updates or deletes a row in this table.
//
// It lives in tenancy because tenancy owns the schema this table is declared in
// and the one read path over it. It scans EVERY worker, because the writers are
// spread across three of them and the point is that no worker is an exception.

import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import {
  ACTIVITY_VERBS,
  VERB_BY_LAST_WORD,
  VERB_BY_PHRASE,
  activityVerb,
  verbLookupKey,
} from "@shared/workers/activity-verbs"
import { ACTIVITY_ORIGINS, readOrigin } from "@shared/workers/origin"

const ROOT = join(__dirname, "..", "..", "..")

/** Every worker's src .ts file, plus the shared worker code — the whole surface
 * that can write to this table. Test files are out: a fixture writing a made-up
 * sentence is not the app saying it. */
function writerSources(): { rel: string; source: string }[] {
  const dirs = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
    .filter((w) => w.isDirectory())
    .map((w) => join(ROOT, "workers", w.name, "src"))
  dirs.push(join(ROOT, "shared", "workers"))
  return sourceFiles(dirs, { extensions: [".ts"], skipTests: true, relativeTo: ROOT })
}

/** WRITERS THAT ARE NOT THE WRITER — functions that take an activity entry and
 * hand it on. Data, and rot-checked below: each one must really call the shared
 * writer and must really forward a `type` it was given, so this list cannot
 * quietly become a way of excusing a site from the census.
 *
 * One today. `recordGoogleAct` is the audit line for every act kwapso performs
 * inside somebody's Google account, and its callers write the sentence — so a
 * scan that only opened `logActivity(` call sites never saw "Reply sent" or
 * "Message labelled" and could not have told you what verb they store. */
const PASS_THROUGH_WRITERS = ["recordGoogleAct"]

/** The balanced argument text of every call to `fn` in `source`, each with the
 * name of the top-level function it sits inside — which is what tells a FORWARD
 * (a pass-through handing on the entry it was given) from a WRITE. */
function callBodies(source: string, fn: string): { body: string; inside: string }[] {
  const out: { body: string; inside: string }[] = []
  const declarations = [...source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)]
  for (const call of source.matchAll(new RegExp(`(?<![A-Za-z0-9_$.])${fn}\\s*\\(`, "g"))) {
    const at = call.index ?? 0
    let i = at + call[0].length
    let depth = 1
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth++
      else if (source[i] === ")") depth--
      i++
    }
    const enclosing = declarations.filter((d) => (d.index ?? 0) < at).pop()
    out.push({ body: source.slice(at, i), inside: enclosing?.[1] ?? "" })
  }
  return out
}

/** Every string an activity `type:` can actually BE, read off the call sites.
 *
 * Not "every string literal near a writer call" — that would collect the
 * operands of the comparisons those sites are full of (`status === "done"`) and
 * demand a verb for the word "done" standing alone, which the app never writes.
 * So comparison operands are removed first, a template literal is EXPANDED
 * (`Story ${x ? "done" : "updated"}` yields "Story done" and "Story updated" —
 * the strings that actually reach the column), and a lookup into a module-level
 * table (`SHARE_ACTIVITY[input.kind]`) is resolved by reading that table.
 *
 * Nothing is allowed to remain unreadable. An expression this cannot resolve is
 * a sentence whose stored verb is UNPROVEN, and an unproven verb is exactly the
 * hole the census exists to close — so it fails and names the file. */
function activityTypeStrings(): { text: string; where: string }[] {
  const out: { text: string; where: string }[] = []
  const unreadable: string[] = []
  for (const { rel, source: raw } of writerSources()) {
    const source = stripComments(raw)
    const bodies = ["logActivity", "writeActivity", ...PASS_THROUGH_WRITERS].flatMap((fn) =>
      callBodies(source, fn)
    )
    for (const { body, inside } of bodies) {
      const typeExpr = /\btype:\s*([^\n]*?),\s*\n\s*description:/.exec(body)
      if (!typeExpr) continue
      // A FORWARD, not a write: a pass-through writer hands on the `type` it was
      // handed, and the sentences live at ITS call sites, which this census
      // opens separately. Allowed only inside a declared pass-through — the same
      // shape anywhere else is a sentence nobody can read and fails below.
      if (/^\w+\.type$/.test(typeExpr[1].trim()) && PASS_THROUGH_WRITERS.includes(inside)) continue
      // Strip the operands of equality tests: `status === "done" ? …` names a
      // state being COMPARED, never a sentence being written.
      let expr = typeExpr[1].replace(/[!=]==?\s*"[^"]*"/g, "")
      // Resolve a lookup into a module-level table by reading the table itself —
      // the declaring file, never the assembler.
      const lookup = /^(\w+)\[/.exec(expr.trim())
      if (lookup) {
        const table = new RegExp(`const ${lookup[1]}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source)
        if (!table) {
          unreadable.push(`${rel}: ${expr.trim()}`)
          continue
        }
        expr = table[1]
      }
      const literals = [...expr.matchAll(/"([^"]*)"/g)].map((m) => m[1])
      const templates = [...expr.matchAll(/`([^`$]*)\$\{/g)].map((m) => m[1])
      if (templates.length) {
        for (const head of templates) for (const tail of literals) out.push({ text: head + tail, where: rel })
        continue
      }
      if (literals.length) {
        for (const text of literals) out.push({ text, where: rel })
        continue
      }
      unreadable.push(`${rel}: ${typeExpr[1].trim()}`)
    }
  }
  expect(
    unreadable,
    `these activity writes name a type this census cannot resolve, so the verb they store is unproven: ${unreadable.join(", ")}`
  ).toEqual([])
  return out
}

describe("the activity row says what kind of thing happened", () => {
  const types = activityTypeStrings()

  it("finds the write sites (the scan itself must not go blind)", () => {
    expect(types.length).toBeGreaterThan(100)
    expect(types.map((t) => t.text)).toContain("Account archived")
  })

  it("every sentence the app writes classifies to a real verb, never `other`", () => {
    const unreadable = types
      .filter((t) => activityVerb(t.text) === "other")
      .map((t) => `"${t.text}" (${t.where})`)
    expect(
      unreadable,
      `shared/workers/activity-verbs.ts cannot read these sentences, so they would store the verb "other" and no filter would find them. Add the last word to VERB_BY_LAST_WORD, or the whole phrase to VERB_BY_PHRASE: ${unreadable.join(", ")}`
    ).toEqual([])
  })

  it("classifies the same event the same way however it is spelt", () => {
    // The five coats the review found on one event. If this ever fails, an
    // archive has become findable under one word and invisible under another.
    for (const spelling of [
      "Internal rate retired",
      "To-do withdrawn",
      "Staff profile taken down",
      "Module switched off",
      "Work log binned",
      "Account archived",
    ])
      expect(activityVerb(spelling), spelling).toBe("archived")
  })

  it("reads the verb off the sentence, not off a trailing aside", () => {
    // The bulk ticket move says "Tickets resolved (bulk)". A count-shaped aside
    // is exactly the kind of thing that keeps being appended to a sentence.
    expect(activityVerb("Tickets resolved (bulk)")).toBe("status")
    expect(activityVerb("Tickets updated (bulk)")).toBe("edited")
  })

  it("no word in the vocabulary describes something the app no longer says", () => {
    // Asked through the classifier's OWN lookup, never a copy of it — a check
    // that re-implemented the resolution would be a parser agreeing with itself,
    // and it would be wrong exactly where the classifier is cleverest.
    const said = new Set(types.map((t) => verbLookupKey(t.text)))
    const unused = [...Object.keys(VERB_BY_LAST_WORD), ...Object.keys(VERB_BY_PHRASE)].filter(
      (k) => !said.has(k)
    )
    expect(
      unused,
      `these entries classify nothing the app writes any more — delete them, so the vocabulary can only ever describe what is really said: ${unused.join(", ")}`
    ).toEqual([])
  })

  it("a phrase ruling overrules the grammar it was written to beat", () => {
    // Proves the phrase table is consulted FIRST. "Module switched off" ends on
    // a word the last-word map does not hold; "Shared again" ends on one it
    // deliberately does not, so a coincidence of grammar cannot outvote a ruling.
    expect(activityVerb("Shared again")).toBe("restored")
    expect(activityVerb("Story in progress")).toBe("status")
  })
})

describe("the activity row says which front door it came through", () => {
  const sources = writerSources()
  const find = (rel: string) => {
    const file = sources.find((f) => f.rel === rel)
    expect(file, `${rel} must exist for this check to mean anything`).toBeDefined()
    return stripComments((file as { source: string }).source)
  }

  it("both public gateways stamp the surface, and they stamp different ones", () => {
    expect(find("workers/gateway/src/index.ts")).toMatch(/stampOrigin\([\s\S]*?"app"\)/)
    expect(find("workers/portal-gateway/src/index.ts")).toMatch(/stampOrigin\([\s\S]*?"portal"\)/)
  })

  it("every act-as-user hop names its surface", () => {
    // forwardToDoor REQUIRES an origin, so the compiler already holds this — what
    // is checked here is that nobody has quietly settled on one label for all of
    // them, which would compile and would erase the distinction the column exists
    // to make.
    const named = new Set<string>()
    for (const { source } of sources) {
      const code = stripComments(source)
      // Two shapes, because a surface is declared in two places: on the hop
      // (`origin: "mcp"` in a forwardToDoor call) and on a config built outside a
      // request (`d1ConfigFrom(env, "automation")` in a cron).
      for (const m of code.matchAll(/origin:\s*"(\w+)"/g)) named.add(m[1])
      for (const m of code.matchAll(/d1Config(?:From)?\([^)]*,\s*"(\w+)"\)/g)) named.add(m[1])
    }
    for (const surface of ["mcp", "assistant", "import", "automation"])
      expect(named, `nothing declares the ${surface} surface any more`).toContain(surface)
  })

  it("an unrecognised header is `unknown`, never the caller's own string", () => {
    const header = (value: string) => ({ headers: { get: () => value } })
    expect(readOrigin(header("app"))).toBe("app")
    expect(readOrigin(header("portal"))).toBe("portal")
    // A caller inventing a surface, and a caller trying to put something else in
    // the column. Neither reaches the row.
    expect(readOrigin(header("boardroom"))).toBe("unknown")
    expect(readOrigin(header("'); DROP TABLE activity;--"))).toBe("unknown")
    expect(readOrigin({ headers: { get: () => null } })).toBe("unknown")
  })

  it("the one INSERT writes both new columns, so a row cannot be written without them", () => {
    const writer = find("shared/workers/activity.ts")
    expect(writer).toContain("verb")
    expect(writer).toContain("origin")
    expect(writer).toMatch(/activityVerb\(entry\.type\)/)
    expect(writer).toMatch(/cfg\.origin \?\? "unknown"/)
  })

  it("the two closed sets stay closed", () => {
    expect(new Set(ACTIVITY_ORIGINS).size).toBe(ACTIVITY_ORIGINS.length)
    expect(new Set(ACTIVITY_VERBS).size).toBe(ACTIVITY_VERBS.length)
    expect(new Set(Object.values(VERB_BY_LAST_WORD))).not.toContain("other")
    expect(new Set(Object.values(VERB_BY_PHRASE))).not.toContain("other")
  })
})

describe("nothing rewrites history", () => {
  it("no worker updates or deletes a row in the activity table", () => {
    // Stated in the schema since 0062's comment; asserted here, because an
    // invariant that is only true by habit is one the next person breaks without
    // knowing it existed. Both spellings of the table's own name are covered, and
    // `account_activity` (the global identity trail) is deliberately NOT matched
    // by the word boundary — it has its own ceiling test.
    const offenders: string[] = []
    for (const { rel, source } of writerSources()) {
      const code = stripComments(source)
      for (const m of code.matchAll(/\bUPDATE\s+activity\b/gi)) offenders.push(`${rel} @${m.index}`)
      for (const m of code.matchAll(/\bDELETE\s+FROM\s+activity\b/gi))
        offenders.push(`${rel} @${m.index}`)
    }
    expect(
      offenders,
      `the activity table is append-only — a row written is a row that stays. These statements change one: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("there is exactly one way into the table from outside a migration", () => {
    const inserts: string[] = []
    for (const { rel, source } of writerSources())
      for (const m of stripComments(source).matchAll(/\bINSERT\s+INTO\s+activity\b/gi))
        inserts.push(`${rel} @${m.index}`)
    expect(
      inserts.map((s) => s.split(" @")[0]),
      "only shared/workers/activity.ts may insert here; every caller goes through logActivity or writeActivity"
    ).toEqual(["shared/workers/activity.ts"])
  })
})
