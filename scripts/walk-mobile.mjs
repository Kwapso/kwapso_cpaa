#!/usr/bin/env node
/**
 * walk-mobile.mjs — walk both front doors at 375×812 and report what a phone
 * would actually show.
 *
 * WHY THIS EXISTS. Three defects reached the owner's handset in a row, and none
 * of them was visible at 1280: a header wider than the screen, a picker that
 * opened behind the dialog it belonged to, and a module name rendering as "Au…".
 * They share a shape — a thing that is too wide for the room it was given — and
 * a page at desktop width has room to spare, so nobody sees it happen.
 *
 * So this measures, rather than looks. Four checks per screen:
 *
 *   1 · IS THE PAGE WIDER THAN THE PHONE. `scrollWidth > innerWidth`, with the
 *       culprit elements named. Anything that scrolls in its own box is allowed
 *       (a wide table, a card rail, a flowchart) and is skipped by its own
 *       `overflow-x`.
 *   2 · IS ANY TEXT WIDER THAN ITS BOX. `scrollWidth > clientWidth` on the text
 *       elements. Deliberate truncation (`text-overflow: ellipsis`, an
 *       `overflow: hidden` ancestor) is not a defect and is skipped — an avatar's
 *       initials inside a clipped circle used to report here.
 *   3 · IS ANYTHING FIXED SITTING ON THE BOTTOM NAV, and does the bar have a
 *       gutter at both ends.
 *   4 · DO THE NAV LABELS FIT IN EVERY LANGUAGE THE APP SPEAKS. Measured with a
 *       canvas in the bar's own computed font, because the labels are `flex-1`
 *       and a fifth of 375 is 75px: "Mein Unternehmen" needs 112.
 *
 * TWO MODES.
 *   --stub   (default) Stubs the network and renders the local dev server. No
 *            key, no backend, fixture rows. Proves layout, stacking and
 *            wrapping — and nothing that depends on real data.
 *   --live   Signs in through the admin test-login door against a deployed
 *            environment and walks the real thing. Needs TEST_LOGIN_KEY:
 *              set -a && source ~/.config/kwapso/keys.env && set +a
 *
 * USAGE
 *   node scripts/walk-mobile.mjs --stub --door=portal --base=http://localhost:3100
 *   node scripts/walk-mobile.mjs --live --door=agency
 *   node scripts/walk-mobile.mjs --live --door=both --shots=/tmp/shots
 *
 * Playwright is NOT a repo dependency (see web/playwright.config.ts) — install
 * it locally first: `npm i -D @playwright/test && npx playwright install`.
 * Exits non-zero when a check fails, so it can gate a deploy.
 */

import { mkdirSync } from "node:fs"

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

const LIVE = has("live")
const DOOR = arg("door", "both")
const SHOTS = arg("shots", "")
const AGENCY_BASE = arg("base", LIVE ? (process.env.SMOKE_BASE ?? "https://kwapso-staging.kwapso.workers.dev") : "http://localhost:3200")
const PORTAL_BASE = arg("portal-base", LIVE ? (process.env.SMOKE_PORTAL_BASE ?? "https://staging-client.kwapso.app") : "http://localhost:3100")

/** The languages the app speaks, and the bottom-bar labels in each. Kept here
 * rather than read from the catalogue because this script runs against a
 * DEPLOYED build too, where the catalogue on disk may not be the one that
 * shipped. If a label changes, this list is the thing to update. */
const NAV_LABELS = {
  portal: {
    en: ["Home", "Tickets", "Impact", "Deliverables", "My company"],
    de: ["Start", "Tickets", "Wirkung", "Ergebnisse", "Mein Unternehmen"],
    es: ["Inicio", "Tickets", "Impacto", "Entregables", "Mi empresa"],
    ca: ["Inici", "Tickets", "Impacte", "Lliurables", "La meva empresa"],
  },
  agency: {
    en: ["Home", "Accounts", "Knowledge base", "Tickets", "More"],
    de: ["Start", "Kunden", "Wissensdatenbank", "Tickets", "Mehr"],
    es: ["Inicio", "Cuentas", "Base de conocimiento", "Tickets", "Más"],
    ca: ["Inici", "Comptes", "Base de coneixement", "Tickets", "Més"],
  },
}

