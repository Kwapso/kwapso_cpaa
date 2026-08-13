// THE SCREENS THE MIGRATION LEFT EMPTY — process maps, the delivery method and
// the marketing pipeline — filled so the app reads like a working system.
//
//   TEST_LOGIN_KEY=… node scripts/seed-the-quiet-screens.mjs staging
//
// WHERE EACH ONE'S CONTENT COMES FROM, because they are not the same and the
// difference matters:
//
//   • DELIVERY METHOD and MARKETING are REAL — Glide's `program` and `content`
//     tables, carried through glide/normalised.json like everything else. They
//     were deferred in the first pass because no module held them; both do now.
//
//   • PROCESS MAPS ARE NOT REAL, and this file says so out loud in the place a
//     reader will see it. Glide never held a process map, so there is nothing to
//     import: the maps below are written FROM the apps' own descriptions — which
//     say, in the client's own words, what each system replaced ("Excel
//     spreadsheets", "WhatsApp groups", "Post-its and Outlook flags", "paper") —
//     and the TIMES are first-pass estimates, not measurements.
//
//     That matters more here than anywhere else in the app: a process map's
//     times drive the savings figure, and the savings figure is shown to the
//     CLIENT on their own portal whether or not price visibility is on. So every
//     map carries a line in its description saying the times are unconfirmed and
//     must be agreed with the client before anybody quotes them. The app's own
//     caption already says the times are agreed estimates; this is the sentence
//     that keeps that true while they are not yet agreed.
//
// STAGING ONLY by default, and production refuses the sign-in door anyway.

import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { makeApi, timedFetch } from "./lib/api.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TARGETS = {
  staging: { base: "https://agency-staging.kwapso.app", label: "staging" },
  production: { base: "https://agency.kwapso.app", label: "PRODUCTION" },
}
const target = process.argv[2]
if (!TARGETS[target]) {
  console.error("Usage: node scripts/seed-the-quiet-screens.mjs <staging|production>")
  process.exit(2)
}
const BASE = TARGETS[target].base
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "alaap@kwapso.com"
const TEST_LOGIN_KEY = process.env.TEST_LOGIN_KEY ?? ""
if (!TEST_LOGIN_KEY) {
  console.error("Stopped: export TEST_LOGIN_KEY (it lives in ~/.config/kwapso/keys.env).")
  process.exit(1)
}

const SOURCE = resolve(ROOT, "glide/normalised.json")
if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}. Run \`node scripts/glide-transform.mjs\` first.`)
  process.exit(1)
}
const history = JSON.parse(readFileSync(SOURCE, "utf8"))

const api = makeApi(BASE)
const post = (path, payload, cookie) =>
  api(path, { method: "POST", body: JSON.stringify(payload ?? {}) }, cookie)

let failures = 0
const step = (t) => console.log(`\n${t}`)
const say = (verb, what) => console.log(`  ${verb.padEnd(8)} ${what}`)
const must = (res, what) => {
  if (!res.ok) {
    console.error(`\nStopped: ${what} — ${res.status} ${res.body?.message ?? ""}`)
    process.exit(1)
  }
  return res.body
}

/** The sentence every seeded map carries, where a person reading the map sees
 * it. Written once so the twelve maps cannot say it twelve slightly different
 * ways — and so removing the caveat is one edit somebody has to mean. */
const UNCONFIRMED =
  "The times on this map are a first pass, written from what this system replaced — " +
  "they have NOT been measured or agreed with the client yet. Confirm them before " +
  "the saving is quoted to anybody."

// ── the maps ─────────────────────────────────────────────────────────────────
//
// `before` and `after` are seconds per run; `perMonth` is how often it happens.
// `after: 0` means the step no longer happens at all — the app took the whole job
// away, and the engine goes on counting its time as a saving, which is the point.

