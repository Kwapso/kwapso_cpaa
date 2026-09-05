// THE WAY BACK TO THE RECORD, PROVED THROUGH THE SHIPPED DOORS (R29).
//
// EARNED BY A SENTENCE THAT LIED. The mention notice said "Open the ticket to
// read the full conversation and reply" and carried no link of any kind — the
// copy instructed an action the message made impossible. Fixing the sentence is
// a one-line edit; what this suite is for is the half that a one-line edit
// cannot hold: WHICH APP the link opens.
//
// The same ticket has two addresses. A staff member reads it in the agency app,
// a client contact reads it in the portal, and ONE reply notice goes to both
// kinds of person in the same send. Hand a client an agency URL and you have
// given them a link they cannot open AND advertised a door they may not pass
// (R21) — a fault a unit test on the URL builder cannot see, because the builder
// would be perfectly correct and the caller would be passing it the wrong
// audience.
//
// So this runs the real handlers over a real SQLite spine and reads what would
// have gone out: the recipients are decided by the door, the audiences by the
// portal-grant read, and the assertions are about the strings in the two
// inboxes. R29's own suite (web/test/linked-emails.test.ts) holds the census and
// the builder; this holds the wiring between them.

import type { DatabaseSync } from "node:sqlite"
import { withDeferred } from "./deferred"
import { beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ db: null as DatabaseSync | null }))

vi.mock("@shared/workers/d1-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/workers/d1-rest")>()
  const { d1Impl } = await import("../../tenancy/test/d1-sqlite")
  return { ...actual, ...d1Impl(() => holder.db as DatabaseSync) }
})

import worker from "../src/index"
import { buildSpineDb, IDS, makeEnv } from "../../tenancy/test/spine-harness"

const db = () => holder.db as DatabaseSync

/** The two origins, deliberately unlike each other and unlike anything real, so
 * an assertion about which one appears cannot pass by coincidence. */
const AGENCY = "https://agency.example"
const PORTAL = "https://client.example"

/** Every email the worker would have sent — the whole message, HTML and text
 * both. The text half is not an afterthought here: it is the only way back to
 * the record for a text-only reader, and it is where the raw URL has to be. */
let sent: { to: string; subject: string; html: string; text: string }[] = []

