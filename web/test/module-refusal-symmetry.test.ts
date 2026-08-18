// IF A MODULE'S READS REFUSE A CLIENT LOGIN, SO MUST ITS WRITES.
//
// R21 is enforced (`client-reachable-doors` in rules.test.ts) and it asks exactly
// the right question — "can a caller holding the Client role's rights pass this
// door?" — which means it stops at every door the shipped role cannot reach.
// Eleven agency-only WRITE doors sat in that shadow: the learning library (since
// purged), the
// dropdown vocabulary and the team's own record each had `refusePortalCaller` on
// EVERY read door and on NOT ONE write door.
//
// Nothing was leaking. The seeded Client role holds no write right, so the doors
// were refuted as findings — and that is precisely the objection. R21's own text
// says the refusal belongs at the door "so it does not depend on how carefully a
// role was built", and an owner who ticks `brand_assets: edit` on their client role
// is one checkbox away from a client editing the agency's how-to library. A
// defence that survives only because of a permission matrix somebody may change
// tomorrow is a defence with a date on it.
//
// So this asks the question R21 cannot: for each module, do the two halves AGREE?
// Nothing is hand-listed — the modules are discovered from the read doors that
// already refuse, and the writes are found in the same file.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const ROOT = join(__dirname, "..", "..")

/** Every route handler in a worker's routes/ directory, name → body. */
function handlers(worker: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const { source } of sourceFiles(join(ROOT, "workers", worker, "src", "routes"), {
    extensions: [".ts"],
  })) {
    const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) =>
      out.set(m[1], stripComments(source.slice(m.index, starts[i + 1]?.index ?? source.length)))
    )
  }
  return out
}