const MAPS = [
  {
    app: "CONFIA",
    name: "Taking on a new insurance client",
    baseline: "Before CONFIA — paper files and scattered systems",
    steps: [
      ["Collect the client's documents by email", 1800, 300, 40],
      ["Type the client's details into the system", 900, 120, 40],
      ["File the policy documents where they can be found again", 600, 60, 40],
      ["Chase the paperwork that didn't arrive", 1200, 240, 25],
      ["Set a reminder for the renewal date", 300, 0, 40],
    ],
  },
  {
    app: "CONFIA",
    name: "Recording a damage case",
    baseline: "Before CONFIA — a phone call and a paper file",
    steps: [
      ["Take the report by phone and write it down", 900, 420, 30],
      ["Find which policy it belongs to", 600, 60, 30],
      ["Assemble the file for the insurer", 1500, 360, 30],
      ["Keep track of what stage the case is at", 900, 120, 30],
    ],
  },
  {
    app: "Assecuranz",
    name: "Changing a client's address or bank details",
    baseline: "Before the broker system — Outlook, Excel and a Post-it",
    steps: [
      ["Read the request in Outlook and work out what changed", 300, 120, 60],
      ["Enter the change in aB Agenta by hand", 900, 180, 60],
      ["Write to the insurer with the new details", 600, 120, 60],
      ["Flag it in Outlook and remember to check it went through", 420, 0, 60],
    ],
  },
  {
    app: "Assecuranz",
    name: "Onboarding a new broker client",
    baseline: "Before the broker system — post, Word templates and paper",
    steps: [
      ["Send the power of attorney out for signature", 1800, 300, 15],
      ["Chase the signature until it comes back", 1500, 300, 15],
      ["Type the existing contracts into the system", 2400, 600, 15],
      ["Check nothing has been left behind", 900, 180, 15],
    ],
  },
  {
    app: "Ontime Fuhrpark",
    name: "Handing a vehicle to a new driver",
    baseline: "Before ONTIME — one shared Excel file",
    steps: [
      ["Find the vehicle's row in the shared spreadsheet", 420, 30, 20],
      ["Write the handover on paper and scan it", 900, 180, 20],
      ["Update who is driving what", 300, 45, 20],
      ["Remember to check the next inspection date", 600, 0, 20],
    ],
  },
  {
    app: "Ontime Fuhrpark",
    name: "Recording damage to a vehicle",
    baseline: "Before ONTIME — photos in WhatsApp, notes in a folder",
    steps: [
      ["Collect the photos out of WhatsApp", 600, 120, 12],
      ["Write up the damage report", 1200, 300, 12],
      ["Send the report to the insurer", 600, 120, 12],
      ["Work out who was driving, and when", 1800, 60, 12],
    ],
  },
  {
    app: "AWS",
    name: "Planning a week of installations",
    baseline: "Before the AWS app — order PDFs and a whiteboard",
    steps: [
      ["Read the incoming order PDFs", 1800, 600, 20],
      ["Assign the crew, the vehicle and the warehouse", 2400, 600, 20],
      ["Check the site's minimum notice period", 600, 60, 20],
      ["Tell each crew what they are doing", 900, 120, 20],
    ],
  },
  {
    app: "AWS",
    name: "Documenting a finished installation",
    baseline: "Before the AWS app — photos by email, PDFs by hand",
    steps: [
      ["Collect the crew's photos", 900, 120, 60],
      ["Sort them into the right categories", 1200, 180, 60],
      ["Build the photo documentation PDF", 1800, 240, 60],
      ["Send it to the customer", 300, 60, 60],
    ],
  },
  {
    app: "FluClinic",
    name: "Issuing vouchers to a pharmacy",
    baseline: "Before FluClinic — email requests and a spreadsheet",
    steps: [
      ["Take the pharmacy's request by email", 600, 120, 80],
      ["Check what they are entitled to", 900, 60, 80],
      ["Issue the vouchers", 1200, 180, 80],
      ["Record what was issued and to whom", 600, 30, 80],
    ],
  },
  {
    app: "Padelbase",
    name: "Organising a tournament",
    baseline: "Before Padelbase — WhatsApp groups and Excel",
    steps: [
      ["Collect the entries out of WhatsApp", 2400, 300, 8],
      ["Build the draw in a spreadsheet", 3600, 600, 8],
      ["Chase the entry payments", 1800, 420, 8],
      ["Publish the schedule to the players", 900, 120, 8],
    ],
  },
  {
    app: "HORST",
    name: "Placing a candidate",
    baseline: "Before HORST — spreadsheets, email and disconnected tools",
    steps: [
      ["Read the CV and key the details in", 1800, 240, 50],
      ["Match the candidate to open positions", 1500, 180, 50],
      ["Qualify them by phone", 1200, 900, 50],
      ["Push the placement through to Zvoove", 900, 120, 50],
    ],
  },
  {
    app: "S4Y Office",
    name: "Completing a vehicle safety check",
    baseline: "Before S4Y — a paper checklist and a drive back to the office",
    steps: [
      ["Fill in the paper checklist", 900, 240, 100],
      ["Drive the paperwork back to the office", 1800, 0, 100],
      ["File it where it can be found again", 300, 15, 100],
      ["Report a defect that was found", 900, 180, 25],
    ],
  },
]

