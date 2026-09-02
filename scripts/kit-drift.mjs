#!/usr/bin/env node
/**
 * kit-drift.mjs — are the app and the design kit still saying the same thing?
 *
 *     node scripts/kit-drift.mjs           report
 *     node scripts/kit-drift.mjs --check   exit 1 if anything has drifted
 *
 * THE LOOP THIS GUARDS. `shared/ui/` is the kit, vendored at the tag in
 * VERSION.json. Fixes get made in the APP first, we look at them, and the rule
 * is then written back UPSTREAM so the next product inherits it. That write-back
 * is the only step in the loop nothing checks: `sync-design.mjs` pulls, the hash
 * test in `vendored-kit.test.ts` proves the copy is clean, and both are blind to
 * a fix that was made here and never travelled. On 2026-09-02 the kit was four
 * commits and six uncommitted files ahead of the pin, and one of its commits was
 * titled "re-imported from kwapso_system" — a hand carry, remembered that day.
 *
 * WHAT IT DOES NOT DO. It does not decide whether an app change SHOULD have gone
 * upstream; no script can read that intent. It reports the three facts a person
 * needs in order to decide, and section 3 is a prompt-list rather than a verdict:
 * UI commits made here since the pin, so the question gets ASKED once per sync
 * instead of never.
 *
 * The kit's own clone is not required — CI does not have it, and a check that
 * fails when a directory is missing is a check people learn to ignore. Absent,
 * sections 1 and 2 say so and are skipped; section 3 still runs off this repo.
 * Point it elsewhere with KIT_REPO=/path/to/kwapso-ui-ux.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CHECK = process.argv.includes("--check")
const KIT = process.env.KIT_REPO ?? resolve(ROOT, "..", "kwapso-design")

/** The app's own UI surface — a commit touching one of these is a write-back
 *  candidate. Derived from where the front doors actually keep components, so a
 *  new folder under web/ is covered without editing this list. */
const UI_PATHS = ["web/components", "web-portal/components", "shared/web"]

const git = (cwd, ...args) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return null
  }
}

const version = JSON.parse(readFileSync(join(ROOT, "shared", "ui", "VERSION.json"), "utf8"))
const findings = []
const out = []

out.push(`\nkit-drift — app vs ${version.repo}`)
out.push(`  pinned at ${version.tag} (${version.sha.slice(0, 7)}), synced ${version.syncedAt}\n`)

/* -- 1 · has the KIT moved since we pinned it? ------------------------------ */

const haveKit = existsSync(join(KIT, ".git"))
if (!haveKit) {
  out.push(`1 · kit clone      not at ${KIT} — sections 1 and 2 skipped`)
  out.push(`                   (clone it, or set KIT_REPO)`)
} else {
  const known = git(KIT, "cat-file", "-t", version.sha) === "commit"
  const ahead = known ? git(KIT, "log", "--oneline", `${version.sha}..HEAD`) : null

  if (!known) {
    out.push(`1 · kit ahead      the pinned sha is not in that clone — fetch it, or KIT_REPO points at the wrong repo`)
    findings.push("pinned sha unknown to the kit clone")
  } else if (ahead) {
    const lines = ahead.split("\n")
    out.push(`1 · kit ahead      ${lines.length} commit(s) upstream are NOT in this app:`)
    for (const l of lines) out.push(`                     ${l}`)
    out.push(`                   → node scripts/sync-design.mjs <tag>`)
    findings.push(`${lines.length} kit commit(s) not pulled`)
  } else {
    out.push(`1 · kit ahead      none — the pin is the kit's HEAD`)
  }

  const newest = git(KIT, "describe", "--tags", "--abbrev=0")
  if (newest && newest !== version.tag) out.push(`                   newest tag upstream is ${newest}, we are on ${version.tag}`)

  /* -- 2 · work in the kit that is not committed anywhere -------------------- */

  const dirty = git(KIT, "status", "--porcelain")
  if (dirty) {
    const lines = dirty.split("\n").map((l) => l.trim())
    out.push(`\n2 · kit uncommitted ${lines.length} file(s) changed upstream and not committed — these are at risk:`)
    for (const l of lines) out.push(`                     ${l}`)
    findings.push(`${lines.length} uncommitted file(s) in the kit`)
  } else {
    out.push(`\n2 · kit uncommitted none — the kit's tree is clean`)
  }
}

