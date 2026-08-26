// THE LAWS OF THE BASE, machine-checked (see RULES.md + shared/rules/registry.ts).
// Each `it` is the enforcement for one law — break a law and this build goes red.
// It reads source straight off disk (like the publish-seam tests) so the checks
// can't be fooled by anything but the real code.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"
import { GLOSSARY } from "@shared/glossary"
import {
  ACCOUNT_SCOPED_MODULES,
  ACTIVITY_GATE_MAP,
  ACTIVITY_TABLE_EXEMPT,
  CLIENT_REACHABLE_EXEMPT,
  DEAF_EXEMPT,
  FORM_DIALOGS,
  GLOSSARY_SYNONYMS,
  GLOSSARY_SYNONYM_OK,
  GROWING_COLLECTIONS,
  MUTATING_WORKERS,
  PAGE_WIDTH_OWNER,
  RADIUS_EXCEPTION,
  RAW_BODY_EXEMPT,
  RECORD_DETAIL_NOT,
  PALETTE_LITERAL_OK,
  SCREEN_WIDTH_EXEMPT,
  PORTAL_VISIBLE_READS,
  RECORD_TAB_COUNT_EXCEPTIONS,
  RULES_REGISTRY,
  TAB_COUNT_EXCEPTIONS,
  BASE_LAW_CEILING,
  BASE_REPOSITORY,
  LAW_ID_ORIGIN,
} from "@shared/rules/registry"
import { TEAM_MODULE_CATALOG, offeredRights } from "@shared/team-modules"
import { formatCount } from "@shared/web/format-count"
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES, TIME_SLICE_PREFIX } from "../lib/live-resources"
import { TEAM_SECTIONS } from "../lib/pages"
import { BASE_RECIPES, MODULE_PERMISSION, tabCountKey, withTabCounts } from "../lib/screens"
import { COLLECTION_FILTERS } from "../lib/collection-filters"

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const WEB = join(HERE, "..") // web/
const ROOT = join(WEB, "..") // repo root
const read = (p: string) => readFileSync(p, "utf8")

/** The READ functions in a lib — `count*` / `list*` / `search*` — each as its own
 * body, so a rule about what a BADGE's number may do doesn't reach a count that
 * decides whether a WRITE proceeds. A body runs to the next top-level `export`,
 * the same slice the publish-seam and gating scans take. */
function readerBodies(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const starts = [...src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
  starts.forEach((m, i) => {
    if (!/^(count|list|search)/i.test(m[1])) return
    const next = i + 1 < starts.length ? starts[i + 1].index : undefined
    out.push({ name: m[1], body: src.slice(m.index, next) })
  })
  return out
}

/** Every worker's src .ts file (recursively), as [repo-relative path, source]. */
function workerSources(): [string, string][] {
  const srcDirs = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
    .filter((w) => w.isDirectory())
    .map((w) => join(ROOT, "workers", w.name, "src"))
  return sourceFiles(srcDirs, { extensions: [".ts"], relativeTo: ROOT }).map((f) => [f.rel, f.source])
}

/** Every *.tsx under web/components (recursively — the folder has subdirectories,
 * and a component that moves into one must not fall out of the laws below). */
function componentFiles(): string[] {
  return sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }).map((f) => f.path)
}

/** R2 / R8 — THE BESPOKE RECORD DETAILS, READ OFF THE CODE.
 *
 * A law that enumerates its subject from a hand-kept list has a hole by
 * construction, and this one's opened twice. `RECORD_DETAIL_COMPONENTS` in the
 * registry was that list: R2 and R8 walked exactly the screens somebody had
 * remembered to type into it. `app-detail` and `process-detail` were added on 17
 * Aug 2026 after a tester found faults on screens no law had ever read; `sprint-
 * detail` and `story-detail` were found missing on 18 Aug, having shipped tabs
 * and an Activity panel that neither law had ever looked at. Nothing was red
 * either time. A screen that no law walks looks precisely like a screen that
 * passes.
 *
 * So the subject is derived, the way R8 already derives which collection a badge
 * describes. TWO INDEPENDENT SIGNALS, because either alone has a gap:
 *
 *   BY NAME       `web/components/**\/*-detail.tsx` — the convention every one of
 *                 them already follows, and the one the hand-rolled-feed check
 *                 below has always used.
 *   BY BEHAVIOUR  it renders an `<ActivityPanel>` — a record's own history feed,
 *                 which nothing but a record detail has any business drawing. This
 *                 catches the detail screen that arrives under some other name.
 *
 * AND THE SIGNALS ARE DELIBERATELY NOT THE OBLIGATIONS, so nothing here is
 * circular. R2 demands TabsView *and* ActivityPanel; a file caught by NAME is held
 * to both with neither assumed, which is the case that actually bites — a new
 * `foo-detail.tsx` shipped without tabs turns this red. A file caught only by
 * BEHAVIOUR has satisfied one of the two by definition, and is still held to the
 * other, and to every per-tab count R8 asks for.
 *
 * `RECORD_DETAIL_NOT` (registry) is the reasoned residue, rot-checked below.
 *
 * COMMENTS ARE STRIPPED FIRST, as every source scan here does (CONVENTIONS.md).
 * Not housekeeping: R8's tab scan matches `{ value: "…" … badge: … }`, and
 * `story-detail` writes three lines of comment between the brace and the value,
 * so on the raw text its Work logs tab simply was not there. A tab a law cannot
 * see is a tab with no count and nothing red — the same shape as the screens this
 * census was written to stop losing, one level down. The blindness tripwire below
 * is what surfaced it. */
function recordDetailComponents(): { name: string; source: string }[] {
  return sourceFiles(join(WEB, "components"), { extensions: [".tsx"] })
    .map((f) => ({ name: basename(f.path, ".tsx"), source: stripComments(f.source) }))
    .filter((c) => /-detail$/.test(c.name) || c.source.includes("<ActivityPanel"))
    .filter((c) => !RECORD_DETAIL_NOT[c.name])
}

/** EVERY FIND BAR IN THE APP, as source — the props of each `<PagedFind>`, from
 * the tag to 1,800 characters on.
 *
 * COMMENTS STRIPPED FIRST, and not for tidiness: this file's own header block
 * mentions `<PagedFind>` in prose, and on the raw text that sentence opened a
 * window that ran on into the real component's cache key forty lines below —
 * a "screen" made entirely of explanation, failing a check about wiring.
 *
 * A FIXED window rather than one that stops at the first `>`: `<PagedFind<Account>`
 * carries a generic, so a lazy match to the tag's close ends four characters in
 * and reports every screen as unwired (paged-search.test.ts and
 * paged-sort.test.ts say the same about the same tag). */
function findBars(): string[] {
  return componentFiles().flatMap((f) =>
    [...stripComments(read(f)).matchAll(/<PagedFind[\s\S]{0,1800}/g)].map((m) => m[0])
  )
}

