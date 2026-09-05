// AN INTERNAL NUMBER CANNOT LEAVE THE ROOM IT WAS READ IN — R24's OUTBOUND HALF.
//
// R24 closed the INBOUND direction and closed it properly: what our own hour
// costs lives in one file, nothing a client login can reach imports it, and the
// build goes red if a portal-reachable path ever does. That sentence is a fact
// about the import graph.
//
// It says nothing at all about the other direction. The assistant reads the
// margin through a door R24 fences correctly — as an agency admin, holding
// `commercials:read`, exactly as designed — and then, in the same breath, writes
// a reply into a ticket thread the client reads. No import was forgotten, no
// condition inverted, no permission granted: every door on that path did its own
// job. The figure still arrived at the client's inbox.
//
// WHAT MADE IT REACHABLE. A client login raises a ticket through the portal
// (`POST /api/content/help` is on the portal's own allow-list, and the seeded
// Client role holds `help:create`) with up to 20,000 characters of their own
// prose in the description. That prose is read by the model the next time
// anybody here asks the assistant a question that touches tickets. So the
// attacker writes the plan and we deliver it: read the margin, then reply with
// it. `reply_help_ticket` is a write gated on `help:read`, the lowest bar in the
// catalogue, and its confirm predicate fires only when the reply @mentions
// somebody — so a reply with no mentions opens no panel at all, and
// `notifyReplyAndMentions` emails the raiser a preview of the body.
//
// THE ONLY THING STANDING THERE TODAY IS A SENTENCE IN A TOOL DESCRIPTION —
// "INTERNAL, never repeat this figure to a client, in any form". R24's own text
// already says why that is not enough, about a different half of the same
// problem: "a condition can be inverted and a permission can be granted, an
// import cannot be forgotten." A prose instruction to a language model is the
// least structural defence available, and it is being asked to hold against
// prose written by the person it is protecting the number from.
//
// SO: IF A CONVERSATION HAS READ AN INTERNAL NUMBER, IT MAY NOT THEN WRITE TO A
// DOOR THE CLIENT'S OWN BROWSER OPENS. Per turn, refused at the step, before the
// door is called. Not a confirm panel — the owner considered and rejected making
// staff click through one on ordinary work — and not a scan of the outgoing text
// either, because "does this paragraph contain a margin" is a judgement and this
// has to be a fact.
//
// ── BOTH SETS ARE DERIVED, AND NEITHER IS A LIST OF TOOL NAMES ───────────────
//
// A hand-written list of money tools would rot the day somebody adds one, which
// is the failure this codebase has now made often enough to have a name for.
// So:
//
//   THE DOORS come from the two files that already decide them, and the CHECK
//   re-derives both off disk and fails if either pin has drifted
//   (`internal-money-never-in-portal`, web/test/rules.test.ts):
//     • the money doors are the tenancy routes whose handlers call an export of
//       workers/tenancy/src/lib/internal-money.ts — the same walk R24's first
//       clause already makes, over the same file, so the two cannot disagree;
//     • the client-readable doors are the non-GET entries of `PORTAL_DOORS` in
//       workers/portal-gateway/src/index.ts — the allow-list is the definition
//       of what a client's browser may call, so it is the oracle rather than
//       anything invented here.
//
//   THE TOOLS are then derived from the doors AT RUNTIME, off the catalogue
//   itself. A money tool added tomorrow on a door already on this list is
//   covered the moment it exists, with nothing edited here. A brand new money
//   DOOR is the only thing that needs a line, and the check demands it.
//
// WHY THE DOOR PINS ARE COPIES AT ALL. The worker cannot read the tenancy lib or
// the portal gateway at runtime — they are other workers' private source, in
// other bundles. So the runtime carries the answer and the build proves it,
// which is the shape `PALETTE_LITERAL_OK` and `STORED_FILES` already use here:
// data, rot-checked against its own oracle, in both directions.
//
// ── WHAT THIS DELIBERATELY DOES NOT COVER ────────────────────────────────────
//
// Named here because a defence whose edges are not written down gets mistaken
// for a wall:
//
//   • ACROSS TURNS. The taint is per-turn, which is the owner's decision and the
//     right one: a thread-wide taint would refuse a ticket reply for the rest of
//     a conversation's life because somebody asked about a margin once, and a
//     control that fires on ordinary work is a control people route around.
//     Tool RESULTS are not replayed across turns (`replayable` in agent.ts keeps
//     user + assistant text only), so the figure does not survive on its own —
//     but a model that said the number out loud in its own prose leaves that
//     prose in the history. Read the honest sentence as: this closes the
//     one-turn chain, which is the shape an injected instruction has to take.
//   • A WRITE ON AN AGENCY-ONLY DOOR WHOSE ROW A CLIENT LATER READS. The oracle
//     is the doors a client's browser opens, not a data-flow analysis of every
//     table a portal GET can reach. `resolve_help_ticket` and
//     `create_deliverable` are the two worth knowing about. Widening the oracle
//     means deriving "which writes land in a table a portal read returns", which
//     is `PORTAL_VISIBLE_READS`' territory and a bigger law than this one.
//   • WHETHER THE MODEL WOULD HAVE COMPLIED AT ALL. Unproven, and deliberately:
//     nobody has spent an API call to find out. The structural gap was
//     confirmed by reading; the exploitability was not.

