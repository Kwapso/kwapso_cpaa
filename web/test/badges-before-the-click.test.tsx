// THE BUG THE OWNER REPORTED, as a test.
//
//   "whenever I go into the details screen of any record and it has multiple
//    tabs, especially when it comes to sprints or activity or apps, I'm noticing
//    that only when I click on those tabs does the badge count appear. … until I
//    don't click on the tab, I am always assuming that there is no information in
//    that tab because there's no badge count."
//
// The mechanism was exact. A tab badge read a sidecar cache key
// (`total:<prefix>:<recordId>`) through `useCachedValue`, which is a pure cache
// READ and never fetches; the only thing that ever wrote that key was the tab
// PANEL's own list fetch. So the number arrived when the panel mounted and not
// one moment sooner — and because `formatCount` renders nothing for a zero AND
// nothing for a missing number, "nobody has looked yet" and "there are none of
// these" were the same pixels.
//
// So the assertion that matters is NOT "the door returns numbers". It is: with
// NO panel mounted and NO tab touched, the badge is there. Every test below is
// a version of that sentence, plus the two things that would quietly undo it —
// a count that never refreshes (worse than a blank one, because it looks right)
// and a denied module answering "0" instead of "we did not look".

import { renderHook, waitFor } from "@testing-library/react"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatCount } from "@shared/web/format-count"
import { RECORD_CHILDREN } from "@shared/record-counts"
import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { invalidate, readCache } from "@shared/web/store"
import { recordCountsKey, totalKey, TEAM_RESOURCES } from "@/lib/live-resources"
import { useRecordCounts } from "@/lib/use-record-counts"

const tenancyCounts = vi.fn()
const contentCounts = vi.fn()
vi.mock("@/lib/api", () => ({
  tenancy: { recordCounts: (table: string, id: string) => tenancyCounts(table, id) },
  content: { recordCounts: (table: string, id: string) => contentCounts(table, id) },
}))

// The cache is a module singleton — a fresh record id per test so nothing bleeds.
let n = 0
const freshId = () => `rec-${++n}`

beforeEach(() => {
  tenancyCounts.mockReset()
  contentCounts.mockReset()
  tenancyCounts.mockResolvedValue({ counts: {} })
  contentCounts.mockResolvedValue({ counts: {} })
})

/** What a badge actually shows for a record's collection — the exact expression
 * every record detail uses, `formatCount` over the sidecar the counts read
 * primes. Read straight out of the cache rather than through a second hook, so
 * this is the value the screen would render and not a paraphrase of it. */
const badge = (key: string, id: string) => formatCount(readCache<number | null>(totalKey(key, id)))