// ── sign in ──────────────────────────────────────────────────────────────────

async function signIn(email) {
  const start = await api("/api/auth/admin/test-login", {
    method: "POST",
    headers: { "x-admin-key": TEST_LOGIN_KEY },
    body: JSON.stringify({ email }),
  })
  if (!start.ok) {
    console.error(`Stopped: couldn't mint a login code for ${email} — ${start.status} ${start.body?.message ?? ""}`)
    process.exit(1)
  }
  const verify = await timedFetch(`${BASE}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: start.body.code }),
  })
  const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie.startsWith("kwapso_session=")) {
    console.error(`Stopped: ${email} couldn't sign in (${verify.status}).`)
    process.exit(1)
  }
  return cookie
}

async function allPages(path, key, cookie) {
  const rows = []
  let cursor = null
  for (let page = 0; page < 40; page++) {
    const sep = path.includes("?") ? "&" : "?"
    const url = cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path
    const body = must(await api(url, {}, cookie), `reading ${path}`)
    rows.push(...(body[key] ?? []))
    if (!body.hasMore || !body.nextCursor) return rows
    cursor = body.nextCursor
  }
  throw new Error(`${path}: more than 40 pages — refusing to treat a short read as complete`)
}

console.log(`\nFilling the quiet screens on ${TARGETS[target].label} (${BASE})`)
const cookie = await signIn(OWNER_EMAIL)

// ── 1 · the delivery method — REAL, out of Glide's `program` table ────────────

step("Delivery method")
{
  const PROGRAM = { name: "Name", german: "jncW0", description: "Ua5qn", sequence: "IlH09" }
  const raw = existsSync(resolve(ROOT, "glide/data/agency.program.json"))
    ? JSON.parse(readFileSync(resolve(ROOT, "glide/data/agency.program.json"), "utf8")).rows ?? []
    : []
  const existing = new Map(
    (must(await api("/api/content/delivery/programs", {}, cookie), "reading the programmes").programs ?? []).map(
      (p) => [p.name, p]
    )
  )
  for (const r of raw) {
    const name = String(r[PROGRAM.name] ?? "").trim()
    if (!name) continue
    if (existing.has(name)) {
      say("reused", name)
      continue
    }
    const german = String(r[PROGRAM.german] ?? "").trim()
    const desc = String(r[PROGRAM.description] ?? "").trim()
    must(
      await post(
        "/api/content/delivery/programs",
        {
          name,
          description: [desc, german && `Known to German-speaking clients as “${german}”.`].filter(Boolean).join("\n\n") || undefined,
          sequence: Number.isFinite(Number(r[PROGRAM.sequence])) ? Number(r[PROGRAM.sequence]) : undefined,
        },
        cookie
      ),
      `adding the programme ${name}`
    )
    say("created", name)
  }
}

// ── 2 · marketing — REAL, the Glide content that never became an article ──────