import { SHARED_TOOLS } from "./tool-catalog"

/** THE DOORS THAT HAND BACK WHAT OUR OWN WORK COSTS.
 *
 * Every tenancy route whose handler calls an export of
 * `workers/tenancy/src/lib/internal-money.ts` — the internal rate card, the role
 * rate card, the margin, and what an app is said to have given back (whose money
 * half is priced off the role card). Paths only: a WRITE here is on the list too,
 * because a caller who is setting an internal rate is a caller who already has
 * the number.
 *
 * DERIVED, NOT DECIDED. Re-derived off disk on every build from that file's own
 * exports and tenancy's own ROUTES table, and this pin must equal it exactly. */
export const INTERNAL_MONEY_DOORS: readonly string[] = [
  "/api/tenancy/internal-rates",
  "/api/tenancy/internal-rates/update",
  "/api/tenancy/internal-rates/active",
  "/api/tenancy/margin",
  "/api/tenancy/role-rates",
  "/api/tenancy/app-money",
]

/** THE DOORS A CLIENT'S OWN BROWSER OPENS AND WRITES THROUGH.
 *
 * The non-GET half of the client portal's `PORTAL_DOORS` allow-list, verbatim.
 * A row written through one of these is a row on the client's side of the wire
 * by definition — the portal is the thing that opens it.
 *
 * The auth doors carry no agent tool today and are on the list anyway: this is a
 * MIRROR of the allow-list, and an editorial subtraction is the thing that stops
 * being true later. DERIVED and rot-checked, like the list above. */
export const CLIENT_READABLE_WRITE_DOORS: readonly string[] = [
  "POST /api/auth/email/start",
  "POST /api/auth/email/verify",
  "POST /api/auth/profile",
  "POST /api/auth/language",
  "POST /api/auth/logout",
  "POST /api/tenancy/portal/switch-account",
  "POST /api/content/help",
  "POST /api/content/help/reply",
  "POST /api/content/help/update",
  "POST /api/content/help/rank",
  "POST /api/content/help/attachments",
  "POST /api/content/help/attachments/remove",
  "POST /api/content/help/validate",
  "POST /api/content/todos/complete",
  "POST /api/tenancy/processes/comments",
]

/** The wiring of one door, as much of it as either question needs. Structural on
 * purpose: the agent's `AgentTool` and the catalogue's `SharedTool` are two
 * projections of the same endpoint, and both satisfy this without either
 * importing the other. */
export type DoorFacts = { method: string; path: string; write: boolean }

/** Does this door hand back one of the agency's own figures? */
export function readsInternalMoney(door: Pick<DoorFacts, "path">): boolean {
  return INTERNAL_MONEY_DOORS.includes(door.path)
}

/** Does this door write where a client can read it? A read is never outbound —
 * it puts nothing anywhere — so `write` is half the question. */
export function writesWhereClientsRead(door: DoorFacts): boolean {
  return door.write && CLIENT_READABLE_WRITE_DOORS.includes(`${door.method} ${door.path}`)
}

/** THE MONEY TOOLS, DERIVED FROM THE DOORS AT LOAD TIME.
 *
 * This is the half that cannot rot: the names are read off the shipped catalogue
 * rather than typed, so a second tool on `/api/tenancy/margin` taints a
 * conversation from the moment it is written. Only a brand-new money DOOR needs
 * a line above, and the build asks for it. */
export const INTERNAL_MONEY_TOOLS: ReadonlySet<string> = new Set(
  SHARED_TOOLS.filter((t) => readsInternalMoney(t)).map((t) => t.name)
)

/** HAS AN INTERNAL NUMBER ENTERED THIS CONVERSATION? The argument is the tool
 * names the turn has already run — which is what the model has in front of it,
 * read off the same messages the model is reading.
 *
 * A REFUSED money read taints too, and that is deliberate rather than sloppy:
 * the caller asked for the figure, and a control that has to work out whether
 * the door actually answered is a control with a branch in it. Fail safe; the
 * cost is one extra refusal in a turn that was already going wrong. */
export function moneyIsInContext(toolNames: readonly (string | null | undefined)[]): boolean {
  return toolNames.some((n) => !!n && INTERNAL_MONEY_TOOLS.has(n))
}

/** THE WHOLE DECISION, IN ONE PLACE, PURE — so the law can RUN it rather than
 * read it. True means: this call would put an internal number on a surface the
 * client reads, and must be refused before the door is opened. */
export function refusesOutboundMoney(
  door: DoorFacts,
  toolNamesSoFar: readonly (string | null | undefined)[]
): boolean {
  return writesWhereClientsRead(door) && moneyIsInContext(toolNamesSoFar)
}
