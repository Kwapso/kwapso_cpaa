// THE MIGRATION GATE — refuse to deploy while a team database is behind.
//
//   node scripts/check-team-migrations.mjs staging
//   node scripts/check-team-migrations.mjs production
//
// A PIPELINE GATE, not a Law of the Base: it asks a question about the LIVE
// ESTATE, so it has no RULES.md entry, no registry row and no rule test. It is
// modelled on `lang:check`, which is the other check both deploy commands open
// with, and it opens first for the same reason that one does — it is a second's
// read and it must fail BEFORE the two-minute build, not after it.
//
// ── WHY THIS EXISTS (26-27 Aug 2026) ────────────────────────────────────────
//
// Migration `0057_one_control_where_there_were_two` created a new per-team table
// (`sync_leases`). The code that writes to it went to staging and production
// WITHOUT the migration being rolled out to the team databases that already
// existed. Every "Bring it in" press then reached a table that was not there and
// came back a 500.
//
// `npm run check` was green the whole time and could never have caught it. The
// test suite builds its database by replaying the WHOLE of `TEAM_MIGRATIONS` on
// every run, so the schema it tests against is always current by construction.
// Only an environment with a HISTORY — a database built months ago and migrated
// forward since — can be behind. That is not a property of the source, so no
// test that reads the source can see it.
//
// OPERATIONS.md already said "roll it out with migrate-teams first, then deploy".
// It said it in prose, and prose does not fail a build.
//
// ── WHAT IT ASKS ────────────────────────────────────────────────────────────
//
// The core database's `teams.schema_version` is what the migration robot WRITES
// when it finishes a team (`migrateTeams`, workers/tenancy/src/routes/admin.ts),
// so it is the estate's own record of how far each team has been carried. This
// reads that column and compares it with the last entry in `TEAM_MIGRATIONS`.
//
// Both halves are DERIVED and neither is typed here:
//
//   • the LATEST version is parsed out of `workers/tenancy/src/team-schema.ts`
//     itself, off the syntax tree, not matched with a regex and never copied.
//     A copied version number in this file would be a gate that goes green
//     while the estate is behind — the exact failure it exists to catch, wearing
//     a green tick. (README/OPERATIONS both carry the scar: the sentence naming
//     the last migration has drifted twice.)
//   • WHICH TEAMS COUNT is the robot's own WHERE clause, lifted out of
//     `migrateTeams`. The gate and the robot must agree about the population or
//     the gate refuses over teams the remedy provably cannot fix.
//
// It reaches the core database only. It does NOT open the team databases, and
// that is deliberate: those go through the D1 REST door on `CF_D1_TOKEN`, which
// is the credential that was rotated on 27 Aug — a gate that needs the broken
// thing to tell you something is broken is not a gate.
//
// ── THE TRAP THIS IS BUILT AROUND ───────────────────────────────────────────
//
// A naive "any team behind → refuse" would have blocked every deploy on the
// morning of 27 Aug. A leftover "Smoke team" was stranded at an old version and
// could not be migrated at all. A gate that cannot be satisfied is a gate
// somebody deletes, and then the estate has neither the gate nor the prose.
//
// So the population is the robot's: `db_status = 'ready' AND deactivated_at IS
// NULL`. A team the robot SKIPS cannot be brought forward by the remedy, so
// refusing over it would be refusing over something nobody can fix. (Staging
// today holds exactly that team — a third row, `db_status = 'failed'`,
// `schema_version` null. It is invisible to the robot and it is invisible here.)
//
// ── AND WHEN A COUNTED TEAM GENUINELY CANNOT BE MIGRATED ────────────────────
//
// The case above is the one that has actually happened, and skipping it costs
// nothing, because a `failed` team serves nobody. The harder case is a team that
// IS `ready`, IS live, and still will not go forward: its database has been
// deleted underneath us, or one migration hits data only that team has.
//
// Three ways out were considered. Written down because the wrong one is the
// obvious one:
//
//   1. AN ENV-VAR ESCAPE HATCH (`SKIP_MIGRATION_GATE=1`). REFUSED. It is the
//      cheapest to write and the only one that can switch the gate off forever
//      without leaving a mark: it goes into a shell profile or a CI variable
//      during one bad afternoon and nothing ever turns it back on. A gate you
//      can silence invisibly is prose again, with extra steps.
//
//   2. DEACTIVATE THE TEAM — the first answer, and it needs nothing new. A team
//      whose database cannot be migrated is a team the app cannot serve
//      correctly, and saying so in the row is the honest record rather than a
//      workaround. `deactivated_at` takes it out of the robot's population and
//      out of this gate at the same moment, because both read the same fence.
//      Deactivate, never delete, so it is reversible the day the database is.
//
//   3. A DATED WAIVER — the second answer, for a team that must stay live while
//      somebody works out why it is stuck. `MIGRATION_WAIVERS` below, one entry
//      per team, each carrying the version it is stuck at, WHY, and an EXPIRY.
//      It is the shape this repo already uses for every exemption list
//      (SCREEN_WIDTH_EXEMPT, PALETTE_LITERAL_OK, UNWALKED_OK): data, with a
//      reason each, rot-checked so it can only shrink. A waiver whose team is no
//      longer behind turns this red. A waiver whose stated version no longer
//      matches turns this red. A waiver past its expiry turns this red. So the
//      deploy is never stranded, and the waiver is never permanent: renewing it
//      is an edit somebody has to justify in a diff, which is the difference
//      between an exception and a hole.
//
// The list is empty today, and that is the point of it.
//
// The three derivations and the waiver rot check are EXPORTED and locked by
// web/test/migration-gate.test.ts, which runs in `npm run check` and touches no
// network. Everything this gate promises was once a manual proof somebody ran on
// an afternoon; a proof nobody can re-run is a proof that decays.

