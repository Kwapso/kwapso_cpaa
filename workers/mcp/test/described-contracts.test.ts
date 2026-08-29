// R27 — DESCRIBED CONTRACTS: every `backticked` identifier in a tool
// description names something real.
//
// R19/R22 prove the machine-readable contract — schema, buildQuery, buildBody —
// against the door's own source. Neither ever reads the PROSE, and the prose is
// the half a developer and a model actually read. Proven on 2026-08-16: a
// session reverted a tool description to a false promise, added two parameters
// that do not exist and a fake filter claim, and `npm run check` passed —
// because every law on this surface reads the wiring and none read the words.
//
// So the words get the same treatment the wiring gets: DERIVED, never trusted.
// A backticked identifier in a description must be one of:
//
//   1. an argument the tool's own schema declares;
//   2. a query param its door parses (`searchParams.get`, the R19 census);
//   3. a body field its door reads (`body.<f>`, the R22 census);
//   4. a field its response actually carries, from the seams and the door's own
//      source — the pagedJson contract (R14's one paged shape) plus the door's
//      extras read out of the call itself; the keys of `json({...})` literals in
//      the handler; the row fields the module's own libs map off a database row
//      (`stepKey: r.step_key` — the one shape every mapper here uses); and the
//      keys of R23's `knowledgeAnswer` seam, for the module whose routes import
//      it (no door may assemble that response by hand, so the seam IS the
//      contract);
//   5. another tool's name on either machine surface (descriptions cross-refer:
//      "pass `cursor` from `list_help_tickets`");
//   6. an entry in DESCRIPTION_VOCABULARY below — the small reviewed remainder,
//      each with a reason, rot-checked like every other deny-list in the base.
//
// Nothing hand-listed that can be derived: tools from the three catalogues
// themselves, doors from each worker's own switchboard, reads from handler
// source, response keys from the seams and the module's own libs.
//
// SCOPE, stated honestly: this law checks IDENTIFIERS, not sentences. A
// description that misuses a REAL identifier ("filters by `status`" on a door
// whose rows merely carry status) tells a lie no identifier census can see —
// that sentence is R19/R22's to make pointless, since the schema either exposes
// the filter or doesn't. What THIS law ends is the lie that actually shipped:
// a name that exists nowhere — not in the schema, not in the door, not in the
// response — surviving review because only humans read prose, and humans
// assume a green build checked it.

import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import { SHARED_TOOLS } from "@shared/workers/tool-catalog"
import { MCP_TOOLS } from "../src/lib/tools"
import { TOOL_CATALOG } from "../../data-ops/src/lib/tools"
import {
  DOORS,
  doorBodyFields,
  doorParams,
  fnBody,
  handlerBody,
  moduleLibSources,
  type Door,
} from "./door-census"

/* ------------------------- the reviewed vocabulary ------------------------- */

/** The identifiers a description may use that NO derivation can see — each a
 * decision someone made, in writing. This list is a deny-list in spirit: an
 * entry nothing uses turns the build red (the rotting-entry rule every registry
 * in this base follows), so it can only hold words descriptions actually need.
 * Before adding a line here, ask whether the word belongs to a class above —
 * a schema argument, a door read, a response field, a tool name — because an
 * entry for a derivable word is a bypass with better manners. */
