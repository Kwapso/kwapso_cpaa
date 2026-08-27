// WHAT A PERSON LETS KWAPSO READ, RUN RATHER THAN READ.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE IS FOR
//
// On 25 August 2026 a live password was said out loud on a call, transcribed
// into the meeting notes and indexed into the knowledge base. It was rotated.
// The fix offered was a credential SCANNER over transcripts and the owner
// refused it: "no it should not scan anything.. give content as it is." So the
// lever is SCOPE — the answer to "that should never have been read" is "that
// source was never in scope".
//
// A scope that FILTERS is not a scope. A message that was fetched and then
// dropped has been through this worker's memory and its logs on the way to being
// dropped, and the only difference between that and no scope at all is a
// promise. So the assertions here are about what Google is ASKED, and the
// sharpest of them assert that Google is not asked at all.
//
// THE CENSUS AT THE BOTTOM is the half that survives a refactor. Every behaviour
// test here proves the seam behaves; the census proves nothing walks around it.
// Applying scope only where it was easy — inside the knowledge sweep — would
// have left the assistant's own mail tool reading the whole mailbox through a
// door the sweep was fenced out of, and every behaviour test above would still
// have been green.
// ══════════════════════════════════════════════════════════════════════════════

import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { sourceFiles } from "@shared/rules/source-scan"

import { GuardError } from "@shared/workers/gating"
import { GOOGLE_EVENT_TYPES } from "@shared/types"
import { asScopeMode, eventTypeList } from "../src/lib/google"
import { calendarList, gmailSearch, googlePresence } from "../src/lib/google-api"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

/** Every URL the code under test asked Google for. */
function recordUrls(body: unknown = {}) {
  const urls: string[] = []
  globalThis.fetch = vi.fn(async (url: unknown) => {
    urls.push(String(url))
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  return urls
}

describe("the narrowing is a parameter Google applies, not a filter we apply", () => {
  it("a scoped mail read names its label AT GMAIL — the rest is never fetched", async () => {
    const urls = recordUrls({ messages: [] })
    await gmailSearch("token", "", undefined, ["Label_7"])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls)
      expect(url, "a label scope that is not in the query is not a scope").toContain("labelIds=Label_7")
  })

  it("two labels are TWO searches, because Gmail's labelIds means AND", async () => {
    // A person naming two labels means "either". Sending both ids on one request
    // asks Gmail for messages carrying BOTH, which is a narrower answer than
    // anybody asked for and silently so — a scope that quietly returns almost
    // nothing looks exactly like an empty mailbox.
    const urls = recordUrls({ messages: [] })
    await gmailSearch("token", "", undefined, ["Label_7", "Label_9"])
    const seven = urls.filter((u) => u.includes("labelIds=Label_7"))
    const nine = urls.filter((u) => u.includes("labelIds=Label_9"))
    expect(seven.length).toBeGreaterThan(0)
    expect(nine.length).toBeGreaterThan(0)
    for (const url of urls)
      expect(
        url.includes("labelIds=Label_7") && url.includes("labelIds=Label_9"),
        "two label ids on one request is an AND, and the person meant OR"
      ).toBe(false)
  })

  it("an unscoped mail read is unchanged — no labelIds at all", async () => {
    // The default has to be bit-for-bit what it was, or this lane changed what
    // every existing connection reads without anybody deciding to.
    const urls = recordUrls({ messages: [] })
    await gmailSearch("token", "")
    for (const url of urls) expect(url).not.toContain("labelIds")
  })

  it("a named calendar is READ AT ITS OWN ADDRESS, not filtered out of the primary one", async () => {
    const urls = recordUrls({ items: [] })
    await calendarList("token", { calendarId: "team@group.calendar.google.com" })
    expect(urls[0]).toContain(encodeURIComponent("team@group.calendar.google.com"))
    expect(urls[0], "a scoped calendar read must not go to the primary calendar").not.toContain(
      "calendars/primary"
    )
  })

  it("an unnamed calendar read is still `primary` — the behaviour every team has today", async () => {
    const urls = recordUrls({ items: [] })
    await calendarList("token", {})
    expect(urls[0]).toContain("calendars/primary/events")
  })

  it("the kinds of entry ride the request as repeated eventTypes", async () => {
    const urls = recordUrls({ items: [] })
    await calendarList("token", { eventTypes: ["default", "outOfOffice"] })
    expect(urls[0]).toContain("eventTypes=default")
    expect(urls[0]).toContain("eventTypes=outOfOffice")
  })

  it("no kinds chosen means NOTHING is sent — Google's own default is every kind", async () => {
    // Spelled by omission rather than by listing all six, so a kind Google adds
    // tomorrow is included for a person who never narrowed. Sending the six we
    // know would silently exclude the seventh.
    const urls = recordUrls({ items: [] })
    await calendarList("token", { eventTypes: [] })
    expect(urls[0]).not.toContain("eventTypes")
  })
})

describe("the stored allow-list can only ever narrow", () => {
  it("a word this build does not recognise is dropped, not carried to Google", () => {
    // Google refuses a request naming an unknown eventType OUTRIGHT, so carrying
    // one would cost the whole calendar rather than the one kind.
    expect(eventTypeList("default madeUpKind outOfOffice")).toEqual(["default", "outOfOffice"])
  })

  it("the untouched column means EVERY kind, and that is the only way to spell it", () => {
    expect(eventTypeList("")).toEqual([])
  })

  it("every one of Google's own words survives the round trip", () => {
    expect(eventTypeList(GOOGLE_EVENT_TYPES.join(" "))).toEqual([...GOOGLE_EVENT_TYPES])
  })

  it("the mode has no safe default — a caller that forgot to say is told so", () => {
    // Unlike a shelf, there is no answer that is safe by omission here: the two
    // words differ in WHICH DIRECTION the mistake goes, so silence cannot be
    // read as either.
    expect(asScopeMode("everything")).toBe("everything")
    expect(asScopeMode("only")).toBe("only")
    expect(() => asScopeMode(undefined)).toThrow(GuardError)
    expect(() => asScopeMode("")).toThrow(GuardError)
    expect(() => asScopeMode("some")).toThrow(GuardError)
  })
})

describe("the pass that RETIRES asks the same calendars the pass that FILED did", () => {
  it("an event is only GONE when every named calendar says so", async () => {
    // THE BUG THIS EXISTS TO PREVENT. `googlePresence` reads a 404 as "the
    // material has gone" and the caller acts on it by retiring the source. An
    // event living on a named secondary calendar is a 404 on `primary` — so a
    // probe pinned to the primary calendar would retire live material and record
    // it as housekeeping.
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).includes("work%40example.com")
        ? new Response(JSON.stringify({ status: "confirmed" }), { status: 200 })
        : new Response("{}", { status: 404 })
    ) as unknown as typeof fetch
    expect(await googlePresence("calendar", "token", "EVT", ["primary", "work@example.com"])).toBe("there")
  })

  it("one calendar that cannot answer makes the whole question UNKNOWN", async () => {
    // Conservative in the only direction that is safe: "we could not ask" must
    // never become "it is not there".
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).includes("work%40example.com")
        ? new Response("{}", { status: 500 })
        : new Response("{}", { status: 404 })
    ) as unknown as typeof fetch
    expect(await googlePresence("calendar", "token", "EVT", ["primary", "work@example.com"])).toBe("unknown")
  })

  it("gone from all of them is gone", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch
    expect(await googlePresence("calendar", "token", "EVT", ["primary", "work@example.com"])).toBe("gone")
  })
})