/** The module + right a handler gates on, if it says so at its own opening. */
function gatesOf(body: string): { module: string; right: string }[] {
  return [
    ...body.matchAll(/\bgated(?:Body)?(?:<[^>]*>)?\s*\(\s*request,\s*env,\s*"(\w+)",\s*"(\w+)"/g),
    ...body.matchAll(/\brequireRight\s*\(\s*\w+,\s*\w+,\s*"(\w+)",\s*"(\w+)"/g),
  ].map((m) => ({ module: m[1], right: m[2] }))
}

/** A handler's source PLUS the source of the route-local helpers it calls —
 * R21's own `reach`, for R21's own stated reason: "a refusal one frame down
 * still counts". This scan read the handler alone and so accused
 * `POST /import/batch/plan` of not refusing a client login, when it refuses in
 * the first line of `requireAnyImportRight` — a false alarm that would have
 * taught the next reader to distrust the check, which is worse than no check.
 * Bounded, so a mutually recursive pair cannot run away. */
function reach(fns: Map<string, string>, name: string, seen = new Set<string>()): string {
  if (seen.has(name) || seen.size > 6) return ""
  seen.add(name)
  const body = fns.get(name)
  if (!body) return ""
  let out = body
  for (const other of fns.keys())
    if (other !== name && new RegExp(`(?<![\\w.])${other}\\s*\\(`).test(body)) out += reach(fns, other, seen)
  return out
}

describe("a module refuses a client login on both halves, or on neither", () => {
  it("every module whose reads refuse a client login refuses them on its writes too", () => {
    // door → { module, right, refuses }, for every gated door in the three
    // workers R21 walks.
    type Door = { key: string; module: string; right: string; refuses: boolean }
    const doors: Door[] = []
    for (const worker of ["tenancy", "content", "data-ops"]) {
      const index = readFileSync(join(ROOT, "workers", worker, "src", "index.ts"), "utf8")
      const table = /export const ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(index)
      expect(table, `workers/${worker} has no ROUTES table — did it move?`).toBeTruthy()
      const fns = handlers(worker)
      for (const [, door, handler] of (table as RegExpExecArray)[1].matchAll(
        /"([A-Z]+ \/[^"]+)":\s*\{\s*handler:\s*(\w+)/g
      )) {
        const body = fns.get(handler)
        if (!body) continue
        // The GATE is read off the handler's own opening (that is where a door
        // states its terms); the REFUSAL is read one frame down as well, because
        // that is where several of them legitimately live.
        const withHelpers = reach(fns, handler)
        for (const g of gatesOf(body))
          doors.push({
            key: `${door} (${worker}/${handler})`,
            module: g.module,
            right: g.right,
            refuses: /refusePortalCaller\s*\(/.test(withHelpers),
          })
      }
    }
    expect(doors.length, "no gated doors parsed — this test is reading nothing").toBeGreaterThan(20)

    // DISCOVERED, not listed: a module is "agency-only" because every one of its
    // READ doors already says so in code. That is the whole derivation — add a
    // module tomorrow and it joins the set the day its reads refuse.
    const agencyOnly = new Set<string>()
    for (const module of new Set(doors.map((d) => d.module))) {
      const reads = doors.filter((d) => d.module === module && d.right === "read")
      if (reads.length > 0 && reads.every((d) => d.refuses)) agencyOnly.add(module)
    }
    // Pinned so a SHRINKING set is a failure rather than a quiet pass: if a read
    // door loses its refusal, this derivation would stop calling its module
    // agency-only and the writes below would stop being checked — the test would
    // go green by learning less. The team's own record and the screen recipes are
    // NOT here, and that is the derivation being honest rather than incomplete:
    // their read doors gate on identity (`teamContext`), not on a module right,
    // so there is no `<module>:read` gate for this scan to read. They are named
    // by hand below, which is the only place in this file anything is.
    //
    // `agent` joined the set when the assistant's six doors started refusing a
    // client login. It was the module R21 could not see AT ALL: the derivation
    // reads the Client role's rights out of the seed to decide which doors to
    // walk, the seed named no `agent` right, so `if (!passable) continue` skipped
    // the whole surface — while the DEFAULT Viewer template ships
    // `agent: read + create`, which is what an owner clones to build a client
    // role. The seed now holds the right (worst case, on purpose), the doors now
    // refuse, and the write half — chat and confirm, the two that spend the
    // team's AI allowance — is checked below like every other module's.
    // `knowledge` was agency-only from its first commit rather than by later
    // discovery: it holds the agency's own material — its process notes, its
    // internal tickets, what it knows about each client — so there is no fenced
    // slice of it to serve a client, only a refusal, on every door of both halves.
    expect(
      [...agencyOnly].sort(),
      "the modules whose reads refuse a client login — if this set shrinks, a read door lost its refusal"
    // `work` joined the set the day the work engine shipped, and it is the one
    // member whose exclusion would have been most tempting: a story is ABOUT a
    // client's request, so a fence looks plausible. It is refused instead,
    // because of what a story ROW says rather than whose request it answers —
    // a title, an assignee, a reviewer and a date, which together are "which
    // staff member is doing the work", the one thing SCOPE ch.06 says the portal
    // never shows. What a client sees of a story is a COUNT on their own ticket,
    // served by the ticket door. `processes` is the contrast, three lines down.
    //
    // The four agency-internal modules joined the day they shipped, not by later
    // discovery: every one of them holds the agency's own material — what we
    // publish, the material we publish it with, how we run delivery, and who our
    // people are — so there is no fenced slice of any of them to serve a client,
    // only a refusal, on every door of both halves.
    //
    // `google` is the newest, and the only member so far where the material on
    // the far side of the door is not even ours: it is one colleague's own Drive,
    // mailbox, diary and chat spaces. Clients get no assistant and no Google
    // surface at all, so every door on it refuses rather than fences. Its SWITCH
    // module — `google_mail` — is deliberately absent from this set and that is
    // the derivation working, not a gap: it gates no read door at all (nothing
    // asks for `google_mail:read`), so there is no read half for this test to
    // compare a write half against. What guards it is that every door demanding
    // it ALSO demands `google:edit`, and this set already holds `google`. (There
    // was a second switch, `google_events`; it went with the calendar's write
    // half on 18 August 2026.)
    //
    // `meetings` joined the day the diary shipped, and it is the member whose
    // exclusion would have been most tempting after `work`: a meeting is WITH a
    // client, so a fence looks plausible. It is refused instead, because of what
    // the row SAYS rather than who was in the room — the notes are our own record
    // of a conversation, written for us and often about the client rather than
    // for them, and a fence that showed a contact their own meetings would show
    // them those notes.
    //
    // `deliverables` is the NEWEST member and the one whose exclusion would be
    // most tempting of all — more than `work`, more than `meetings`. The material
    // is not merely about the client, it IS the client's: a handover doc, an API
    // reference, a recorded walkthrough, the things we hand over TO them. Every
    // row even carries their account, so a fence would work. It refuses anyway,
    // and the reason is that nobody has decided yet: whether a client may see
    // their own handover shelf is a product question the owner has not answered,
    // and the base's rule is that an unmade decision is a closed door rather than
    // an open one. The fence is built and switched off; opening it is a decision
    // somebody makes on purpose, not one that arrives by default.
    ).toEqual([
      "agent",
      "brand_assets",
      "commercials",
      "deliverables",
      "delivery",
      "google",
      "knowledge",
      "meetings",
      "selectable_data",
      "staff_profiles",
      "work",
    ])
    //
    // `commercials` joined the set the day the money shipped, and it is the
    // clearest member of it: BOTH rate cards and the margin are the agency's own
    // books. The account rate card is the interesting one — it is about a client,
    // and a client may still be shown what they are charged — but they are shown
    // it through the portal's own value projection, never by knocking on this
    // module's door, which answers with every account's card, the retired rows
    // and the audit block naming who set the price. `processes` is deliberately
    // NOT here: its reads are FENCED rather than refused, because a process map
    // is the client's own way of working and they read theirs.

    const asymmetric = doors
      .filter((d) => agencyOnly.has(d.module) && d.right !== "read" && !d.refuses)
      .map((d) => `${d.key} [${d.module}:${d.right}]`)
    expect(
      asymmetric,
      `these doors WRITE to a module whose reads all refuse a client login, and do not refuse one themselves. The shipped Client role cannot reach them today; R21's point is that the door must not depend on that: ${asymmetric.join(", ")}`
    ).toEqual([])
  })

  // The two the derivation above cannot see. Their READ siblings refuse a client
  // login (`getScreens`, and `active` / `switch-team` / `team-meta` through
  // agencyContext) but they gate on identity rather than on `teams:read`, so no
  // module gate exists for the scan to pair them with. Named here rather than
  // left out: an unwatched door is how the write half got missed in the first place.
  it("the team's own record and its screen recipes refuse one on the write half too", () => {
    const cases = [
      ["tenancy", "postUpdateTeam"],
      ["tenancy", "postScreen"],
    ] as const
    for (const [worker, handler] of cases) {
      const body = handlers(worker).get(handler)
      expect(body, `${worker}/${handler} has moved — re-read this list`).toBeTruthy()
      expect(body, `${handler} writes the agency's own record and must refuse a client login`).toMatch(
        /refusePortalCaller\s*\(/
      )
    }
  })
})
