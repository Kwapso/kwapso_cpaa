// BACKFILL THE NEW REFERENCE SCHEME ONTO EXISTING ROWS — the 2026-08-31/09-01
// ruling (shared/workers/refs.ts, `nextTeamRef`, `team_ref_counters`, team
// migration 0060) only mints the new team-wide shape ("T412", "B188", "S12",
// "M9", "A3", "W1") for records CREATED after it shipped. It never touched a
// row that already existed. This is a ONE-OFF DATA BACKFILL (the columns and
// the counters table already exist from migration 0060) — not a schema
// migration — so it lives here rather than in team-schema.ts, the same
// division scripts/reset-all.mjs and scripts/backfill-ticket-raisers.mjs draw.
//
//   node scripts/backfill-refs-2026-09-01.mjs --dry-run      # writes nothing
//   node scripts/backfill-refs-2026-09-01.mjs --apply        # writes, staging only
//
// DRY RUN IS THE DEFAULT. `--apply` is required to write anything, and even
// then the script REFUSES to write a single row for a kind where it found a
// blocking problem it was told not to guess through (see "STOP CONDITIONS"
// below) — the whole run for that kind is withheld, never a partial write.
//
// Runs against wrangler's own D1 REST-backed `d1 execute` (this sandbox has no
// `cf-exec` and no visible CLOUDFLARE_API_TOKEN, but `wrangler` itself resolves
// credentials on its own — confirmed with `wrangler whoami` before writing this),
// the same subprocess pattern reset-all.mjs and backfill-ticket-raisers.mjs use,
// rather than a raw fetch against the REST endpoint (prune-empty-meetings.mjs's
// style) — that style needs the token in `process.env` directly, which a plain
// `node` process here does not have.
//
// PRODUCTION IS NOT IN SCOPE for this run — the client's own instruction was to
// preview against staging first. The flag exists for the day this plan is
// approved and re-run for real, and even then it needs BOTH extra flags, same
// convention as prune-empty-meetings.mjs.
//
// ── THE FOUR KINDS, AND WHY THEY ARE NOT ONE RECIPE ─────────────────────────
//
// 1. APPS — the client handed over an EXACT, EXTERNALLY-DICTATED order (29
//    names). This is not a counter to run, it is a lookup table: position N in
//    APP_ORDER gets literally `A<N padded to 4>`. Matched by (app name, account
//    name) EXACTLY, because two live apps are named "Fuhrpark" and only the
//    account tells them apart (the client named both explicitly, HOGO vs DEMO).
//    The team's own `team_ref_counters` row for kind 'A' is advanced to
//    (however many apps actually exist) afterward, so the NEXT app created
//    mints one number past the last one this script assigned — never a
//    collision with A0001.
//
// 2. TICKETS AND STORIES — reformat an EXISTING ref, never renumber: take the
//    old `<account>-<OldLetter><digits>` string, keep the digits VERBATIM, swap
//    only the letter (T stays T; story's old S becomes B). This is the
//    instruction as given, and see the STOP CONDITION below for why a dry run
//    was mandatory before writing a single row of it.
//
// 3. SPRINTS, MEETINGS, WAVES — the opposite of #2: throw the old value away
//    entirely and mint a brand new TEAM-WIDE sequence, oldest `created_at`
//    first, through the exact arithmetic `nextTeamRef` itself uses (so the
//    team's counter is left in the state it would be in had every row been
//    minted one at a time, in order, starting today). Gated on `account_id
//    IS NOT NULL` for sprints/meetings, matching the live gate the CREATE path
//    already applies (`v.accountId ? nextTeamRef(...) : null` in
//    workers/content/src/lib/{stories,meetings}.ts) — an account-less row never
//    got a ref before and does not start now. Waves' `account_id` is NOT NULL
//    in the schema, so every wave qualifies.
//
// ── STOP CONDITION #1, FOUND WHILE BUILDING THIS: TICKET/STORY COLLISIONS ───
//
// The old shape was PER-ACCOUNT ("BERG-T0412"): every account's own tickets
// started counting at 1. Stripping the account prefix and keeping the digits
// verbatim, exactly as instructed, means two different accounts' "T0001"
// become the SAME string "T0001" — which is precisely the cross-account
// collision shared/workers/refs.ts's own essay says the whole redesign exists
// to make structurally impossible for NEW mints. Reformatting old rows this
// way walks it back in for OLD ones, and `idx_help_ref` / `idx_stories_ref`
// are LIVE UNIQUE indexes on staging today (checked against
// sqlite_master directly) — a literal reformat is not merely unwise, it
// cannot be written at all without either dropping those indexes (a schema
// change, out of scope for a data backfill) or accepting that most of the new
// values silently fail to write.
//
// Measured against live staging (`team-01kzwxfd86n0k3rzrbhkmkrwys`, the
// "Kwapso" team, the only one holding real client data): 1,896 ticket refs
// reformat to only 1,694 distinct strings (22 colliding groups, 224 rows);
// ALL 275 story refs reformat to only 34 distinct strings — every single
// story collides with at least one sibling. Even the tiny "Smoke team" shows
// it on 2 rows ("PORT2-T0001" and "PORT-T0001" both become "T0001").
//
// So this script computes the full reformat plan for tickets and stories,
// reports every collision it finds, and its `--apply` path REFUSES to write
// either table at all until a human decides how to resolve it (drop the
// unique index, keep only one row per collision and leave the rest ref-less,
// fall back to a fresh renumber the way sprints/meetings do, or something
// else) — none of which this script may choose on its own.
//
// ── STOP CONDITION #2: THE APPS LIST DOES NOT LINE UP WITH LIVE DATA ────────
//
// Checked against the same live team: it holds 28 apps, not 29. Position #29
// in the client's list, "Players" (account Padelbase), matches NOTHING —
// Padelbase's account only has "Academy" and "Padelbase" as apps, no
// "Players" anywhere in the database. Position #28, "Platinum" (account
// PLATINUM), also matches nothing BY NAME — the one app on account PLATINUM
// is named "ERP Kennogroup", not "Platinum", and "ERP Kennogroup" itself is
// not named anywhere in the client's 29-item list. Both are reported as
// AMBIGUOUS and neither gets a ref assigned; positions #1–#27 all match
// exactly one live app each and are unaffected.