describe("a record's tab badges arrive with the record, not with the click", () => {
  it("badges every collection on a system without a single tab being opened", async () => {
    const appId = freshId()
    contentCounts.mockResolvedValue({
      counts: { "sprints-app": 3, "stories-app": 41, "meetings-app": 0, "tickets-app": 12 },
    })
    tenancyCounts.mockResolvedValue({ counts: { "processes-app": 2 } })

    // The whole screen, as far as its badges are concerned: the hook a detail
    // calls at the top, and nothing else. No panel is mounted, no tab exists.
    renderHook(() => useRecordCounts("apps", appId))

    await waitFor(() => expect(badge("sprints-app", appId)).toBe("3"))
    expect(badge("stories-app", appId)).toBe("41")
    expect(badge("tickets-app", appId)).toBe("12")
    // …and the count that straddles the other worker landed in the same place,
    // from the same one read as far as the screen is concerned.
    expect(badge("processes-app", appId)).toBe("2")
    // A collection that really is empty still shows nothing — the badge is not
    // the point, the DISTINCTION is, and it lives in the cache below.
    expect(badge("meetings-app", appId)).toBe("")
    expect(readCache(totalKey("meetings-app", appId))).toBe(0)
  })

  it("asks each worker exactly once, and only the workers that owe the record", async () => {
    const sprintId = freshId()
    contentCounts.mockResolvedValue({ counts: { "stories-sprint": 7 } })
    renderHook(() => useRecordCounts("sprints", sprintId))

    await waitFor(() => expect(badge("stories-sprint", sprintId)).toBe("7"))
    expect(contentCounts).toHaveBeenCalledTimes(1)
    expect(contentCounts).toHaveBeenCalledWith("sprints", sprintId)
    // A sprint's only child collection is the work inside it, which content
    // owns — so tenancy is never troubled. One round trip, not two.
    expect(tenancyCounts).not.toHaveBeenCalled()
  })

  // A company's screen hands an individual straight to the contact screen, so a
  // person's record has TWO components asking the same question in the same
  // tick — and `useCached` revalidates once per mounted subscriber. One
  // question, one answer.
  it("asks once when two screens on the same record want the same counts", async () => {
    const accountId = freshId()
    contentCounts.mockResolvedValue({ counts: { "todos-account": 4 } })
    tenancyCounts.mockResolvedValue({ counts: { "apps-account": 1 } })

    renderHook(() => {
      useRecordCounts("accounts", accountId) // the company screen
      useRecordCounts("accounts", accountId) // …and the contact screen inside it
    })

    await waitFor(() => expect(badge("todos-account", accountId)).toBe("4"))
    expect(contentCounts).toHaveBeenCalledTimes(1)
    expect(tenancyCounts).toHaveBeenCalledTimes(1)
  })

  it("fetches nothing for a record with no child collections", () => {
    renderHook(() => useRecordCounts("member_roles", freshId()))
    // A role, a source, a meeting and a task badge only their Activity tab, and
    // that total already rides the feed. A round trip for nothing is the other
    // way to answer this badly.
    expect(tenancyCounts).not.toHaveBeenCalled()
    expect(contentCounts).not.toHaveBeenCalled()
  })

  /* ------------------------- the three states, apart ------------------------ */

  // They all render "", which is exactly why the distinction has to survive in
  // the DATA. Two of them being pixel-identical is the bug; three of them being
  // indistinguishable in the cache would be the bug re-introduced one layer down.
  it("keeps 'not counted yet', 'you may not look' and 'there are none' apart", async () => {
    const accountId = freshId()
    contentCounts.mockResolvedValue({
      counts: { "sprints-account": 0, "todos-account": null, "tickets-account": null, "meetings-account": null },
    })
    tenancyCounts.mockResolvedValue({ counts: { "apps-account": 5, "account-rates": null } })

    // BEFORE the read lands: nothing in the cache at all. Not a zero, not a null
    // — the key is simply absent, which is the only one of the three that ever
    // resolves into something else.
    expect(readCache(totalKey("apps-account", accountId))).toBeUndefined()

    renderHook(() => useRecordCounts("accounts", accountId))
    await waitFor(() => expect(badge("apps-account", accountId)).toBe("5"))

    // THERE ARE NONE — counted, and the answer is zero.
    expect(readCache(totalKey("sprints-account", accountId))).toBe(0)
    // YOU MAY NOT LOOK — nobody counted, because the role holds no read right on
    // that module (R18). It is NOT zero, and a screen or a later reader can tell.
    expect(readCache(totalKey("todos-account", accountId))).toBeNull()
    expect(readCache(totalKey("todos-account", accountId))).not.toBe(0)
    // NOT COUNTED YET — a collection neither door answered for stays absent.
    expect(readCache(totalKey("stories-app", accountId))).toBeUndefined()

    // …and all three render the same nothing, which is the whole reason the
    // distinction had to be kept somewhere a person cannot see.
    expect(badge("sprints-account", accountId)).toBe("")
    expect(badge("todos-account", accountId)).toBe("")
    expect(badge("stories-app", accountId)).toBe("")
  })

  it("shows no badge for a denied module rather than a confident zero", async () => {
    const accountId = freshId()
    contentCounts.mockResolvedValue({ counts: { "todos-account": null } })
    tenancyCounts.mockResolvedValue({ counts: { "apps-account": 1 } })
    renderHook(() => useRecordCounts("accounts", accountId))
    await waitFor(() => expect(badge("apps-account", accountId)).toBe("1"))
    expect(badge("todos-account", accountId)).toBe("")
  })

  /* ------------------------------ staying true ------------------------------ */

  // R15. Fetching a count once and never again would replace "blank until you
  // click" with "stale for ever", which is worse: a blank badge looks unloaded,
  // and a stale one looks right.
  it("re-reads every badge when the record's counts are invalidated", async () => {
    const appId = freshId()
    contentCounts.mockResolvedValue({ counts: { "sprints-app": 3 } })
    renderHook(() => useRecordCounts("apps", appId))
    await waitFor(() => expect(badge("sprints-app", appId)).toBe("3"))

    contentCounts.mockResolvedValue({ counts: { "sprints-app": 4 } })
    invalidate(recordCountsKey("apps", appId))
    await waitFor(() => expect(badge("sprints-app", appId)).toBe("4"))
  })

  // …and the live layer must NAME that key when a child row moves. The ping
  // carries the CHILD's id, never the parent's, so the listener finds the open
  // records by looking at the cache — which is the part that would silently stop
  // working if the key family or the registry drifted.
  it("names the open record's counts among the caches a child ping drops", async () => {
    const appId = freshId()
    contentCounts.mockResolvedValue({ counts: { "sprints-app": 3 } })
    renderHook(() => useRecordCounts("apps", appId))
    await waitFor(() => expect(badge("sprints-app", appId)).toBe("3"))

    // A sprint was created somewhere. The listener is handed the SPRINT's id.
    const dropped = TEAM_RESOURCES.sprints.deps?.("team-1", "some-new-sprint") ?? []
    expect(dropped).toContain(recordCountsKey("apps", appId))
    // …and a resource this record badges nothing of leaves it alone — the drop is
    // derived from the registry, not a blanket "something changed".
    const unrelated = TEAM_RESOURCES.members.deps?.("team-1", "someone") ?? []
    expect(unrelated).not.toContain(recordCountsKey("apps", appId))
  })
})