const SCREENS = {
  portal: [["home", "/home"], ["tickets", "/tickets"], ["impact", "/impact"], ["company", "/company"], ["deliverables", "/deliverables"]],
  agency: [["home", "/home"], ["accounts", "/accounts"], ["tickets", "/tickets"], ["knowledge", "/knowledge"], ["apps", "/apps"], ["settings", "/settings"], ["profile", "/profile"], ["kwapso", "/kwapso"]],
}

/* ── the stub fixtures, for --stub ─────────────────────────────────────── */
const MODULES = ["teams","team_members","member_roles","accounts","contacts","portal_users","help","knowledge","selectable_data","agent","processes","deliverables","commercials","work","all_tasks","todos","meetings","brand_assets","delivery","staff_profiles","google","google_mail"]
const ALL_RIGHTS = Object.fromEntries(MODULES.map((m) => [m, { read: true, create: true, edit: true, delete: true }]))
const TEAM = { id: "team_1", name: "Kwapso", logoUrl: null, roleId: "role_1", dbStatus: "ready", legalName: null, legalNumbers: null, registeredAddress: null, billingEmail: null }
const STAFF = { id: "usr_staff", email: "staff@example.com", firstName: "Alex", lastName: "K", imageUrl: null, onboardingComplete: true, currentTeamId: "team_1", pinnedTeamId: null, language: null, scale: null }
const CLIENT = { ...STAFF, id: "usr_client", email: "dana@northwind.example", firstName: "Dana", lastName: "Okafor" }

function stubFor(door, url) {
  const u = new URL(url)
  const p = u.pathname
  if (/\/api\/auth\/me/.test(p)) return { user: door === "portal" ? CLIENT : STAFF }
  if (/\/api\/auth\//.test(p)) return { user: door === "portal" ? CLIENT : STAFF, ok: true }
  if (/\/api\/tenancy\/active/.test(p)) return { team: TEAM, role: { id: "role_1", title: "Owner" }, memberCount: 3, teams: [TEAM] }
  if (/my-permissions/.test(p)) return { permissions: ALL_RIGHTS }
  if (/portal\/(context|switch-account)/.test(p)) return { accounts: [{ id: "acc_1", name: "Northwind Trading" }], currentAccountId: "acc_1" }
  if (/accounts\/detail/.test(p)) return {
    account: { id: "acc_1", name: "Northwind Trading", code: "NW", email: "hello@northwind.example", phone: "+44 20 7946 0100", addressLine1: "12 Bishopsgate", addressLine2: null, city: "London", postcode: "EC2N 4AJ", country: "United Kingdom", logoUrl: null, active: true },
    links: [{ id: "ct_1", personName: "Dana Okafor", relationship: "Main contact", isMainStakeholder: true, active: true }],
    linksTotal: 1,
  }
  if (/tenancy\/impact/.test(p)) return { savedSecondsPerMonth: 396000, caption: null, apps: [{ id: "app_1", name: "CONFIA", savedSecondsPerMonth: 288000, processes: [] }] }
  // A POPULATED knowledge base — the smoke team's own is empty (kwapso-cpaa-a7,
  // 30 Aug 2026), which renders the collection's search bar with nothing beside
  // it to overflow. Real rows, real title lengths, so the search bar and the
  // card frame are measured under the same content a real team would show.
  if (/content\/knowledge\b(?!\/ask)/.test(p)) {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      id: `src_${i}`,
      kind: i % 2 ? "meeting" : "file",
      originTable: null, originRowId: null, compartment: "agency", accountId: null,
      appId: null, ticketId: null, sprintId: null, recordDate: null,
      title: [
        "Bergman GmbH: dispatch window and the Stripe webhook change",
        "Q3 kickoff — Confia onboarding and the process map handover",
        "FluClinic: changing the Stripe webhook, quick notes",
        "Padelbase train-the-trainer workshops, quarterly cadence",
        "HOGO x Claude math — meeting records and transcript",
        "Internal review: what changed since the last audit",
      ][i],
      summary: "What was said, in a sentence or two, about the thing this source is from.",
      body: null, bodyBytes: 1200, bodyTruncated: false, sourceUrl: null,
    }))
    return { sources, total: sources.length, nextCursor: null, count: sources.length }
  }
  const last = p.split("/").filter(Boolean).pop() ?? ""
  return { [last]: [], rows: [], items: [], total: 0, nextCursor: null, count: 0 }
}