import { execFileSync } from "node:child_process"
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const APPLY = process.argv.includes("--apply")
const PRODUCTION = process.argv.includes("--production")
const CONFIRMED = process.argv.includes("--yes-production")

if (PRODUCTION && !CONFIRMED) {
  console.error(
    "Refusing production without --yes-production. The client's own instruction was to preview\n" +
      "against staging first; that approval does not reach production. Ask the owner, then pass both flags."
  )
  process.exit(1)
}

const CORE_DB = PRODUCTION ? "kwapso-core" : "kwapso-core-staging"

// Where every planned-change file lands, so a human can read the FULL list
// (this console only prints samples + every anomaly) before anything is ever
// applied. Passed in by the caller in this environment; falls back to /tmp
// elsewhere.
const OUT_DIR =
  process.env.BACKFILL_REFS_OUT_DIR ||
  "/private/tmp/claude-501/-Users-aurora-Documents-Claude-kwapso/13e014ce-dce3-4ba0-ad97-b0ad7e206664/scratchpad/backfill-refs-2026-09-01"
mkdirSync(OUT_DIR, { recursive: true })

// ── THE EXACT APP ORDER, given directly by the client, 2026-09-01. Position
// in this array (1-based) IS the number the app gets: APP_ORDER[0] -> A0001. ──
const APP_ORDER = [
  { name: "CONFIA", account: "Confia" },
  { name: "S4Y Office", account: "Safety4You" },
  { name: "196+ awards", account: "196+" },
  { name: "EmployR", account: "HOGO" },
  { name: "MAKLAR Pickl", account: "Pickl" },
  { name: "IFNW", account: "Institut Vividus" },
  { name: "S4Y Mitarbeiter", account: "Safety4You" },
  { name: "Comunitapp", account: "Cardenal Reig" },
  { name: "Padelbase", account: "Padelbase" },
  { name: "S4Y Schulungszentrum", account: "Safety4You" },
  { name: "S4Y Extern", account: "Safety4You" },
  { name: "Looom", account: "Looom" },
  { name: "VU Solutions", account: "VU Solutions" },
  { name: "Amstella", account: "Amstella" },
  { name: "AWS", account: "aWs" },
  { name: "Amstella Ops", account: "Amstella" },
  { name: "Assecuranz", account: "Assecuranz" },
  { name: "re-green", account: "re-green" },
  { name: "Fuhrpark", account: "HOGO" }, // #19 — the OTHER Fuhrpark is #25
  { name: "HORST", account: "HOGO" },
  { name: "ETZI", account: "Etzi Haus" },
  { name: "Kwapso System", account: "Kwapso" },
  { name: "FluClinic", account: "FluClinic" },
  { name: "Academy", account: "Padelbase" },
  { name: "Fuhrpark", account: "DEMO" }, // #25 — the OTHER Fuhrpark is #19
  { name: "Kwapso Portal", account: "Kwapso" },
  { name: "Ontime Fuhrpark", account: "Ontime Logistics" },
  { name: "Platinum", account: "PLATINUM" },
  { name: "Players", account: "Padelbase" },
]