describe("RULES — the laws of the base", () => {
  // L0 — the keystone: the doc, the data, and the table can't drift.
  it("registry-integrity: RULES.md lists exactly the law ids in RULES_REGISTRY", () => {
    const ids = RULES_REGISTRY.map((r) => r.id)
    expect(new Set(ids).size, "no duplicate law ids").toBe(ids.length)
    const md = read(join(ROOT, "RULES.md"))
    const inDoc = [...md.matchAll(/^\|\s*(R\d+[a-z]?)\s*\|/gm)].map((m) => m[1])
    expect(new Set(inDoc)).toEqual(new Set(ids))
  })

  // …AND THE NUMBER SAYS WHOSE BOOK IT IS.
  //
  // `registry-integrity` proves our ids are unique HERE. They are not unique
  // across the estate: this repository and the canonical base
  // (alaap-swift-struck/brimba) forked their numbering at R20 and both kept
  // minting, so seven ids carry a different law in each book. The owner ruled on
  // 26 Aug 2026 that brimba's series is canonical and ours is the divergent one
  // — it is the most recent (its R26 is the newest law either repo holds) and it
  // is the one that travels into every future product.
  //
  // The seven that already collide are DATA, so they are a recorded decision
  // rather than a thing somebody rediscovers. What this check is actually for is
  // the EIGHTH: a law we mint from here on must sit above the base's ceiling, so
  // a number we invent can never be one the base also invents.
  it("law-id-origin: a law we mint cannot take a number the base could mint", () => {
    const ours = new Map(RULES_REGISTRY.map((r) => [r.id, r.checkId]))
    // i · every pinned collision is still real on our side — an entry naming a
    // law we no longer have is a record of an argument nobody is having.
    for (const row of LAW_ID_ORIGIN) {
      expect(ours.has(row.id), `LAW_ID_ORIGIN names ${row.id} and we have no such law — delete the line`).toBe(true)
      expect(
        ours.get(row.id),
        `LAW_ID_ORIGIN says ${row.id} is our "${row.ours}" and the registry now says "${ours.get(row.id)}" — ` +
          `re-read the base and update the pin`
      ).toBe(row.ours)
    }
    // ii · …and nothing at or below the base's ceiling is UNPINNED. A law of
    // ours inside brimba's range that nobody has compared is the exact shape of
    // the fault this closes: silent, invisible to both builds, and only found
    // when somebody tries to merge the two books.
    const pinned = new Set(LAW_ID_ORIGIN.map((r) => r.id))
    const unpinned = RULES_REGISTRY.filter(
      (r) => Number(r.id.replace(/^R/, "").replace(/[a-z]$/, "")) <= BASE_LAW_CEILING && !pinned.has(r.id)
    ).map((r) => r.id)
    // R1–R19 predate the divergence: same number, same law, in both books.
    // Anything else at or under the ceiling has to be checked against the base
    // by hand and then pinned.
    const inherited = unpinned.filter((id) => Number(id.replace(/^R/, "").replace(/[a-z]$/, "")) >= 20)
    expect(
      inherited,
      `these laws sit inside ${BASE_REPOSITORY}'s minted range and are not pinned in LAW_ID_ORIGIN — ` +
        `compare them with the base's book and record the answer: ${inherited.join(", ")}`
    ).toEqual([])
    // iii · the next law we write starts above the base's high-water mark.
    const highest = Math.max(...RULES_REGISTRY.map((r) => Number(r.id.replace(/^R/, "").replace(/[a-z]$/, ""))))
    expect(
      highest,
      `our newest law is ${highest} and the base has minted up to ${BASE_LAW_CEILING} — ` +
        `mint above the ceiling, or raise it after re-reading ${BASE_REPOSITORY}`
    ).toBeGreaterThan(BASE_LAW_CEILING)
  })

  // R2 — every record-detail screen exposes Overview + Activity tabs. The
  // engine-recipe details (team/members/invites) carry them as recipe data; the
  // bespoke ones must render them themselves.
  // The Activity tab is now ONE component (components/activity-panel.tsx), so
  // this check follows it there. It reads the same way round: each detail must
  // render the panel, and the panel must be a feed you can page. Before, the two
  // strings were looked for in every detail — which is why the block they name
  // was written out ten times, comment and all, to keep the check happy.
  //
  // The strength is unchanged and the blind spot is smaller: the pairing of feed
  // and pager now has ONE place it can be got wrong, and the assertion below
  // stands on that place rather than on ten copies of it.
  it("record-detail-tabs: bespoke record details render tabs + a pageable Activity panel", () => {
    // R2 meets R14: the feed is a PAGE of a growing collection under a badge
    // counting ALL of it — the gap that let a record with 143 events truthfully
    // badge 143 over its newest 50, forever.
    const panel = read(join(WEB, "components", "activity-panel.tsx"))
    expect(panel, "the Activity panel must render the library ActivityFeed").toContain("ActivityFeed")
    expect(panel, "the Activity panel must carry a <LoadMore> — its badge counts rows it can't reach (R14)").toContain(
      "<LoadMore"
    )

    const details = recordDetailComponents()
    // The census must not go blind. A derivation that matches nothing reports the
    // same all-clear as one that matched everything and found no fault, which is
    // the exact failure the hand-kept list used to produce one screen at a time.
    expect(
      details.length,
      "the record-detail census found almost nothing — the derivation has gone blind"
    ).toBeGreaterThanOrEqual(9)

    for (const c of details) {
      expect(c.source, `${c.name} must use library TabsView`).toContain("TabsView")
      expect(c.source, `${c.name} must render the Activity tab through <ActivityPanel>`).toContain(
        "<ActivityPanel"
      )
    }
  })

  // …and the exemptions can't rot. An entry naming a file the census would not
  // have caught anyway is a line nobody can delete safely and nobody can justify —
  // the ratchet RAW_BODY_EXEMPT already runs, so the list can only shrink.
  it("record-detail-tabs: every RECORD_DETAIL_NOT entry is a real exemption", () => {
    const caught = sourceFiles(join(WEB, "components"), { extensions: [".tsx"] })
      .map((f) => ({ name: basename(f.path, ".tsx"), source: stripComments(f.source) }))
      .filter((c) => /-detail$/.test(c.name) || c.source.includes("<ActivityPanel"))
      .map((c) => c.name)
    for (const [name, why] of Object.entries(RECORD_DETAIL_NOT)) {
      expect(why.trim(), `RECORD_DETAIL_NOT["${name}"] must say WHY it is not a record detail`).not.toBe("")
      expect(
        caught,
        `RECORD_DETAIL_NOT lists ${name}, which the census would not have caught — delete the line`
      ).toContain(name)
    }
  })

  // …and nothing goes back to hand-rolling one. A detail that renders its own
  // ActivityFeed is a second copy of the pairing above, and the copy is exactly
  // what shipped a feed under an unreachable badge the first time. Same census as
  // above, so a screen cannot be a record detail for one half of R2 and not the
  // other.
  it("record-detail-tabs: no record detail hand-rolls its own Activity feed", () => {
    const offenders = recordDetailComponents()
      .filter((c) => c.source.includes("<ActivityFeed"))
      .map((c) => c.name)
    expect(
      offenders,
      `render the Activity tab through <ActivityPanel> instead of a local ActivityFeed: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // R3 — collection tab strips use TabsView; no hand-rolled <Button> toggles
  // (a selected-state toggle has the tell-tale `variant={x === y ? … : …}`).
  it("no-handrolled-toggles: no component fakes a tab strip with Button variants", () => {
    const offenders = componentFiles().filter((f) => /variant=\{[^}]*===[^}]*\?/.test(read(f)))
    expect(offenders, `use the library TabsView instead of hand-rolled toggles: ${offenders.join(", ")}`).toEqual([])
  })

  // R4 — every form dialog renders through the shared FormShell.
  it("forms-use-formshell: every form dialog imports FormShell", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must use FormShell (one shared form layout)`).toContain("form-shell")
    }
  })

  // R7 — every form dialog persists its draft per session, so unsaved input survives
  // navigating away (CACHING.md §11). The draft hook is the single seam.
  it("forms-persist-drafts: every form dialog persists its draft via useFormDraft", () => {
    for (const d of FORM_DIALOGS) {
      const src = read(join(WEB, "components", `${d}.tsx`))
      expect(src, `${d} must persist its draft (useFormDraft — CACHING.md §11)`).toContain("useFormDraft")
    }
  })

  // ONE SEARCHABLE PICKER, NOT NINE. Not a law of its own — a regression lock on
  // the shape R4 already asks for. Every "which record do you mean?" control goes
  // through components/record-picker.tsx, which is the only file that composes the
  // library's Command palette. Nine screens each building their own is how they
  // came to behave nine different ways, reported from a phone as "any drop-downs
  // are becoming impossible to search through".
  it("one-record-picker: only record-picker.tsx composes the library Command", () => {
    const picker = read(join(WEB, "components", "record-picker.tsx"))
    // A blind check reports "all clear" exactly like a passing one.
    expect(picker, "the record picker must be the library Command + Popover").toContain(
      "controls/command/command"
    )
    const offenders = componentFiles()
      .filter((f) => !f.endsWith("record-picker.tsx"))
      .filter((f) => stripComments(read(f)).includes("controls/command/command"))
    expect(
      offenders,
      `use <RecordPicker> instead of composing a second searchable picker: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // ONE CALENDAR, AND EVERYTHING ON IT OPENS. Not a law of its own — a
  // regression lock on the shape R2/R8 already assume, in the same spirit as the
  // record-picker check above.
  //
  // Reported by the owner on 18 Aug 2026: "all detail screens should be clickable
  // and accessible if there are records displaying on the calendar". They were
  // not, on any of the three screens that have one, and the reason was
  // structural rather than an oversight — the library's `CalendarView` draws an
  // event as a plain `<div>` and takes no click prop of any kind, so a screen
  // could not have wired one if it wanted to. "+6 more" was a second `<div>`,
  // naming six records with no way to reach one.
  //
  // The check therefore holds TWO things, because either alone can go quietly
  // wrong: no screen may render the library's calendar directly (it is a picture,
  // not a way in), and the host's own must keep the two controls that make it a
  // way in — an entry that is a BUTTON, and an overflow that OPENS THE DAY.
  it("one-calendar: every calendar is the host's, and every record on it opens", () => {
    const host = join(WEB, "components", "record-calendar.tsx")
    const src = stripComments(read(host))
    // i · the entry is a control, and it opens the record it names.
    expect(src, "an entry must be a <button> — a div cannot be reached by keyboard or click").toMatch(
      /<button[\s\S]*onClick=\{\(\) => onOpen\(entry\.id\)\}/
    )
    // ii · the overflow opens the day rather than naming records nobody can reach.
    expect(src, '"+N more" must be a control that opens the day').toMatch(
      /<button[\s\S]*onClick=\{\(\) => setOpenDay\(key\)\}/
    )
    expect(src, "…and the day it opens lists rows that open too").toContain("<DayRows")
    // iii · nothing else draws a calendar. Derived from the imports themselves,
    // so a fourth screen that grows one is caught the day it is written.
    const offenders = componentFiles()
      .filter((f) => f !== host)
      .filter((f) => stripComments(read(f)).includes("collections/calendar-view/calendar-view"))
    expect(
      offenders,
      `use <RecordCalendar> — the library calendar cannot open a record (UI-GAPS #22): ${offenders.join(", ")}`
    ).toEqual([])
    // iv · and every screen that shows one wires it to the engine's open intent.
    const wired = componentFiles().filter((f) => read(f).includes("<RecordCalendar"))
    expect(wired.length, "no screen renders the calendar — this check has gone blind").toBeGreaterThan(2)
    for (const f of wired)
      expect(
        /onOpen=\{\(id\) => onIntent\(\{ kind: "open"/.test(read(f)),
        `${f} shows a calendar whose records go nowhere — pass onOpen through onIntent`
      ).toBe(true)
  })

  // A RECORD DETAIL MAY NOT LOOK ITS RECORD UP IN A PAGE.
  //
  // THE OWNER, 26 Aug 2026, opening a ticket from the triage queue: "That ticket
  // no longer exists." It existed. It was number 1,030 of 1,820, and the whole
  // of the lookup was a `find` over the cached list — which, for a collection
  // R14 makes PAGE (GROWING_COLLECTIONS), is the newest fifty rows. Every ticket
  // past the cursor was unreachable by direct link, from an email button, from a
  // bookmark, and the screen said the most alarming thing it could: that the
  // record was gone.
  //
  // The door had answered `?id` since paging landed and says why in its own
  // comment; the API client had `helpOne`; nothing had ever called either. Three
  // sibling screens had already got it right — `meeting-detail` and
  // `knowledge-detail` name the variable `inPage`, and `story:one:` was added to
  // the live registry in August for exactly this — so this was one screen left
  // behind by a pattern the rest of the app already knew.
  //
  // The rule is POSITIONAL, like R20's: a `find` by id over a cached list is
  // only honest when the same file also holds a by-id read. A detail screen that
  // reads its record through a dedicated per-record door (account-detail,
  // process-detail) never touches a list and is never caught.
  it("details-ask-the-door: no record detail resolves its record out of a paged list", () => {
    // The cache-key builders of the collections R14 makes page. A `find` over
    // any other list is over a bounded one, where page one IS the collection.
    // The cache-key builders of the collections R14 makes page, plus the one
    // written as a template literal rather than through its builder — which is
    // the spelling the fault actually shipped in.
    const pagedKeys = Object.values(GROWING_COLLECTIONS)
      .map((c) => c.webKey)
      .filter((k) => k.endsWith("("))
      .concat("`help:${")
    const offenders: string[] = []
    let scanned = 0
    for (const f of componentFiles()) {
      if (!basename(f).endsWith("-detail.tsx")) continue
      const src = stripComments(read(f))
      const asksTheDoor = src.includes(":one:")
      // POSITIONAL, the way R20 identifies a checked field: what matters is the
      // query VARIABLE built from a paged key, and whether THAT variable is the
      // one being searched. Asking only "does this file read a paged list, and
      // does it contain any find" caught app-detail and role-detail, whose finds
      // are over `apps` and `member_roles` — both bounded collections, where
      // page one IS the collection and a find over it is exactly right.
      const searched = new Set(
        [...src.matchAll(/(\w+)\.data\?\.find\(\([^)]*\)\s*=>\s*\w+\.id ===/g)].map((m) => m[1])
      )
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useCached<[^>]*>\(\s*([^,]*),/g)) {
        const [, name, keyExpr] = m
        if (!pagedKeys.some((k) => keyExpr.includes(k))) continue
        scanned++
        if (searched.has(name) && !asksTheDoor) offenders.push(`${basename(f)} (${name})`)
      }
    }
    expect(
      offenders,
      `these detail screens find their record in a PAGED list and will say it does not exist ` +
        `for every row past the cursor — add the by-id read (see help-detail): ${offenders.join(", ")}`
    ).toEqual([])
    // Tripwire: a scan that matched no paged read passes exactly like a clean one.
    expect(scanned, "the paged-detail census found no screens — it has gone blind").toBeGreaterThan(2)
  })

  // …AND THE WORD IT CARRIES IS AN ADDRESS, NOT A PERMISSION.
  //
  // The open intent's `module` has exactly one consumer and it builds a URL out
  // of it (deep-link-screen.tsx: `/${intent.module}/${intent.id}`). So the field
  // is a URL SEGMENT by usage — and for every module in the app but one the
  // segment and the permission module are the same string, which is why passing
  // the wrong one is invisible to a reader, to TypeScript (both are `string`)
  // and to every other law here.
  //
  // Tickets is the one. The segment is `tickets`, the right the server enforces
  // is `help` (MODULE_PERMISSION says why each stays). Triage's Open button
  // passed `help`, so it navigated to `/help/<id>` — not a route on either URL
  // form — and answered "This page could not be found" for the whole life of the
  // tab, under a green build, on the one screen whose job is to open tickets.
  // Reported from staging on 26 Aug 2026.
  //
  // The keys of MODULE_PERMISSION ARE the segments, so this needs no list of its
  // own: a module string that is not a key is not an address.
  it("open-intent-segments: every open intent names a URL segment, never a permission module", () => {
    const segments = new Set(Object.keys(MODULE_PERMISSION))
    const offenders: string[] = []
    let seen = 0
    for (const f of [...componentFiles(), ...sourceFiles(join(WEB, "lib"), { extensions: [".ts", ".tsx"] }).map((x) => x.path)]) {
      for (const m of stripComments(read(f)).matchAll(/kind:\s*"open"\s*,\s*module:\s*"([^"]+)"/g)) {
        seen++
        if (!segments.has(m[1]))
          offenders.push(`${basename(f)} → "${m[1]}"`)
      }
    }
    expect(
      offenders,
      `these open intents build an address out of a word that is not a URL segment — ` +
        `the link will 404. Pass the segment (a key of MODULE_PERMISSION): ${offenders.join(", ")}`
    ).toEqual([])
    // Tripwire: a census that matched nothing passes exactly like a clean one.
    expect(seen, "the open-intent scan went blind").toBeGreaterThan(4)
  })

  // …AND A PICKER OVER A PAGED COLLECTION ASKS THE DOOR, never the list cache.
  // Derived from two pieces of registry data that were never read together: the
  // GROWING collections' own web cache keys (R14) and the form dialogs (R4/R7).
  // A form that filled a picker from one of those keys was offering PAGE ONE as
  // if it were the collection — every company past the cursor silently
  // un-nameable, under a control that gave no sign of it. Reported from staging
  // as "not all clients or contacts are showing per account".
  it("pickers-ask-the-door: no form dialog fills a picker from a PAGED list cache", () => {
    // The LIST cache keys only (`…Key(`) — the activity feed's entries in the
    // same table are a record's history, not a picker's options.
    const pagedKeys = Object.values(GROWING_COLLECTIONS)
      .map((c) => c.webKey)
      .filter((k) => k.endsWith("Key("))
    expect(pagedKeys.length, "no paged list keys to check — the derivation has gone blind").toBeGreaterThan(3)

    const offenders: string[] = []
    for (const d of FORM_DIALOGS) {
      const file = join(WEB, "components", `${d}.tsx`)
      if (!existsSync(file)) continue
      const src = stripComments(read(file))
      for (const key of pagedKeys) if (src.includes(key)) offenders.push(`${d} reads ${key}`)
    }
    expect(
      offenders,
      `a paged collection's list cache holds page one — search it at the door instead (lib/picker-sources.ts): ${offenders.join(", ")}`
    ).toEqual([])
  })

  // …AND SO DOES EVERY OTHER CONTROL ON A COLLECTION THAT PAGES. The third
  // clause of one sentence, and the third time it was found the hard way.
  //
  // A collection is asked three things — which rows (the filters), which of
  // those (the search) and in what order (the sort) — and on a PAGED collection
  // all three have exactly one honest place to be answered: the door. The search
  // box learned that in August; the column headers learned it on 18 Aug; the
  // FACETS were still narrowing the fifty rows the browser was holding.
  //
  // Reported the same day: the owner filtered the knowledge base by "From a
  // meeting" and was shown TWO sources. The door, asked properly, answers 52 and
  // the app holds 170 meetings. Page one happened to contain two of them, so the
  // screen reported two — under a badge (R16) correctly counting all 3,000-odd
  // sources. Nothing was broken; the filter was simply answering a question about
  // a window nobody could see the edges of.
  //
  // FOUR CLAUSES, because the control can be lost at four different points and
  // each of them looks like a working screen from the outside:
  //
  //   1. THE RECIPE DECLARES NONE. `{ field: "kind" }` on a recipe means "the
  //      `kind` property of the loaded row objects"; the same five characters in
  //      lib/collection-filters.ts mean "the `kind` parameter the door parses".
  //      They are indistinguishable to a reader and answer different questions,
  //      so a paged recipe may not carry the first kind at all.
  //   2. THE DOOR PARSES WHAT IS OFFERED. Derived from each door's own
  //      `searchParams.get` calls, exactly as R19 derives a tool's filters — a
  //      facet naming a parameter no door reads is a dropdown that quietly
  //      changes nothing.
  //   3. THE SCREEN WIRES THEM, into the <PagedFind> holding THAT collection's
  //      own cache key. A file mentioning both strings somewhere proves nothing
  //      (R14's own blind spot, and paged-sort.test.ts says the same).
  //   4. THE QUESTION REACHES THE DOOR WHOLE. This is the one that had already
  //      gone wrong invisibly: `content.knowledge` took the find's whole question
  //      and copied three named fields of it into a URL, so when sorting arrived
  //      and put `sort` in that question, the knowledge base's sort control
  //      changed the cache key, refetched the same rows in the same order, and
  //      looked like it worked. Nothing enumerates now — the screen spreads
  //      `...query` and `listQuery` forwards every key — and this is what keeps
  //      it that way.
  it("facets-ask-the-door: a paged collection's filters are the door's, not the loaded page's", () => {
    // The collections this governs: the growing ones with a LIST SCREEN. Derived
    // from the registry, never listed here.
    const PAGED = Object.entries(GROWING_COLLECTIONS).filter(([, c]) => c.listRecipe)
    expect(PAGED.length, "no paged list screens found — the scan is reading nothing").toBeGreaterThan(4)

    // A paged list screen that deliberately offers NO filters, each with its
    // reason. Silence about a control has to be written down, or "nobody wired
    // it" and "nobody wanted it" are the same green build.
    const UNFILTERED: Record<string, string> = {
      help: "the tickets screen narrows by stage and kind through its own sub-tab strip, which asks the DOOR (helpFacetFilter → <PagedFind fixed>). A Status select beside it would be a second control on one field — the clutter the accounts screen removed when its Type select became the All/Companies/People strip — and the two would fight, because `fixed` wins over a facet.",
    }

    for (const [name, c] of PAGED) {
      // 1 — the frame's own (in-memory, page-one) filter bar is off, because the
      // recipe declares nothing for it to draw.
      const recipe = BASE_RECIPES[c.listRecipe as string]
      expect(recipe, `${name}: recipe ${c.listRecipe} must exist`).toBeDefined()
      expect(
        recipe.collection?.filterFacets ?? [],
        `${name} pages, so a facet in its recipe narrows the loaded page — move it to COLLECTION_FILTERS, where its field is the DOOR's own query parameter`
      ).toEqual([])
      expect(
        recipe.collection?.userFilter,
        `${name} pages, so the frame must not draw a filter bar of its own`
      ).toBe(false)

      const facets = COLLECTION_FILTERS[name] ?? []
      if (facets.length === 0) {
        expect(
          UNFILTERED[name],
          `${name} is a paged list screen with no entry in COLLECTION_FILTERS — give it the door's filters, or a reasoned UNFILTERED line`
        ).toBeTruthy()
        continue
      }

      // 2 — every field it offers is a parameter that door really parses, read
      // off the door's own source.
      const door = stripComments(read(join(ROOT, c.routes)))
      const parsed = new Set([...door.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((m) => m[1]))
      expect(parsed.size, `${c.routes} parses no query parameters — the derivation has gone blind`).toBeGreaterThan(1)
      for (const f of facets)
        expect(
          parsed.has(f.field),
          `${name} offers a "${f.label}" filter on \`${f.field}\`, which ${c.routes} does not parse — an offered filter that cannot be honoured must not be shown`
        ).toBe(true)

      // 3 + 4 — the screen wires them to THIS collection's own key, and hands the
      // whole question over. A fixed window rather than one that stops at the
      // first `>`: `<PagedFind<Account>` carries a generic (its two siblings,
      // paged-search and paged-sort, say the same about the same tag).
      const wired = findBars().filter((w) => w.includes(c.webKey))
      expect(
        wired.length,
        `${name} has door filters but no <PagedFind> whose listKey is built from ${c.webKey}`
      ).toBeGreaterThan(0)
      for (const w of wired) {
        expect(
          w.includes("facets="),
          `${name}'s find bar draws no filters — pass translatedFacets("${name}", t, …)`
        ).toBe(true)
        // THE WHOLE QUESTION, never a copy of the fields somebody remembered.
        expect(
          /\.\.\.query/.test(w),
          `${name}'s fetchPage must hand the door the WHOLE question ({ ...query, cursor }) — copying named fields across is how the sort was silently dropped for six days`
        ).toBe(true)
      }
    }

    // 4, the other half of the wire: the client method each of those screens
    // calls builds its URL through the ONE forwarding seam. The method NAMES are
    // read out of the screens themselves, so a new door is held to this the day
    // a screen calls it.
    const called = new Set(
      findBars()
        .filter((w) => Object.values(GROWING_COLLECTIONS).some((c) => w.includes(c.webKey)))
        // The method whose ARGUMENT OBJECT carries the question. Not "the object
        // that opens with it": three of these screens put the strip's own
        // narrowing first and spread the person's question over it, which is the
        // right way round and would read as unwired to a tighter pattern.
        .flatMap((w) => [...w.matchAll(/\.(\w+)\(\{[\s\S]{0,600}?\.\.\.query/g)].map((m) => m[1]))
    )
    expect(called.size, "no paged list client methods found — the scan has gone blind").toBeGreaterThan(4)
    const apiSrc = sourceFiles(join(WEB, "lib", "api"), { extensions: [".ts"] })
      .map((f) => stripComments(f.source))
      .join("\n")
    for (const method of called) {
      const at = apiSrc.indexOf(`\n  ${method}: (`)
      expect(at, `web/lib/api declares no ${method}( — the derivation is reading the wrong thing`).toBeGreaterThan(-1)
      // The method's OWN body: up to the next member of the same object literal,
      // which is the next line opening at two spaces with a `name: (`.
      const rest = apiSrc.slice(at + 1)
      const next = rest.search(/\n {2}\w+: \(/)
      const body = next === -1 ? rest : rest.slice(0, next)
      expect(
        body.includes("listQuery("),
        `${method}() spells its door's parameters out one at a time — build the query with listQuery(opts) instead, or the next parameter added to that door is silently dropped on the way to it`
      ).toBe(true)
    }
  })

  // R8, surface ONE — the TEAM section strip. A placement:"tab" section that
  // shows a collection MUST declare a countCacheKey (so the badge is derived,
  // never a forgotten hand-listed key), AND the host must build the counts by
  // iterating that field — not a per-key literal.
  it("tab-counts-derived: every team collection tab declares a countCacheKey, derived generically", () => {
    for (const s of TEAM_SECTIONS) {
      if (s.placement !== "tab") continue
      if (s.countCacheKey === undefined) {
        expect(
          TAB_COUNT_EXCEPTIONS[s.key],
          `team tab "${s.key}" shows a collection → it must declare a countCacheKey (or be a reviewed TAB_COUNT_EXCEPTIONS entry)`
        ).toBeTruthy()
      } else {
        expect(s.countCacheKey.trim(), `team tab "${s.key}" countCacheKey must be non-empty`).not.toBe("")
      }
    }
    // Anti-regression: the host derives the badges by iterating countCacheKey — no
    // hand-listed per-section literal can creep back in.
    const src = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(src, "deep-link-screen must derive tab counts from countCacheKey").toContain("s.countCacheKey")
  })

  // R8, surface TWO — a RECORD's OWN tabs. The team strip is not the only tab
  // strip in the app: every record detail carries one too, built somewhere else
  // entirely (recipe data for the engine details, a tabs config for the bespoke
  // ones) — which is exactly how every record in the app shipped an Activity tab
  // with no count at all while surface one stayed green. Same law, both surfaces:
  // a tab that reveals a collection carries its count; a tab that shows the
  // record itself says so once, in RECORD_TAB_COUNT_EXCEPTIONS, with a reason.
  it("tab-counts-derived: every record-detail collection tab carries its count", () => {
    // (a) ENGINE-RECIPE details — which tabs are collections is DERIVED from each
    // tab's own block (tabCountKey), and the withTabCounts seam badges exactly
    // those. Run the seam rather than reading it: a badge the seam fails to apply
    // is the whole bug, and source text can't tell us it applied.
    let countedRecipeTabs = 0
    for (const [key, recipe] of Object.entries(BASE_RECIPES)) {
      if (recipe.type !== "detail" || !recipe.tabs) continue
      const collections = recipe.tabs.map(tabCountKey).filter((k): k is string => k !== null)
      const badged = withTabCounts(recipe, Object.fromEntries(collections.map((k) => [k, 42])))
      for (const tab of badged.tabs ?? []) {
        if (tabCountKey(tab) === null) {
          expect(
            RECORD_TAB_COUNT_EXCEPTIONS[`${key}.${tab.key}`],
            `${key} tab "${tab.key}" shows no collection → say so once, as a reviewed RECORD_TAB_COUNT_EXCEPTIONS entry`
          ).toBeTruthy()
          continue
        }
        countedRecipeTabs++
        expect(
          tab.badge,
          `${key} tab "${tab.key}" reveals a collection → it must carry that collection's count`
        ).toBe(formatCount(42))
      }
    }
    // Tripwire: a scan that finds no counted tabs has gone blind, and a blind
    // check reports "all clear" exactly like a passing one.
    expect(countedRecipeTabs, "the recipe-tab scan found no collection tabs — it has gone blind").toBeGreaterThan(2)

    // …and the HOST must actually badge every detail it renders — a seam nothing
    // calls is dead code wearing a law's clothes. One withTabCounts per rendered
    // detail recipe, counted both ways so neither can drift.
    const host = read(join(WEB, "components", "deep-link", "module-content.tsx"))
    const rendered = [...host.matchAll(/resolveRecipe\("[a-z]+\.detail"/g)].length
    expect(rendered, "the host renders no detail recipes — the scan has gone blind").toBeGreaterThan(2)
    expect(
      [...host.matchAll(/withTabCounts\(/g)].length,
      `the host renders ${rendered} detail recipes but badges fewer — every detail's tabs go through withTabCounts`
    ).toBe(rendered)
    // R16 owns the NUMBER: the seam abbreviates through the one formatCount path.
    expect(read(join(WEB, "lib", "screens.ts")), "withTabCounts must render the number through formatCount").toContain(
      "formatCount"
    )

    // (b) BESPOKE details — host-composed tabs configs. Their panels are JSX, so
    // "does this tab reveal a collection?" can't be derived off disk: every tab
    // must therefore carry a badge OR be a reviewed exception. Reading the tabs
    // out of the source (not a hand-list) is what makes a NEW tab arrive already
    // held to the law.
    // THE TRIPWIRE'S FLOOR IS R2'S FLOOR, WHICH IS TWO — not three.
    //
    // It read `toBeGreaterThan(2)` per component, i.e. "every bespoke record
    // detail has at least three tabs". That is not a law anybody wrote: R2 says
    // Overview + Activity, and a record with no collection hanging off it has
    // exactly those two. It passed for a year because every bespoke detail so
    // far happened to have a third tab, so the assertion looked like a blindness
    // guard while quietly asserting something else — and the first record that
    // obeyed R2 exactly (a dropdown value: a word, its group, and its history)
    // turned the build red for having the minimum the law requires.
    //
    // The blindness it was written to catch is real, so it is kept and moved to
    // where it belongs: per component the floor is two, because a regex that has
    // stopped matching yields nought or one; and the AGGREGATE below is what
    // catches a scan that degrades everywhere at once, the same shape the recipe
    // half above already uses.
    let scannedTabs = 0
    for (const c of recordDetailComponents()) {
      const tabs = [...c.source.matchAll(/\{\s*value: "([a-z-]+)",[\s\S]{0,300}?badge: ([^,\n]+),/g)]
      expect(
        tabs.length,
        `${c.name}: the tab scan found fewer than two tabs — either it has gone blind, or this detail is missing Overview/Activity (R2)`
      ).toBeGreaterThanOrEqual(2)
      scannedTabs += tabs.length
      let counted = 0
      for (const [, value, badge] of tabs) {
        if (badge.trim() !== '""') {
          counted++
          continue
        }
        expect(
          RECORD_TAB_COUNT_EXCEPTIONS[`${c.name}.${value}`],
          `${c.name} tab "${value}" carries no count → badge it from the door's exact total, or pin it (with a reason) in RECORD_TAB_COUNT_EXCEPTIONS`
        ).toBeTruthy()
      }
      // R16 owns the NUMBER here too — a counted bespoke tab goes through the seam.
      if (counted > 0)
        expect(
          c.source,
          `${c.name} badges a tab → the number must come through the formatCount seam (R16)`
        ).toContain("format-count")
    }
    // …and the aggregate tripwire. A regex that degrades across the board still
    // clears the per-component floor of two on a file or two by luck; it cannot
    // clear this. Anchored to the census's own size rather than a magic number,
    // so adding a detail raises the bar with it.
    expect(
      scannedTabs,
      "the bespoke tab scan found barely any tabs across every record detail — it has gone blind"
    ).toBeGreaterThan(recordDetailComponents().length * 2)
  })

  // R5 — record activity is read through the ONE generic (table, id) path.
  it("generic-activity-path: the activity read path has a generic record scope", () => {
    const src = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(src, "activity-read must support the generic `record` scope").toContain('scope === "record"')
    const api = read(join(WEB, "lib", "api", "tenancy.ts"))
    expect(api, "the web app reads record activity through the one fetcher").toContain("recordActivity")
  })

  // R6 — the glossary is the single, well-formed dictionary of product terms.
  it("glossary-wellformed: every term is present, brief, and unique", () => {
    const terms = new Set<string>()
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.trim(), `${key}.term`).not.toBe("")
      expect(entry.def.trim(), `${key}.def`).not.toBe("")
      expect(entry.def.length, `${key}.def must be brief (≤140 chars), never over-explained`).toBeLessThanOrEqual(140)
      expect(terms.has(entry.term), `duplicate term "${entry.term}"`).toBe(false)
      terms.add(entry.term)
    }
  })

  // R6, THE OTHER HALF — the one the app is actually read in.
  //
  // `glossary-wellformed` above reads the glossary FILE and stops there: term
  // non-empty, definition brief, no duplicates. R6's own sentence has always had
  // a second clause — "use those words in UI copy; never invent a synonym" — and
  // for a year nothing read a single line of copy against it. That is how the
  // app came to say "Permissions" on the Roles screen and "access rights" on two
  // others, "teammate" for a member, "cost card" for the internal rates and
  // "Portal login" for portal access, all under a green build.
  //
  // WHAT IT READS. `shared/i18n-strings.json` — which R28 makes EXACTLY the set
  // of user-visible English sentences in both front doors, re-derived from the
  // source on every build. So this check inherits its reach: a sentence a person
  // can read is a sentence in that file, and there is no second census to keep.
  //
  // WHAT IT REFUSES TO DO. It does not demand that copy be written out of the
  // glossary — most sentences are ordinary English and a rule that flagged them
  // would be switched off within a week. It carries a NARROW deny-list of words
  // that, in this app, can mean nothing but a record that already has a name.
  // The registry's own comment lists what was deliberately left off it and why
  // ("client", "option", "request"); the short version is that a word people
  // exempt their way past is worse than no word at all.
  // ── R35 · A RECORD NEVER APPEARS WITHOUT ITS FACE ────────────────────────
  //
  // Checked at the three places a visual can be LOST, rather than by inspecting
  // markup. There is no honest regex for "this JSX is a record row" — `.map(x =>
  // <li>` matches attachment lists, reply threads, comment feeds and step lists,
  // none of which are records — so a scan written that way would either miss the
  // rows that matter or flag the ones that do not, and a rule that cries wolf is
  // a rule people delete.
  //
  // The three chokepoints are real because the codebase already made them real:
  // one picker type every searchable dropdown funnels through (`record-picker`
  // is the only composer of `command`, enforced above), one recipe file, and one
  // shared nested row. A field that is not carried cannot be forgotten later; it
  // is already gone.
  it("records-carry-their-face: the three places a visual can be lost all declare it (R35)", () => {
    // 1 · THE PICKER'S OPTION TYPE. Thirty-three pickers pass through it, and
    // until 19 Aug 2026 it had no field for a picture at all — so none of them
    // COULD have drawn one.
    const picker = read(join(WEB, "components", "record-picker.tsx"))
    for (const field of ["picture", "mark", "shape"])
      expect(
        new RegExp(`\\n\\s*${field}\\??:`).test(picker),
        `PickerOption must declare \`${field}\` — a picker option that cannot carry a visual makes every dropdown in the app a column of words`
      ).toBe(true)
    expect(
      /<RecordMark/.test(picker),
      "the picker no longer draws a RecordMark, so its options declare a visual nothing renders"
    ).toBe(true)

    // 2 · THE RECORD TYPE THE DIALOGS SHARE. Nine dialogs said `{ id; name }[]`
    // and were handed rows carrying a logo, which the type discarded one line
    // before the component.
    const pickable = read(join(WEB, "lib", "pickable.ts"))
    expect(
      /logoUrl\??:/.test(pickable),
      "PickableRecord must carry the record's picture, or every dialog that takes one loses it at the boundary"
    ).toBe(true)
    const members = read(join(WEB, "lib", "members.ts"))
    expect(
      /photo\??:/.test(members),
      "PickablePerson must carry the person's photo — it dropped `imageUrl` for a year, one line before every picker that offers a person"
    ).toBe(true)

    // 3 · EVERY LIST RECIPE NAMES ITS LEADING COLUMN. Not most of them: a person
    // sees these lists side by side, and one bare row among fourteen reads as the
    // broken one.
    const recipes = read(join(WEB, "lib", "screens.ts"))
    // A RECIPE is a `…Recipe: ScreenRecipe = {…}` declaration — not any block
    // that happens to mention `listCollection` in a comment, which is what a
    // looser split caught on the first run.
    const bare = [...recipes.matchAll(/const (\w*Recipe): ScreenRecipe = \{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => body.includes("listCollection(") && !body.includes('leading: "mark"'))
      .map(([, name]) => name)
    expect(
      bare.length,
      `${bare.length} list recipe(s) draw rows with no leading visual:\n  ${bare.join("\n  ")}`
    ).toBe(0)
    const allRecipes = [...recipes.matchAll(/const (\w*Recipe): ScreenRecipe = \{([\s\S]*?)\n\}/g)].filter(
      ([, , body]) => body.includes("listCollection(")
    )
    expect(allRecipes.length, "no list recipes found — this check is measuring nothing").toBeGreaterThan(5)

    // 4 · THE ONE SHARED NESTED ROW REQUIRES ITS MARK. Required, not optional:
    // `null` is a real answer said out loud at the call site, and an omitted
    // optional prop says nothing at all — which is exactly how twenty panels came
    // to draw bare words without anybody deciding to.
    const panels = read(join(WEB, "components", "work-panels.tsx"))
    expect(
      /\n\s*mark: React\.ReactNode \| null\n/.test(panels),
      "the shared nested Row must take its mark as a REQUIRED prop — an optional one is a rule a twenty-first panel can skip in silence"
    ).toBe(true)
  })

  it("glossary-in-copy: no screen says a known synonym for a glossary term (R6/R33)", () => {
    const strings: string[] = JSON.parse(read(join(ROOT, "shared", "i18n-strings.json")))
    // The census must not go blind: an empty catalogue would pass this silently.
    expect(strings.length, "the string catalogue is empty — this check is reading nothing").toBeGreaterThan(100)
    expect(GLOSSARY_SYNONYMS.length, "the deny-list is empty").toBeGreaterThan(5)

    const whole = (word: string) =>
      new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}(?![\\w-])`, "i")

    // ROT, FIRST — a deny-list that has drifted from the dictionary is worse than
    // none, because it reads as a promise that the words agree.
    for (const s of GLOSSARY_SYNONYMS) {
      expect(
        Object.prototype.hasOwnProperty.call(GLOSSARY, s.term),
        `"${s.word}" is banned in favour of the glossary key "${s.term}", which no longer exists`
      ).toBe(true)
      expect(s.why.trim(), `"${s.word}" needs a reason`).not.toBe("")
      // And the dictionary may not contradict the rule. If a term or its
      // definition uses the banned word, the ban is aimed at the glossary itself
      // — which is the shape ("option") that makes a rule people exempt past.
      const entry = GLOSSARY[s.term as keyof typeof GLOSSARY]
      expect(
        whole(s.word).test(`${entry.term} ${entry.def}`),
        `the glossary's own "${entry.term}" says "${s.word}" — a rule that contradicts its dictionary cannot be obeyed`
      ).toBe(false)
    }

    // …and the exemptions rot in both directions.
    for (const [sentence, why] of Object.entries(GLOSSARY_SYNONYM_OK)) {
      expect(why.trim(), `the exemption for "${sentence}" needs a reason`).not.toBe("")
      expect(
        strings.includes(sentence),
        `GLOSSARY_SYNONYM_OK excuses "${sentence}", which the app no longer says — delete the line`
      ).toBe(true)
      expect(
        GLOSSARY_SYNONYMS.some((s) => whole(s.word).test(sentence)),
        `GLOSSARY_SYNONYM_OK excuses "${sentence}", which contains no banned word — delete the line`
      ).toBe(true)
    }

    // THE CHECK.
    const said: string[] = []
    for (const sentence of strings) {
      if (Object.prototype.hasOwnProperty.call(GLOSSARY_SYNONYM_OK, sentence)) continue
      for (const s of GLOSSARY_SYNONYMS) {
        if (!whole(s.word).test(sentence)) continue
        const term = GLOSSARY[s.term as keyof typeof GLOSSARY].term
        said.push(`"${sentence}" — says "${s.word}"; this app's word is "${term}" (${s.why})`)
      }
    }
    expect(
      said,
      "R6: the glossary is the single source of product terms, and these sentences invent a second word for one. " +
        "Reword the copy to the term, or — if the banned word is genuinely the right one there — add the sentence to " +
        "GLOSSARY_SYNONYM_OK with the reason. Re-run `node scripts/i18n-extract.mjs` after any copy change (R28)"
    ).toEqual([])
  })

  // R1, the ROSTER half. The per-worker publish-seam suites prove each mutation in
  // the workers that HAVE one publishes. Nothing proved the roster: MUTATING_WORKERS
  // sat in the registry saying "a new mutating worker without a publish-seam test is
  // a gap — track it here", and no check read it, so a ninth worker that published
  // and shipped no suite would have been exactly that gap, silently. Both directions,
  // derived from disk.
  it("publish-seam-roster: every worker that publishes has a publish-seam suite", () => {
    const publishers = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
      .filter((w) => w.isDirectory())
      .filter((w) =>
        sourceFiles(join(ROOT, "workers", w.name, "src"), { extensions: [".ts"] }).some((f) =>
          /publish(Change|UserChange|SignOut)\s*\(/.test(stripComments(f.source))
        )
      )
      .map((w) => w.name)

    // The scan must not go blind: three workers are the known floor.
    expect(publishers.length, "the publisher scan found almost nothing").toBeGreaterThanOrEqual(3)

    // auth is the reviewed exception CLAUDE.md and CACHING.md rule 5 already name:
    // it publishes on the USER channel (identity events + a forced sign-out), not a
    // team resource, so there is no ROUTES-table mutation set for a seam to walk.
    const EXEMPT: Record<string, string> = {
      auth: "publishes on the per-user identity channel, not a team resource — no ROUTES mutation set to walk (CACHING.md rule 5)",
    }
    const unguarded = publishers.filter((w) => !MUTATING_WORKERS.includes(w as never) && !EXEMPT[w])
    expect(
      unguarded,
      `these workers publish and have no publish-seam suite — add one and list them in ` +
        `MUTATING_WORKERS, or add a reasoned exemption: ${unguarded.join(", ")}`
    ).toEqual([])

    // …and the other direction: a name in MUTATING_WORKERS must be a worker that
    // really carries the suite, so the list can't rot into a wish.
    for (const w of MUTATING_WORKERS) {
      expect(publishers, `MUTATING_WORKERS lists ${w}, which publishes nothing`).toContain(w)
      expect(
        existsSync(join(ROOT, "workers", w, "test", "publish-seam.test.ts")),
        `MUTATING_WORKERS lists ${w}, which has no publish-seam.test.ts`
      ).toBe(true)
    }
    for (const w of Object.keys(EXEMPT))
      expect(publishers, `${w} is exempted from R1's roster but publishes nothing`).toContain(w)
  })

  // R11 — every EXTERNAL fetch (a bare global fetch() to the internet) carries an
  // AbortSignal timeout, so a hung socket can't stall a worker. Service-binding calls
  // (X.fetch()) are Cloudflare-bounded and exempt (the bare-fetch regex skips them).
  it("fetch-timeout: every external fetch carries an AbortSignal timeout", () => {
    const serverDirs = [
      join(ROOT, "shared", "workers"),
      // Directories only — skip stray files (e.g. a macOS .DS_Store) so the scan can't
      // try to walk `<file>/src` and die with ENOTDIR.
      ...readdirSync(join(ROOT, "workers"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(ROOT, "workers", e.name, "src")),
    ]
    const offenders: string[] = []
    for (const file of sourceFiles(serverDirs, {
      extensions: [".ts"],
      skipTests: true,
      relativeTo: ROOT,
    })) {
      // `await fetch(` = an awaited call to the GLOBAL fetch (an external socket).
      // This excludes service bindings (`X.fetch`), the Worker `async fetch(` handler,
      // and type annotations (`{ fetch(url…) }`) — all of which aren't external calls.
      const re = /\bawait fetch\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(file.source))) {
        const window = file.source.slice(m.index, m.index + 600)
        if (!/signal:\s*AbortSignal\.timeout/.test(window)) offenders.push(`${file.rel} @${m.index}`)
      }
    }
    expect(offenders, `external fetch without an AbortSignal timeout (R11): ${offenders.join(", ")}`).toEqual([])
  })

  // R12 — every cron / scheduled handler records its failures to the error store.
  // Unattended work has no user watching, so a swallowed background failure would be
  // invisible in the 90-day error_logs. (The request dispatcher already records; this
  // guards the background handlers.)
  it("cron-records: every scheduled handler records failures via recordWorkerError", () => {
    const offenders: string[] = []
    for (const w of readdirSync(join(ROOT, "workers"))) {
      const idx = join(ROOT, "workers", w, "src", "index.ts")
      if (!existsSync(idx)) continue
      const src = read(idx)
      const m = /async scheduled\s*\(/.exec(src)
      if (!m) continue // no cron in this worker
      // The scheduled handler runs to the end of the file — it must record.
      if (!/recordWorkerError/.test(src.slice(m.index)))
        offenders.push(w)
    }
    expect(offenders, `cron handler that swallows failures without recording (R12): ${offenders.join(", ")}`).toEqual([])
  })

  // R14 — no unbounded list endpoint: every exported list*/search* function in a
  // worker lib either pages or carries a hard-cap LIMIT (one unbounded read
  // stalls a worker at 100k rows — the 24k-catalogue failure).
  it("bounded-lists: every exported list*/search* function carries a LIMIT", () => {
    const offenders: string[] = []
    let seen = 0
    for (const [path, src] of workerSources()) {
      if (!path.includes("/src/lib/")) continue
      // BOTH export shapes. A scan that only knows `export function listX` goes
      // silently blind the day someone writes `export const listX = async () =>`
      // — the read is then unbounded AND invisible, which is worse than either.
      const re = /export (?:async )?function ((?:list|search)\w*)|export const ((?:list|search)\w*)\s*(?::[^=;\n]*)?=/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        seen++
        const next = src.indexOf("\nexport ", m.index + 1)
        const body = stripComments(src.slice(m.index, next === -1 ? undefined : next))
        if (/SELECT/.test(body) && !/LIMIT\s/.test(body)) offenders.push(`${path} → ${m[1] ?? m[2]}`)
      }
    }
    // The tripwire: a scan that suddenly finds nothing has gone blind, and a
    // blind check reports "all clear" exactly like a passing one.
    expect(seen, "the bounded-lists scan found no list functions at all — it has gone blind").toBeGreaterThan(15)
    expect(
      offenders,
      `unbounded list read (R14) — add a hard-cap LIMIT (with its comment) or real paging: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // R14, the other half — a cap is an honest REFUSAL to answer, so a collection
  // that grows with ordinary use must PAGE instead: keyset (never OFFSET, which
  // re-scans everything skipped and duplicates rows under concurrent writes), an
  // exact total, hasMore, an opaque cursor — and a client that can actually reach
  // page two. Paging no one can reach is dead code wearing a law's clothes.
  it("bounded-lists: every GROWING collection pages by key, end to end", () => {
    for (const [name, c] of Object.entries(GROWING_COLLECTIONS)) {
      const lib = read(join(ROOT, c.lib))
      const at = lib.indexOf(`export async function ${c.fn}`)
      expect(at, `${name}: ${c.fn} must exist in ${c.lib}`).toBeGreaterThan(-1)
      const next = lib.indexOf("\nexport ", at + 1)
      const body = lib.slice(at, next === -1 ? undefined : next)
      for (const seam of ["decodeCursor", "keysetAfter", "toPage"])
        expect(body, `${name} (${c.why}) must page through the ${seam} seam, not a hard cap`).toContain(seam)
      expect(body, `${name} must not page by OFFSET — keyset only`).not.toMatch(/OFFSET/i)

      // The door must hand the WHOLE contract back, through the one pagedJson
      // seam — a door assembling its own response literal can (and did) ship with
      // half the contract, and the client then silently loses page two.
      const routes = read(join(ROOT, c.routes))
      expect(routes, `${c.routes} must answer ${name} through the pagedJson seam`).toContain("pagedJson")
      // …and NOTHING may hand these rows back any other way: a response built by
      // hand is how a door ships half the contract (rows + total, no cursor).
      const handBuilt = [...routes.matchAll(/(?<![A-Za-z])json\(/g)].filter((m) =>
        new RegExp(`\\b${c.rowsKey}\\s*:`).test(routes.slice(m.index, (m.index ?? 0) + 300))
      )
      expect(
        handBuilt.length,
        `${c.routes} hands \`${c.rowsKey}\` back through a hand-built json() — every page must go through pagedJson`
      ).toBe(0)

      // …and something in web must be able to ask for page two.
      //
      // THE `<LoadMore>` AND THE KEY MUST BE THE SAME CONTROL, not two strings in
      // one file. This used to be `src.includes("<LoadMore") && src.includes(key)`
      // — a file-level AND — and the knowledge base walked straight through it:
      // its LIST had no paging control at all while its record DETAIL had one (for
      // the activity feed) and mentioned the list's cache key elsewhere, so a
      // component with both substrings existed and the law reported "all clear".
      // Deleting the whole control left the build green. So the key must appear
      // INSIDE the LoadMore's own props — that is what makes it that collection's
      // paging control rather than a coincidence of substrings.
      //
      // AND EVERY COLLECTION IS PROVED AGAINST ITS OWN CONTROL, IN ITS OWN FILE.
      // The fix above was written as a BRANCH on `!c.listRecipe`, which reads like
      // "the record feed" and is in fact true of THREE entries — `recordActivity`,
      // `activity` and `workLogs`. That branch asserted a `<LoadMore
      // listKey={activity.listKey}>` inside `activity-panel.tsx`, which is the
      // record feed's control and has nothing to do with the team feed or the list
      // of time. So for two of the three collections it was a CONSTANT: deleting
      // `<LoadMore listKey={workLogsKey(teamId)}>` from `time-panel.tsx`, or the
      // team-feed pager from `module-content.tsx`, left the build green — where the
      // weaker-looking sentence it replaced had gone red. One branch cannot stand
      // for three collections; `pagerFile`/`pagerKey` name each one's own.
      const pager = read(join(WEB, c.pagerFile))
      const wired = [...pager.matchAll(/<LoadMore[\s\S]{0,400}?\/>/g)].some((m) =>
        m[0].includes(c.pagerKey)
      )
      expect(
        wired,
        `${name} pages on the server but nothing in web can reach page two — ${c.pagerFile} must render a <LoadMore> whose listKey is built from ${c.pagerKey}`
      ).toBe(true)
      // …and the collection's cache key is NAMED by a component, which on the
      // record feed is the second half of the pairing rather than a restatement of
      // the first: its control reads `listKey={activity.listKey}`, a value the
      // `useRecordActivity(` hook hands it, so the hook has to be called somewhere
      // for that control to be about anything at all.
      expect(
        componentFiles().some((f) => read(f).includes(c.webKey)),
        `${name}: no component names ${c.webKey}, so ${c.pagerFile}'s pager pages nothing`
      ).toBe(true)

      // R14 meets R16: the collection frame's own "Showing X of Y" counts the
      // LOADED prefix, so on a paged screen it under-reports — and it is a
      // second count besides. The exact one above is the only one.
      if (c.listRecipe) {
        const recipe = BASE_RECIPES[c.listRecipe]
        expect(recipe, `${name}: recipe ${c.listRecipe} must exist`).toBeDefined()
        expect(
          recipe.collection?.showCount,
          `${name} is paged, so its recipe must not render the frame's own "Showing X of Y" (it counts the loaded prefix)`
        ).toBe(false)
      }
    }
  })

  // R17 — state transitions are idempotent: every deactivate/reactivate UPDATE
  // carries the current-status predicate (a double click must move ZERO rows and
  // write no duplicate history), and the writers read the changed count back.
  it("idempotent-transitions: every deactivate/reactivate UPDATE carries the status predicate", () => {
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      let idx = -1
      while ((idx = src.indexOf("SET deactivated_at =", idx + 1)) !== -1) {
        // The statement window: from its UPDATE keyword to just past the match.
        const from = src.lastIndexOf("UPDATE", idx)
        const stmt = src.slice(from, Math.min(src.length, idx + 500))
        // An upsert's DO UPDATE (excluded.*) re-activates by design — exempt.
        if (/excluded\./.test(stmt)) continue
        if (!/deactivated_at IS (NOT )?NULL/.test(stmt)) offenders.push(`${path} @${idx}`)
      }
      // Status moves too: a help status UPDATE must carry a CURRENT-STATUS
      // predicate. Two spellings count, and only two:
      //   • `status <> ?`      — "not already there" (a move to one named state);
      //   • `status IN (…)` / `status NOT IN (…)` — "only out of these" (a move
      //     whose ALLOWED starting states are a list, which is what the Ready
      //     flip needs: a ticket may become ready from new / triaged / in
      //     progress, and must never be dragged back out of resolved).
      // The second spelling was added when the flip landed. It is the same law
      // and, for a list, the stricter statement of it — `<> 'ready'` alone would
      // have let a RESOLVED ticket be un-answered by a straggler story closing.
      // The pattern is deliberately anchored to the word `status` so an unrelated
      // `account_id IN (…)` on the same statement cannot satisfy it.
      let s = -1
      while ((s = src.indexOf("UPDATE help SET status", s + 1)) !== -1) {
        const stmt = src.slice(s, Math.min(src.length, s + 500))
        if (!/status\s*(?:<>|NOT\s+IN\s*\(|IN\s*\()/.test(stmt))
          offenders.push(`${path} @${s} (status move without a current-status predicate)`)
      }
    }
    expect(
      offenders,
      `state transition without the current-status predicate (R17): ${offenders.join(", ")}`
    ).toEqual([])
    // The three transition writers read the changed count back (RETURNING id) so
    // a zero-row move can skip the activity row + the publish.
    for (const [file, fn] of [
      ["workers/tenancy/src/lib/roles.ts", "setRoleActive"],
      ["workers/tenancy/src/lib/selectable.ts", "setSelectableActive"],
      ["workers/content/src/lib/brand-assets.ts", "setBrandAssetActive"],
      ["workers/content/src/lib/help.ts", "setStatus"],
      // The Ready flip is a status writer like any other, and the one with the
      // most to lose from a double: it fires off the back of a story closing, and
      // a story close is exactly the kind of thing a person double-clicks.
      ["workers/content/src/lib/ready-flip.ts", "readyFlipForTicket"],
    ] as const) {
      const src = read(join(ROOT, ...file.split("/")))
      // THE FUNCTION, not the rest of the file. This window used to run to EOF,
      // so a `return false` in any later function satisfied it — and the moment
      // one of these writers needed to return something richer than a boolean
      // (setStatus now reports WHICH account's ticket moved, for the live ping)
      // the check failed for a reason that had nothing to do with the law.
      const from = src.indexOf(`export async function ${fn}`)
      const next = src.indexOf("\nexport ", from + 1)
      const body = src.slice(from, next === -1 ? src.length : next)
      expect(/RETURNING id/.test(body), `${fn} must read the changed-row count (RETURNING id)`).toBe(true)
      // The law, said as the code must say it: a zero-row move RETURNS, and it
      // returns BEFORE the activity row is written. Anything after that early
      // exit is the "something really changed" path.
      const early = body.indexOf("if (!changed[0]) return")
      const history = body.indexOf("logActivity")
      expect(early, `${fn} must return early when zero rows moved`).toBeGreaterThan(-1)
      expect(
        history === -1 || early < history,
        `${fn} must skip the activity row when zero rows moved`
      ).toBe(true)
    }
  })

  // R18 — a cross-module read carries the caller's module rights. Every
  // relatedTable any worker writes must resolve through the gate map (or a
  // pinned, reasoned exemption); the team feed subtracts denied modules through
  // ONE shared clause any count must reuse.
  it("activity-gate-coverage: every relatedTable resolves to a gated module or a pinned exemption", () => {
    const known = new Set([...Object.keys(ACTIVITY_GATE_MAP), ...Object.keys(ACTIVITY_TABLE_EXEMPT)])
    const offenders: string[] = []
    for (const [path, src] of workerSources()) {
      for (const m of src.matchAll(/relatedTable: "([a-z_]+)"/g))
        if (!known.has(m[1])) offenders.push(`${path} writes relatedTable "${m[1]}"`)
    }
    // Dynamic writer: the import engine logs relatedTable: target.tableKey — so
    // every TargetDef key must be in the gate map (imports write real module rows).
    const targetsSrc = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    for (const m of targetsSrc.matchAll(/tableKey: "([a-z_]+)"/g))
      if (!(m[1] in ACTIVITY_GATE_MAP)) offenders.push(`targets.ts TargetDef "${m[1]}" not in ACTIVITY_GATE_MAP`)
    expect(
      offenders,
      `a table the feed cannot NAME is a table it cannot withhold (R18) — add it to ACTIVITY_GATE_MAP or (with a reason) ACTIVITY_TABLE_EXEMPT: ${offenders.join(", ")}`
    ).toEqual([])

    // The ONE clause: the reader exposes the shared builder, the team scope uses
    // it, and the route builds `allowed` from the registry map + the caller's rights.
    const reader = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(reader).toContain("export function activityVisibilityClause")
    expect(reader).toContain('scope === "team"')
    const route = read(join(ROOT, "workers", "tenancy", "src", "routes", "team.ts"))
    expect(route).toContain("ACTIVITY_GATE_MAP")
    expect(route).toContain("getMyPermissions")
  })

  // R15 — no deaf publishers: every resource any worker publishes must reach a
  // listener (the row-level registry, a coarse invalidation, or a reasoned
  // exemption). Publishing to nobody is the silent half of the stale-screen bug.
  // The publisher set is DERIVED by scanning publishChange calls — never hand-listed.
  //
  // R15 USED TO HAVE A SECOND HALF — "every paged screen subscribes via
  // useLiveRefetch" — and it was a guard that could not fail. It filtered
  // components on `/\/search\?|usePagedList/`; ZERO files matched, so its
  // offender list was permanently `[]` and it protected a hook with no call
  // sites. The need was real when it was written and then went away: paging
  // moved to opaque CURSORS over the shared store, so a paged list's rows now
  // live IN a cache key (`accounts:<team>`, `help:<team>`, `activity:record:…`)
  // with its cursor in a sidecar — exactly the caches the row-level registry
  // below already patches and the portal's own listener map invalidates. There
  // is no longer any screen holding page state OUTSIDE those caches, which was
  // the hook's entire premise. So the clause and the hook are retired rather
  // than re-detected: a law kept alive by a filter matching nothing is worse
  // than no law. What still bites is below — and it is derived off the workers'
  // own publishChange calls, so it cannot go blind the same way.
  it("live-collections: every published resource reaches a listener (no deaf publishers)", () => {
    const published = new Set<string>()
    for (const [, src] of workerSources()) {
      // Literal resources: publishChange(env.REALTIME, <team>, "resource"…
      for (const m of src.matchAll(/publishChange\([^,]+,[^,]+,\s*"([a-z_]+)"/g)) published.add(m[1])
    }
    // Dynamic resources: the import engine publishes each TargetDef's module.
    const targetsSrc = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    for (const m of targetsSrc.matchAll(/module: "([a-z_]+)"/g)) published.add(m[1])
    const listeners = new Set([
      ...Object.keys(TEAM_RESOURCES),
      ...Object.keys(SIMPLE_INVALIDATIONS),
      ...Object.keys(DEAF_EXEMPT),
    ])
    const deaf = [...published].filter((r) => !listeners.has(r))
    expect(
      deaf,
      `published to nobody (R15) — add a TEAM_RESOURCES/SIMPLE_INVALIDATIONS listener or a reasoned DEAF_EXEMPT entry: ${deaf.join(", ")}`
    ).toEqual([])
    // Tripwire: the publisher set is scanned, so a scan that finds nothing would
    // report "all clear" exactly like a passing one.
    expect(published.size, "the publisher scan found no publishChange calls — it has gone blind").toBeGreaterThan(5)
  })

  // R15's OTHER HALF: a collection also cached in RECORD-SCOPED slices has to
  // reach a listener in that shape too, and the resource name alone does not get
  // there. A `work_logs` ping carries the work LOG's id; the story it sits
  // against is on the row, which `deps` has not read and `patchRow` never reads
  // at all when the team-wide list isn't loaded. So the registry declares the
  // family by PREFIX and the shell drops it.
  //
  // This is the bug the tester found on staging: a timer stopped from the header
  // bar went on reading "running" on the story's Time tab for ever — and because
  // that screen only offers a correction on time that has FINISHED, a row stuck
  // at "running" is also a row nobody can edit. One stale cache key, two
  // findings.
  it("live-collections: a record-scoped slice of a live collection reaches a listener too", () => {
    const declared = Object.values(TEAM_RESOURCES)
      .map((r) => r.slicePrefix)
      .filter((p): p is string => !!p)
    expect(
      declared,
      "the time slices are a live collection's record-scoped half — a resource must claim them (R15)"
    ).toContain(TIME_SLICE_PREFIX)

    // …and the SHELL performs the drop, rather than the registry describing one
    // nothing does. A declared prefix nobody reads is R15's original failure
    // mode wearing a new field name.
    const shell = read(join(WEB, "components", "app-shell.tsx"))
    expect(
      shell.includes("invalidatePrefix(r.slicePrefix)"),
      "app-shell must drop each resource's declared slice family on a ping (R15)"
    ).toBe(true)

    // …and no screen builds a per-record time key by hand. ONE builder, so the
    // prefix the registry drops and the key the screen reads cannot drift apart
    // — which is exactly how the story's Time tab ended up on a key
    // (`time-story-of:<id>`) that nothing in the live layer had ever heard of.
    const handRolled = componentFiles().filter((f) => /sliceKey\(\s*["'`]time-/.test(read(f)))
    expect(
      handRolled,
      `a per-record time cache key must come from recordTimeKey, not sliceKey (R15): ${handRolled.join(", ")}`
    ).toEqual([])
  })

  // R16 — every screen showing a collection shows its count exactly once: the
  // NUMBER through the one formatCount seam (never rows.length), the PLACE a
  // counted tab or a CollectionHeading, the ARBITRATION a context (a counted tab
  // wins; the heading stands down).
  // R16 AMENDED (2026-08-14) — the SERVER half of the number, which this check
  // did not have. Every clause above is about the browser: which component
  // renders the badge, where it sits, who stands down. None of them could see
  // that the total behind the badge was an unbounded `COUNT(*)` over a table that
  // grows on every mutation — the one read in the product with no ceiling at all.
  //
  // So the law now also says WHERE COUNTING STOPS, and this is the clause that
  // holds it: every GROWING collection's count goes through the one bounded seam
  // (shared/workers/count.ts), DERIVED from GROWING_COLLECTIONS rather than
  // hand-listed, so a tenth growing collection cannot be added without one.
  //
  // The exemption is as important as the rule. A number that feeds a DECISION —
  // billable seconds, an export's completeness — must NOT be capped, so this
  // clause deliberately checks only the count, and a separate assertion below
  // proves the two paths that must stay exact still are.
  it("counted-collections (server): every growing collection counts through the bounded seam", () => {
    const offenders: string[] = []
    let checked = 0
    for (const [name, c] of Object.entries(GROWING_COLLECTIONS)) {
      const src = stripComments(read(join(ROOT, c.lib)))
      // The seam, in any of its three spellings: the two helpers, or the exported
      // bounded subquery for the one door that computes a capped count beside an
      // exact sum (work_logs). A door importing none of them is counting without
      // a ceiling. The generic is allowed for (`countCollectionWith<{…}>(`) — the
      // same blindness the R10 gate scan was once fooled by.
      if (!/\b(countCollection|countCollectionWith|boundedInner)(?:<[^(<>]*>)?\s*\(/.test(src))
        offenders.push(`${name} (${c.lib}) — no bounded count seam`)
      // …and no hand-written unbounded COUNT(*) over the collection's OWN table
      // may survive INSIDE A READER, or the seam is decoration.
      //
      // SCOPED TO THE READERS, deliberately, and this is the distinction the law
      // turns on rather than a convenience: a `count*`/`list*`/`search*` function
      // answers "how many are there" for a BADGE, which is what the cap is for. A
      // count anywhere else in the same file is answering something else — the
      // bulk status move confirms how many rows it is about to touch, and that
      // number decides whether a write proceeds. Capping a decision is the bug
      // this amendment is most likely to cause, so the check must not demand it.
      for (const fn of readerBodies(src))
        for (const m of fn.body.matchAll(/SELECT\s+COUNT\(\*\)\s+AS\s+\w+\s+FROM\s+(\w+)/gi))
          if (m[1] === c.rowsKey || m[1] === name)
            offenders.push(`${name} (${c.lib}) — unbounded COUNT(*) over ${m[1]} in ${fn.name}`)
      checked++
    }
    expect(checked, "GROWING_COLLECTIONS must not be empty — the check derives from it").toBe(
      Object.keys(GROWING_COLLECTIONS).length
    )
    expect(
      offenders,
      `R16 (amended): a growing collection's total is counted through shared/workers/count.ts, exactly to TOTAL_COUNT_CAP and "at least" beyond it: ${offenders.join(", ")}`
    ).toEqual([])

    // The seam says where counting stops ONCE — the cap is imported from
    // limits.ts by both sides, never restated. A second literal is how a door
    // that stops counting and a badge that starts hedging come to disagree.
    const seam = read(join(ROOT, "shared", "workers", "count.ts"))
    expect(seam, "the seam imports the one cap").toContain("TOTAL_COUNT_CAP")
    expect(
      stripComments(seam).match(/1_000_000|1000000/),
      "the seam must not restate the cap as a literal"
    ).toBeNull()
    // The badge side is asserted differently, because `1_000_000` appears there
    // legitimately as a RUNG of the abbreviation ladder (the "m" magnitude) and
    // banning the literal would ban the ladder. What must not exist is a SECOND
    // cap: the file imports the one number and declares none of its own.
    const badge = stripComments(read(join(ROOT, "shared", "web", "format-count.ts")))
    expect(badge, "the badge imports the one cap").toContain("TOTAL_COUNT_CAP")
    expect(
      badge.match(/const\s+\w*_?CAP\b/),
      "the badge must not declare a cap of its own — one ceiling, imported"
    ).toBeNull()

    // …and pagedJson DERIVES totalCapped, so no door can promise an exactness it
    // did not pay for. This is why the amendment needed no edit at 13 call sites.
    const http = stripComments(read(join(ROOT, "shared", "workers", "http.ts")))
    expect(http, "pagedJson must declare totalCapped").toContain("totalCapped")
    expect(http, "…and DERIVE it from the total, not take it from the caller").toMatch(
      /totalCapped:\s*isCapped\(page\.total\)/
    )
  })

  // The other half of the amendment, and the one that would have shipped a
  // billing bug: a number that feeds a DECISION stays EXACT. Asserted rather
  // than assumed, because "we did not cap that one" is not a property of code.
  it("counted-collections (server): decision numbers are NOT capped", () => {
    // Billable time. The work-log door computes a capped ROW COUNT beside an
    // EXACT SUM in one statement — the sum must sit outside the bounded subquery.
    const wl = stripComments(read(join(ROOT, "workers", "content", "src", "lib", "work-logs.ts")))
    expect(wl, "the row count is bounded").toContain("boundedInner(")
    expect(
      wl,
      "…and SUM(w.seconds) is read OUTSIDE it — billable time is never a partial sum"
    ).toMatch(/SELECT\s+SUM\(w\.seconds\)\s+FROM\s+work_logs\s+w\s+WHERE/)
    expect(wl.indexOf("SUM(w.seconds)"), "the sum must not be an aggregate over the bounded set")
      .toBeGreaterThan(-1)
    expect(
      /boundedInner\(`SELECT 1 FROM work_logs[^`]*`\)/.test(wl),
      "the bounded subquery selects rows to COUNT, never seconds to SUM"
    ).toBe(true)

    // An export proves it came out WHOLE through its own `complete` flag, which
    // predates this amendment and must survive it untouched: an export that
    // silently stopped at the collection cap would answer "complete" about a
    // truncated file. These three doors are the whole of that path.
    for (const f of [
      join(ROOT, "workers", "tenancy", "src", "lib", "accounts.ts"),
      join(ROOT, "workers", "content", "src", "lib", "delivery.ts"),
      join(ROOT, "workers", "content", "src", "lib", "brand-assets.ts"),
    ]) {
      const src = stripComments(read(f))
      expect(src, `${f} keeps its EXPORT_HARD_CAP completeness flag`).toContain("EXPORT_HARD_CAP")
      expect(src, `${f} must not route its export through the collection cap`).not.toMatch(
        /complete:[^\n]*TOTAL_COUNT_CAP/
      )
    }
  })

  it("counted-collections: server totals through ONE seam, one place, arbitrated", () => {
    // (i) THE NUMBER — no component builds a count badge from a loaded list's length.
    const lengthBadges = componentFiles().filter((f) => /badge:[^,\n]*\.length/.test(read(f)))
    expect(
      lengthBadges,
      `a capped list's length is a ceiling, not a total (R16) — badge from the server total via formatCount: ${lengthBadges.join(", ")}`
    ).toEqual([])

    // (i, widened) A STAT TILE IS A BADGE WITH A LABEL, and this clause is the
    // half that was missing. The scan above reads `badge:` props only, so
    // `work-logs-panel.tsx` shipped both of R16's failure modes side by side,
    // inside a `<StatGrid>`, under a green build:
    //
    //   • `value: String(summary.total)` — the SAME collection the tab strip
    //     directly above it badged through `formatCount`. At 1,200 entries the
    //     tab read "1.2k" and the tile read "1200": one collection, two numbers,
    //     which is the sentence R16 opens with.
    //   • `value: String(summary.people.length)` — and `people` is `LIMIT
    //     WORK_LOG_GROUP_CAP`, so a record worked on by more than fifty people
    //     read "People on it: 50" for ever with nothing saying it had stopped.
    //     A capped list's length wearing a total's clothes: R16's origin story.
    //
    // SCOPED TO THE FILES THAT RENDER A `<StatGrid`, deliberately. A `value:`
    // prop anywhere else is an overview FIELD — a phone number, a language, a
    // status word — and holding those to a count seam would be noise that
    // teaches people to widen the exemption list instead of fixing the number.
    // Inside a stat grid every `value:` IS a figure, by construction.
    const tileOffenders: string[] = []
    let tiles = 0
    for (const f of componentFiles()) {
      const src = stripComments(read(f))
      if (!src.includes("<StatGrid")) continue
      for (const m of src.matchAll(/value:\s*([^,\n]+)/g)) {
        const v = m[1].trim()
        tiles++
        // `.length` as the FIGURE. `xs.length - 1` is an index and `xs.length ?`
        // is a "is there anything" test — neither is a count being rendered, and
        // banning them would ban the pulse band's own last-week lookup.
        if (/\.length/.test(v) && !/\.length\s*[-+]/.test(v) && !/\.length\s*\?/.test(v))
          tileOffenders.push(`${f} → ${v}`)
        // …and a figure stringified straight past the seam. `formatCount` is
        // where the abbreviation ladder and the "+" at the counting ceiling live,
        // so `String(n)` beside a badge is two renderings of one number.
        if (/^String\(/.test(v)) tileOffenders.push(`${f} → ${v}`)
      }
    }
    expect(tiles, "the stat-tile scan found no tiles — it has gone blind").toBeGreaterThan(5)
    expect(
      tileOffenders,
      `a stat tile shows a figure exactly as a badge does (R16) — through formatCount (or hoursSpoken for hours), never String(n) and never a capped list's length: ${tileOffenders.join(", ")}`
    ).toEqual([])
    // …and the badge builders route through the seam. The deep-link switch's
    // badges are all on the COLLECTION half (a record detail badges its tabs
    // through withTabCounts instead), so that is the file named here — it used to
    // be module-content.tsx, before the switch became two files.
    expect(read(join(WEB, "components", "team-section-nav.tsx"))).toContain("formatCount")
    const collections = read(join(WEB, "components", "deep-link", "collection-content.tsx"))
    expect(collections).toContain("formatCount")

    // (ii) THE PLACE — every registry section with a count key whose placement
    // isn't "tab" renders a CollectionHeading (derived, never hand-listed).
    for (const s of TEAM_SECTIONS) {
      if (!s.countCacheKey || s.placement === "tab") continue
      const rendered = componentFiles().some((f) =>
        read(f).includes(`<CollectionHeading sectionKey="${s.key}"`)
      )
      expect(rendered, `sidebar collection "${s.key}" must render a CollectionHeading (R16 ii)`).toBe(true)
    }

    // (iii) THE ARBITRATION — the context exists; the heading consults it ABOVE
    // its early return and returns null when marked; the tab host marks badged
    // panels only; a file with both a counted tab and a heading imports the seam.
    const counted = read(join(WEB, "components", "counted-tabs.tsx"))
    expect(counted).toContain("createContext")
    expect(counted).toContain("CountedAbove")
    const heading = read(join(WEB, "components", "collection-heading.tsx"))
    const hookAt = heading.indexOf("useCountStandsDown()")
    const returnAt = heading.indexOf("return null")
    expect(hookAt, "the heading must consult the arbitration hook").toBeGreaterThan(-1)
    expect(returnAt, "the heading must stand down (return null) when marked").toBeGreaterThan(hookAt)
    const host = read(join(WEB, "components", "deep-link-screen.tsx"))
    expect(host, "the tab host marks badged panels via CountedTabs").toContain("<CountedTabs badged=")
    for (const f of componentFiles()) {
      const src = read(f)
      if (/badge: (formatCount|[a-z]+Badge)/.test(src) && /<CollectionHeading/.test(src))
        expect(
          /CountedAbove|CountedTabs/.test(src),
          `${f} shows a counted tab AND a heading — it must import the arbitration seam (R16 iii)`
        ).toBe(true)
    }
  })

  // R20 — INPUT IS VALIDATED AT THE BOUNDARY, and now it is SCANNED. This law
  // lived for months as a sentence in CLAUDE.md claiming to be "locked by
  // workers/content/test/validate.test.ts" — which locks the helpers' behaviour
  // and the QUERY-string half, and excludes workers/auth outright. Auth is
  // exactly where an unauthenticated 500 was found: POST /api/auth/email/start
  // with {"email": 123} crashed before the send throttle and wrote an error row
  // into the GLOBAL core database on every request. Every other law had a real
  // scanner; the one about never trusting a request body had prose.
  //
  // THE RULE IS POSITIONAL, and that is deliberate. An earlier auth-only version
  // matched the shape of the bug (`body.x ?? ""`), and a cast — `(body.email as
  // string) ?? ""` — walked straight past it. So a body field may appear ONLY
  // where something is CHECKING it: as the first argument of a validator from
  // shared/workers/validate.ts, as the operand of `typeof`, inside
  // Array.isArray()/Number(), in a strict comparison against a literal, or as
  // the needle of an allow-list `.includes()`. A cast occupies none of those
  // positions, so it cannot launder a field.
  //
  // Comments are stripped first (stripComments above): this repo comments
  // heavily and its comments discuss the very fields being scanned — a rule
  // satisfied by prose is not satisfied.
  it("validated-bodies: no request-body field reaches code unchecked", () => {
    const offenders: string[] = []
    let doors = 0
    for (const [path, raw] of workerSources()) {
      const src = stripComments(raw)
      const file = path.replace(/^\//, "")
      // A body may NOT be destructured at the read: `const { channel } = await
      // request.json()` scatters untrusted values into bare locals the scan (and
      // the reader) can no longer follow. Read it as one object, then validate.
      for (const m of src.matchAll(/const\s*\{[^}]*\}\s*=\s*\(?\s*await\s+request\.json\s*\(/g)) {
        void m
        offenders.push(`${file}:: destructures the request body at the read`)
      }
      // Where a body ENTERS: a direct read, or the shared gated openings that do
      // the read for the handler (shared/workers/route.ts).
      const binds: { name: string; at: number }[] = []
      for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\(?\s*await\s+request\.json\s*\(/g))
        binds.push({ name: m[1], at: m.index as number })
      for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+(?:gatedBody|openTeam)\s*[<(]/g))
        if (/\bbody\b/.test(m[1])) binds.push({ name: "body", at: m.index as number })
      if (!binds.length) continue
      binds.sort((a, b) => a.at - b.at)
      doors += binds.length
      // One region per binding — each handler rebinds, so a region IS a door, and
      // one handler's check can never license another handler's raw read.
      for (let i = 0; i < binds.length; i++) {
        const { name, at } = binds[i]
        const region = src.slice(at, binds[i + 1]?.at ?? src.length)
        const seen = new Map<string, boolean>() // field → checked anywhere in this door
        for (const u of region.matchAll(new RegExp(`(?<![\\w$.])${name}\\.(\\w+)`, "g"))) {
          const field = u[1]
          const at2 = u.index as number
          const before = region.slice(Math.max(0, at2 - 60), at2).trimEnd()
          const after = region.slice(at2 + u[0].length, at2 + u[0].length + 30)
          // The checkers. `requireMoment` / `optionalMoment` are the text seam's
          // TIME half and live in the same file (shared/workers/validate.ts):
          // requireText, then a parse, then a clean 400 — because Date.parse
          // returns NaN for a great deal of plausible nonsense and a NaN reaching
          // a duration is an hour that never happened, sitting in a total nobody
          // can explain. Locked with the rest of the seam by
          // workers/content/test/validate.test.ts. `parseUploadDataUrl` earns its
          // place beside them because it IS the seam's binary half: it takes `unknown`,
          // type-checks, and caps BYTES before decoding (a data URL is megabytes,
          // so a character cap would be the wrong refusal) — locked by
          // workers/content/test/upload-parse.test.ts. `parseDataUrl` beside it
          // does NOT qualify: it declares `dataUrl: string`, which is a claim.
          // `optionalDocument` is the seam's WHOLE-DOCUMENT half and lives in the
          // same file: same type-check and NUL-strip, capped in bytes because the
          // thing it guards is a database row's byte ceiling, not a paragraph —
          // locked by workers/content/test/validate.test.ts with the rest.
          const checked =
            /(?<![\w$.])(?:requireText|optionalText|optionalDocument|queryText|requireIdList|requireMoment|optionalMoment|parseUploadDataUrl|Array\.isArray|Number|includes)\($/.test(
              before
            ) ||
            /(?<![\w$.])typeof\s*$/.test(before) ||
            /^\s*(?:===|!==)\s*(?:"[^"]*"|'[^']*'|true|false|null|undefined|-?\d+)/.test(after)
          seen.set(field, (seen.get(field) ?? false) || checked)
        }
        for (const [field, checked] of seen)
          if (!checked) offenders.push(`${file}::${name}.${field}`)
      }
    }
    // Tripwire: a scan that finds no doors reports "all clear" exactly like a
    // passing one. This is the failure mode the retired R15 clause died of.
    expect(doors, "the body-boundary scan found no request bodies — it has gone blind").toBeGreaterThan(30)

    const exempt = new Set(Object.keys(RAW_BODY_EXEMPT))
    const unlisted = offenders.filter((o) => !exempt.has(o))
    expect(
      unlisted,
      `a request-body field is trusted without a runtime check (R20) — put it through requireText/optionalText from shared/workers/validate.ts (or typeof / Array.isArray / a literal comparison), or add a reasoned RAW_BODY_EXEMPT line: ${unlisted.join(", ")}`
    ).toEqual([])

    // THE RATCHET, and the reason an exemption here cannot rot: every listed line
    // must still BE an offender. Validate a listed field and its line must go —
    // so the list can only ever shrink, and it can never quietly describe code
    // that no longer exists.
    const stale = [...exempt].filter((k) => !offenders.includes(k))
    expect(
      stale,
      `RAW_BODY_EXEMPT names a door that no longer reads that field raw — delete the line (R20's exemptions may only shrink): ${stale.join(", ")}`
    ).toEqual([])
    for (const [k, why] of Object.entries(RAW_BODY_EXEMPT))
      expect(why.length, `${k} is an exception to R20 — that needs a real reason`).toBeGreaterThan(20)
  })

  // R20, THE OTHER HALF OF THE REQUEST. CLAUDE.md has always said the query half
  // is "locked separately by workers/content/test/validate.test.ts" — and that
  // file locks what `queryText` DOES, which is a different sentence from "every
  // door uses it". The body half got a call-site census the day its prose was
  // found to be prose; the query half kept the prose. This is its census, and it
  // is the same rule read positionally: a query parameter may reach code only
  // from INSIDE something that is checking it.
  //
  // It found the two that were left: workers/realtime's `?user=` and `?team=`,
  // the only raw request inputs in the fleet — each of which NAMES a Durable
  // Object, sixty lines below a `/publish` door that caps its channel name for
  // exactly that reason. Neither was exploitable as written; both were one edit
  // away from being a fact about today's code instead of a property of the door.
  it("validated-bodies: no query parameter reaches code unchecked either", () => {
    /** The identifier opening the innermost call that encloses `i` — so a
     * parameter is judged by where it SITS, exactly as a body field is. Stops at
     * a statement boundary: a validator three statements back is not this one. */
    const enclosingCall = (src: string, i: number): string => {
      let depth = 0
      for (let j = i - 1; j >= 0; j--) {
        const ch = src[j]
        if (ch === ")") depth++
        else if (ch === "(") {
          if (depth === 0) return /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, j - 40), j))?.[1] ?? ""
          depth--
        } else if (ch === ";" || ch === "{" || ch === "}") return ""
      }
      return ""
    }
    // The seam, plus the two runtime coercions the body half already accepts in
    // the same position (`Number(` / `parseInt(`), plus this repo's own named
    // parsers that take the raw value and refuse it (requireWeek).
    const CHECKERS = new Set([
      "queryText", "requireText", "optionalText", "requireIdList", "requireMoment",
      "optionalMoment", "Number", "parseInt", "requireWeek",
    ])
    const offenders: string[] = []
    let params = 0
    for (const [path, raw] of workerSources()) {
      const src = stripComments(raw)
      for (const m of src.matchAll(/\.searchParams\.get\s*\(\s*"([^"]*)"/g)) {
        params++
        if (!CHECKERS.has(enclosingCall(src, m.index as number)))
          offenders.push(`${path.replace(/^\//, "")}::?${m[1]}`)
      }
    }
    // Tripwire: a census that finds no parameters reports "all clear" exactly
    // like a passing one — the failure mode the retired R15 clause died of.
    expect(params, "the query-boundary scan found no parameters — it has gone blind").toBeGreaterThan(60)
    expect(
      offenders,
      `a query parameter is trusted without a runtime check (R20) — put it through queryText from shared/workers/validate.ts: ${offenders.join(", ")}`
    ).toEqual([])
  })

  // Every enforced law in the registry maps to one of the checks above (or a
  // R21 — A DOOR ON THE AGENCY'S OWN MATERIAL REFUSES A CLIENT LOGIN.
  //
  // Earned twice, the same way both times. The client portal's gateway forwards
  // a NAMED allow-list and leaves the agency's own doors out, with a comment
  // saying why. The AGENCY gateway forwards by PREFIX, and a client login is an
  // ordinary team member holding an ordinary role — so every door the portal
  // deliberately withheld was served to the same person at the other hostname.
  // First the (since-purged) learning library and the dropdown vocabulary; then, because the
  // enumeration that followed listed "what the accounts module owns" instead of
  // "what a client can reach", the help STAKEHOLDER list — a door that names the
  // agency's staff admins, with their email addresses, and answers on a POST as
  // well as a GET.
  //
  // So this check enumerates the only way that cannot go stale: DERIVED, from
  // four sources that are each already the truth about themselves —
  //   • every right the permission matrix can GRANT, read out of the module
  //     catalog + MODULE_OFFERED_RIGHTS (R36's own data);
  //   • every route, read out of each worker's own ROUTES table;
  //   • the gate each one opens with, read out of the handler (and the
  //     route-local helpers it calls — a refusal one frame down still counts);
  //   • the portal's own surface, read out of PORTAL_DOORS.
  // A door a client login COULD pass, that the portal does not open, must
  // refuse them or fence them. Add a door tomorrow and it is judged today.
  //
  // GRANTABLE, not granted — the third recurrence taught that. This walk used
  // to read the CLIENT ROLE's rights out of the seed, so a door gated on a
  // right the seed happened not to hold was a door the law never walked. The
  // members, roles and invites doors sat exactly there: one owner tick of
  // `team_members:read` on a cloned Viewer role and a client login was reading
  // the staff directory, with email addresses, at the agency origin. A client
  // login is an ordinary member holding an ordinary role, and an owner can
  // build any role the matrix offers — so the reachable set is what the matrix
  // OFFERS, and the seed is kept below only as a subset guard on this
  // derivation, never as the walk itself.
  it("client-reachable-doors: every agency door a client login can pass refuses or fences them", () => {
    // ── 1. every right an owner could put on a client's role (R36's data) ─────
    const grantable = new Set<string>()
    for (const { key } of TEAM_MODULE_CATALOG)
      for (const right of offeredRights(key)) grantable.add(`${key}:${right}`)
    expect(grantable.size, "the offered-rights derivation went blind").toBeGreaterThan(20)

    // ── 1b. the seed's Client role must be a SUBSET of grantable (guard) ──────
    const seed = read(join(ROOT, "scripts", "seed-staging.mjs"))
    const rightsAt = seed.indexOf("rights: {", seed.indexOf("const CLIENT_ROLE"))
    expect(rightsAt, "the seed no longer declares CLIENT_ROLE.rights — re-read this check").toBeGreaterThan(-1)
    // INSIDE the brace, not from the `rights:` key itself. Scanning from the key
    // made the container look like the FIRST module: `[^}]*` ran from `rights: {`
    // to the closing brace of `teams: { read: true }`, so the first module in the
    // block was recorded as a phantom `rights:read` and its real right was lost.
    // It cost nothing only because no door happens to gate on `teams:read` — the
    // check silently declared the Client role unable to reach a right it holds,
    // which is the one direction this derivation must never fail in.
    const block = seed.slice(seed.indexOf("{", rightsAt) + 1, seed.indexOf("\n  },", rightsAt))
    const clientRights = new Set<string>()
    for (const m of block.matchAll(/(\w+):\s*\{([^}]*)\}/g))
      for (const r of m[2].matchAll(/(\w+):\s*true/g)) clientRights.add(`${m[1]}:${r[1]}`)
    // Guard the derivation: an empty right set would make every door "unreachable"
    // and pass this whole law without reading a line of worker source.
    expect(clientRights.has("help:read"), "the Client role must still hold help:read").toBe(true)
    // And guard it against the mis-parse above, which an empty-set check cannot
    // see: the FIRST module in the block has to survive, and the container must
    // never appear as one.
    expect(clientRights.has("teams:read"), "the first module in the block was dropped").toBe(true)
    expect(
      [...clientRights].filter((r) => r.startsWith("rights:")),
      "`rights` is the container, not a module — the scan started outside the brace"
    ).toEqual([])
    expect(clientRights.size, "the Client role's rights did not parse").toBeGreaterThan(4)
    // Every right the seed grants must be one the matrix can grant — the two
    // derivations cross-check each other, so neither can go quietly blind. One
    // storage rule rides along: any write on a module auto-flips `read` on
    // (normalizeRights in lib/roles.ts), so a stored `read` is legitimate
    // wherever some write on that module is offered, even when the matrix
    // draws no read box (`teams` is exactly that).
    const storable = (r: string) => {
      if (grantable.has(r)) return true
      const [mod, right] = r.split(":")
      return right === "read" && ["create", "edit", "delete"].some((w) => grantable.has(`${mod}:${w}`))
    }
    expect(
      [...clientRights].filter((r) => !storable(r)),
      "the seed grants a right the matrix cannot — one of the two derivations is wrong"
    ).toEqual([])

    // ── 2. the portal's own surface ──────────────────────────────────────────
    const portalSrc = read(join(ROOT, "workers", "portal-gateway", "src", "index.ts"))
    const portalDoors = new Set([...portalSrc.matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1]))
    expect(portalDoors.size, "PORTAL_DOORS did not parse").toBeGreaterThan(5)

    // ── 3. every route, and the source its handler actually runs ─────────────
    // auth and realtime answer from a switch rather than a ROUTES table, and
    // neither has a door onto the agency's material: auth answers only about the
    // caller's own identity, and the realtime handshake carries the account
    // stamp itself (workers/realtime/test/realtime.test.ts owns that one). mcp's
    // equivalent refusal is requireStaff, proven by its own identity-gate suite.
    const offenders: string[] = []
    const stale = new Set(Object.keys(CLIENT_REACHABLE_EXEMPT))
    for (const worker of ["tenancy", "content", "data-ops"]) {
      const dir = join(ROOT, "workers", worker, "src", "routes")
      // Every function in the worker's routes/, exported or not — a gate or a
      // refusal is routinely one route-local helper down (agencyContext,
      // requireAnyImportRight), and a walk that stopped at exported names would
      // read those doors as ungated and unrefused.
      const fns = new Map<string, string>()
      for (const { source: code } of sourceFiles(dir, { extensions: [".ts"] })) {
        const starts = [...code.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
        starts.forEach((m, i) => fns.set(m[1], code.slice(m.index, starts[i + 1]?.index ?? code.length)))
      }
      const reach = (name: string, seen = new Set<string>()): string => {
        if (seen.has(name) || seen.size > 6) return ""
        seen.add(name)
        const body = fns.get(name)
        if (!body) return ""
        let out = body
        for (const other of fns.keys())
          if (other !== name && new RegExp(`(?<![\\w.])${other}\\s*\\(`).test(body)) out += reach(other, seen)
        return out
      }

      const index = read(join(ROOT, "workers", worker, "src", "index.ts"))
      const table = /export const ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(index)
      expect(table, `workers/${worker} has no ROUTES table — did it move?`).toBeTruthy()
      const routes = [...(table as RegExpExecArray)[1].matchAll(/"([A-Z]+ \/[^"]+)":\s*\{\s*handler:\s*(\w+)/g)]
      expect(routes.length, `workers/${worker}'s ROUTES did not parse`).toBeGreaterThan(3)

      for (const [, door, handler] of routes) {
        if (door.endsWith("/health")) continue
        if (portalDoors.has(door)) continue // the portal opens it ON PURPOSE
        const body = stripComments(reach(handler))
        expect(body.length, `handler ${handler} for ${door} not found in workers/${worker}/src/routes`).toBeGreaterThan(0)
        if (/adminGuard\s*\(/.test(body)) continue // key-gated: no session reaches it

        // Which module rights does this door demand? A door that demands none is
        // open to ANY member — which includes a client login, and is exactly how
        // the screen recipes and the import history were reachable.
        const gates = [
          ...body.matchAll(/\bgated(?:Body)?(?:<[^>]*>)?\s*\(\s*request,\s*env,\s*"(\w+)",\s*"(\w+)"/g),
          ...body.matchAll(/\brequireRight\s*\(\s*\w+,\s*\w+,\s*"(\w+)",\s*"(\w+)"/g),
        ].map((m) => `${m[1]}:${m[2]}`)
        const passable = gates.length === 0 || gates.some((g) => grantable.has(g))
        if (!passable) continue // no role the matrix can build ever passes this door

        // Reachable. So the door must have made a decision about client logins,
        // and there are only two that count.
        //
        // FIRST: it refuses them. That is the answer for anything of the
        // agency's, whatever it is gated on.
        //
        // SECOND — and ONLY second: every right it demands is on a module whose
        // rows belong to a CUSTOMER (ACCOUNT_SCOPED_MODULES), and it resolves
        // the fence. Then "a client can reach it" is the point: they are reading
        // their own company, through the clause that decides which rows those
        // are.
        //
        // "It resolves accountScope" ALONE is not enough, and that loophole is
        // the whole reason this check exists. The stakeholder door resolved the
        // caller's scope and fenced the TICKET with it — and still answered with
        // the agency's staff admins, by name and email address. A fence over
        // somebody's rows says nothing about an answer made of somebody else's.
        if (/refusePortalCaller\s*\(/.test(body)) continue
        const customerRows =
          gates.length > 0 &&
          gates.every((g) => (ACCOUNT_SCOPED_MODULES as readonly string[]).includes(g.split(":")[0]))
        if (customerRows && /accountScope(Clause)?\s*\(/.test(body)) continue
        stale.delete(door)
        if (!(door in CLIENT_REACHABLE_EXEMPT)) offenders.push(`${door} (${worker}/${handler})`)
      }
    }
    expect(
      offenders,
      `these doors serve the AGENCY's own material to a client login — refuse them (refusePortalCaller), fence them (accountScope), or write down in CLIENT_REACHABLE_EXEMPT why the door answers only about the caller themselves: ${offenders.join(", ")}`
    ).toEqual([])
    // An exemption that is no longer an offender reads as a decision somebody
    // made on purpose. It isn't; it's a line nobody reread.
    expect(
      [...stale],
      `CLIENT_REACHABLE_EXEMPT names doors that are no longer reachable-and-unguarded — delete these lines: ${[...stale].join(", ")}`
    ).toEqual([])
  })

  // R24 — AN INTERNAL NUMBER CANNOT REACH THE CLIENT'S SIDE.
  //
  // SCOPE's ruling is one of the few in this codebase with no exceptions clause
  // at all: internal rates and margin never render in the portal under any flag,
  // ever — "not behind a permission, not behind a feature toggle, not for an
  // admin viewing the portal". The instruction that came with it was to make
  // that STRUCTURALLY true rather than a condition someone can invert later, and
  // this is what "structurally" means in a codebase: the figures live in ONE
  // file, and nothing a client login can reach imports it.
  //
  // A condition can be inverted. A permission can be granted. A flag can be
  // flipped by whoever writes next year's screen. An import cannot be forgotten,
  // because it is not a decision anybody re-makes — it is either in the graph or
  // it is not, and this reads the graph.
  //
  // Nothing here is hand-listed. The INTERNAL SURFACE is the exported names of
  // internal-money.ts, read off that file. The INTERNAL DOORS are the tenancy
  // routes whose handlers call one of them, read off the handler source. Add a
  // door tomorrow that reads a margin and it is judged today.
  it("internal-money-never-in-portal: no client-reachable path reaches the agency's own cost", () => {
    const INTERNAL = join(ROOT, "workers", "tenancy", "src", "lib", "internal-money.ts")
    const internalSrc = stripComments(read(INTERNAL))

    // ── the internal surface, derived from the file itself ────────────────────
    const exported = [...internalSrc.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])
    const tables = [...new Set([...internalSrc.matchAll(/(?:FROM|INTO|UPDATE)\s+([a-z_]+)/g)].map((m) => m[1]))]
    expect(exported.length, "the internal-money scan found no exports — it has gone blind").toBeGreaterThan(3)
    expect(tables, "internal_rates is the table this law is about — did it move?").toContain("internal_rates")

    // ── the internal doors, derived from the handlers that call into it ───────
    const tenancyIndex = read(join(ROOT, "workers", "tenancy", "src", "index.ts"))
    const routeFns = new Map<string, string>()
    for (const { source } of sourceFiles(join(ROOT, "workers", "tenancy", "src", "routes"), { extensions: [".ts"] })) {
      const starts = [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)]
      starts.forEach((m, i) => routeFns.set(m[1], source.slice(m.index, starts[i + 1]?.index ?? source.length)))
    }
    const routes = [...tenancyIndex.matchAll(/"([A-Z]+ \/[^"]+)":\s*\{\s*handler:\s*(\w+)/g)]
    expect(routes.length, "tenancy's ROUTES did not parse").toBeGreaterThan(10)

    const internalDoors = routes
      .filter(([, , handler]) => {
        const body = stripComments(routeFns.get(handler) ?? "")
        return exported.some((fn) => new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(body))
      })
      .map(([, door, handler]) => ({ door, handler }))
    expect(
      internalDoors.length,
      "no door was derived as internal — the walk has gone blind, and a blind check reports 'all clear' exactly like a passing one"
    ).toBeGreaterThan(3)

    // ── 1. none of them is on the portal's surface ────────────────────────────
    const portalSrc = read(join(ROOT, "workers", "portal-gateway", "src", "index.ts"))
    const portalDoors = new Set([...portalSrc.matchAll(/"([A-Z]+ \/[^"]+)":\s*"\w+"/g)].map((m) => m[1]))
    expect(portalDoors.size, "PORTAL_DOORS did not parse").toBeGreaterThan(5)
    const published = internalDoors.filter((d) => portalDoors.has(d.door))
    expect(
      published.map((d) => d.door),
      "the portal gateway opens a door that reads the agency's own cost — SCOPE says a client never sees this, under any flag (R24)"
    ).toEqual([])

    // ── 2. every one of them refuses a client login at the door ───────────────
    // Belt and braces on purpose: the gateway's allow-list is the first answer
    // and the door's own refusal is the one that survives somebody adding a line
    // to the allow-list. That mistake has been made twice in this codebase.
    const unrefused = internalDoors.filter(
      (d) => !/refusePortalCaller\s*\(/.test(stripComments(routeFns.get(d.handler) ?? ""))
    )
    expect(
      unrefused.map((d) => `${d.door} (${d.handler})`),
      "a door that reads the agency's own cost must refuse a portal caller AT THE DOOR (R24 · R21)"
    ).toEqual([])

    // ── 3. the client's own front end names none of it ────────────────────────
    //
    // WHICH TABLES ARE "INTERNAL" IS ITSELF DERIVED, and it has to be: the margin
    // reads `apps` for what a system costs us to run, and `apps` is not an
    // internal table — a client's own value screen names their apps by design. So
    // the forbidden set is the tables the internal file reads MINUS every table a
    // file that ANSWERS A CLIENT reads (PORTAL_VISIBLE_READS, whose completeness
    // is the portal-fence suite's job). What survives that subtraction is exactly
    // "a table only the agency's own side ever touches", which is the thing this
    // law is about. Hand-listing it would have been the fourth version of the
    // mistake this codebase keeps making.
    const clientReadable = new Set<string>()
    for (const file of Object.keys(PORTAL_VISIBLE_READS))
      for (const m of stripComments(read(join(ROOT, file))).matchAll(/(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/g))
        clientReadable.add(m[1])
    const internalTables = tables.filter((t) => !clientReadable.has(t))
    expect(
      internalTables,
      "the internal-table derivation subtracted everything — internal_rates must survive it"
    ).toContain("internal_rates")

    // The paths and the table are unambiguous strings; `marginCents` is the field
    // a screen would have to read to render one. Comments are stripped first — a
    // note explaining why the portal does NOT show a margin must not read as one.
    const forbidden = [...internalTables, ...internalDoors.map((d) => d.door.split(" ")[1]), "marginCents"]
    const portalFiles = sourceFiles(
      ["lib", "components", "app"].map((d) => join(ROOT, "web-portal", d)),
      { extensions: [".ts", ".tsx"], relativeTo: join(ROOT, "web-portal") }
    )
    expect(portalFiles.length, "the portal source walk found nothing").toBeGreaterThan(10)
    const leaks: string[] = []
    for (const f of portalFiles) {
      const src = stripComments(f.source)
      for (const needle of forbidden) if (src.includes(needle)) leaks.push(`${f.rel} names ${needle}`)
    }
    expect(
      leaks,
      `the client portal names the agency's own cost figures (R24): ${leaks.join(", ")}`
    ).toEqual([])

    // ── 4. …AND OUR OWN TWO RATE CARDS STAY TWO SCREENS ───────────────────────
    //
    // The three clauses above all watch the CLIENT's app. This one watches ours,
    // and it closes the way this law would most plausibly be undone next: not by
    // a leak, but by somebody noticing that "what an account is charged" and
    // "what our own hour costs" are the same list with different numbers, and
    // merging the two screens into one component with an `internal` flag on it.
    //
    // That is precisely the shape the law exists to forbid. lib/rates.ts says it
    // about the worker in its own header — "keeping them in one file behind a
    // flag would put the figure SCOPE says a client must NEVER see one forgotten
    // predicate away from the one they may" — and the split held on the server
    // for as long as neither half had a screen. Both have one now, so the same
    // sentence has to hold on this side of the wire.
    //
    // BOTH DOOR SETS ARE DERIVED, symmetrically: the internal ones from the
    // handlers that call into internal-money.ts (above), the account ones from
    // the handlers that call into lib/rates.ts beside it. Then the api layer's
    // own method bodies say which method posts to which, and the components say
    // which methods they call. Nothing here is a list somebody maintains.
    const ratesSrc = stripComments(read(join(ROOT, "workers", "tenancy", "src", "lib", "rates.ts")))
    const accountExports = [...ratesSrc.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])
    expect(accountExports.length, "the account-rates scan found no exports — it has gone blind").toBeGreaterThan(2)
    const accountDoors = routes
      .filter(([, , handler]) => {
        const body = stripComments(routeFns.get(handler) ?? "")
        return accountExports.some((fn) => new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(body))
      })
      .map(([, door]) => door.split(" ")[1])
    expect(accountDoors.length, "no account-rate door was derived — the walk has gone blind").toBeGreaterThan(2)

    // Which api method posts to which side. Same two-hop read the doors-have-
    // controls check makes, for the same reason: a screen calls a METHOD, and
    // the path only exists in that method's body.
    const apiSrc = read(join(WEB, "lib", "api", "tenancy.ts"))
    const apiMethods = [...apiSrc.matchAll(/^ {2}(\w+):\s*[(<]/gm)]
    expect(apiMethods.length, "the tenancy api-method scan found almost nothing").toBeGreaterThan(20)
    const sideOf = (paths: string[]) =>
      apiMethods
        .filter((m, i) => {
          const body = apiSrc.slice(m.index as number, (apiMethods[i + 1]?.index as number) ?? apiSrc.length)
          return paths.some((p) => body.includes(`"${p}"`) || body.includes(`\`${p}`))
        })
        .map((m) => m[1])
    const internalMethods = sideOf(internalDoors.map((d) => d.door.split(" ")[1]))
    const accountMethods = sideOf(accountDoors)
    expect(internalMethods.length, "no api method reaches the internal doors — the map has gone blind").toBeGreaterThan(2)
    expect(accountMethods.length, "no api method reaches the account doors — the map has gone blind").toBeGreaterThan(2)

    const bothSides = componentFiles().filter((f) => {
      const src = stripComments(read(f))
      const calls = (names: string[]) => names.some((n) => new RegExp(`\\.${n}\\s*\\(`).test(src))
      return calls(internalMethods) && calls(accountMethods)
    })
    expect(
      bothSides,
      `one screen reads BOTH rate cards (R24). What we charge a client and what our own hour costs are two audiences: keep them in two components, so the separation is an import somebody cannot forget rather than a condition somebody can invert — ${bothSides.join(", ")}`
    ).toEqual([])
  })

  // R25 — A SAVINGS FIGURE NEVER RENDERS WITHOUT SAYING WHAT IT IS MADE OF.
  //
  // "The numbers stop being believable" is one of the three things the owner
  // named as what would make him abandon this and go back to a spreadsheet. A
  // savings figure a client cannot account for is worse than no figure at all:
  // the first time they question it and nobody can answer, every other number in
  // the app loses its credit too.
  //
  // So the caption ships WITH the number, on both front doors, in one sentence
  // that is honest about both halves — the inputs are estimates we agreed, the
  // subtraction is arithmetic. The screens are DERIVED from the payload they
  // read, so a new one is held to this the day it is written rather than the day
  // somebody remembers to add it to a list.
  it("savings-caption: every screen showing a saving renders the caption it came with", () => {
    const savings = read(join(ROOT, "shared", "workers", "savings.ts"))
    expect(savings, "SAVINGS_CAPTION is the one sentence — did it move?").toContain("export const SAVINGS_CAPTION")

    const screens = sourceFiles(
      [join(WEB, "components"), join(ROOT, "web-portal", "components")],
      { extensions: [".tsx"], relativeTo: ROOT }
    )
    // The payload's own field names: a screen that shows a saving has to read one.
    const showsSaving = screens.filter((f) => /savedSecondsPerMonth|savedHours\s*\(/.test(stripComments(f.source)))
    expect(
      showsSaving.length,
      "no screen reads a savings figure — the derivation has gone blind (a blind check reports 'all clear' exactly like a passing one)"
    ).toBeGreaterThan(1)

    const silent = showsSaving.filter((f) => !f.source.includes("SAVINGS_CAPTION"))
    expect(
      silent.map((f) => f.rel),
      `these screens show a saving without the sentence that makes it honest — render SAVINGS_CAPTION beside it (R25): ${silent.map((f) => f.rel).join(", ")}`
    ).toEqual([])
  })

  // per-worker seam test) — a law can't exist without a check.
  // R29 — the page has ONE width per front door, and no screen sets its own.
  //
  // A page container is identified POSITIONALLY, the same way R20 identifies a
  // checked field: one LINE carrying `mx-auto`, `w-full` and a `max-w-*`
  // together. That triple is the signature of a centred content column and of
  // nothing else — a dialog, a sheet, a door card, a chat bubble and a capped
  // line of prose are none of them centred-and-full-width, so none is caught and
  // none has to be excused. It is read per line rather than per className because
  // `deep-link-screen.tsx`'s own container is a template literal that runs past
  // the end of the line, and a scan that needed the closing quote would have
  // missed the one file the law is built around.
  //
  // Both directions are checked, so the exemption list is a RATCHET: a file that
  // sets a width and is not the owner must be pinned, and a pin whose file no
  // longer sets a width must be deleted.
  it("one-page-width: exactly one page container per front door, and every pin is live", () => {
    const roots = [
      join(WEB, "components"),
      join(WEB, "app"),
      join(ROOT, "web-portal", "components"),
      join(ROOT, "web-portal", "app"),
      join(ROOT, "shared", "web"),
    ].filter((d) => existsSync(d))

    /** Every page-container line in the app, as `file → the widths it sets`. */
    const found = new Map<string, string[]>()
    for (const f of sourceFiles(roots, { extensions: [".tsx"], relativeTo: ROOT, skipTests: true })) {
      for (const line of stripComments(f.source).split("\n")) {
        if (!/\bmx-auto\b/.test(line) || !/\bw-full\b/.test(line)) continue
        const cap = /\bmax-w-(?:\[[^\]]*\]|[\w.]+)/.exec(line)
        if (!cap) continue
        const list = found.get(f.rel) ?? []
        list.push(cap[0])
        found.set(f.rel, list)
      }
    }

    // i · every owner is present and sets ONLY the width it declares.
    for (const [file, width] of Object.entries(PAGE_WIDTH_OWNER)) {
      const widths = found.get(file)
      expect(widths, `${file} owns its front door's page width and must set one`).toBeDefined()
      expect([...new Set(widths)], `${file} may set only ${width}`).toEqual([width])
    }

    // ii · nothing else sets a page width unless it is pinned, with its reason.
    const offenders = [...found.keys()].filter(
      (f) => !(f in PAGE_WIDTH_OWNER) && !(f in SCREEN_WIDTH_EXEMPT)
    )
    expect(
      offenders,
      `these set their own page width (R29). Delete the cap, or pin it in SCREEN_WIDTH_EXEMPT with a reason:\n  ${offenders.join("\n  ")}`
    ).toEqual([])

    // iii · the ratchet. A pin that no longer describes anything is a record of
    // what the app used to do, and it goes red so the fix takes its pin with it.
    const stale = Object.keys(SCREEN_WIDTH_EXEMPT).filter((f) => !found.has(f))
    expect(
      stale,
      `these SCREEN_WIDTH_EXEMPT entries match nothing — the file no longer sets a page width, so delete the entry:\n  ${stale.join("\n  ")}`
    ).toEqual([])
  })

  // R31 — TWO RADII AND NO THIRD.
  //
  // The cheapest rule in the book to check and the one that was most broken:
  // every Tailwind radius step from `sm` to `3xl` resolves to the same
  // `var(--radius)` (24px) in this theme, so `rounded-lg` and `rounded-xl` were
  // two spellings of one pixel value and the app used five of them. That is five
  // decisions where there is one, and the day the theme gives those steps
  // different numbers the app acquires radii nobody chose.
  //
  // BARE `rounded` IS NOT CAUGHT, deliberately, and it is the interesting case.
  // It resolves to 4px here, NOT 24 — measured in a browser against the running
  // theme rather than read off a file — so on an inline `<mark>` and on a 32px
  // thumbnail it is a genuinely different value doing a genuinely different job.
  // Folding it into the vocabulary would put a lozenge round every highlighted
  // word, which is a redesign wearing a sweep's clothes.
  it("two-radii: only rounded-xl, rounded-t-xl and rounded-full ship (R31)", () => {
    // `shared/rules/` is the LAW BOOK — prose ABOUT the code, not code that
    // renders. R31's own sentence names the steps it forbids, so a scan that
    // read it would go red on the rule's own text.
    const roots = [WEB, join(ROOT, "web-portal"), join(ROOT, "shared")]
    const lawBook = join(ROOT, "shared", "rules")
    // shared/ui/ IS IN SCOPE. It was excused for one day while the reskin's shape
    // stage was pending; that stage collapsed 45 off-vocabulary radii in there
    // into rounded-xl, the exemption's own rot check went red, and the exemption
    // was deleted. The library is held to the same vocabulary as the app.
    const offenders: string[] = []
    // An admitted exception has to be USED, or it is vocabulary nobody asked
    // for. Counted across the whole scan, vendored directory included, because
    // the selection controls the 6px exists for live in there.
    const exceptionUsed = new Map(Object.keys(RADIUS_EXCEPTION).map((k) => [k, 0]))
    for (const f of sourceFiles(roots, { extensions: [".tsx", ".ts"], relativeTo: ROOT, skipTests: true })) {
      if (f.path.startsWith(lawBook)) continue
      for (const hit of stripComments(f.source).match(/\brounded-(?:[a-z]+-)*(?:\[[^\]]+\]|[a-z0-9]+)/g) ?? []) {
        if (/^rounded-(?:t-)?xl$/.test(hit) || hit === "rounded-full" || hit === "rounded-none") continue
        // The kit's one-edge spellings of the SAME two radii, through its
        // tokens: the `rounded-t-xl` move in token clothing (R31's law text).
        // …and any bracket spelling that RESOLVES THROUGH A RADIUS TOKEN
        // (plain, one edge, inherited, or a calc over the token for a
        // concentric inner corner). A NAMED third step stays forbidden.
        if (/^rounded-(?:[tbse]-)?\[(?:inherit|var\(--radius[a-z-]*\)|calc\([^\]]*--radius[^\]]*\))\]$/.test(hit)) continue
        if (exceptionUsed.has(hit)) {
          exceptionUsed.set(hit, exceptionUsed.get(hit)! + 1)
          continue
        }
        offenders.push(`${f.rel}: ${hit}`)
      }
    }

    // The exceptions carry their reasons, and the reasons have to be there.
    for (const [cls, why] of Object.entries(RADIUS_EXCEPTION)) {
      expect(why.trim(), `RADIUS_EXCEPTION["${cls}"] must say WHY it earns a third radius`).not.toBe("")
    }
    // …and the ratchet, the same one R29 and R32 run: an exception nothing uses
    // is a radius somebody added and nobody spends, and it widens the vocabulary
    // for free. The list can only shrink.
    const unusedExceptions = [...exceptionUsed].filter(([, n]) => n === 0).map(([cls]) => cls)
    expect(
      unusedExceptions,
      `these RADIUS_EXCEPTION entries are not used anywhere — delete them, or use them where their reason says they belong:\n  ${unusedExceptions.join("\n  ")}`
    ).toEqual([])
    expect(
      offenders,
      `R31 — a surface is rounded-xl and a pill is rounded-full, nothing else:\n  ${offenders.join("\n  ")}`
    ).toEqual([])

  })

  // R32 — EVERY COLOUR RESOLVES THROUGH A TOKEN.
  //
  // A hard-coded colour is invisible to a theme, and colour drift is only ever
  // visible in aggregate — which is exactly why it needs a check rather than a
  // reviewer. Two live breaches earned this: `import-screen.tsx` said `amber-600`
  // and `emerald-500` where it meant warning and success, so the one screen that
  // reports a RESULT was the one screen a rebrand could not reach; and
  // `shared/departments.ts` held five hexes the legacy app chose, none of them
  // one of kwapso's own seven, so a department dot was the single mark on screen
  // that did not belong to this product's palette.
  //
  // The exemptions are DATA, with reasons, rot-checked in both directions — the
  // same shape as R29's width pins, so a file that stops holding a literal must
  // lose its entry and the list can only shrink.
  it("closed-palette: no Tailwind ramp and no hex outside PALETTE_LITERAL_OK (R32)", () => {
    const roots = [WEB, join(ROOT, "web-portal"), join(ROOT, "shared")]
    const RAMP =
      /\b(?:text|bg|border|fill|stroke|ring|from|via|to|decoration|divide|outline|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
    const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g
    const lawBook = join(ROOT, "shared", "rules") // it quotes what it forbids
    const ramps: string[] = []
    const hexed = new Set<string>()
    for (const f of sourceFiles(roots, { extensions: [".tsx", ".ts"], relativeTo: ROOT, skipTests: true })) {
      if (f.path.startsWith(lawBook)) continue
      const src = stripComments(f.source)
      for (const hit of src.match(RAMP) ?? []) ramps.push(`${f.rel}: ${hit}`)
      if ((src.match(HEX) ?? []).length > 0) hexed.add(f.rel)
    }
    expect(
      ramps,
      `R32 — a Tailwind ramp names a colour, not a meaning. Use the token (warning / success / destructive / chart-N):\n  ${ramps.join("\n  ")}`
    ).toEqual([])

    const unexcused = [...hexed].filter((f) => !(f in PALETTE_LITERAL_OK))
    expect(
      unexcused,
      `R32 — these hold a colour literal. Resolve it through a token, or pin the file in PALETTE_LITERAL_OK with a reason:\n  ${unexcused.join("\n  ")}`
    ).toEqual([])

    const stale = Object.keys(PALETTE_LITERAL_OK).filter((f) => !hexed.has(f))
    expect(
      stale,
      `these PALETTE_LITERAL_OK entries match nothing — the file no longer holds a colour literal, so delete the entry:\n  ${stale.join("\n  ")}`
    ).toEqual([])
  })

  it("every enforced law has a known check", () => {
    const known = new Set([
      "publish-seam", // the 3 per-worker publish-seam.test.ts suites
      "gating-seam", // R10: the 3 per-worker gating-seam suites + the mcp identity-gate suite
      "fetch-timeout", // R11: the source-scan below
      "cron-records", // R12: the scheduled-handler scan below
      "record-detail-tabs",
      "no-handrolled-toggles",
      "forms-use-formshell",
      "generic-activity-path",
      "glossary-wellformed",
      "forms-persist-drafts",
      "tab-counts-derived",
      "agent-app-parity", // workers/data-ops/test/agent-parity.test.ts
      "bounded-lists", // R14: the source-scan above
      "idempotent-transitions", // R17: the source-scan above
      "activity-gate-coverage", // R18: the source-scan above
      "live-collections", // R15: the deaf-publisher scan above
      "validated-bodies", // R20: the request-body boundary scan above
      "counted-collections", // R16: the seam/place/arbitration scan above + format-count.test.ts
      "catalog-coverage", // R13: workers/data-ops/test/catalog-coverage.test.ts
      "agent-filter-parity", // R19: workers/mcp/test/filter-parity.test.ts
      "client-reachable-doors", // R21: the client-reach scan above
      "two-radii", // R31: the radius-vocabulary grep above
      "closed-palette", // R32: the ramp + hex-literal grep above
      "records-carry-their-face", // R35: the three-chokepoint scan above
      "agent-body-parity", // R22: the request BODY half, beside R19 in the mcp suite
      "cited-answers", // R23: workers/content/test/cited-answers.test.ts
      "internal-money-never-in-portal", // R24: the import-graph scan above
      "savings-caption", // R25: the derived-screens scan above
      "vector-fence", // R26: workers/content/test/vector-fence.test.ts
      "described-contracts", // R27: workers/mcp/test/described-contracts.test.ts, beside R19/R22 on the same door census
      "catalogued-strings", // R28: web/test/catalogued-strings.test.ts — re-runs the real extractor over both front doors
      "one-page-width", // R29: the page-container scan above, over both front doors
      "glossary-in-copy", // R33: the deny-list scan over shared/i18n-strings.json, above
      "linked-emails", // R30: web/test/linked-emails.test.ts — the email census, derived from the send sites themselves
      "wrapped-strings", // R33: web/test/wrapped-strings.test.ts — R28's walk read the other way round, over both front doors
      "offered-rights", // R36: the offered-vs-consulted census below
      "in-app-anchors", // R37: web/test/shell-nav.test.ts — every component's anchors, classified by where the href points
      "details-ask-the-door", // R38: the paged-detail census above — a find over a PAGE is not a lookup
    ])
    for (const r of RULES_REGISTRY) {
      if (r.status === "enforced")
        expect(known.has(r.checkId), `law ${r.id} (${r.checkId}) needs a real check`).toBe(true)
    }
  })
})

/** R36 — EVERY SWITCH ON THE PERMISSION MATRIX DECIDES SOMETHING.
 *
 * The grid gives every module four boxes whether or not four decisions exist
 * behind them, so an inert box looks exactly like a live one — and an owner who
 * ticks it, saves, and gets a green toast has been told they granted something.
 * On 21 Aug 2026 fifteen of eighty-eight decided nothing, seven of them with no
 * note anywhere saying so, and one module (`screens`) had four boxes and no
 * door at all: its two doors gate on `teams:edit`.
 *
 * OFFERED IS DATA, CONSULTED IS DERIVED, and the check fails both ways.
 * Offered-but-unasked is theatre. Asked-but-unoffered is the dangerous half: a
 * door written against a right no role can hold refuses everybody, and the
 * Admin role is locked, so nobody can tick their way out of it.
 *
 * FOUR PLACES ASK FOR A RIGHT, and a census that knew only the first would have
 * called four live rights dead — `work:create` among them:
 *   1 · a literal pair — requireRight/gated/gatedBody(…, "help", "create")
 *   2 · the MCP surface — TOOL_GATES values, which are "help:create" strings
 *   3 · the record activity feed — every ACTIVITY_GATE_MAP module, asked for read
 *   4 · the importer — every TARGETS module, asked for create
 */
describe("offered-rights: no permission switch decides nothing", () => {
  const RIGHTS = ["read", "create", "edit", "delete"] as const

  /** Everything the running code actually asks for, off the source. */
  function consulted(): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>()
    const add = (mod: string, right: string) => {
      if (!out.has(mod)) out.set(mod, new Set())
      out.get(mod)!.add(right)
    }
    const files = sourceFiles([join(ROOT, "workers"), join(ROOT, "shared")], {
      extensions: [".ts"],
      skipTests: true,
    })
    expect(files.length, "the gate-source walk found nothing — a blind check passes like a clean one")
      .toBeGreaterThan(50)
    for (const f of files) {
      const flat = read(f.path).replace(/\s+/g, " ")
      // 1 · the literal pair, and 2 · the MCP gate string
      for (const m of flat.matchAll(/"([a-z_]+)"\s*,\s*"(read|create|edit|delete)"/g)) add(m[1], m[2])
      for (const m of flat.matchAll(/"([a-z_]+):(read|create|edit|delete)"/g)) add(m[1], m[2])
    }
    // 3 · the record feed asks every mapped module for read
    for (const mod of Object.values(ACTIVITY_GATE_MAP)) add(mod, "read")
    // 4 · the importer asks every target's module for create
    const targets = read(join(ROOT, "workers", "data-ops", "src", "lib", "targets.ts"))
    const targetModules = [...targets.matchAll(/module\s*:\s*"([a-z_]+)"/g)].map((m) => m[1])
    expect(targetModules.length, "no import target module was derived — the walk has gone blind")
      .toBeGreaterThan(3)
    for (const mod of targetModules) add(mod, "create")
    return out
  }

  it("offered-rights: every right the matrix offers is asked for by something", () => {
    const asked = consulted()
    const theatre: string[] = []
    for (const { key } of TEAM_MODULE_CATALOG)
      for (const right of offeredRights(key))
        if (!asked.get(key)?.has(right)) theatre.push(`${key}:${right}`)

    expect(
      theatre,
      `The Roles screen offers ${theatre.length} switch(es) that no door, tool gate, activity map ` +
        `or import target ever asks for. Somebody can tick one, save it, and believe they granted ` +
        `something. Either wire it, or take it out of MODULE_OFFERED_RIGHTS in shared/team-modules.ts ` +
        `with the reason:\n${theatre.join("\n")}`
    ).toEqual([])
  })

  it("offered-rights: every right something asks for is one the matrix can grant", () => {
    const asked = consulted()
    const known = new Set(TEAM_MODULE_CATALOG.map((m) => m.key))
    const ungrantable: string[] = []
    for (const [mod, rights] of asked) {
      if (!known.has(mod)) continue // not a team module (core-DB rights, tool names, unrelated pairs)
      const offered = new Set<string>(offeredRights(mod))
      for (const right of rights) if (!offered.has(right)) ungrantable.push(`${mod}:${right}`)
    }

    expect(
      ungrantable,
      `Something asks for a right the Roles screen cannot grant, so the door refuses EVERYBODY — ` +
        `including Admin, which is locked and cannot be edited to fix it. Add the right to ` +
        `MODULE_OFFERED_RIGHTS in shared/team-modules.ts:\n${ungrantable.join("\n")}`
    ).toEqual([])
  })

  it("offered-rights: no module offers a right outside the four the grid draws", () => {
    for (const { key } of TEAM_MODULE_CATALOG)
      for (const right of offeredRights(key))
        expect(RIGHTS as readonly string[], `${key} offers "${right}"`).toContain(right)
  })
})

/** A GROUP OF CONTROLS IS NOT ONE CONTROL, and the required ring says so.
 *
 * `Field` draws `required-ring` — a hairline box at the input's corner radius —
 * around whatever it wraps, whenever the field is required. That is right for a
 * single input and wrong for a stack of checkboxes: the ring boxes the WHOLE
 * group including the gaps, and because the stack carries no padding of its own
 * the boxes sit flush against the hairline and read as breaking out of it. The
 * owner reported exactly that on the New story form.
 *
 * The library already anticipated it — `FieldShape` has a `group` value whose
 * own comment says "a ring would box the WHOLE group in gold… so there is no
 * ring — the label's asterisk carries required instead". Nothing declared it:
 * 138 Field call sites and not one passed a shape. So this is not a library
 * gap, it is a call site that never answered a question it was asked.
 *
 * Derived, so a fifth cannot be added: any Field wrapping more than one
 * Checkbox / RadioGroup / ToggleGroup must say `shape="group"` (or turn the
 * ring off itself). */
describe("required-ring: a group says it is a group", () => {
  it("no Field boxes a group of controls in the single-control ring", () => {
    const offenders: string[] = []
    const files = [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }),
    ]
    for (const f of files) {
      const src = readFileSync(f.path, "utf8")
      for (const m of src.matchAll(/<Field\b[^>]*>/g)) {
        const tag = m[0]
        const end = src.indexOf("</Field>", m.index! + tag.length)
        const body = src.slice(m.index! + tag.length, end < 0 ? undefined : end)
        const composite =
          /<Checkbox\b/.test(body) || /<RadioGroup\b/.test(body) || /<ToggleGroup\b/.test(body)
        if (!composite) continue
        if (tag.includes('shape="group"') || tag.includes("ringed={false}")) continue
        offenders.push(`${f.path.slice(ROOT.length + 1)}:${src.slice(0, m.index!).split("\n").length}`)
      }
    }
    expect(
      offenders,
      `these Fields wrap a group of controls and let the required ring box the whole stack — pass shape="group": ${offenders.join(", ")}`
    ).toEqual([])
  })
})

// EVERY SIDEBAR SECTION HAS A COLLECTION SCREEN TO SHOW.
//
// renderCollection() resolves `<module>.list` from the recipe registry and
// returns NotFound when there is none. A HOST-COMPOSED collection has no
// recipe by definition, so it must be answered ABOVE that guard — and a file
// comment has said so, in those words, since the first time it happened:
//
//   "a host-only collection placed among them resolves to NotFound: the
//    section is in every registry, the rail links to it, and the page 404s.
//    (It did, for one commit.)"
//
// It then happened a second time, to `waves`, and shipped: the rail linked to
// it, /waves rendered "That screen doesn't exist", and every other check was
// green — because nothing here reads a screen's ROUTE against its ability to
// draw anything. Prose was the control, and prose is not a control.
//
// So the answer is derived, from three files that already exist: the sections
// the rail offers (pages.ts), the recipes the registry holds (screens.ts), and
// the branches sitting above the guard (collection-content.tsx). Nothing is
// hand-listed, which is the point — a fourth host-composed collection is
// caught by the same walk on the day it is added.
describe("a sidebar section can draw its collection", () => {
  const src = read(join(WEB, "components", "deep-link", "collection-content.tsx"))
  const GUARD = "const recipe = resolveRecipe(`${module}.list`"

  it("collection-screens: the guard this rule is about still exists", () => {
    // If the guard is ever renamed, everything below silently passes.
    expect(src.indexOf(GUARD), "renderCollection must still resolve `<module>.list`").toBeGreaterThan(-1)
    expect(src, "…and must still NotFound when there is none").toContain("if (!recipe) return <NotFound />")
  })

  it("collection-screens: every sidebar module has a recipe, or is answered above the guard", () => {
    const above = src.slice(0, src.indexOf(GUARD))
    const registry = read(join(WEB, "lib", "screens.ts"))
    const pages = read(join(WEB, "lib", "pages.ts"))

    // The rail's own sections, read off the table that draws it.
    const sections = [...pages.matchAll(/\{\s*key:\s*"([a-z-]+)"[^}]*placement:\s*"sidebar"/g)].map((m) => m[1])
    expect(sections.length, "the sidebar census found nothing — it has stopped matching").toBeGreaterThan(8)

    // A section whose segment differs from its module key is named by segment
    // in the router, which is what renderCollection switches on.
    const segmentOf = (key: string) => {
      const row = pages.match(new RegExp(`\\{\\s*key:\\s*"${key}"[^}]*\\}`))
      return row?.[0].match(/segment:\s*"([a-z-]+)"/)?.[1] ?? key
    }

    const stranded = sections
      .map(segmentOf)
      .filter((m) => !registry.includes(`"${m}.list"`))
      .filter((m) => !new RegExp(`module === "${m}"`).test(above))

    expect(
      stranded,
      `${stranded.join(", ")} — the rail links to these and renderCollection cannot draw them. ` +
        `Give each a \`<module>.list\` recipe, or move its branch ABOVE the recipe guard in ` +
        `collection-content.tsx the way \`time\` and \`waves\` are.`
    ).toEqual([])
  })
})

// THE PAGE DOES NOT SCROLL SIDEWAYS, AND A NAME DOES NOT LOSE TO A BADGE.
//
// Two mobile defects with one thing in common: both are whole-screen symptoms
// with a single local cause, so both were fixed where they were noticed and both
// came back somewhere else. The owner reported the horizontal scroll more times
// than I can defend, and the last report was from a phone with the module wall
// reading "Au…" beside a badge that had taken the whole row.
//
// So they are settled structurally and checked here rather than looked for.
describe("nothing pushes the page sideways", () => {
  const doors = [
    ["web", join(WEB, "app", "globals.css")],
    ["web-portal", join(ROOT, "web-portal", "app", "globals.css")],
  ] as const

  it("page-width: both front doors clip horizontal overflow at the root", () => {
    for (const [name, css] of doors) {
      const src = read(css)
      expect(src, `${name}: <html> must clip sideways overflow`).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/)
      expect(src, `${name}: <body> must clip it too`).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/)
    }
  })

  it("page-width: it is CLIP and never HIDDEN", () => {
    // They look identical and they are not. CSS says an element with
    // `overflow-x: hidden` and a visible other axis computes `overflow-y` to
    // `auto` — which turns <html> into a scroll container and silently breaks
    // `position: sticky` on every header in the app. `clip` clips the same
    // overflow and creates no scroll container.
    for (const [name, css] of doors) {
      const root = read(css).match(/(?:^|\n)(?:html|body)\s*\{[^}]*\}/g) ?? []
      for (const block of root)
        expect(block.includes("overflow-x: hidden"), `${name}: use clip, not hidden`).toBe(false)
    }
  })

  it("page-width: the mobile app bar cannot be wider than the phone", () => {
    // It was. The theme control is three segments the kit will not collapse to
    // an icon, and beside the brand, the timer and the avatar it did not fit a
    // 375px screen — so the bar overflowed and took the page with it.
    const shell = read(join(WEB, "components", "app-shell.tsx"))
    const bar = shell.slice(shell.indexOf("md:hidden"), shell.indexOf("md:hidden") + 200)
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"))
    expect(header, "the bar must clip its own contents").toContain("overflow-hidden")
    expect(header, "…and must not draw the theme control").not.toContain("<ModeToggle")
    expect(bar.length).toBeGreaterThan(0)
  })
})

describe("a record's name survives a narrow screen", () => {
  // A row that pairs a NAME with a badge is a flex row with two kinds of child:
  // one that can shrink (`min-w-0 flex-1`) and one that will not (a Badge is
  // `whitespace-nowrap`, so its min-content is the whole phrase). On a phone the
  // rigid one wins and the name becomes "Au…", which is the one piece of
  // information the row exists to carry.
  //
  // The fix is that the ROW WRAPS: the name keeps the first line and the chips
  // drop below it. Derived, so the sixteenth row is caught the day it is written.
  it("wrapped-rows: every name-and-badge row wraps rather than crushing the name", () => {
    const offenders: string[] = []
    let scanned = 0
    const files = [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }).map((f) => f.path),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }).map((f) => f.path),
    ]
    for (const f of files) {
      const src = read(f)
      for (const m of src.matchAll(/className="([^"]*\bflex\b[^"]*)"/g)) {
        const cls = m[1]
        if (cls.includes("flex-col") || !cls.includes("items-center")) continue
        const block = src.slice(m.index! + m[0].length, m.index! + m[0].length + 1400)
        if (!block.includes("min-w-0")) continue
        if (!block.includes("<Badge") && !block.includes("formatCount")) continue
        scanned++
        if (!cls.includes("flex-wrap"))
          offenders.push(`${f.replace(ROOT + "/", "")}:${src.slice(0, m.index).split("\n").length}`)
      }
    }
    // A walk that stops matching must not report an all-clear.
    expect(scanned, "the row census found nothing — it has stopped matching").toBeGreaterThan(8)
    expect(
      offenders,
      `these rows crush the record's name on a phone. Add \`flex-wrap\` to the row and ` +
        `\`basis-[12rem]\` to the name block so the chips drop to a second line instead: ` +
        offenders.join(", ")
    ).toEqual([])
  })
})

// A DISMISSED FORM KEEPS WHAT YOU TYPED — held here, not only in the hook's tests.
//
// The behaviour lives in two files: `useFormDraft` stores it, and
// `FormShellDialog` decides whether closing throws it away. It used to, on every
// dismiss — Esc, backdrop, the close button — and on a phone the backdrop is most
// of the screen. Every form in BOTH front doors renders through this shell (R4),
// so one line here is the whole app's answer, and one line here can also undo it.
describe("closing a form is not a decision to discard it", () => {
  it("form-drafts: FormShellDialog does not clear the draft on dismiss", () => {
    const src = stripComments(read(join(ROOT, "shared", "web", "form-shell.tsx")))
    const handler = src.slice(src.indexOf("onOpenChange={(o) =>"), src.indexOf("onOpenChange={(o) =>") + 260)
    expect(handler, "the dismiss handler must still exist to be checked").toContain("if (busy) return")
    expect(
      handler,
      "closing a form must not throw the draft away — clear it on submit instead"
    ).not.toContain("clearDraft")
  })

  it("form-drafts: a saved draft is merged over the form's shape", () => {
    // Whole-object restore is how a newly added field silently becomes undefined.
    const src = stripComments(read(join(ROOT, "shared", "web", "use-form-draft.ts")))
    expect(src, "read() must take the current shape").toMatch(/function read<T extends object>\(\s*id: string,\s*shape: T/)
    expect(src, "…and spread it under the saved values").toContain("{ ...shape, ...saved }")
  })
})

// THE TAB SHAPE IS ONE DECISION, NOT SIXTEEN.
//
// The owner, seeing the folder on three screens and the old flat strip on the
// rest: "if we change tabs in one central place… it should have changed
// everywhere. If this is not done then the entire way we have built our design
// system is incorrect."
//
// The architecture was fine — one TabsView, one kit Tabs control, one `variant`.
// What was wrong is that sixteen screens had hard-coded `variant: "line"` before
// the folder existed, so the central value governed nothing. It is the DEFAULT
// now, and a screen that wants a line has to be one of the two that genuinely
// do: a strip filtering WITHIN a collection, which has no card to attach to.
describe("a tab strip's shape is decided in one place", () => {
  it("tab-shape: the default is the folder", () => {
    const src = stripComments(read(join(ROOT, "shared", "web", "screen-engine", "tabs-view.tsx")))
    const decl = src.slice(src.indexOf("defaultTabsConfig: TabsConfig"))
    expect(decl.slice(0, decl.indexOf("}") + 1), "the one default must be the folder").toContain('variant: "folder"')
  })

  it("tab-shape: only the two inner filter strips override it", () => {
    const allowed = new Set([
      "web/components/tickets-collection.tsx",
      "web/components/meetings-screen.tsx",
      // The steps view switch (List / Flow / Compare) sits INSIDE the Steps
      // folder tab. Two folders stacked put one strip's feet through the
      // other's toolbar — seen on a phone the moment the default flipped.
      "web/components/process-detail.tsx",
    ])
    const offenders: string[] = []
    let scanned = 0
    const files = [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }),
    ]
    for (const f of files) {
      const rel = f.path.replace(ROOT + "/", "")
      if (!/variant:\s*"line"/.test(read(f.path))) continue
      scanned++
      if (!allowed.has(rel)) offenders.push(rel)
    }
    expect(scanned, "the override census found nothing — it has stopped matching").toBeGreaterThan(1)
    expect(
      offenders,
      `these screens opt out of the one tab shape. A record's tabs and a collection's ` +
        `tabs are the folder; only a strip filtering INSIDE a collection is a line: ${offenders.join(", ")}`
    ).toEqual([])
  })

  it("tab-shape: nothing asks for a `pill`, which the kit does not draw", () => {
    const offenders = [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }),
    ]
      .filter((f) => /variant:\s*"pill"/.test(read(f.path)))
      .map((f) => f.path.replace(ROOT + "/", ""))
    expect(offenders, `\`pill\` is accepted and silently drawn as a line — say what you mean`).toEqual([])
  })
})

// TWO FOLDER STRIPS MUST NOT BE STACKED.
//
// A folder tab is drawn with feet that attach to the card below it. Nest one
// inside another and the inner strip's feet come through the outer one's
// toolbar — which is exactly what happened on a phone the moment the folder
// became the default, on the steps view switch. Derived rather than remembered:
// a screen rendering more than one strip has an inner one, and an inner one is
// a line.
describe("a tab strip is not nested inside another one", () => {
  it("tab-shape: any screen with two strips gives the inner one a line", () => {
    const offenders: string[] = []
    let scanned = 0
    for (const f of [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }),
    ]) {
      const src = read(f.path)
      if ((src.match(/<TabsView/g) ?? []).length < 2) continue
      scanned++
      if (!/variant:\s*"line"/.test(src)) offenders.push(f.path.replace(ROOT + "/", ""))
    }
    expect(scanned, "the nested-strip census found nothing — it has stopped matching").toBeGreaterThan(0)
    expect(
      offenders,
      `these screens stack two folder strips; the inner one switches a VIEW and takes ` +
        `\`variant: "line"\`: ${offenders.join(", ")}`
    ).toEqual([])
  })
})