step("Marketing")
{
  const MARKETING_LIMIT = 60
  const existing = new Set(
    (must(await api("/api/content/marketing", {}, cookie), "reading the marketing list").posts ?? []).map((p) => p.title)
  )
  // The articles already in Learning are the ones WITH a body; what is left is
  // the pipeline — ideas, drafts and posts that went out on a channel.
  const inLearning = new Set(history.learning.filter((a) => a.body).slice(0, 40).map((a) => a.title))
  const posts = history.learning
    .filter((a) => !inLearning.has(a.title))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, MARKETING_LIMIT)
  let made = 0
  for (const p of posts) {
    if (existing.has(p.title)) continue
    const res = await post(
      "/api/content/marketing",
      {
        title: p.title,
        channel: p.category ?? undefined,
        status: p.publicationState ?? undefined,
        summary: p.unhoused?.hashtags ?? undefined,
        body: p.body ?? undefined,
        link: p.contentLink ?? undefined,
        // A DAY, not a moment. The door takes YYYY-MM-DD and refuses a full
        // timestamp — which is right: a post goes out on a day, and storing the
        // hour would invite a screen to show one that means nothing.
        publishedOn: p.publishedAt ? String(p.publishedAt).slice(0, 10) : undefined,
      },
      cookie
    )
    if (!res.ok) {
      console.log(`  FAILED   ${p.title.slice(0, 50)} — ${res.status} ${res.body?.message ?? ""}`)
      failures++
      continue
    }
    made++
  }
  say("created", `${made} posts (of ${history.learning.length} pieces of content in the history)`)
}

// ── 2b · the brand library — REAL rows, still pointing at their own files ─────
//
// A brand asset is a name, a category and a FILE, and the file can be either
// something we host or a link (see brand-assets.ts). Glide's 74 rows carry a
// live URL each, and a sample of eight all answered 200 — so the library is
// seeded as LINKS rather than by moving 74 objects into our own storage.
//
// That is a deliberate half-measure and worth saying: while these point at
// Glide, the library is only as durable as somebody else's bucket. Moving the
// bytes is scripts/glide-to-r2.mjs's job, and until it runs the pictures are
// borrowed, not owned.

step("Brand library")
{
  const BRAND = { name: "Name", category: "bnMiZ", file: "am2b4" }
  const raw = existsSync(resolve(ROOT, "glide/data/agency.branding.json"))
    ? JSON.parse(readFileSync(resolve(ROOT, "glide/data/agency.branding.json"), "utf8")).rows ?? []
    : []
  const existing = new Set(
    (must(await api("/api/content/brand-assets", {}, cookie), "reading the brand library").assets ?? []).map((a) => a.name)
  )
  let made = 0, skipped = 0
  for (const r of raw) {
    const name = String(r[BRAND.name] ?? "").trim()
    const fileUrl = String(r[BRAND.file] ?? "").trim()
    if (!name) continue
    // An asset with no file is a row describing a picture nobody can look at.
    if (!fileUrl) { skipped++; continue }
    if (existing.has(name)) continue
    const res = await post(
      "/api/content/brand-assets",
      {
        name,
        category: String(r[BRAND.category] ?? "").trim() || undefined,
        fileUrl,
        description: "Carried over from the old app. The file is still hosted there, not by us.",
      },
      cookie
    )
    if (!res.ok) {
      console.log(`  FAILED   ${name} — ${res.status} ${res.body?.message ?? ""}`)
      failures++
      continue
    }
    made++
  }
  say("created", `${made} assets${skipped ? ` (${skipped} skipped — no file on the row)` : ""}`)
}

// ── 3 · process maps — NOT real, and they say so ──────────────────────────────