/* ── signing in, for --live ────────────────────────────────────────────── */
/**
 * MINT AT THE AGENCY DOOR, VERIFY AT THE ONE BEING WALKED — the same two steps
 * scripts/smoke-portal.mjs takes, and both halves matter.
 *
 * `admin/test-login` is deliberately NOT on the portal gateway's allow-list, so
 * a client's code can only be minted at the agency hostname (it 404s at the
 * portal, which is the fence working). But the SESSION has to belong to the
 * hostname the browser will actually be on, so the code is spent at the door
 * being walked — otherwise the cookie is scoped to the wrong domain and every
 * screen renders signed-out.
 */
async function liveCookie({ mintAt, verifyAt, email }) {
  const key = process.env.TEST_LOGIN_KEY ?? ""
  if (!key) {
    console.error("--live needs TEST_LOGIN_KEY:  set -a && source ~/.config/kwapso/keys.env && set +a")
    process.exit(2)
  }
  const minted = await fetch(`${mintAt}/api/auth/admin/test-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": key },
    body: JSON.stringify({ email }),
  })
  const { code } = await minted.json().catch(() => ({}))
  if (!code) { console.error(`could not mint a code for ${email} at ${mintAt} (status ${minted.status})`); process.exit(2) }
  const verified = await fetch(`${verifyAt}/api/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  })
  const raw = (verified.headers.get("set-cookie") ?? "").split(";")[0]
  if (!raw.startsWith("kwapso_session=")) {
    console.error(`verify at ${verifyAt} did not set a session cookie (status ${verified.status})`)
    process.exit(2)
  }
  const [name, value] = raw.split("=")
  return { name, value, domain: new URL(verifyAt).hostname, path: "/", httpOnly: true, secure: verifyAt.startsWith("https"), sameSite: "Lax" }
}

