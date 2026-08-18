// THE FOUR THINGS THAT MUST BE TRUE OF EVERY GOOGLE DOOR — derived off disk, so
// a door written tomorrow is judged today.
//
// WHY THIS EXISTS BESIDE R21 rather than inside it. R21's derivation is
// PERMISSION-SHAPED: it reads the Client role's rights out of the seed and walks
// only the doors that role could pass. No client role holds a `google` right, so
// R21 walks past this whole module and reports clean — correctly, and uselessly
// for the promise the owner actually made, which was not "clients cannot reach
// it today" but "clients get no assistant and no Google surface at all". That
// promise is PATH-shaped, and this check is the path-shaped one. The two fail
// for different reasons: R21 catches an owner ticking `google: read` on a client
// role; this catches a door that ships without its refusal in the first place.
//
// The other three are the module's own invariants, each earned by how easy it
// would be to write the opposite:
//   • the two SWITCHES the owner named are demanded by the doors that perform
//     the acts — derived from which handler calls which Google function, never
//     from a list of handler names somebody keeps in step;
//   • no shape a screen sees can carry a token;
//   • whose connection it is comes from the guard, never from a parameter.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { stripComments } from "@shared/rules/source-scan"
import { ROUTES } from "../src/index"

const SRC = join(__dirname, "..", "src")
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8")
const routesSrc = stripComments(read("routes", "google.ts"))
const libSrc = stripComments(read("lib", "google.ts"))

/** Every handler in routes/google.ts, name → body. The bodies run to the next
 * top-level function, and comments are stripped first: this file explains its own
 * refusals at length, and a rule satisfied by prose is not satisfied. */
