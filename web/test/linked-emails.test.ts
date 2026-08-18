// R29 — EVERY EMAIL IS CLASSIFIED, AND ONE THAT NAMES A RECORD CARRIES THE WAY
// BACK TO IT.
//
// EARNED BY A SENTENCE. The mention notice read "Open the ticket to read the full
// conversation and reply" — in an email with no link in it, and no email in the
// fleet had one. The copy instructed an action the message made impossible, and it
// had done so since the notification path was written, because nothing in the build
// could tell the difference between an email that links and one that only talks
// about linking.
//
// SO THE DELIVERABLE IS THE CENSUS, NOT THE BUTTONS. Buttons fix twelve emails; the
// thirteenth, written next year, ships the same way. This reads the SOURCE for every
// function that composes a branded message and demands a classification for each
// one — the shape R27's vocabulary and R13's exemptions already use, in both
// directions, so an unclassified send is red and a census line for a send that no
// longer exists is red too.
//
// AND IT IS WHERE THE FRONT DOOR IS DECIDED. "Which hostname does this go to" is a
// security question wearing a formatting question's clothes: staff read the agency
// app, a client contact reads the portal, and the same ticket therefore has two
// addresses. An agency URL in a client's inbox is a link they cannot open and a
// door they may not pass, advertised (R21). Hence the last three cases here: no
// origin at a call site, no portal link built from an agency-only helper, and no
// worker linking clients anywhere without the portal's own address configured.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { EMAIL_CENSUS } from "@shared/rules/registry"
import { sourceFiles, stripComments, stripJsoncComments } from "@shared/rules/source-scan"
import { hasPortalScreen, recordLink, type RecordKind } from "@shared/workers/record-link"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const read = (p: string) => readFileSync(p, "utf8")

/** THE SEAM THAT PUTS A MESSAGE ON THE WIRE, under any local name.
 *
 * Two functions compose a branded email: `brandedEmail` (auth, which owns the
 * Resend key and calls the template directly) and `sendBrandedEmail` (everyone
 * else, who hands the finished message to auth's internal door). Both are imported
 * — and one of them is imported ALIASED in two files (`sendBrandedEmail as send`),
 * so the local names are read off each file's own import statements rather than
 * assumed. A law that can be dodged by renaming an import is not a law.
 *
 * Deliberately NOT the seam: auth's `sendEmail` and its `/internal/send-email`
 * door. Those are the PIPE — they relay a message somebody else composed, and the
 * composer is the one with something to say about a record. */
function emailSeamNames(src: string): string[] {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*(?:email-template|workers\/notify)"/g))
    for (const spec of m[1].split(",")) {
      const [imported, local] = spec.split(/\s+as\s+/).map((s) => s.trim())
      if (imported === "brandedEmail" || imported === "sendBrandedEmail") names.add(local || imported)
    }
  return [...names]
}

/** Every function in `workers/` that composes a branded email, as
 * `<repo-relative file>::<function>` → its own source.
 *
 * A body runs from its `export function` to the next one — the same slice the
 * publish-seam, gating-seam and R14 scans take, so this law reads the code the same
 * way its twenty-eight siblings do. */
function emailSites(): Map<string, string> {
  const srcDirs = readdirSync(join(ROOT, "workers"), { withFileTypes: true })
    .filter((w) => w.isDirectory())
    .map((w) => join(ROOT, "workers", w.name, "src"))
  const out = new Map<string, string>()
  for (const file of sourceFiles(srcDirs, { extensions: [".ts"], relativeTo: ROOT })) {
    const seams = emailSeamNames(file.source)
    if (!seams.length) continue
    // Comments discuss the very seams being scanned ("sent through the SAME
    // branded template"), so they are not code here either.
    const code = stripComments(file.source)
    const starts = [...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
    starts.forEach((m, i) => {
      const body = code.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined)
      if (seams.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(body)))
        out.set(`${file.rel}::${m[1]}`, body)
    })
  }
  return out
}

