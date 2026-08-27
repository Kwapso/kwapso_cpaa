// THE MIGRATION GATE — refuse to deploy while a team database is behind.
//
//   node scripts/check-team-migrations.mjs staging
//   node scripts/check-team-migrations.mjs production
//
// A PIPELINE GATE, not a Law of the Base: it asks a question about the LIVE
// ESTATE, so it has no RULES.md entry, no registry row and no rule test.
//
// It runs in both deploy chains IMMEDIATELY AFTER TENANCY IS DEPLOYED and before
// any other worker. That position is the whole design and it is not negotiable;
// the section "WHERE IT SITS, AND WHY IT MOVED" below is the reason.
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
// ── WHERE IT SITS, AND WHY IT MOVED (27 Aug 2026, hours after it shipped) ───
//
// It first shipped as the FIRST thing in both deploy chains, ahead of even
// `lang:check`, so that it would fail in a second rather than after a two-minute
// build. That position deadlocked the next schema change, which is every schema
// change from here on:
//
//   · lane/google-scope wrote migration 0058. Local TEAM_MIGRATIONS ends at
//     0058; both live teams read 0057. The gate refused. So far correct.
//   · The remedy said "run the robot". The robot answered HTTP 200,
//     {"teamsChecked":2,"teamsMigrated":0}, and changed nothing.
//   · The gate refused again, identically, forever.
//
// BECAUSE THE ROBOT IS NOT A TOOL, IT IS A DEPLOYED WORKER. `migrateTeams`
// applies `TEAM_MIGRATIONS` AS BUNDLED INTO THE RUNNING TENANCY WORKER. That
// worker was built from main and had never heard of 0058, so it correctly found
// nothing missing and correctly reported success. Teams could not reach 0058
// until a tenancy carrying 0058 was deployed; nothing could be deployed until
// teams reached 0058; and the gate stood in front of the deploy. Closed loop.
//
// The gate had been asking "is the estate current with my working tree?" at a
// moment when the answer NO has two completely different causes and only one
// remedy printed:
//
//   A. the migration is DEPLOYED and not rolled out — the 26-27 Aug incident,
//      the fault this exists for. The estate is broken right now. Refuse.
//   B. the migration is merely WRITTEN — the ordinary state of every branch that
//      adds one. Nothing is broken; the deploy IS the remedy. Refusing here is
//      the deadlock.
//
// Nothing in the core database can tell A from B: `schema_version` records how
// far the robot has carried each team and says nothing about what the deployed
// worker knows. So the fix is not a cleverer question, it is a better MOMENT to
// ask it. Deploying tenancy collapses B into A — once the running worker carries
// the new list, "behind" means one thing and the printed remedy always works.
//
// Hence: lang:check → build → realtime, auth, TENANCY → **this check** → content,
// data-ops, mcp, both gateways → smoke. The gate now guards exactly the workers
// that READ the new columns, which is precisely who broke on the 27th (content's
// sync-lease writer), and the three-phase sequence OPERATIONS.md always described
// in prose — tenancy, then migrate, then the rest — is finally the sequence the
// command actually runs. As a bonus it makes that prose POSSIBLE: taken
// literally, "roll it out first, then deploy" could never work for a new
// migration, because the thing that rolls it out ships inside the deploy.
//
// WHAT THAT COSTS, said plainly: it no longer fails before the build. A deploy
// carrying a new migration now takes two runs — build, three workers, refusal,
// robot, run again. That is a real price and it buys a gate that can always be
// satisfied. A gate that cannot be is one somebody deletes, and a fast failure
// nobody can clear is not faster, it is just earlier.
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
// The three derivations, the waiver rot check and the whole verdict are EXPORTED
// and locked by
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

// ── The verdict ─────────────────────────────────────────────────────────────

/** THE WHOLE DECISION, over rows somebody hands it — so the suite can walk a
 * team from behind to current and watch the answer change, without an estate.
 *
 * Returns `{ code, message }`: 0 and a line to print, or 1 and the refusal.
 */