const DESCRIPTION_VOCABULARY: Record<string, string> = {
  help:
    "the OTHER NAME the query grammar's `tickets` module answers to, and the one every other tool in this catalogue uses for the same thing — `list_help_tickets`, `set_help_status`, the door at /api/content/help, the permission string on every role's sheet (CLAUDE.md says why all of those stay `help` while the label is Tickets). `describe_module` and `query_records` accept it, so the word names something the door really takes; it is underivable because the aliases are computed from QUERY_MODULES' own `table` and `module` fields (shared/workers/query-grammar.ts MODULE_ALIASES) rather than declared in a schema or read off a query string, and no census here walks that map. Delete this line when the derivation learns to read MODULE_ALIASES, or when the module names stop diverging. Earned on 29 Aug 2026: the assistant asked for `help`, the door refused, and the owner's own question died on its first call — so the description now teaches the alias, which is exactly the kind of true sentence this list exists to allow.",
  open:
    "the count of tickets NOT resolved, on each entry of `list_help_tickets`' `byAccount` tally — computed in the GROUP BY itself (`SUM(CASE WHEN h.status = 'resolved' THEN 0 ELSE 1 END)`) in workers/content/src/lib/help.ts and mapped as `open:`. Underivable for the same reason `runaway` is, plus one: it is NESTED a level inside a response field, and the response-key derivation reads the keys a door hands over rather than the shape of the objects inside them. Delete this line when that census learns to walk one level down, or when `byAccount` goes.",
  runaway:
    "the flag on a running timer that has been going longer than RUNAWAY_HOURS — computed at read time in workers/content/src/lib/work-logs.ts (`runaway: elapsed > …`), so it is a real row field the row-mapper derivation cannot see: no column is copied, the value is arithmetic over one.",
  awaiting_validation:
    "the stage a ticket OPENS in when its kind is one that waits for the client (CHECKLIST 5.13). It is a VALUE of the `status` column, not a field: `createTicket` computes it and no door reads it off a body, so neither the schema census nor the response-key derivation can see it. The list it belongs to is HELP_STATUSES in shared/types.ts.",
  new: "the other stage `createTicket` may open a ticket in — the same HELP_STATUSES value, and named beside its sibling for the same reason: a description that said one and not the other would describe half a decision.",
  // `yours` was here, apologising for a blind spot instead of removing it: the
  // shorthand pattern in `literalKeys` used to EAT the comma it matched, so only
  // every other shorthand property was seen. The lookbehind fixed that and this
  // entry became derivable — which the rot-check said, unprompted, the moment the
  // derivation improved. That is the exemption list working the way it should.
  roleCount:
    "how many roles sit in a department — a real field on every row list_client_departments returns, and one no column supplies: the list door counts the joining table in a sub-select and the mapper reads `Number(r.role_count)`, so the row-mapper derivation (which looks for a column copied straight across) cannot see it. Counted in the one statement rather than per row on purpose — a query per department is the N+1 this module would otherwise have been born with.",
  departmentIds:
    "the departments a role sits in — several, deliberately (the owner: \"one role is doing things across multiple departments, especially in slightly smaller companies\"). It is a real field on every row list_client_roles returns AND a real body field update_client_role sends, and it is derivable from neither side: the value is stitched in memory from a second statement over `client_role_departments`, not copied off a column.",
  peopleIds:
    "the contacts holding a role, stitched from `client_role_people` in the same read as the departments above and for the same reason — one statement for the whole page rather than one per role. There is deliberately no person table behind it: a person on a role is a contact we already have, because a second address book is one that goes out of step with the first.",
  export_too_large:
    "the refusal code a too-big export answers with, thrown by the one CSV seam (shared/workers/csv.ts) — R14's posture applied to files: the export is whole or it is an error, never a silently short CSV. An error VALUE rather than a response key, so no door's own source names it.",
  memberUserId:
    "who on a meeting's invitation is one of OUR OWN people. It is a real field on every `links` row `get_meeting_people` returns, and it is derivable from nothing this census can read: `linkGuests` (workers/content/src/lib/meetings.ts) builds it from a users row in the GLOBAL core database, over `env.DB.prepare` rather than the team's REST door, so the row-mapper derivation — which reads a module's libs mapping off a team-database row — never sees the statement at all. The shape it belongs to is `MeetingPersonLink` in shared/types.ts.",
  memberName:
    "the name beside `memberUserId`, and underivable for exactly the same reason — it is assembled in code from the core database's `first_name` and `last_name`, so there is no column being copied for the derivation to find. Named beside its sibling because a description that promised the id and not the name would describe half a row.",
}

/* --------------------------- the judged universe --------------------------- */

type Judged = {
  name: string
  surface: "shared" | "mcp" | "agent"
  text: string
  schema: Record<string, unknown>
  method: string
  path: string
}

/** Every distinct tool on either machine surface, with the one description its
 * callers read. The two surface catalogues PROJECT the shared tools (the MCP
 * appends only the derived "Needs <gate>." hint), so the shared summary is
 * judged once and each surface-only description is judged where it lives. */