/* -- 3 · UI work done HERE since the sync, which may owe the kit a rule ----- */

/* `--since=<date>` with no time means THAT TIME OF DAY, not midnight — a bare
 * date silently hides everything committed earlier the same day, which is most
 * of a sync day's work. Ask for midnight explicitly. */
const since = git(ROOT, "log", "--oneline", `--since=${version.syncedAt} 00:00`, "--", ...UI_PATHS)
out.push(`\n3 · app UI commits since ${version.syncedAt} — did any of these earn a kit rule?`)
if (since) {
  for (const l of since.split("\n")) out.push(`                     ${l}`)
  out.push(`                   (a prompt, not a verdict — answer it once, here, per sync)`)
} else {
  out.push(`                     none`)
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · OVERRIDES THE KIT HAS SINCE MADE UNNECESSARY

   `shared/web/library-overrides.css` is the app correcting the kit from the
   outside. Each block explains itself in prose and most name the upstream fix
   they stand in for — but prose is exactly what nobody re-reads, which is how
   three of them sat for weeks after the reasoning was already written down.

   So the CONDITION is data here and the PROSE stays there. Two directions, both
   red: a block with no entry cannot be added (somebody has to decide which kind
   it is), and an entry naming no block is rot. A `permanent` block is not debt
   and must never be reported as such — the scroll-lock rule corrects a
   third-party package against these two shells and says in its own text that no
   kit component owns it.
   ══════════════════════════════════════════════════════════════════════════ */

/** Keyed by the block's FIRST selector, verbatim off the stylesheet. */
const OVERRIDE_CLAIMS = [
  {
    selector: "html",
    kind: "permanent",
    why: "corrects react-remove-scroll (via Radix) against both shells; the block's own text says no component in shared/ui/ owns it",
  },
  /* THREE ENTRIES LEFT HERE ON 2026-09-02, AND THAT IS THIS LIST WORKING.
     `:root` (the focus ring's offset), the AgentChat composer's ring and
     `[data-slot="agent-chat-turn"]`'s alignment were all `debt`, all client
     rulings on KIT behaviour, and all three had sat in the stylesheet since
     31 Aug with their own "delete this the day the kit ships it" line
     unfollowed. The kit shipped all three in v1.2.24; the blocks were deleted
     the same day and their entries with them. An entry naming no block is rot
     — see the header — so removing the block without removing its claim is
     just the same debt in a different file. */
]

const overridesCss = readFileSync(join(ROOT, "shared", "web", "library-overrides.css"), "utf8")
/* A block opens at a line that is a selector at column 0 and ends in `{` or `,`.
 * Comments are indented by one space in this file, so column 0 is unambiguous. */
const blocks = [...overridesCss.matchAll(/^([a-z:[*][^\n{,]*)[{,]$/gim)].map((m) => m[1].trim())

out.push(`\n4 · overrides       ${blocks.length} selector(s) in library-overrides.css`)

const claimed = new Set()
for (const sel of blocks) {
  const claim = OVERRIDE_CLAIMS.find((c) => c.selector === sel)
  if (!claim) continue // a continuation selector of a block already claimed
  claimed.add(claim.selector)

  if (claim.kind === "permanent") {
    out.push(`                   · ${sel} — permanent, not debt`)
    continue
  }
  const kitFile = join(ROOT, "shared", "ui", claim.file)
  const shipped = existsSync(kitFile) && claim.fixedWhen.test(readFileSync(kitFile, "utf8"))
  if (shipped) {
    out.push(`                   ✗ ${sel} — THE KIT HAS SHIPPED THIS. The override is dead code: delete it.`)
    out.push(`                       (${claim.what} — ${claim.file})`)
    findings.push(`a dead override: ${sel}`)
  } else {
    out.push(`                   · ${sel} — still needed. Owes the kit: ${claim.what}`)
    out.push(`                       (${claim.file})`)
  }
}
for (const c of OVERRIDE_CLAIMS)
  if (!claimed.has(c.selector)) {
    out.push(`                   ✗ claim for "${c.selector}" matches no block — stale entry, delete it`)
    findings.push(`stale override claim: ${c.selector}`)
  }
const unclaimed = blocks.filter((s) => !OVERRIDE_CLAIMS.some((c) => c.selector === s) && !/^\[data-slot="agent-chat-composer"\] |^body\[data-scroll-locked\]|^\[data-slot="agent-chat-thinking"\]/.test(s))
for (const s of unclaimed) {
  out.push(`                   ✗ "${s}" has no entry — say whether it is permanent or owes the kit a fix`)
  findings.push(`unclaimed override: ${s}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · UI-GAPS ROWS THE KIT HAS SINCE CLOSED

   A row marked "flag for the library" is a promise that something is still
   missing. Row 21 said a flow/graph shape was missing while the kit shipped
   `flowchart`, `flowdetail` AND `swimlane` and `process-flowchart.tsx` already
   drew with them — a register that lies about finished work is how a register
   stops being read.

   NOT DERIVABLE FROM THE ROW'S OWN WORDS, which is why this is data. Row 21
   names no component in backticks (it asks for "a flow / graph shape"), and its
   Placeholder column points at `agent-blocks.tsx` while the file that actually
   closed it was a different one. So each open row DECLARES what would close it,
   and the check reads the pinned kit for that.
   ══════════════════════════════════════════════════════════════════════════ */

/* A PROBE MUST POINT AT THE THING THE ROW IS ABOUT, or it can never go green
   however the work lands — which is a check that reports "still open" forever
   and teaches its reader to skim past it. Three probes here did exactly that
   until 2026-09-02: rows 15, 17 and 24 were aimed at `components/screen-
   renderer`, `components/notes` and `components/collection-frame`, none of
   which is the subject any more. The engine that would carry 15's seam is
   app-side (`shared/web/screen-engine/`), the editor 17 is about MOVED
   app-side (the kit's `Notes` is a read-only stack of remark rows now), and
   24's grouping would land on the kit's `List`, not on a frame that only
   draws an eyebrow and a count. A row whose subject is no longer IN the kit
   has no kit probe to write, and says so rather than pretending. */
const GAP_CLOSERS = [
  { row: "1",   closes: "a code-input component",                 file: "components/code-input/code-input.tsx", fixedWhen: /./ },
  { row: "15",  closes: "the serverSide seam reaches the frame",  appSide: "the engine that would carry it is shared/web/screen-engine/, not the kit" },
  { row: "17",  closes: "the notes EDITOR takes an id and forwards ARIA", appSide: "the editor moved to shared/web/notes-editor/; the kit's Notes is read-only now" },
  { row: "17b", closes: "a server-searchable picker (onSearch + serverSide)", file: "components/choice/choice.tsx",  fixedWhen: /onSearch\?:/ },
  { row: "22b", closes: "a per-column sort TYPE, so a column can display one value and compare another",
                appSide: "the kit's DataTable reports key+direction and sorts nothing, so the comparator lives in shared/web/screen-engine/collection.ts" },
  /* A PROBE MATCHES AN API, NEVER A WORD. `/group/i` here matched three
     comments about the trailing BUTTON group and reported the row closed on
     2026-09-02. A prop declaration is the only thing that means the kit
     actually offers this. */
  { row: "24",  closes: "a collection that GROUPS rows under a heading", file: "components/list/list.tsx", fixedWhen: /^\s*group(By|s)\??:/m },
]

out.push(`\n5 · UI-GAPS rows    ${GAP_CLOSERS.length} row(s) marked open, checked against the pinned kit`)
for (const g of GAP_CLOSERS) {
  /* No kit probe to write: the subject is not in the kit. Reported so the row
     is still listed and still visible, but never as something the kit closed. */
  if (g.appSide) {
    out.push(`                   · row ${g.row} — open, APP-SIDE: ${g.closes}`)
    out.push(`                       ${g.appSide}`)
    continue
  }
  const f = join(ROOT, "shared", "ui", g.file)
  const shipped = existsSync(f) && g.fixedWhen.test(readFileSync(f, "utf8"))
  if (shipped) {
    out.push(`                   ✗ row ${g.row} — THE KIT SHIPS THIS NOW: ${g.closes}`)
    out.push(`                       verify and cross the row off (${g.file})`)
    findings.push(`UI-GAPS row ${g.row} may be closed`)
  } else {
    out.push(`                   · row ${g.row} — still open: ${g.closes}`)
  }
}

out.push("")
out.push(findings.length ? `DRIFT · ${findings.join(" · ")}` : `IN SYNC · nothing to carry`)
out.push("")

console.log(out.join("\n"))
if (CHECK && findings.length) process.exit(1)
