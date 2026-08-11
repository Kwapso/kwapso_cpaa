// THE LAWS OF THE BASE, machine-checked (see RULES.md + shared/rules/registry.ts).
// Each `it` is the enforcement for one law — break a law and this build goes red.
// It reads source straight off disk (like the publish-seam tests) so the checks
// can't be fooled by anything but the real code.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { GLOSSARY } from "@shared/glossary"
import {
  ACCOUNT_SCOPED_MODULES,
  ACTIVITY_GATE_MAP,
  ACTIVITY_TABLE_EXEMPT,
  CLIENT_REACHABLE_EXEMPT,
  DEAF_EXEMPT,
  FORM_DIALOGS,
  GROWING_COLLECTIONS,
  RAW_BODY_EXEMPT,
  RECORD_DETAIL_COMPONENTS,
  RECORD_TAB_COUNT_EXCEPTIONS,
  RULES_REGISTRY,
  TAB_COUNT_EXCEPTIONS,
} from "@shared/rules/registry"
import { formatCount } from "@shared/web/format-count"
import { SIMPLE_INVALIDATIONS, TEAM_RESOURCES } from "../lib/live-resources"
import { TEAM_SECTIONS } from "../lib/pages"
import { BASE_RECIPES, tabCountKey, withTabCounts } from "../lib/screens"

/** Every worker's src .ts file (recursively), as [repo-relative path, source]. */
function workerSources(): [string, string][] {
  const out: [string, string][] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".ts")) out.push([p.slice(ROOT.length), read(p)])
    }
  }
  for (const w of readdirSync(join(ROOT, "workers"), { withFileTypes: true }))
    if (w.isDirectory()) walk(join(ROOT, "workers", w.name, "src"))
  return out
}

const HERE = dirname(fileURLToPath(import.meta.url)) // web/test
const WEB = join(HERE, "..") // web/
const ROOT = join(WEB, "..") // repo root
const read = (p: string) => readFileSync(p, "utf8")