describe("R29 — linked-emails: every email is classified, and one about a record links to it", () => {
  const sites = emailSites()

  it("the scan finds the fleet — a census over nothing would pass silently", () => {
    // The floor is deliberately low and non-zero: it catches the scan looking in
    // the wrong place or the seam being renamed out from under it, without
    // becoming a number somebody has to bump for every new email.
    expect(sites.size, "no email-composing function was found — the scan is broken").toBeGreaterThan(8)
  })

  it("every email in the source is classified in EMAIL_CENSUS", () => {
    const unclassified = [...sites.keys()].filter((k) => !EMAIL_CENSUS[k])
    expect(
      unclassified,
      `these emails are not in EMAIL_CENSUS (shared/rules/registry.ts). Say whether each one ` +
        `refers to a specific record — and if it does, give it a button through ` +
        `shared/workers/record-link.ts:\n${unclassified.join("\n")}`
    ).toEqual([])
  })

  it("every EMAIL_CENSUS entry names an email that still exists", () => {
    const orphans = Object.keys(EMAIL_CENSUS).filter((k) => !sites.has(k))
    expect(
      orphans,
      `these census entries match no email in workers/. Nothing breaks today, which is exactly ` +
        `how a census rots into a record of what the app used to send:\n${orphans.join("\n")}`
    ).toEqual([])
  })

  it("an email that refers to a record carries a link, built through the one helper", () => {
    const wrong: string[] = []
    for (const [key, entry] of Object.entries(EMAIL_CENSUS)) {
      if (!entry.refersToRecord) continue
      const body = sites.get(key) ?? ""
      if (!/\bctaUrl\b/.test(body)) wrong.push(`${key} — classified as being about a record but passes no ctaUrl`)
      if (!/\brecordLink\s*\(/.test(body))
        wrong.push(`${key} — builds its link without recordLink(), so nothing decides its front door`)
      expect(entry.link.length, `${key}'s census entry must say what its button points at`).toBeGreaterThan(20)
    }
    expect(wrong, `R29:\n${wrong.join("\n")}`).toEqual([])
  })

  it("an email that refers to NO record promises none — and says why", () => {
    const wrong: string[] = []
    for (const [key, entry] of Object.entries(EMAIL_CENSUS)) {
      if (entry.refersToRecord) continue
      expect(entry.why.length, `${key}'s exemption needs a real reason`).toBeGreaterThan(40)
      const body = sites.get(key) ?? ""
      if (/\bctaUrl\b/.test(body))
        wrong.push(`${key} — classified as referring to no record, yet it passes a ctaUrl`)
    }
    expect(wrong, `R29:\n${wrong.join("\n")}`).toEqual([])
  })

  it("no email spells an origin — the two front doors are configuration", () => {
    const offenders: string[] = []
    for (const [key, body] of sites)
      for (const m of body.matchAll(/https?:\/\/[^\s"'`)]+/g)) offenders.push(`${key} → ${m[0]}`)
    expect(
      offenders,
      `a hostname written into an email. The recipient decides which app the link opens, so the ` +
        `origins arrive as PUBLIC_APP_URL / PUBLIC_PORTAL_URL and only recordLink() reads them:\n` +
        offenders.join("\n")
    ).toEqual([])
  })
})

describe("R29 — the helper answers with the RECIPIENT's front door", () => {
  const env = { PUBLIC_APP_URL: "https://agency.example", PUBLIC_PORTAL_URL: "https://client.example" }

  it("a client is never handed an agency address, and a staff member never a portal one", () => {
    const refs = [
      { kind: "ticket", teamId: "T1", id: "R1" },
      { kind: "ticketList", teamId: "T1" },
      { kind: "todo", teamId: "T1", accountId: "A1" },
      { kind: "member", teamId: "T1", id: "U1" },
      { kind: "invite" },
    ] as const
    for (const ref of refs) {
      const portal = recordLink(env, "portal", ref)
      if (portal) expect(portal.url.startsWith(env.PUBLIC_PORTAL_URL), `${ref.kind} → ${portal.url}`).toBe(true)
      const agency = recordLink(env, "agency", ref)
      if (agency) expect(agency.url.startsWith(env.PUBLIC_APP_URL), `${ref.kind} → ${agency.url}`).toBe(true)
    }
  })

  it("a portal address never carries the agency's team id", () => {
    // Not a formatting preference. The portal's address space has no team in it —
    // a client belongs to an account, not to our team — so a portal URL that
    // named one would be a fact about the agency's own shape, leaked in a link.
    for (const ref of [
      { kind: "ticket", teamId: "TEAMID", id: "R1" },
      { kind: "ticketList", teamId: "TEAMID" },
      { kind: "todo", teamId: "TEAMID", accountId: "A1" },
    ] as const) {
      const link = recordLink(env, "portal", ref)
      if (link) expect(link.url, `${ref.kind} → ${link.url}`).not.toContain("TEAMID")
    }
  })

  it("an unconfigured origin means NO button, never a link to nowhere", () => {
    expect(recordLink({}, "portal", { kind: "ticket", id: "R1" })).toBeNull()
    expect(recordLink({ PUBLIC_APP_URL: "  " }, "agency", { kind: "ticketList", teamId: "T1" })).toBeNull()
  })

  it("a record kind with no screen on a front door gets nothing, not an invented one", () => {
    expect(recordLink(env, "portal", { kind: "member", teamId: "T1", id: "U1" })).toBeNull()
    expect(recordLink(env, "portal", { kind: "invite" })).toBeNull()
    // …and a ref with too little in it to address is null rather than a URL with
    // `undefined` in the middle of it.
    expect(recordLink(env, "agency", { kind: "ticket", teamId: "T1" })).toBeNull()
  })
})

describe("R29 — the portal's address is configured, and it is the right one", () => {
  /** A worker's wrangler config, comments stripped, as JSON. */
  function wrangler(worker: string): Record<string, unknown> {
    return JSON.parse(stripJsoncComments(read(join(ROOT, "workers", worker, "wrangler.jsonc"))))
  }

  /** Every `vars` block in a config — top level and each named environment, since
   * an env does NOT inherit the top-level vars. Staging is where an unset origin
   * would first be noticed, and noticing it in production is too late. */
  function varBlocks(config: Record<string, unknown>): Record<string, string>[] {
    const envs = (config.env ?? {}) as Record<string, { vars?: Record<string, string> }>
    return [config.vars as Record<string, string>, ...Object.values(envs).map((e) => e.vars)].filter(
      (v): v is Record<string, string> => Boolean(v)
    )
  }

  /** CAN THIS FILE ADDRESS THE PORTAL? Derived rather than string-matched for
   * `"portal"`, because the audience is very often a VARIABLE — one reply notice
   * decides it per recipient, which is the whole point of the helper. So: any
   * call whose audience is not the literal `"agency"` counts, and a `recordLink`
   * only counts if one of the record kinds in the same file has a portal screen
   * at all (tenancy links a MEMBER record, which the portal does not have, so it
   * can pass a variable audience and never produce a portal URL). */
  function addressesPortal(src: string): boolean {
    const calls = [...src.matchAll(/\b(recordLink|frontDoorOrigin)\(\s*[^,]+,\s*([^,)]+)/g)].filter(
      (m) => m[2].trim() !== '"agency"'
    )
    if (!calls.length) return false
    if (calls.some((m) => m[1] === "frontDoorOrigin")) return true
    return [...src.matchAll(/kind:\s*"(\w+)"/g)].some((m) => hasPortalScreen(m[1] as RecordKind))
  }

  /** The workers whose census says they can email a CLIENT — derived from the
   * sends themselves, so a new worker that starts emailing clients is covered
   * without anybody remembering this test exists. */
  const portalLinkers = [
    ...new Set(
      Object.keys(EMAIL_CENSUS)
        .filter((key) => addressesPortal(read(join(ROOT, key.split("::")[0]))))
        .map((key) => key.split("/")[1])
    ),
  ]

  it("every worker that links a client has the portal origin set, in every environment", () => {
    expect(portalLinkers.length, "no worker links a client — the derivation is broken").toBeGreaterThan(0)
    for (const worker of portalLinkers)
      for (const vars of varBlocks(wrangler(worker)))
        expect(vars.PUBLIC_PORTAL_URL, `${worker}: a vars block with no PUBLIC_PORTAL_URL`).toBeTruthy()
  })

  it("no config points the portal at portal.kwapso.app — that is somebody else's product", () => {
    // It resolves to the owner's live third-party no-code app (see
    // workers/portal-gateway/wrangler.jsonc). The portal is client.kwapso.app /
    // staging-client.kwapso.app. A var is exactly the kind of value somebody
    // retypes from memory, which is why the memory is checked.
    const offenders: string[] = []
    for (const worker of readdirSync(join(ROOT, "workers"), { withFileTypes: true }).filter((w) => w.isDirectory()))
      for (const vars of varBlocks(wrangler(worker.name)))
        for (const [name, value] of Object.entries(vars))
          if (typeof value === "string" && value.includes("portal.kwapso.app"))
            offenders.push(`${worker.name}: ${name} = ${value}`)
    expect(offenders, `these point at the Glide product, not the portal:\n${offenders.join("\n")}`).toEqual([])
  })
})