import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The core database + the gateway origin per environment. The database names
 * are the same pair `backup.mjs` and `reset-all.mjs` carry; the origins are the
 * tenancy worker's own `PUBLIC_APP_URL` (workers/tenancy/wrangler.jsonc,
 * top-level = production, `env.staging` = staging). They appear here only in the
 * remedy line, so a drift here misprints a URL — it can never turn a red run
 * green, which is why this one is a list and the version is not. */
export const ENVIRONMENTS = {
  staging: { db: "kwapso-core-staging", origin: "https://agency-staging.kwapso.app" },
  production: { db: "kwapso-core", origin: "https://agency.kwapso.app" },
}

/**
 * Teams allowed to be behind, each until a stated date. Read the header before
 * adding one — options 2 and 3 — and never add one without the `why` and the
 * `until`. Rot-checked below: an entry that no longer describes something true
 * fails this check rather than sitting here.
 *
 * @type {{ env: "staging"|"production", teamId: string, name: string,
 *          stuckAt: string|null, until: string, why: string }[]}
 */
export const MIGRATION_WAIVERS = [
  // {
  //   env: "staging",
  //   teamId: "01M0THFJC37525M1WD1PPWTPBY",
  //   name: "Smoke team",
  //   stuckAt: "0055_transcript_gives_up",
  //   until: "2026-09-30",
  //   why: "Its database answers nothing over the REST door; ticket KW-000.",
  // },
]


// ── The derivations ─────────────────────────────────────────────────────────
//
// Exported, and the runner below only fires when this file is EXECUTED — so
// web/test/migration-gate.test.ts can call them without reaching the network or
// tripping the account guard. Every proof in this file's history was a manual
// one somebody ran once; that suite is the part that survives.

/** Parse TypeScript source into a syntax tree, for the two derivations below.
 * They take SOURCE rather than a path so the suite can feed them a crafted file
 * — including the one that reads like the real thing and is not. */
function parse(source) {
  return ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true)
}

const read = (relPath) => readFileSync(join(ROOT, relPath), "utf8")

/** THE LATEST TEAM-SCHEMA VERSION, read off `TEAM_MIGRATIONS` itself.
 *
 * Off the syntax tree rather than a regex: `version: "…"` appears once per
 * migration and the answer is the LAST one in that array, which a text match
 * cannot promise — a `version:` in a comment, a doc block or some later constant
 * would be picked up just as happily. Both wrong answers are bad and they are
 * bad in different ways: too old is a gate that goes green while the estate is
 * behind, too new is a gate that goes red for a reason nobody can act on. (The
 * planning session met the second one by accident on 27 Aug 2026 — a mutation
 * pasted PAST the array's close, which a regex would have matched and this
 * correctly did not see.) Anything unexpected in the shape throws; there is no
 * fallback, because a fallback is how a gate goes quietly green. */