step("Process maps")
{
  const apps = must(await api("/api/tenancy/apps", {}, cookie), "reading the apps").apps ?? []
  const appByName = new Map(apps.map((a) => [a.name, a]))
  const existing = new Map((await allPages("/api/tenancy/processes", "processes", cookie)).map((p) => [p.name, p]))

  for (const map of MAPS) {
    const app = appByName.get(map.app)
    if (!app) {
      console.log(`  skipped  ${map.name} — no app called “${map.app}” on this environment`)
      continue
    }
    let processId = existing.get(map.name)?.id

    if (!processId) {
      // 1 · The map, and with it version 1 — which IS the baseline, always.
      const made = must(
        await post(
          "/api/tenancy/processes",
          {
            appId: app.id,
            name: map.name,
            description: `How this is done on ${map.app}, and how it was done before.\n\n${UNCONFIRMED}`,
            baselineLabel: map.baseline,
          },
          cookie
        ),
        `mapping ${map.name}`
      )
      processId = made.process?.id ?? made.id
      if (!processId) {
        console.error(`\nStopped: mapped ${map.name} but the door returned no id.`)
        process.exit(1)
      }

      // 2 · The steps, with the times AS THEY WERE BEFORE. These are the baseline.
      for (const [i, [name, before, , perMonth]] of map.steps.entries())
        must(
          await post(
            "/api/tenancy/processes/steps",
            { processId, name, secondsPerRun: before, runsPerMonth: perMonth, position: i + 1 },
            cookie
          ),
          `adding the step “${name}”`
        )

      // 3 · Cut version 2. The baseline is now frozen and the steps travel forward
      //     with their keys, which is what makes the next move a subtraction.
      must(
        await post("/api/tenancy/processes/versions", { processId, label: `After ${map.app}` }, cookie),
        `cutting a version of ${map.name}`
      )
      say("created", `${map.name} — ${map.steps.length} steps, ${map.app}`)
    }

    // 4 · The times AS THEY ARE NOW — run whether the map was just made or was
    //     already there. A map whose two versions still hold the SAME times shows
    //     a saving of zero, which is what an earlier run of this script left
    //     behind: it read the steps off the wrong door, found none, and skipped
    //     the whole of this. Converging on the right state beats skipping.
    //
    //     The steps live on the DETAIL door; the list door carries a count and no
    //     rows, which is the shape that misled the first version.
    const detail = must(
      await api(`/api/tenancy/processes/detail?id=${encodeURIComponent(processId)}`, {}, cookie),
      "re-reading the map"
    )
    const steps = detail.steps ?? detail.process?.steps ?? []
    if (!steps.length) {
      console.log(`  (no steps came back for “${map.name}” — the detail door's shape has moved)`)
      failures++
      continue
    }
    let moved = 0
    for (const [name, , after, perMonth] of map.steps) {
      const row = steps.find((s) => s.name === name)
      if (!row) {
        console.log(`  (couldn't find the step “${name}” to bring up to date)`)
        failures++
        continue
      }
      // A step that already reads as it should needs no write — that is what
      // makes a second run quiet rather than a second round of edits.
      if (after === 0) {
        if (row.removedAt) continue
        must(await post("/api/tenancy/processes/steps/remove", { id: row.id }, cookie), `retiring “${name}”`)
        moved++
        continue
      }
      if (row.secondsPerRun === after && row.runsPerMonth === perMonth) continue
      must(
        await post(
          "/api/tenancy/processes/steps/update",
          { id: row.id, name, secondsPerRun: after, runsPerMonth: perMonth },
          cookie
        ),
        `bringing “${name}” up to date`
      )
      moved++
    }
    if (moved) say("updated", `${map.name} — ${moved} step(s) brought up to date`)
  }
}

// ── 4 · did it actually produce a saving? ─────────────────────────────────────

step("Checking the savings add up")
{
  const view = must(await api("/api/tenancy/value", {}, cookie), "reading the value")
  const hours = Math.round((view.savedSecondsPerMonth ?? 0) / 3600)
  const check = (label, ok, detail = "") => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`)
    if (!ok) failures++
  }
  check("the value screen reports a saving at all", (view.savedSecondsPerMonth ?? 0) > 0, `${view.savedSecondsPerMonth}s`)
  check("it names the apps the saving came from", (view.apps ?? []).length > 0)
  check("and the caption that makes it honest rides with it", Boolean(view.caption))
  // Each app's figure is the sum of its own processes; each process the sum of
  // its steps. If those disagree, a client drilling in sees a different number
  // at every level, which is the one thing this screen must never do.
  for (const a of view.apps ?? []) {
    const fromProcesses = (a.processes ?? []).reduce((n, p) => n + (p.savedSecondsPerMonth ?? 0), 0)
    check(`${a.name} adds up from its processes`, a.savedSecondsPerMonth === fromProcesses, `${a.savedSecondsPerMonth} vs ${fromProcesses}`)
    for (const p of a.processes ?? []) {
      const fromSteps = (p.steps ?? []).reduce((n, s) => n + (s.savedSecondsPerMonth ?? 0), 0)
      check(`  “${p.name}” adds up from its steps`, p.savedSecondsPerMonth === fromSteps, `${p.savedSecondsPerMonth} vs ${fromSteps}`)
    }
  }
  console.log(`\n  ${hours.toLocaleString()} hours a month given back, across ${(view.apps ?? []).length} apps.`)
}

console.log(failures ? `\nFINISHED WITH ${failures} PROBLEM(S)` : `\nDONE — the quiet screens have something on them.`)
process.exit(failures ? 1 : 0)