/** Comments are NOT code. Without this, `// no LIMIT needed here` satisfies the
 * very bound it describes the ABSENCE of, and a comment naming a seam stands in
 * for calling it. Block comments go first; line comments only when the `//`
 * isn't part of a `https://` URL (SQL and template literals are left intact —
 * R14 reads LIMIT out of them). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")
}

/** Every *.tsx under web/components (recursively). */
function componentFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".tsx")) out.push(p)
    }
  }
  walk(join(WEB, "components"))
  return out
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

  // R2 — every record-detail screen exposes Overview + Activity tabs. The
  // engine-recipe details (team/members/invites) carry them as recipe data; the
  // bespoke ones must render them themselves.
  it("record-detail-tabs: bespoke record details render tabs + an Activity feed", () => {
    for (const c of RECORD_DETAIL_COMPONENTS) {
      const src = read(join(WEB, "components", `${c}.tsx`))
      expect(src, `${c} must use library TabsView`).toContain("TabsView")
      expect(src, `${c} must render an ActivityFeed (the Activity tab)`).toContain("ActivityFeed")
      // R2 meets R14: that feed is a PAGE of a growing collection under a badge
      // counting ALL of it. The generic check below proves SOMETHING in web can
      // reach page two; this proves THIS detail can — the gap that let a record
      // with 143 events truthfully badge 143 over its newest 50, forever.
      expect(src, `${c}'s Activity feed must carry a <LoadMore> — its badge counts rows it can't reach (R14)`).toContain(
        "<LoadMore"
      )
    }
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
    for (const c of RECORD_DETAIL_COMPONENTS) {
      const src = read(join(WEB, "components", `${c}.tsx`))
      const tabs = [...src.matchAll(/\{\s*value: "([a-z-]+)",[\s\S]{0,300}?badge: ([^,\n]+),/g)]
      expect(tabs.length, `${c}: the tab scan found no tabs — it has gone blind`).toBeGreaterThan(2)
      let counted = 0
      for (const [, value, badge] of tabs) {
        if (badge.trim() !== '""') {
          counted++
          continue
        }
        expect(
          RECORD_TAB_COUNT_EXCEPTIONS[`${c}.${value}`],
          `${c} tab "${value}" carries no count → badge it from the door's exact total, or pin it (with a reason) in RECORD_TAB_COUNT_EXCEPTIONS`
        ).toBeTruthy()
      }
      // R16 owns the NUMBER here too — a counted bespoke tab goes through the seam.
      if (counted > 0)
        expect(src, `${c} badges a tab → the number must come through the formatCount seam (R16)`).toContain(
          "format-count"
        )
    }
  })

  // R5 — record activity is read through the ONE generic (table, id) path.
  it("generic-activity-path: the activity read path has a generic record scope", () => {
    const src = read(join(ROOT, "workers", "tenancy", "src", "lib", "activity-read.ts"))
    expect(src, "activity-read must support the generic `record` scope").toContain('scope === "record"')
    const api = read(join(WEB, "lib", "api.ts"))
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
    const tsFiles = (dir: string): string[] => {
      const out: string[] = []
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name)
          if (e.isDirectory()) walk(p)
          else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p)
        }
      }
      walk(dir)
      return out
    }
    const offenders: string[] = []
    for (const dir of serverDirs) {
      for (const file of tsFiles(dir)) {
        const src = read(file)
        // `await fetch(` = an awaited call to the GLOBAL fetch (an external socket).
        // This excludes service bindings (`X.fetch`), the Worker `async fetch(` handler,
        // and type annotations (`{ fetch(url…) }`) — all of which aren't external calls.
        const re = /\bawait fetch\(/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          const window = src.slice(m.index, m.index + 600)
          if (!/signal:\s*AbortSignal\.timeout/.test(window))
            offenders.push(`${file.slice(ROOT.length)} @${m.index}`)
        }
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
      const wired = componentFiles().some((f) => {
        const src = read(f)
        return src.includes("<LoadMore") && src.includes(c.webKey)
      })
      expect(wired, `${name} pages on the server but nothing in web can reach page two`).toBe(true)

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
      // Status moves too: a help status UPDATE must carry `status <> ?`.
      let s = -1
      while ((s = src.indexOf("UPDATE help SET status", s + 1)) !== -1) {
        const stmt = src.slice(s, Math.min(src.length, s + 500))
        if (!/status <>/.test(stmt)) offenders.push(`${path} @${s} (status move without <> predicate)`)
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
      ["workers/content/src/lib/learning.ts", "setLearningActive"],
      ["workers/content/src/lib/help.ts", "setStatus"],
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

  // R16 — every screen showing a collection shows its count exactly once: the
  // NUMBER through the one formatCount seam (never rows.length), the PLACE a
  // counted tab or a CollectionHeading, the ARBITRATION a context (a counted tab
  // wins; the heading stands down).
  it("counted-collections: server totals through ONE seam, one place, arbitrated", () => {
    // (i) THE NUMBER — no component builds a count badge from a loaded list's length.
    const lengthBadges = componentFiles().filter((f) => /badge:[^,\n]*\.length/.test(read(f)))
    expect(
      lengthBadges,
      `a capped list's length is a ceiling, not a total (R16) — badge from the server total via formatCount: ${lengthBadges.join(", ")}`
    ).toEqual([])
    // …and the badge builders route through the seam.
    expect(read(join(WEB, "components", "team-section-nav.tsx"))).toContain("formatCount")
    const moduleContent = read(join(WEB, "components", "deep-link", "module-content.tsx"))
    expect(moduleContent).toContain("formatCount")

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
          // The checkers. `parseUploadDataUrl` earns its place beside the text
          // seam because it IS the seam's binary half: it takes `unknown`,
          // type-checks, and caps BYTES before decoding (a data URL is megabytes,
          // so a character cap would be the wrong refusal) — locked by
          // workers/content/test/upload-parse.test.ts. `parseDataUrl` beside it
          // does NOT qualify: it declares `dataUrl: string`, which is a claim.
          const checked =
            /(?<![\w$.])(?:requireText|optionalText|queryText|requireIdList|parseUploadDataUrl|Array\.isArray|Number|includes)\($/.test(
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

  // Every enforced law in the registry maps to one of the checks above (or a
  // R21 — A DOOR ON THE AGENCY'S OWN MATERIAL REFUSES A CLIENT LOGIN.
  //
  // Earned twice, the same way both times. The client portal's gateway forwards
  // a NAMED allow-list and leaves the agency's own doors out, with a comment
  // saying why. The AGENCY gateway forwards by PREFIX, and a client login is an
  // ordinary team member holding an ordinary role — so every door the portal
  // deliberately withheld was served to the same person at the other hostname.
  // First the learning library and the dropdown vocabulary; then, because the
  // enumeration that followed listed "what the accounts module owns" instead of
  // "what a client can reach", the help STAKEHOLDER list — a door that names the
  // agency's staff admins, with their email addresses, and answers on a POST as
  // well as a GET.
  //
  // So this check enumerates the only way that cannot go stale: DERIVED, from
  // four sources that are each already the truth about themselves —
  //   • the CLIENT ROLE's rights, read out of the seed;
  //   • every route, read out of each worker's own ROUTES table;
  //   • the gate each one opens with, read out of the handler (and the
  //     route-local helpers it calls — a refusal one frame down still counts);
  //   • the portal's own surface, read out of PORTAL_DOORS.
  // A door a Client-role caller can pass, that the portal does not open, must
  // refuse them or fence them. Add a door tomorrow and it is judged today.
  it("client-reachable-doors: every agency door a client login can pass refuses or fences them", () => {
    // ── 1. what the Client role may do (derived from the seed, never retyped) ──
    const seed = read(join(ROOT, "scripts", "seed-staging.mjs"))
    const rightsAt = seed.indexOf("rights: {", seed.indexOf("const CLIENT_ROLE"))
    expect(rightsAt, "the seed no longer declares CLIENT_ROLE.rights — re-read this check").toBeGreaterThan(-1)
    const block = seed.slice(rightsAt, seed.indexOf("\n  },", rightsAt))
    const clientRights = new Set<string>()
    for (const m of block.matchAll(/(\w+):\s*\{([^}]*)\}/g))
      for (const r of m[2].matchAll(/(\w+):\s*true/g)) clientRights.add(`${m[1]}:${r[1]}`)
    // Guard the derivation: an empty right set would make every door "unreachable"
    // and pass this whole law without reading a line of worker source.
    expect(clientRights.has("help:read"), "the Client role must still hold help:read").toBe(true)
    expect(clientRights.size, "the Client role's rights did not parse").toBeGreaterThan(4)

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
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
        const code = read(join(dir, file))
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
        const passable = gates.length === 0 || gates.some((g) => clientRights.has(g))
        if (!passable) continue // their role stops them before the door has to

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

  // per-worker seam test) — a law can't exist without a check.
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
    ])
    for (const r of RULES_REGISTRY) {
      if (r.status === "enforced")
        expect(known.has(r.checkId), `law ${r.id} (${r.checkId}) needs a real check`).toBe(true)
    }
  })
})