// ── THE CENSUS ───────────────────────────────────────────────────────────────
//
// EVERY MAIL AND CALENDAR READ IN THIS WORKER GOES THROUGH THE SCOPED SEAM.
//
// Derived off the disk rather than hand-listed, for the reason R21 and R37 both
// give in their own words: a rule enforced against the files somebody remembered
// is a rule about somebody's memory. A new door reading `calendarList` directly
// is exactly the shape of the mistake, and it would leave every behaviour test
// above green while the fence stopped applying to the newest screen.

const LIB = join(__dirname, "..", "src")

/** The three raw reads that reach a person's mailbox or calendar unfenced. */
const RAW_READS = ["calendarList", "gmailSearch", "calendarGet"]

/** WHO MAY CALL THEM, and why each is allowed to.
 *
 *   • google-api.ts DECLARES them.
 *   • google-read.ts is the scoped seam itself — it is the one file whose job is
 *     to read the scope and then make the raw call.
 *   • google-transcript.ts reads `gmailSearch` through `googleNoticeQuery()`,
 *     four hard-coded Google robot addresses that cannot carry a colleague's
 *     mail. Ruled exempt on 27 August 2026 and the reasoning is written at the
 *     query: scoping it would buy no privacy and would silently break transcripts
 *     for exactly the people careful enough to have set a scope. */
const MAY_READ_RAW = new Set([
  "lib/google-api.ts",
  "lib/google-read.ts",
  "lib/google-transcript.ts",
])

/** Through the one walker every law here stands on (`sourceFiles`), never a
 * hand-rolled one — thirteen of those once disagreed about what "every file"
 * meant, and a law that silently stops applying goes green rather than red. */
function workerSource() {
  return sourceFiles(LIB, { extensions: [".ts"], skipTests: true, relativeTo: LIB })
}

describe("scope has nowhere to be walked around", () => {
  it("no file outside the seam reads a mailbox or a calendar raw", () => {
    const offenders: string[] = []
    for (const file of workerSource()) {
      if (MAY_READ_RAW.has(file.rel)) continue
      for (const read of RAW_READS)
        if (new RegExp(`\\b${read}\\s*\\(`).test(file.source)) offenders.push(`${file.rel} → ${read}(`)
    }
    expect(
      offenders,
      `these read somebody's mail or calendar without their scope — call scopedGmailSearch / scopedCalendarWindow / scopedCalendarEvent in lib/google-read.ts instead, or add a reasoned line to MAY_READ_RAW: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("the exemption list has not rotted — every file on it still makes a raw read", () => {
    // A pin whose file no longer calls one of these is a pin that has stopped
    // meaning anything, and a list that can only shrink is the only kind worth
    // having. Same rot-check every data-backed exemption in this codebase carries.
    const files = workerSource()
    for (const rel of MAY_READ_RAW) {
      const file = files.find((f) => f.rel === rel)
      expect(file, `${rel} is pinned in MAY_READ_RAW and no longer exists`).toBeTruthy()
      expect(
        RAW_READS.some((read) => new RegExp(`\\b${read}\\s*\\(`).test(file!.source)),
        `${rel} is pinned in MAY_READ_RAW and makes no raw read — delete the line`
      ).toBe(true)
    }
  })
})