/* ── the checks, run inside the page ───────────────────────────────────── */
const PROBE = (labelsByLang) => {
  const d = document.documentElement

  const wide = []
  if (d.scrollWidth > window.innerWidth + 1) {
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect()
      if (r.width > window.innerWidth + 1 && r.height > 0) {
        const ox = getComputedStyle(el).overflowX
        if (ox === "auto" || ox === "scroll" || ox === "clip" || ox === "hidden") continue
        wide.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/)[0]} ${Math.round(r.width)}px`)
      }
    }
  }

  /** Is any ancestor clipping this element? Then it is not "cut", it is
   * truncated on purpose — an avatar's initials in a round well, a `truncate`
   * cell. Walking up is the whole difference between a real finding and six
   * false ones. */
  const clippedByAncestor = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true
    }
    return false
  }
  const cut = []
  for (const el of document.querySelectorAll("a,button,span,p,h1,h2,h3,td,th,label,li")) {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") continue
    if (cs.textOverflow === "ellipsis" || cs.overflow !== "visible" || cs.overflowX !== "visible") continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !clippedByAncestor(el)) {
      cut.push(`${el.tagName.toLowerCase()}["${(el.textContent || "").trim().slice(0, 22)}"] ${el.scrollWidth}>${el.clientWidth}`)
    }
  }

  /* IS A PLACEHOLDER WIDER THAN THE FIELD THAT HOLDS IT, AT REST. `scrollWidth`
     is meaningless here — a native input never scrolls its placeholder, it just
     clips it dead at the padding edge with no ellipsis, so the existing `cut`
     walk (which every one of these elements is excluded from; `input`/`textarea`
     are not in its selector list at all) cannot see this class of defect either.
     Measured the same way the nav-label check measures a word against its slot:
     a canvas in the field's own computed font. */
  const placeholderOverflow = []
  for (const el of document.querySelectorAll("input[placeholder],textarea[placeholder]")) {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") continue
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    const innerWidth = r.width - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0") -
      parseFloat(cs.borderLeftWidth || "0") - parseFloat(cs.borderRightWidth || "0")
    const ctx2d = document.createElement("canvas").getContext("2d")
    ctx2d.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const ink = Math.ceil(ctx2d.measureText(el.placeholder).width)
    if (ink > innerWidth) {
      placeholderOverflow.push(
        `${el.tagName.toLowerCase()}["${el.placeholder.slice(0, 40)}${el.placeholder.length > 40 ? "…" : ""}"] ${ink}px in ${Math.round(innerWidth)}px`
      )
    }
  }

  let bar = null
  /* THE BOTTOM BAR, not the first `<nav>` in the document. The agency shell
     renders its desktop rail first and hides it with `md:flex`, so at 375 that
     element is present, zero-width and invisible — and reading it reported a
     0px gutter on every screen in the app, which was this script crying wolf
     rather than a defect. Take the last nav that actually has a box and sits in
     the bottom third of the viewport. */
  const nav = [...document.querySelectorAll("nav")]
    .filter((n) => {
      const r = n.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.bottom > window.innerHeight * 0.66
    })
    .pop()
  if (nav) {
    const nr = nav.getBoundingClientRect()
    const items = [...nav.querySelectorAll("a,button")].map((a) => a.getBoundingClientRect())
    // A NEGATIVE z-index CANNOT PAINT OVER THE NAV, whatever its box overlaps —
    // that is what negative means, and this check was reporting one on every
    // screen in both themes: `AmbientBackground`, mounted `anchor="fixed"` at
    // `-z-10` so the living background stays put while the page scrolls
    // (web/app/layout.tsx), `pointer-events-none` and `aria-hidden` by its own
    // design (shared/ui/components/ambient-background/ambient-background.tsx —
    // "decoration ... must never" intercept anything). Sixteen standing
    // findings from one always-present, always-behind, always-inert layer is
    // exactly how a real OVER-NAV finding would stop getting anyone's
    // attention. Position overlap is necessary but not sufficient; z-order is
    // the other half of "over," and a bare Y-range check cannot see it.
    const over = [...document.querySelectorAll("body *")]
      .filter((el) => {
        if (getComputedStyle(el).position !== "fixed") return false
        const z = parseInt(getComputedStyle(el).zIndex, 10)
        if (Number.isFinite(z) && z < 0) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.bottom > nr.top + 4 && r.top < nr.bottom - 4 && !el.contains(nav) && !nav.contains(el)
      })
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(/\s+/)[0]}`)

    // Do the labels fit, in every language, in the slot the bar gives them?
    const first = nav.querySelector("a,button")
    const label = first ? (first.querySelector("span") ?? first) : null
    const doesNotFit = []
    if (label) {
      const cs = getComputedStyle(label)
      const slot = Math.round(label.getBoundingClientRect().width)
      const ctx2d = document.createElement("canvas").getContext("2d")
      ctx2d.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      for (const [lang, words] of Object.entries(labelsByLang)) {
        for (const w of words) {
          const ink = Math.ceil(ctx2d.measureText(w).width)
          if (ink > slot - 2) doesNotFit.push(`${lang}:"${w}" ${ink}px in ${slot}px`)
        }
      }
    }
    // Is anything ACTUALLY cut in the bar right now?
    const barCut = [...nav.querySelectorAll("a,button")]
      .map((el) => { const sp = el.querySelector("span") ?? el; return sp.scrollWidth > sp.clientWidth + 1 ? `"${sp.textContent.trim()}"` : null })
      .filter(Boolean)

    bar = {
      gutterLeft: items.length ? Math.round(items[0].left) : null,
      gutterRight: items.length ? Math.round(window.innerWidth - items[items.length - 1].right) : null,
      over, doesNotFit, barCut,
    }
  }

  return {
    page: d.scrollWidth,
    viewport: window.innerWidth,
    wide: wide.slice(0, 6),
    cut: cut.slice(0, 8),
    placeholderOverflow: placeholderOverflow.slice(0, 8),
    bar,
  }
}

/* ── the walk ──────────────────────────────────────────────────────────── */
const { chromium } = await import("playwright")
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const doors = DOOR === "both" ? ["agency", "portal"] : [DOOR]
const findings = []
const browser = await chromium.launch()