export function verdict({ envName, origin, db, latest, teams, waivers, today }) {
  const behind = teams.filter((t) => t.schema_version !== latest)

  // The rot check runs BEFORE the verdict. A waiver is a claim about the estate,
  // and a claim that has stopped being true is worse than no claim: it reads as a
  // handled exception while describing something that is not there any more.
  const { problems, waived } = waiverProblems(envName, waivers, behind, today)
  if (problems.length) {
    return {
      code: 1,
      message:
        `MIGRATION WAIVERS out of date (${envName}):\n\n` +
        problems.map((line) => `  • ${line}`).join("\n") +
        `\n\n  They are data in scripts/check-team-migrations.mjs — read its header.`,
    }
  }

  const blocking = behind.filter((t) => !waived.has(t.id))
  if (blocking.length) {
    return {
      code: 1,
      message:
        `TEAM DATABASES ARE BEHIND (${envName}). The workers about to be deployed\n` +
        `may expect tables and columns these teams do not have yet.\n\n` +
        `  latest team-schema migration (this working tree): ${latest}\n` +
        `  (workers/tenancy/src/team-schema.ts, last entry in TEAM_MIGRATIONS)\n\n` +
        blocking
          .map((t) => `  • ${t.name} (${t.id}) is at ${t.schema_version ?? "(no version recorded)"}`)
          .join("\n") +
        `\n\n` +
        `RUN THE MIGRATION ROBOT, then re-run the deploy. It rolls every missing\n` +
        `migration to every ready team and is safe to run again if it half-finishes:\n\n` +
        `  curl -X POST ${origin}/api/tenancy/admin/migrate-teams \\\n` +
        `    -H "x-admin-key: $ADMIN_KEY"\n\n` +
        `IF IT ANSWERS {"teamsMigrated":0} AND NOTHING CHANGES, read this next\n` +
        `paragraph rather than running it again. The robot applies the migration\n` +
        `list bundled into the DEPLOYED tenancy worker, so it cannot roll out a\n` +
        `migration that exists only in your working tree — it looks, finds nothing\n` +
        `missing, and cheerfully reports success. Inside \`npm run deploy:${envName}\`\n` +
        `that cannot happen: this check runs AFTER tenancy is deployed, so the\n` +
        `robot always knows every migration named above. Running this check BY HAND\n` +
        `before a deploy can hit it, and the answer is to deploy rather than to\n` +
        `keep pressing: \`npm run deploy:${envName}\` sequences the two correctly.\n\n` +
        `If a team cannot be migrated at all, do NOT switch this off — read the\n` +
        `header of scripts/check-team-migrations.mjs: deactivate the team, or add\n` +
        `a dated waiver with a reason.`,
    }
  }

  const alsoWaived = waived.size ? `, ${waived.size} waived` : ""
  return {
    code: 0,
    message: `OK: ${teams.length} live team${teams.length === 1 ? "" : "s"} in ${db} at ${latest}${alsoWaived}.`,
  }
}

// ── The run ─────────────────────────────────────────────────────────────────

function main(argv) {
  // THE ACCOUNT GUARD — the same guard, and the same reason, as `reset-all.mjs`
  // and `backup.mjs`: no worker pins `account_id`, so wrangler acts on whatever
  // account the machine is logged into, and on the machine this was written for
  // that is a DIFFERENT client's account. It is deliberately hard rather than a
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

  const { code, message } = verdict({
    envName,
    origin: target.origin,
    db: target.db,
    latest: latestTeamMigration(),
    teams: query(
      target.db,
      `SELECT id, name, schema_version FROM teams ${robotTeamFence()} ORDER BY name`
    ),
    waivers: MIGRATION_WAIVERS,
    today: new Date().toISOString().slice(0, 10),
  })
  ;(code === 0 ? console.log : console.error)(message)
  return code
}

// Only when RUN, never when imported — see the note above the derivations.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