/** Old shape: `<anything>-<UPPERLETTERS><digits>`, e.g. "BERG-T0412",
 * "196+ awards-T2912", "PORT2-T0001". The prefix is whatever the account's own
 * code/name happened to be — never parsed, only discarded. A ref with no dash
 * at all (the new team-wide shape already has none) simply does not match, so
 * a row minted post-migration is left alone rather than double-handled. */
const OLD_REF_RE = /^(.+)-([A-Z]+)(\d+)$/

function sqlStr(v) {
  if (v === null || v === undefined) return "NULL"
  return `'${String(v).replaceAll("'", "''")}'`
}

/** One read (or, under --apply, one write) through `wrangler d1 execute`,
 * against the database's own id — wrangler accepts the UUID directly, no name
 * lookup needed (confirmed against `wrangler d1 list` before relying on it). */
function d1(db, sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", db, "--remote", "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
  const json = JSON.parse(out.slice(out.indexOf("[")))
  if (!json[0]?.success) throw new Error(`query failed: ${sql.slice(0, 120)}…`)
  return json[0].results ?? []
}

/** A multi-statement write, batched into a file — the same shape
 * backfill-ticket-raisers.mjs uses, for the same reason: hundreds of
 * statements is one file and one round trip, not hundreds of them. */
function d1Apply(db, statements) {
  if (!statements.length) return
  const file = join(OUT_DIR, `apply-${db}-${process.pid}-${Date.now()}.sql`)
  writeFileSync(file, statements.join("\n"))
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", db, "--remote", "--yes", "--file", file], {
      stdio: "inherit",
    })
  } finally {
    unlinkSync(file)
  }
}

function writePlanFile(name, obj) {
  const path = join(OUT_DIR, name)
  writeFileSync(path, JSON.stringify(obj, null, 2))
  return path
}

// ── #2: tickets / stories — REFORMAT, never renumber ────────────────────────
function planReformat(db, table, oldLetter, newLetter) {
  const rows = d1(db, `SELECT id, ref FROM ${table} WHERE ref IS NOT NULL`)
  const groups = new Map() // newRef -> [{id, oldRef}]
  const unparseable = []
  for (const r of rows) {
    const m = r.ref.match(OLD_REF_RE)
    if (!m || m[2] !== oldLetter) {
      unparseable.push(r)
      continue
    }
    const newRef = newLetter + m[3]
    if (!groups.has(newRef)) groups.set(newRef, [])
    groups.get(newRef).push({ id: r.id, oldRef: r.ref })
  }
  const clean = []
  const collisions = []
  for (const [newRef, members] of groups) {
    if (members.length === 1) clean.push({ id: members[0].id, oldRef: members[0].oldRef, newRef })
    else collisions.push({ newRef, members })
  }
  return { totalWithRef: rows.length, clean, collisions, unparseable }
}

// ── #3: sprints / meetings / waves — FRESH backfill, creation-date order ────
function planFreshBackfill(db, table, kindLetter, { requireAccount }) {
  const where = requireAccount ? "WHERE account_id IS NOT NULL" : ""
  const rows = d1(db, `SELECT id, created_at FROM ${table} ${where} ORDER BY created_at ASC, id ASC`)
  const plan = rows.map((r, i) => ({ id: r.id, newRef: kindLetter + String(i + 1).padStart(4, "0") }))
  return { total: rows.length, plan }
}