function handlers(): Map<string, string> {
  const out = new Map<string, string>()
  const starts = [...routesSrc.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
  starts.forEach((m, i) => out.set(m[1], routesSrc.slice(m.index, starts[i + 1]?.index ?? routesSrc.length)))
  return out
}

/** The Google doors, straight out of the worker's own route table. */
const GOOGLE_DOORS = Object.entries(ROUTES).filter(([door]) => door.includes(" /api/content/google/"))

describe("every Google door refuses a client login, at the door", () => {
  it("finds the doors (a scan over nothing passes every assertion below)", () => {
    // Twenty when this was written. The floor is what stops a refactor that
    // renames the path prefix from turning this whole suite into a no-op that
    // still reports green.
    expect(GOOGLE_DOORS.length).toBeGreaterThanOrEqual(18)
    expect(GOOGLE_DOORS.some(([d]) => d.startsWith("POST "))).toBe(true)
    expect(GOOGLE_DOORS.some(([d]) => d.startsWith("GET "))).toBe(true)
  })

  it("no exceptions — reads, writes and the OAuth round-trip alike", () => {
    const fns = handlers()
    const open: string[] = []
    for (const [door, def] of GOOGLE_DOORS) {
      const body = fns.get(def.handler.name)
      expect(body, `handler ${def.handler.name} for ${door} must live in routes/google.ts`).toBeTruthy()
      if (!/refusePortalCaller\s*\(/.test(body as string)) open.push(`${door} (${def.handler.name})`)
    }
    expect(
      open,
      `these Google doors do not refuse a client login — clients get no assistant and no Google surface at all, so every door on this module opens with refusePortalCaller: ${open.join(", ")}`
    ).toEqual([])
  })
})

describe("the owner's switch is demanded where the act happens", () => {
  // DERIVED, not listed: a door owes a switch because of what it CALLS. Naming
  // the handlers instead would be a list somebody has to remember to add to, and
  // the door that gets forgotten is by definition the one nobody thought about.
  //
  // THERE WERE TWO SWITCHES AND NOW THERE IS ONE. `google_events` ("kwapso may
  // put an EVENT in your calendar") guarded four calendar writes; the calendar
  // became READ-ONLY on 18 August 2026, so the writes, their doors and the
  // switch all went together, and the clause below asserts that nothing left in
  // this file can write to a calendar at all.
  const ACTS: { switch: string; calls: RegExp; what: string }[] = [
    {
      switch: "google_mail",
      // `gmailReply` belongs here beside `gmailSend`: a reply is not a softer act
      // than a message, it IS a message, in somebody's inbox, with our name on
      // it. The day the reply door was written this pattern was one name short
      // and would have let it ship without the owner's switch.
      calls: /\bgmail(Send(Draft)?|Reply)\s*\(/,
      what: "sends mail out of somebody's mailbox",
    },
  ]

  // THE CALENDAR WRITES CANNOT COME BACK QUIETLY. Not "they are gated" — they do
  // not exist. A door that called one of these would have to import a function
  // lib/google-api.ts no longer exports, so this is belt on top of a missing
  // brace: the day somebody writes one back, this line names it.
  it("no handler here writes to a calendar, at all", () => {
    const writers = [...handlers()]
      .filter(([, body]) => /\bcalendar(Create|Update|Guests|Cancel|Patch)\s*\(/.test(body))
      .map(([name]) => name)
    expect(
      writers,
      `the calendar is one-way: kwapso reads a diary and never writes one (owner, 18 Aug 2026). These handlers write: ${writers.join(", ")}`
    ).toEqual([])
  })

  it("finds an act of each kind (the derivation must not go blind)", () => {
    const fns = handlers()
    for (const act of ACTS)
      expect(
        [...fns.values()].filter((b) => act.calls.test(b)).length,
        `no handler ${act.what} any more — re-read this check`
      ).toBeGreaterThan(0)
  })

  it("every door that performs one demands its switch", () => {
    const fns = handlers()
    const missing: string[] = []
    for (const [name, body] of fns)
      for (const act of ACTS) {
        if (!act.calls.test(body)) continue
        const demanded = new RegExp(`requireRight\\s*\\(\\s*\\w+,\\s*\\w+,\\s*"${act.switch}",\\s*"create"`).test(body)
        if (!demanded) missing.push(`${name} ${act.what} without demanding ${act.switch}:create`)
        // And never on its own: a role that may send but may not otherwise use
        // the connection is not a state anybody should be able to reach.
        if (!/\bgated(?:Body)?(?:<[^>]*>)?\s*\(\s*request,\s*env,\s*"google",\s*"edit"|requireRight\s*\(\s*\w+,\s*\w+,\s*"google",\s*"edit"/.test(body))
          missing.push(`${name} demands ${act.switch} but not google:edit underneath it`)
      }
    expect(
      missing,
      `the owner named a switch on top of the connection right — sending mail — and a door that performs it without demanding it makes the switch decorative: ${missing.join("; ")}`
    ).toEqual([])
  })

  it("mail asks, and there is no calendar write left to ask about", async () => {
    // Read off the agent's own catalogue rather than described here: the confirm
    // rule is what a person actually experiences, and a comment claiming it
    // would survive the day somebody flipped the flag.
    const { TOOL_CATALOG } = (await import("../../data-ops/src/lib/tools")) as {
      TOOL_CATALOG: { name: string; confirm: boolean | ((i: Record<string, unknown>) => boolean) }[]
    }
    const confirmOf = (name: string) => {
      const t = TOOL_CATALOG.find((x) => x.name === name)
      expect(t, `${name} must exist in the agent's catalogue`).toBeTruthy()
      return typeof t!.confirm === "function" ? t!.confirm({}) : t!.confirm
    }
    expect(confirmOf("google_send_mail"), "mail ALWAYS asks").toBe(true)
    expect(confirmOf("google_chat_post"), "a colleague reads it the moment it lands").toBe(true)
    expect(confirmOf("google_draft_reply"), "a draft is a sentence somebody can still change").toBe(false)
    // The rule's other half used to be "calendar entries do not ask, a diary
    // entry is one click from gone". There is no calendar-write tool left for it
    // to govern, and this asserts that rather than leaving the sentence hanging.
    for (const gone of [
      "google_create_event",
      "google_sprint_to_calendar",
      "google_update_event",
      "google_event_guests",
      "google_event_location",
      "google_cancel_event",
    ])
      expect(
        TOOL_CATALOG.some((t) => t.name === gone),
        `${gone} must not exist — the assistant cannot touch a calendar`
      ).toBe(false)
  })
})

describe("nothing a screen can see carries a token", () => {
  it("the read every response is built from cannot select one", () => {
    // The column list is the enforcement. A read that CANNOT return a token is
    // stronger than a mapper that remembers to strip one, because the next edit
    // to the mapper is written by somebody who has not read this test.
    const columns = /const PUBLIC_COLUMNS = `([^`]*)`/.exec(libSrc)
    expect(columns, "PUBLIC_COLUMNS is the seam this rests on — did it move?").toBeTruthy()
    for (const secret of ["access_token", "refresh_token"])
      expect(
        (columns as RegExpExecArray)[1],
        `PUBLIC_COLUMNS must never select ${secret} — every list, detail and response body is built from it`
      ).not.toContain(secret)
  })

  it("only the token seam ever names the encrypted columns", () => {
    // Both columns may be written and read in lib/google.ts alone. A route
    // touching one would mean a token travelling somewhere the seam cannot see.
    for (const secret of ["access_token", "refresh_token"])
      expect(
        routesSrc,
        `routes/google.ts names ${secret} — tokens are read and written in lib/google.ts and nowhere else`
      ).not.toContain(secret)
  })

  // NOTE: "every stored token is sealed" is proved by RUNNING the writers and
  // reading what would have gone to the database — test/google-tokens.test.ts.
  // It was a source scan here first, and the scan was a fraud: it accepted a
  // `sealToken` mention anywhere in the 400 characters before the assignment, so
  // replacing `sqlString(await sealToken(env, tokens.accessToken))` with
  // `sqlString(tokens.accessToken)` left it green. A rule satisfied by a nearby
  // line is not satisfied, and it is the SQL that reaches D1 that matters here,
  // not the sentence above it.
  it("reading a token back goes through the one seam", () => {
    expect(libSrc, "openToken is the only way a stored token is read").toContain("openToken(env,")
  })
})

describe("whose connection it is comes from the guard, never from a request", () => {
  it("no Google door reads a user id off the query string or the body", () => {
    // The module's central promise — "the assistant sees only what that person
    // can see" — is a property of this ABSENCE. There is no `?userId=` and
    // nowhere to put one, so it cannot be forgotten at one door.
    for (const bad of ['searchParams.get("userId")', "body.userId", 'searchParams.get("user")'])
      expect(routesSrc, `a Google door reads ${bad} — whose connection it is is the guard's answer`).not.toContain(bad)
  })

  it("every connection read selects on the caller's own id", () => {
    // Each statement in the lib that reads a connection or a named source has to
    // carry `user_id = ?`, and the only value bound to it is `guard.userId`.
    const selects = [...libSrc.matchAll(/FROM (google_connections|google_sources)[\s\S]{0,220}?(?:LIMIT|ORDER BY)/g)]
    expect(selects.length, "the connection-read scan found nothing — it has gone blind").toBeGreaterThan(3)
    for (const [statement, table] of selects)
      expect(
        /user_id = \?/.test(statement),
        `a read of ${table} does not narrow to the caller — every one of them must, because there is no other fence on this table`
      ).toBe(true)
    expect(
      libSrc.includes("guard.userId"),
      "the caller's own id is what those statements are bound to"
    ).toBe(true)
  })
})