/* ------------------------- nothing goes back to lazy ---------------------- */

const COMPONENTS = join(__dirname, "..", "components")

/** Every record-detail component in the app, read off disk rather than
 * hand-listed — a new one arrives already held to this.
 *
 * COMMENTS STRIPPED FIRST, and it is not tidiness: these files EXPLAIN their
 * badges in prose beside them, so a scan reading raw source finds
 * `useRecordCounts("apps", …)` in a sentence describing it and marks the screen
 * covered by a paragraph. (Commenting the real call out and watching this stay
 * green is how that was found.) */
function detailSources(): { name: string; src: string }[] {
  return sourceFiles(COMPONENTS, { extensions: [".tsx"], recursive: false })
    .filter((f) => /-detail\.tsx$/.test(f.rel))
    .map((f) => ({ name: f.rel, src: stripComments(f.source) }))
}

describe("no record detail can go back to badging a sidecar nobody fills", () => {
  it("every badged sidecar is either answered by the counts read or primed on the same screen", () => {
    const files = detailSources()
    expect(files.length, "the detail scan found no record screens — it has gone blind").toBeGreaterThan(5)
    let checked = 0
    const offenders: string[] = []

    for (const { name, src } of files) {
      // Which record this screen asks the counts door about, if any.
      const table = /useRecordCounts\(\s*"([a-z_]+)"/.exec(src)?.[1]
      const answered = new Set((table ? (RECORD_CHILDREN[table] ?? []) : []).map((c) => c.key))

      for (const line of src.split("\n")) {
        // The EXPRESSION a badge subscribes to, whole — `totalKey("x", id)` or a
        // key another module composes. Taking the expression rather than the key
        // is what lets the exemption below be exact: "this same screen fills this
        // same key" is a string match, not a family.
        const expr = /useCachedValue<[^>]*>\((.+)\)\s*$/.exec(line)?.[1]
        if (!expr || !expr.includes("total")) continue
        checked++
        // The sidecar's own name, derived from whichever shape wrote it:
        //   totalKey("sprints-app", …)          → sprints-app
        //   `total:${helpAttachmentsKey(id)}`   → help-attachments
        //   `total:help-thread:${id}`           → help-thread
        const key =
          /totalKey\(\s*"([a-z_-]+)"/.exec(expr)?.[1] ??
          /`total:\$\{([a-zA-Z]+)Key\(/
            .exec(expr)?.[1]
            ?.replace(/([a-z])([A-Z])/g, "$1-$2")
            .toLowerCase() ??
          /`total:([a-z-]+):/.exec(expr)?.[1] ??
          expr
        // Answered when the record opens, OR filled by a read THIS screen already
        // makes at the top of itself — the rate card and a story's Time tab are
        // both fetched because something on the Overview needs them anyway, so
        // neither waits for a click either.
        if (answered.has(key) || src.includes(`primeCache(${expr}`)) continue
        offenders.push(`${name} badges total:${key}: nothing fetches it until the tab is opened`)
      }
    }

    expect(checked, "the badge scan found no sidecar badges — it has gone blind").toBeGreaterThan(8)
    expect(
      offenders,
      `a tab badge that is blank until you open the tab reads as an EMPTY tab — count it when the record opens (shared/record-counts.ts + lib/use-record-counts), or prime it from a read this screen already makes:\n  ${offenders.join("\n  ")}`
    ).toEqual([])
  })

  it("every registry line names a live resource the listener registry knows", () => {
    // R15's half of the same contract: a count nothing invalidates is a badge
    // that is right once. Derived from both registries, so a child collection
    // whose resource is misspelled cannot ship looking wired up.
    for (const [table, children] of Object.entries(RECORD_CHILDREN))
      for (const child of children)
        expect(
          child.resource in TEAM_RESOURCES,
          `${table}.${child.key} says its counts move with "${child.resource}", which no live listener claims — the badge would be right once and then wrong for ever`
        ).toBe(true)
  })
})