export function latestTeamMigration() {
  return latestMigrationIn(read("workers/tenancy/src/team-schema.ts"))
}

/** @see latestTeamMigration — the same derivation, over source you hand it. */
export function latestMigrationIn(source) {
  const tree = parse(source)
  let array = null
  ts.forEachChild(tree, (node) => {
    if (!ts.isVariableStatement(node)) return
    for (const decl of node.declarationList.declarations) {
      if (decl.name.getText(tree) !== "TEAM_MIGRATIONS") continue
      let init = decl.initializer
      // `[...] as const` / `satisfies …` wrap the literal without changing it.
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression
      if (init && ts.isArrayLiteralExpression(init)) array = init
    }
  })
  if (!array || array.elements.length === 0) {
    throw new Error(
      "Could not read TEAM_MIGRATIONS as an array literal in workers/tenancy/src/team-schema.ts."
    )
  }
  const last = array.elements[array.elements.length - 1]
  if (!ts.isObjectLiteralExpression(last)) {
    throw new Error("The last TEAM_MIGRATIONS entry is not an object literal.")
  }
  for (const prop of last.properties) {
    if (!ts.isPropertyAssignment(prop) || prop.name.getText(tree) !== "version") continue
    if (!ts.isStringLiteral(prop.initializer)) break
    return prop.initializer.text
  }
  throw new Error("The last TEAM_MIGRATIONS entry has no literal `version` string.")
}

/** WHICH TEAMS THE ROBOT COUNTS, lifted out of the robot.
 *
 * `migrateTeams` chooses its population with a WHERE clause, and this gate has
 * to ask about exactly that population: a gate over teams the remedy skips is a
 * gate nobody can satisfy, which is the whole trap this script is built around.
 * So the clause is read from the handler's own SQL rather than copied into a
 * second sentence that can drift away from the first. */
export function robotTeamFence() {
  return robotFenceIn(read("workers/tenancy/src/routes/admin.ts"))
}

/** @see robotTeamFence — the same derivation, over source you hand it. */
export function robotFenceIn(source) {
  const tree = parse(source)
  let clause = null
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const at = node.text.indexOf("FROM teams WHERE ")
      if (at > -1 && node.text.includes("schema_version")) {
        clause = node.text.slice(at + "FROM teams ".length).trim()
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!clause) {
    throw new Error(
      "Could not read the team fence out of migrateTeams (workers/tenancy/src/routes/admin.ts).\n" +
        "It selects `… FROM teams WHERE …` with schema_version; if that changed shape, teach this function the new one."
    )
  }
  return clause
}

/** THE WAIVER ROT CHECK, and the env filter with it — one pure seam so the four
 * ways a waiver can be wrong are testable without an estate to point at.
 *
 * `behind` is the rows that are actually behind, `today` an ISO date. Returns
 * the problems to refuse over and the teams a still-honest waiver excuses. */
export function waiverProblems(envName, allWaivers, behind, today) {
  const waivers = allWaivers.filter((w) => w.env === envName)
  const problems = []
  const waived = new Set()
  for (const w of waivers) {
    const row = behind.find((t) => t.id === w.teamId)
    if (!row) {
      problems.push(`${w.teamId} (${w.name}) — waived, but it is not behind. Delete the waiver.`)
    } else if (row.schema_version !== w.stuckAt) {
      problems.push(
        `${w.teamId} (${w.name}) — the waiver says it is stuck at ${w.stuckAt ?? "(none)"}, ` +
          `but it reads ${row.schema_version ?? "(none)"}. Correct or delete the waiver.`
      )
    } else if (w.until < today) {
      problems.push(
        `${w.teamId} (${w.name}) — the waiver expired on ${w.until}. ` +
          `Migrate it, deactivate it, or renew the waiver with a fresh reason.`
      )
    } else {
      waived.add(w.teamId)
    }
  }
  return { problems, waived }
}

/** Read rows out of a core database. A failure here is a refusal, never a pass:
 * a check that cannot see the estate knows nothing about it. */