const sharedNames = new Set(SHARED_TOOLS.flatMap((s) => [s.name, s.mcpName ?? s.name]))
const JUDGED: Judged[] = [
  ...SHARED_TOOLS.map((t): Judged => ({
    name: t.name, surface: "shared", text: t.summary, schema: t.schema, method: t.method, path: t.path,
  })),
  ...MCP_TOOLS.filter((t) => !sharedNames.has(t.name)).map((t): Judged => ({
    name: t.name, surface: "mcp", text: t.description, schema: t.inputSchema, method: t.method, path: t.path,
  })),
  ...TOOL_CATALOG.filter((t) => !sharedNames.has(t.name)).map((t): Judged => ({
    name: t.name, surface: "agent", text: t.description, schema: t.schema, method: t.method, path: t.path,
  })),
]

/** Every name a description may cross-refer to: canonical + historical MCP names. */
const ALL_TOOL_NAMES = new Set([
  ...JUDGED.map((t) => t.name),
  ...SHARED_TOOLS.flatMap((s) => (s.mcpName ? [s.mcpName] : [])),
])

/** A whole-token backticked identifier: `cursor` matches; `view=archived` and
 * `'mine'` don't (an expression or a quoted value is not an identifier claim). */
const backticked = (text: string): string[] =>
  [...text.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map((m) => m[1])

const doorOf = (t: Judged): Door | undefined =>
  DOORS.find((d) => d.path === t.path && d.method === t.method)

/* ------------------- class 4: what the response carries ------------------- */

/** The text of every `<callee>(…)` call in a source slice, parens balanced. */
function callTexts(src: string, callee: string): string[] {
  const out: string[] = []
  let at = src.indexOf(`${callee}(`)
  while (at !== -1) {
    let depth = 0
    let i = at + callee.length
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")") {
        depth--
        if (depth === 0) break
      }
    }
    out.push(src.slice(at, i + 1))
    at = src.indexOf(`${callee}(`, i)
  }
  return out
}

/** Object keys (`total:`) and shorthand properties (`{ emailSent,`) in a slice.
 * Comments go first — a comment between two keys would otherwise break the
 * adjacency both patterns stand on (the seam's own `message:` sits under one).
 *
 * THE DELIMITER IS MATCHED BUT NOT CONSUMED, and that is the whole correctness of
 * this. It used to be `[{,]\s*(\w+)\s*[,}]`, which EATS the comma it matched — so
 * in `json({ onDuty, yours, total })` the comma that ends `onDuty` is gone before
 * `yours` is looked for, and only every OTHER shorthand property was ever found.
 * The symptom was a real response field the check could not see, and the repair
 * at the time was a hand-written vocabulary entry apologising for the blind spot
 * rather than removing it — so the next handler written in shorthand hit the same
 * wall (`total`, 24 Aug 2026, when a sequential pair became a `Promise.all` and
 * its keys became shorthand). A lookbehind leaves the delimiter in place for the
 * next match, and the exemption it needed is gone. */