for (const door of doors) {
  const base = door === "portal" ? PORTAL_BASE : AGENCY_BASE
  const cookie = LIVE
    ? await liveCookie({
        mintAt: AGENCY_BASE,
        verifyAt: base,
        email: door === "portal" ? "delivered+portal@resend.dev" : "delivered@resend.dev",
      })
    : null

  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 }, colorScheme: scheme, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    })
    if (cookie) await ctx.addCookies([cookie])
    if (!LIVE) {
      await ctx.route("**/api/**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stubFor(door, route.request().url())) }))
      await ctx.route("**/realtime/**", (r) => r.abort())
    }

    for (const [name, path] of SCREENS[door]) {
      const page = await ctx.newPage()
      const errs = []
      page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)))
      await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {})
      await page.waitForTimeout(1400)
      const dismiss = page.getByRole("button", { name: /got it|not now/i }).first()
      if (await dismiss.count().catch(() => 0)) { await dismiss.click().catch(() => {}); await page.waitForTimeout(300) }

      // TYPE INTO EVERY VISIBLE TEXT FIELD BEFORE MEASURING. A field that only
      // overflows once it holds content is invisible to a check that reads the
      // page at rest — which is what this walk did until 30 Aug 2026, and a
      // search bar that does not expand for a longer query is exactly that
      // class of defect. A real Playwright `fill`, so React sees the same
      // input event a person's keyboard would send, not a synthetic one this
      // check invented. Long and specific rather than a filler string, because
      // the owner's own words were "a bigger search query" and a repeated
      // character wraps or truncates differently than an ordinary sentence
      // does. Reuses the existing WIDER-THAN-PHONE and TEXT-CUT walks below —
      // they already scan every element on the page, so typed content that
      // overflows a box that does not expand shows up there with no second
      // detector to keep in step with the first.
      const QUERY = "the dispatch window we agreed with Bergman last quarter"
      const fields = await page.locator('input[type="text"], input[type="search"], input:not([type]), textarea').all()
      for (const f of fields) {
        if (!(await f.isVisible().catch(() => false))) continue
        if (await f.isDisabled().catch(() => false)) continue
        await f.fill(QUERY).catch(() => {})
      }
      if (fields.length) await page.waitForTimeout(300)

      const at = `${door} ${scheme} ${path}`
      const r = await page.evaluate(PROBE, NAV_LABELS[door]).catch(() => null)
      if (!r) { findings.push(`UNREADABLE ${at}`); await page.close(); continue }

      if (r.page > r.viewport + 1) findings.push(`WIDER-THAN-PHONE ${at}  ${r.page}>${r.viewport} :: ${r.wide.join(" | ")}`)
      if (r.cut.length) findings.push(`TEXT-CUT   ${at}  ${r.cut.join(" | ")}`)
      if (r.placeholderOverflow.length) findings.push(`PLACEHOLDER ${at}  ${r.placeholderOverflow.join(" | ")}`)
      if (errs.length) findings.push(`PAGE-ERROR ${at}  ${errs[0]}`)
      if (r.bar) {
        if (r.bar.over.length) findings.push(`OVER-NAV   ${at}  ${r.bar.over.join(" | ")}`)
        if (r.bar.gutterLeft === 0 || r.bar.gutterRight === 0) findings.push(`NAV-EDGE   ${at}  ends at ${r.bar.gutterLeft}/${r.bar.gutterRight}px from the screen edge`)
        if (r.bar.barCut.length) findings.push(`NAV-CUT    ${at}  ${r.bar.barCut.join(" | ")}`)
        if (r.bar.doesNotFit.length && scheme === "light" && path.endsWith("home")) {
          findings.push(`NAV-WRAPS  ${door}  these need more than one line: ${r.bar.doesNotFit.join(" | ")}`)
        }
      }

      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${door}-${name}-${scheme}.png`, fullPage: true })
      await page.close()
    }
    await ctx.close()
  }
}
await browser.close()

const hard = findings.filter((f) => !f.startsWith("NAV-WRAPS"))
console.log(findings.length ? findings.join("\n") : "clean: nothing wider than the phone, nothing cut, no page errors")
console.log(`\n${LIVE ? "LIVE" : "STUB"} · ${doors.join(" + ")} · 375x812 · light + dark`)
process.exit(hard.length ? 1 : 0)