function env(userId: string) {
  const base = makeEnv(() => db(), userId) as unknown as Record<string, unknown>
  return {
    ...base,
    INTERNAL_KEY: "k",
    PUBLIC_APP_URL: AGENCY,
    PUBLIC_PORTAL_URL: PORTAL,
    AUTH: {
      fetch: async (url: string, init?: { body?: string }) => {
        if (String(url).includes("/internal/send-email")) {
          sent.push(JSON.parse(init?.body ?? "{}"))
          return new Response("{}")
        }
        return (base.AUTH as { fetch: (u: string, i?: unknown) => Promise<Response> }).fetch(url, init)
      },
    },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

const call = (userId: string, route: string, body?: unknown) => {
  const [method, path] = route.split(" ")
  // …with a waiting context, so the door's deferred work (the outbound email)
  // has landed by the time the assertions run — see test/deferred.ts.
  return withDeferred((ctx) =>
    worker.fetch(
      new Request(`https://content${path}`, {
        method,
        headers: { Cookie: "session=x", "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      }),
      env(userId) as never,
      ctx as never
    )
  )
}

/** Marta is the CLIENT: a portal grant on Bergman, and the raiser of the ticket
 * every case below is about. Staff is staff. */
const CLIENT = "marta@bergman.example"
/** A SECOND staff member, so there is somebody a staff reply can @mention. The
 * fixture's other members are client logins, and a client login may not mention
 * anybody at all (the reply door refuses it) — which is the whole reason the
 * mention email is a staff-side message and wants an agency address. */
const STAFF2 = "nora@kwapso.example"
const to = (address: string) => sent.find((m) => m.to === address)

beforeEach(() => {
  sent = []
  holder.db = buildSpineDb()
  db().exec(
    `INSERT INTO users (id, email, first_name, current_team_id) VALUES ('U_STAFF2', '${STAFF2}', 'Nora', '${IDS.team}');
     INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES ('m_staff2', '${IDS.team}', 'U_STAFF2', '${IDS.adminRole}', '2026-01-01');`
  )
})

describe("a ticket notification links back to the ticket, at the recipient's own front door", () => {
  it("the client who raised it is sent the PORTAL address, never the agency's", async () => {
    expect((await call(IDS.staffUser, "POST /api/content/help/reply", {
      helpId: IDS.victimTicket,
      body: "We are looking into the March run now.",
    })).status).toBe(200)

    const mail = to(CLIENT)
    expect(mail, "the raiser was not emailed at all").toBeTruthy()
    expect(mail!.html).toContain(`${PORTAL}/tickets/${IDS.victimTicket}`)
    // THE ASSERTION THAT MATTERS. Not "it has a link" — "it has the RIGHT link".
    // An agency URL here is a door this person may not pass, named in writing.
    expect(mail!.html, "a client was handed an agency address").not.toContain(AGENCY)
    expect(mail!.text, "a client was handed an agency address").not.toContain(AGENCY)
    // …and no team-scoped path, because the portal's address space has no team
    // in it: a client belongs to an account, not to our team.
    expect(mail!.html).not.toContain(`/t/${IDS.team}/`)
  })

  it("a mentioned staff member is sent the AGENCY address, for the same ticket", async () => {
    // The email the owner screenshotted: "kwapso mentioned you in a support
    // ticket reply". ONE reply, and it emails two people about the same record —
    // the client who raised it and the colleague who was tagged — which is why
    // the front door cannot be decided once for the send.
    expect((await call(IDS.staffUser, "POST /api/content/help/reply", {
      helpId: IDS.victimTicket,
      body: "this is a test mention @Nora",
      taggedUserIds: ["U_STAFF2"],
    })).status).toBe(200)

    const mail = to(STAFF2)
    expect(mail, "the mentioned member was not emailed at all").toBeTruthy()
    expect(mail!.subject).toContain("mentioned you")
    expect(mail!.html).toContain(`${AGENCY}/t/${IDS.team}/tickets/${IDS.victimTicket}`)
    expect(mail!.html, "staff were sent to the client portal").not.toContain(PORTAL)
    // …and the client on the same send got the OTHER address, from the one call.
    expect(to(CLIENT)!.html).toContain(`${PORTAL}/tickets/${IDS.victimTicket}`)
  })

  it("no email still tells somebody to open a ticket it gave them no way to open", async () => {
    await call(IDS.staffUser, "POST /api/content/help/reply", {
      helpId: IDS.victimTicket,
      body: "A reply, so there is a notice to read.",
    })
    const mail = to(CLIENT)!
    // The sentence itself. It promised an action the message made impossible for
    // as long as the notification path existed; it is a statement of fact now,
    // and the instruction is the button beside it.
    expect(mail.html).not.toContain("Open the ticket to read the full conversation")
    expect(mail.html).toContain("Open the ticket") // the button's own label
  })

  it("a to-do points at the portal HOME, where to-dos actually sit — not an invented screen", async () => {
    expect((await call(IDS.staffUser, "POST /api/content/todos", {
      accountId: IDS.victimAccount,
      title: "Send us the signed supplier form",
    })).status).toBe(200)

    const mail = to(CLIENT)
    expect(mail, "nobody at the account was asked for it").toBeTruthy()
    // The portal has no to-do detail page. Rather than link to one that does not
    // exist, this lands them where the item is — above their own requests.
    expect(mail!.html).toContain(`${PORTAL}/home`)
    expect(mail!.html).not.toContain(AGENCY)
  })

  it("the answer to what they asked links to the answered ticket, in their portal", async () => {
    expect((await call(IDS.staffUser, "POST /api/content/help/resolve", {
      id: IDS.victimTicket,
      resolution: "The March run is visible again — a filter was hiding it.",
    })).status).toBe(200)

    const mail = to(CLIENT)
    expect(mail, "the raiser was not told their ticket was answered").toBeTruthy()
    expect(mail!.html).toContain(`${PORTAL}/tickets/${IDS.victimTicket}`)
    expect(mail!.html).not.toContain(AGENCY)
  })
})

describe("the button survives the clients people actually read email in", () => {
  /** One real notification, built by the real template. */
  async function notice() {
    await call(IDS.staffUser, "POST /api/content/help/reply", {
      helpId: IDS.victimTicket,
      body: "We are looking into the March run now.",
    })
    return to(CLIENT)!
  }

  it("it is a table cell with a background colour, not a padded anchor", async () => {
    const mail = await notice()
    // Outlook on Windows renders with Word's engine, which ignores padding on an
    // inline-block anchor: the button used to arrive there as bare underlined
    // text. The colour lives on a <td> Word will paint, and mso-padding-alt
    // gives it the padding through the cell.
    expect(mail.html).toMatch(/<td[^>]*bgcolor="#[0-9a-fA-F]{3,8}"[^>]*>/)
    expect(mail.html).toContain("mso-padding-alt")
    expect(mail.html).toMatch(/<a href="https:\/\/client\.example\/tickets\//)
  })

  it("the plain-text alternative carries the raw URL, on a line of its own", async () => {
    const mail = await notice()
    // A text-only reader gets no button at all, so this line IS the way back. On
    // its own line because a URL with anything after it is a URL that gets
    // linkified with the trailing character stuck to it.
    expect(mail.text.split("\n")).toContain(`${PORTAL}/tickets/${IDS.victimTicket}`)
  })
})