function query(db, sql) {
  let out
  try {
    out = execSync(
      `npx wrangler d1 execute ${db} --remote --json --command ${JSON.stringify(sql)}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], cwd: ROOT }
    )
  } catch (err) {
    throw new Error(
      `Could not read ${db}.\n${(err.stderr || err.stdout || err.message || "").toString().trim()}`
    )
  }
  const start = out.indexOf("[")
  if (start < 0) throw new Error(`Could not read ${db}: wrangler returned no JSON.\n${out.trim()}`)
  return JSON.parse(out.slice(start))[0]?.results ?? []
}

// ── The run ─────────────────────────────────────────────────────────────────

function main(argv) {
  // THE ACCOUNT GUARD — the same guard, and the same reason, as `reset-all.mjs`
  // and `backup.mjs`: no worker pins `account_id`, so wrangler acts on whatever
  // account the machine is logged into, and on the machine this was written for
  // that is a DIFFERENT client's account. Being the first thing in the deploy,
  // this refusal also catches "you are about to ship eight workers to the wrong
  // account" before the build starts. It is deliberately hard rather than a
  // warning: every deploy here runs through `cf-exec`, so the correct path is
  // never the one that trips it.
  const KWAPSO_ACCOUNT_ID = "b5bb3d84a59c029ea5e0fe164dab1cf7"
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== KWAPSO_ACCOUNT_ID) {
    console.error(
      `Refusing to run: CLOUDFLARE_ACCOUNT_ID is ${process.env.CLOUDFLARE_ACCOUNT_ID ?? "unset"},\n` +
        `and this script only ever reads ${KWAPSO_ACCOUNT_ID}.\n\n` +
        `Run it through cf-exec, or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.`
    )
    return 2
  }

  const envName = argv[0]
  const target = ENVIRONMENTS[envName]
  if (!target) {
    console.error("Usage: node scripts/check-team-migrations.mjs <staging|production>")
    return 2
  }

  const latest = latestTeamMigration()
  const teams = query(
    target.db,
    `SELECT id, name, schema_version FROM teams ${robotTeamFence()} ORDER BY name`
  )
  const behind = teams.filter((t) => t.schema_version !== latest)

  // The rot check runs BEFORE the verdict. A waiver is a claim about the estate,
  // and a claim that has stopped being true is worse than no claim: it reads as a
  // handled exception while describing something that is not there any more.
  const today = new Date().toISOString().slice(0, 10)
  const { problems, waived } = waiverProblems(envName, MIGRATION_WAIVERS, behind, today)
  if (problems.length) {
    console.error(`MIGRATION WAIVERS out of date (${envName}):\n`)
    for (const line of problems) console.error(`  • ${line}`)
    console.error(`\n  They are data in scripts/check-team-migrations.mjs — read its header.`)
    return 1
  }

  const blocking = behind.filter((t) => !waived.has(t.id))
  if (blocking.length) {
    console.error(
      `TEAM DATABASES ARE BEHIND (${envName}). The code you are about to deploy may\n` +
        `expect tables and columns these teams do not have yet.\n\n` +
        `  latest team-schema migration: ${latest}\n` +
        `  (workers/tenancy/src/team-schema.ts, last entry in TEAM_MIGRATIONS)\n`
    )
    for (const t of blocking) {
      console.error(`  • ${t.name} (${t.id}) is at ${t.schema_version ?? "(no version recorded)"}`)
    }
    console.error(
      `\nRUN THIS FIRST — the migration robot, which rolls every missing migration\n` +
        `to every ready team, and is safe to run again if it half-finishes:\n\n` +
        `  curl -X POST ${target.origin}/api/tenancy/admin/migrate-teams \\\n` +
        `    -H "x-admin-key: $ADMIN_KEY"\n\n` +
        `Then re-run this check. If a team cannot be migrated at all, do NOT switch\n` +
        `this off — read the header of scripts/check-team-migrations.mjs: deactivate\n` +
        `the team, or add a dated waiver with a reason.`
    )
    return 1
  }

  const alsoWaived = waived.size ? `, ${waived.size} waived` : ""
  console.log(
    `OK: ${teams.length} live team${teams.length === 1 ? "" : "s"} in ${target.db} at ${latest}${alsoWaived}.`
  )
  return 0
}

// Only when RUN, never when imported — see the note above the derivations.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