function literalKeys(src: string): string[] {
  const clean = stripComments(src)
  return [
    ...[...clean.matchAll(/(?<=[{,])\s*(\w+)\s*(?=:)/g)].map((m) => m[1]),
    ...[...clean.matchAll(/(?<=[{,])\s*(\w+)\s*(?=[,}])/g)].map((m) => m[1]),
  ]
}

/** What a door's response really carries, read from the seams and its own source:
 *   • pagedJson calls — the R14 contract (total, totalCapped, hasMore,
 *     nextCursor), the rows key, and the door's own extras (help's mineTotal,
 *     work-logs' totalSeconds), all read out of the call itself;
 *   • json({…}) literals in the handler (invite's emailSent, sync's caughtUp);
 *   • the row fields the module's own libs map off a database row — the keys of
 *     `field: r.<column>` / `row.<column>` expressions in the lib files this
 *     door's routes file imports. That pattern is the ONE shape every mapper in
 *     this base uses, and scoping to it is what keeps this class from
 *     swallowing every object key in the module (which would let a fake filter
 *     hide behind any word a lib happens to use);
 *   • R23's knowledgeAnswer seam keys, where the module imports the seam — the
 *     law that no door assembles that answer by hand is exactly what makes the
 *     seam's own function the response contract. */
function responseFields(door: Door): Set<string> {
  const out = new Set<string>()
  const handler = handlerBody(door)
  for (const call of callTexts(handler, "pagedJson")) {
    const rowsKey = call.match(/pagedJson\(\s*"(\w+)"/)?.[1]
    if (rowsKey) out.add(rowsKey)
    for (const k of literalKeys(call)) out.add(k)
    for (const k of ["total", "totalCapped", "hasMore", "nextCursor"]) out.add(k)
  }
  for (const call of callTexts(handler, "json")) for (const k of literalKeys(call)) out.add(k)
  const libs = moduleLibSources(door)
  // A DOOR THAT HANDS ITS ANSWER OVER WHOLE. `json(answer)` carries no literal at
  // all, so every class above is blind to it — and that shape is not an oversight,
  // it is R23's rule written on another door: when `found` and the sentence that
  // hangs off it are ONE decision, the seam that made them is the contract and the
  // handler must not pick fields out again. The knowledgeAnswer clause below says
  // exactly this for exactly one seam, by name. This says it for any of them: find
  // what identifier reached `json`, find the lib function the handler awaited into
  // it, and read THAT function's keys. Earned by getMeetingTranscript, whose empty
  // answer became `found: false` plus a sentence — two real fields the check could
  // not see, and the tempting repair was a vocabulary line apologising for the
  // blind spot instead of removing it. (The same repair the shorthand-property bug
  // got wrong once already — see literalKeys.)
  for (const call of callTexts(handler, "json")) {
    const held = call.match(/^json\(\s*(\w+)\s*\)$/)?.[1]
    if (!held) continue
    const maker = handler.match(new RegExp(`const ${held}\\s*=\\s*await\\s+(\\w+)\\(`))?.[1]
    if (!maker) continue
    for (const lib of libs) for (const k of literalKeys(fnBody(lib, maker))) out.add(k)
  }
  for (const lib of libs)
    for (const m of lib.matchAll(/(\w+):\s*(?:r|row)\??\.\w+/g)) out.add(m[1])
  for (const lib of libs)
    if (/export function knowledgeAnswer\(/.test(lib))
      for (const k of literalKeys(fnBody(lib, "knowledgeAnswer"))) out.add(k)
  return out
}

/** Everything a backticked identifier in this tool's description may name —
 * the five derived classes, plus whichever vocabulary is granted (the dead-entry
 * check below passes a narrowed one to ask "would this entry be missed?"). */
function allowedFor(t: Judged, vocabulary: Iterable<string> = Object.keys(DESCRIPTION_VOCABULARY)): Set<string> {
  const door = doorOf(t)
  return new Set<string>([
    ...Object.keys((t.schema as { properties?: Record<string, unknown> }).properties ?? {}),
    ...(door ? doorParams(door) : []),
    ...(door ? doorBodyFields(door) : []),
    ...(door ? responseFields(door) : []),
    ...ALL_TOOL_NAMES,
    ...vocabulary,
  ])
}

const offendersOf = (t: Judged): string[] =>
  [...new Set(backticked(t.text))].filter((w) => !allowedFor(t).has(w))

/* --------------------------------- the law --------------------------------- */

describe("described-contracts (R27): a description may only name what is real", () => {
  it("finds the whole surface to judge (the census must not silently go blind)", () => {
    // All three catalogues are in the universe…
    // The floor moved from 120 to 115 on 17 Aug 2026: Marketing, Learning and
    // the delivery programmes were purged, taking eleven shared tools with them.
    expect(JUDGED.filter((t) => t.surface === "shared").length).toBeGreaterThanOrEqual(115)
    expect(JUDGED.filter((t) => t.surface === "mcp").length).toBeGreaterThanOrEqual(20)
    expect(JUDGED.filter((t) => t.surface === "agent").length).toBeGreaterThanOrEqual(15)
    // …and the descriptions really carry identifiers to judge (150+ today; a
    // collapse in the extractor would zero this long before it zeroes tools).
    const mentions = JUDGED.reduce((n, t) => n + backticked(t.text).length, 0)
    expect(mentions, "the backtick extractor stopped finding identifiers").toBeGreaterThanOrEqual(150)
  })

  it("each derivation class still sees the case that proves it", () => {
    const by = (name: string) => JUDGED.find((t) => t.name === name)!
    // The paged contract (R14's seam): a paged list may promise nextCursor.
    expect(allowedFor(by("list_help_tickets")).has("nextCursor")).toBe(true)
    // A handler's own json({…}) literal: the invite door answers emailSent.
    expect(allowedFor(by("invite_member")).has("emailSent")).toBe(true)
    // A module lib's row mapper: a story row carries stepKey.
    expect(allowedFor(by("set_story_status")).has("stepKey")).toBe(true)
    // R23's seam: the ask door's answer carries found, and the seam is where
    // that key lives — no door assembles it by hand.
    expect(allowedFor(by("ask_knowledge")).has("found")).toBe(true)
    // And the allow-set has NOT degenerated into "everything": a word that is
    // real elsewhere is still refused where it names nothing.
    expect(allowedFor(by("list_dropdown_values")).has("parentId")).toBe(false)
    expect(allowedFor(by("list_help_tickets")).has("stepKey")).toBe(false)
  })

  it("the three lies from the 2026-08-16 proof cannot pass this classifier", () => {
    // The incident, replayed in memory against the REAL classifier (the same
    // allowedFor the enforcement below uses — not a copy): a description
    // reverted to a false promise, two parameters that do not exist, a fake
    // filter. A green run of this suite means all three still go red.
    const victim = JUDGED.find((t) => t.name === "list_help_tickets")!
    const lies: [string, string][] = [
      ["a false response promise", "The `exactTotal` field is never capped."],
      ["a parameter that does not exist", "Pass `includeArchived` and `matchMode` to widen the search."],
      ["a fake filter claim", "`assigneeId` narrows the list to one person's tickets."],
    ]
    for (const [what, text] of lies) {
      const caught = offendersOf({ ...victim, text })
      expect(caught.length, `${what} (“${text}”) must be caught`).toBeGreaterThan(0)
    }
  })

  it("every vocabulary entry is still used, and still needs to exist", () => {
    for (const [word, why] of Object.entries(DESCRIPTION_VOCABULARY)) {
      expect(why.length, `"${word}" needs a reason someone can disagree with`).toBeGreaterThan(40)
      // The rotting-entry rule: an entry nothing uses is a standing licence to
      // lie with that word later. Delete the line when the last use goes.
      expect(
        JUDGED.some((t) => backticked(t.text).includes(word)),
        `"${word}" is in DESCRIPTION_VOCABULARY but no description uses it — delete the line`
      ).toBe(true)
      // And an entry a derivation now covers is a bypass with better manners:
      // if every tool that says the word is allowed it WITHOUT this entry, the
      // line is dead weight in front of a real class — delete it.
      const without = Object.keys(DESCRIPTION_VOCABULARY).filter((k) => k !== word)
      const stillNeeded = JUDGED.some(
        (t) => backticked(t.text).includes(word) && !allowedFor(t, without).has(word)
      )
      expect(
        stillNeeded,
        `"${word}" is in DESCRIPTION_VOCABULARY but every description that uses it is already covered by a derived class — delete the line`
      ).toBe(true)
    }
  })

  for (const t of JUDGED) {
    const bad = offendersOf(t)
    if (!bad.length && !backticked(t.text).length) continue
    it(`${t.name} [${t.surface}] names only what is real`, () => {
      expect(
        bad,
        `${t.name}'s description backticks ${bad.map((w) => `\`${w}\``).join(", ")} — which is not an argument its schema declares, a param or body field its door (${t.method} ${t.path}) reads, a field its response carries, a tool name, or a DESCRIPTION_VOCABULARY entry. Fix the description, or fix the contract it should have been describing — and if the word is real but underivable, add a reasoned vocabulary line.`
      ).toEqual([])
    })
  }
})