// EVERY TAB IS IN THE VOCABULARY.
//
// The owner's rule (25 Aug 2026): a tab always carries an icon, and the same
// tab means the same icon on every screen. TabsView enforces the rendering half
// (TAB_ICONS wins over call sites, a folder tab falls back to the folder glyph
// rather than shipping bare) — this census enforces the deciding half: a NEW
// tab value must be given its own line in the vocabulary, so the fallback is a
// net under a decision and never the decision itself. Derived, not remembered:
// tab objects are the only shape in either app carrying `badgeVariant`, so the
// census keys on that and reads the values beside it.
describe("every tab value has an icon in the vocabulary", () => {
  it("tab-icons: each tab value used by either app is a TAB_ICONS key", () => {
    const vocab = read(join(ROOT, "shared", "web", "screen-engine", "tabs-view.tsx"))
    const table = vocab.slice(vocab.indexOf("TAB_ICONS"), vocab.indexOf("}", vocab.indexOf("TAB_ICONS")))
    const known = new Set([...table.matchAll(/^\s*"?([a-z0-9-]+)"?:\s*"/gm)].map((m) => m[1]))
    expect(known.size, "the TAB_ICONS table went missing or unreadable").toBeGreaterThan(20)

    const missing = new Map<string, string>()
    let scanned = 0
    for (const f of [
      ...sourceFiles(join(WEB, "components"), { extensions: [".tsx"] }),
      ...sourceFiles(join(ROOT, "web-portal", "components"), { extensions: [".tsx"] }),
      { path: join(WEB, "lib", "screens.ts") },
    ]) {
      const src = read(f.path)
      for (const m of src.matchAll(/badgeVariant/g)) {
        const back = src.slice(Math.max(0, m.index - 600), m.index)
        const values = [...back.matchAll(/value:\s*"([a-z0-9_-]+)"/g)]
        const value = values.at(-1)?.[1]
        if (!value) continue
        scanned++
        if (!known.has(value)) missing.set(value, f.path.replace(ROOT + "/", ""))
      }
    }
    expect(scanned, "the tab census found nothing — its signature stopped matching").toBeGreaterThan(30)
    expect(
      [...missing.entries()].map(([v, f]) => `${v} (${f})`),
      "these tab values have no line in TAB_ICONS (shared/web/screen-engine/tabs-view.tsx) — give each an icon there, so the same tab draws the same glyph on every screen"
    ).toEqual([])
  })
})