// ── #1: apps — the externally-dictated exact order ──────────────────────────
function planApps(db) {
  const rows = d1(
    db,
    `SELECT a.id, a.name, a.ref, ac.name AS account_name FROM apps a LEFT JOIN accounts ac ON ac.id = a.account_id`
  )
  const byKey = new Map()
  for (const r of rows) {
    const key = `${r.name} ${r.account_name ?? ""}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(r)
  }
  const matched = []
  const ambiguous = []
  const consumed = new Set()
  APP_ORDER.forEach((entry, idx) => {
    const key = `${entry.name} ${entry.account}`
    const candidates = (byKey.get(key) || []).filter((c) => !consumed.has(c.id))
    if (candidates.length === 1) {
      const aRef = `A${String(idx + 1).padStart(4, "0")}`
      matched.push({ position: idx + 1, aRef, appId: candidates[0].id, name: entry.name, account: entry.account })
      consumed.add(candidates[0].id)
    } else {
      ambiguous.push({
        position: idx + 1,
        name: entry.name,
        account: entry.account,
        candidatesFound: candidates.length,
      })
    }
  })
  const extraAppsInDb = rows.filter((r) => !consumed.has(r.id))
  return { totalAppsInDb: rows.length, matched, ambiguous, extraAppsInDb }
}

// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `backfill-refs-2026-09-01 — ${PRODUCTION ? "PRODUCTION" : "staging"} (${CORE_DB})` +
      `${APPLY ? "  — APPLYING" : "  — DRY RUN, nothing will be written"}\n`
  )

  const teams = d1(CORE_DB, "SELECT id, name, database_id FROM teams WHERE database_id IS NOT NULL")
  console.log(`${teams.length} team(s) with a database:`)
  for (const t of teams) console.log(`  ${t.name}  (${t.database_id})`)
  console.log()

  let blockingFound = false
  const allApply = { tickets: [], stories: [], sprints: [], meetings: [], waves: [], apps: [], counters: [] }

  for (const team of teams) {
    const db = team.database_id
    console.log(`━━━ team "${team.name}" (${db}) ━━━`)

    // ── apps ──────────────────────────────────────────────────────────────
    const apps = planApps(db)
    if (apps.totalAppsInDb > 0) {
      console.log(`apps: ${apps.totalAppsInDb} live, ${apps.matched.length}/${APP_ORDER.length} of the given order matched`)
      for (const m of apps.matched.slice(0, 3)) console.log(`   ${m.aRef}  ${m.name} (${m.account})  [${m.appId}]`)
      if (apps.matched.length > 3) console.log(`   … ${apps.matched.length - 3} more, see plan file`)
      if (apps.ambiguous.length) {
        blockingFound = true
        console.log(`   AMBIGUOUS — no confident match, NOT assigned (per instruction, not guessed):`)
        for (const a of apps.ambiguous)
          console.log(
            `     #${a.position} "${a.name}" (account: ${a.account}) — ${a.candidatesFound} candidate(s) found in this team`
          )
      }
      if (apps.extraAppsInDb.length) {
        blockingFound = true
        console.log(`   EXTRA apps in this team's database, not named anywhere in the client's 29-item list:`)
        for (const e of apps.extraAppsInDb)
          console.log(`     "${e.name}" (account: ${e.account_name ?? "none"})  [${e.id}]`)
      }
      writePlanFile(`apps-${db}.json`, apps)
      for (const m of apps.matched)
        allApply.apps.push(`UPDATE apps SET ref = ${sqlStr(m.aRef)} WHERE id = ${sqlStr(m.appId)} AND ref IS NULL;`)
      if (!apps.ambiguous.length) {
        // Only safe to state a target counter value when every position resolved —
        // otherwise "however many apps exist" is itself an open question.
        const target = apps.totalAppsInDb + 1
        allApply.counters.push(
          `INSERT INTO team_ref_counters (kind, next_no) VALUES ('A', ${target})` +
            ` ON CONFLICT(kind) DO UPDATE SET next_no = ${target}; -- next app mints A${String(target).padStart(4, "0")}`
        )
      }
    }

    // ── tickets (reformat) ───────────────────────────────────────────────
    const tickets = planReformat(db, "help", "T", "T")
    if (tickets.totalWithRef > 0) {
      console.log(
        `tickets: ${tickets.totalWithRef} with a ref → ${tickets.clean.length} reformat cleanly, ` +
          `${tickets.collisions.length} colliding group(s) covering ${tickets.collisions.reduce((a, c) => a + c.members.length, 0)} row(s)` +
          (tickets.unparseable.length ? `, ${tickets.unparseable.length} unparseable` : "")
      )
      if (tickets.collisions.length) {
        blockingFound = true
        console.log(`   BLOCKING — a literal reformat collides on idx_help_ref (live UNIQUE index). Sample:`)
        for (const c of tickets.collisions.slice(0, 5))
          console.log(`     ${c.newRef}  ← ${c.members.map((m) => m.oldRef).join(", ")}`)
        if (tickets.collisions.length > 5) console.log(`     … ${tickets.collisions.length - 5} more, see plan file`)
      }
      if (tickets.unparseable.length) {
        blockingFound = true
        console.log(`   UNPARSEABLE refs (do not match "<prefix>-T<digits>"):`)
        for (const u of tickets.unparseable.slice(0, 5)) console.log(`     ${u.id}  ${u.ref}`)
      }
      writePlanFile(`tickets-${db}.json`, tickets)
      // Withheld entirely while this kind has ANY blocking finding for this team.
      if (!tickets.collisions.length && !tickets.unparseable.length) {
        for (const c of tickets.clean)
          allApply.tickets.push(
            `UPDATE help SET ref = ${sqlStr(c.newRef)} WHERE id = ${sqlStr(c.id)} AND ref = ${sqlStr(c.oldRef)};`
          )
      }
    }

    // ── stories (reformat, letter changes S → B) ────────────────────────
    const stories = planReformat(db, "stories", "S", "B")
    if (stories.totalWithRef > 0) {
      console.log(
        `stories: ${stories.totalWithRef} with a ref → ${stories.clean.length} reformat cleanly, ` +
          `${stories.collisions.length} colliding group(s) covering ${stories.collisions.reduce((a, c) => a + c.members.length, 0)} row(s)` +
          (stories.unparseable.length ? `, ${stories.unparseable.length} unparseable` : "")
      )
      if (stories.collisions.length) {
        blockingFound = true
        console.log(`   BLOCKING — a literal reformat collides on idx_stories_ref (live UNIQUE index). Sample:`)
        for (const c of stories.collisions.slice(0, 5))
          console.log(`     ${c.newRef}  ← ${c.members.map((m) => m.oldRef).join(", ")}`)
        if (stories.collisions.length > 5) console.log(`     … ${stories.collisions.length - 5} more, see plan file`)
      }
      writePlanFile(`stories-${db}.json`, stories)
      if (!stories.collisions.length && !stories.unparseable.length) {
        for (const c of stories.clean)
          allApply.stories.push(
            `UPDATE stories SET ref = ${sqlStr(c.newRef)} WHERE id = ${sqlStr(c.id)} AND ref = ${sqlStr(c.oldRef)};`
          )
      }
    }

    // ── sprints / meetings / waves (fresh backfill) ─────────────────────
    const kinds = [
      { table: "sprints", letter: "S", requireAccount: true, bucket: "sprints" },
      { table: "meetings", letter: "M", requireAccount: true, bucket: "meetings" },
      { table: "waves", letter: "W", requireAccount: false, bucket: "waves" },
    ]
    for (const k of kinds) {
      const fresh = planFreshBackfill(db, k.table, k.letter, { requireAccount: k.requireAccount })
      if (fresh.total === 0) continue
      console.log(`${k.table}: ${fresh.total} to number fresh, ${k.letter}0001 … ${k.letter}${String(fresh.total).padStart(4, "0")}`)
      for (const p of fresh.plan.slice(0, 3)) console.log(`   ${p.newRef}  [${p.id}]`)
      if (fresh.plan.length > 3) console.log(`   … ${fresh.plan.length - 3} more, see plan file`)
      writePlanFile(`${k.table}-${db}.json`, fresh)
      for (const p of fresh.plan)
        allApply[k.bucket].push(`UPDATE ${k.table} SET ref = ${sqlStr(p.newRef)} WHERE id = ${sqlStr(p.id)};`)
      const target = fresh.total + 1
      allApply.counters.push(
        `INSERT INTO team_ref_counters (kind, next_no) VALUES ('${k.letter}', ${target})` +
          ` ON CONFLICT(kind) DO UPDATE SET next_no = ${target}; -- next ${k.table} mints ${k.letter}${String(target).padStart(4, "0")}`
      )
    }

    if (APPLY) {
      // Per-database counters share the 'S' letter between story's OLD scheme
      // (never written here) and sprint's NEW one — sprint owns 'S' going
      // forward (0059's ruling), so only sprint's counter line is emitted above.
      const statements = [
        ...allApply.apps,
        ...allApply.tickets,
        ...allApply.stories,
        ...allApply.sprints,
        ...allApply.meetings,
        ...allApply.waves,
        ...allApply.counters,
      ]
      if (statements.length) d1Apply(db, statements)
      // Reset per-team so the next iteration's counters aren't re-applied to a
      // later team's database.
      for (const key of Object.keys(allApply)) allApply[key] = []
    }
  }

  console.log(`\nplan files written to ${OUT_DIR}`)
  if (blockingFound) {
    console.log(
      "\nBLOCKING FINDINGS ABOVE. Nothing for the affected kind was written, in dry run or apply mode.\n" +
        "This needs a human decision before it can proceed — see the script's own header comment for the\n" +
        "two stop conditions found while building this (ticket/story collisions on the live UNIQUE index,\n" +
        "and the two app-list entries that do not match live data)."
    )
  }
  console.log(APPLY ? "\nAPPLIED." : "\nDRY RUN — nothing was written. Re-run with --apply once reviewed.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
