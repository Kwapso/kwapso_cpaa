// WHAT THE CONFIRM PANEL ACTUALLY SAYS — the resolved payload of a proposed
// action, in words a manager can read.
//
// The confirm panel is the DESIGNATED defence against the assistant being talked
// into something. The model reads team data an attacker can author (a ticket
// description is up to 20,000 characters of somebody else's text), so the last
// line of defence is a human clicking "Go ahead". A panel that says only "Set
// access rights for the Sub Admin role" asks that human to approve a payload
// they cannot see — and a confirm you cannot read is not a confirm. So the panel
// shows the BODY THE DOOR WILL RECEIVE: what is approved is what happens.
//
// DERIVED, never a per-tool list. The lines come from the tool's own `buildBody`
// (literally the object posted to the gated door), so a tool added tomorrow
// shows its payload the moment it exists. An unlabelled field still appears,
// under a humanised version of its own key — nothing can hide by being new.
//
// Three things the renderer refuses to do: echo a value whose key smells like a
// credential, run a long value off the panel, or print raw JSON at somebody who
// is not a programmer.

import { TEAM_MODULE_CATALOG } from "../team-modules"
import type { PendingCall } from "../types"

/** A value under one of these keys is NEVER echoed — the panel says "hidden"
 * instead. No tool carries one today; this is the guard for the one that does. */
const SECRET_KEY = /pass(word|phrase)|secret|token|credential|api[-_]?key|^key$|authorization|session/i

/** One line stays one line: past this a value is clipped with an ellipsis. */
const MAX_VALUE = 160
/** A panel, not a data dump. Extra lines collapse into "…and N more".
 *
 * WITH ONE EXCEPTION, and it is the whole reason this file exists: a PERMISSION
 * SHEET is never abbreviated. The grid renderer prints one line per module —
 * including every module being set to NO ACCESS — because the door writes them
 * all, and a panel that showed only the grants would let a silent removal
 * through. Collapsing the tail of that grid into "…and 6 more" is the same
 * stealth demotion arriving by a different route: the admin approves a sheet
 * they were shown two thirds of.
 *
 * It was not hypothetical. This cap was 16 while the app had 13 modules, so a
 * sheet plus its role line fitted with two lines to spare — and the day four
 * more modules shipped, the last of them fell off the panel. The fix is not a
 * bigger number, which would rot again at the next module; it is that a grid is
 * not subject to a line budget at all — `hasGrid` below.
 *
 * (Two lanes found this independently and fixed it two ways. The other derived
 * the cap from the module catalogue, which also never rots; it is gone because
 * once a grid is exempt outright the cap governs only payloads that are NOT
 * sheets, and for those a plain 16 says what it means.)
 *
 * AND THEN IT ROTTED ANYWAY, from the other direction, exactly as that comment
 * predicted for the number it had just replaced. Nothing to do with modules this
 * time: an ACCOUNT grew. A company record gained a split postal address, an
 * industry, a paragraph, a logo and a cover, which took `create_account`'s body
 * past sixteen named fields — and the seventeenth to fall off the panel was the
 * language the client is written to. The admin was still asked to approve it.
 *
 * So the number says what it is now: a ceiling on lines a payload can produce
 * VARIABLY (a nested object, an array of ids), sized so that no tool's own
 * declared fields can reach it. A schema is written by hand, one field at a
 * time, by somebody who meant each one; there is no honest reason to hide one
 * from the person being asked to say yes. */
const MAX_LINES = 32
/** Ids listed from a bulk array before the count carries the rest. */
const MAX_ITEMS = 3

/** Glossary words for the fields that carry one, plus `<tool>.<field>` overrides
 * where a bare key is ambiguous (`value` is a dropdown option in one tool and a
 * whole permission sheet in another). Everything else humanises its own key —
 * missing from this map means "plainer label", never "hidden". */
const FIELD_LABELS: Record<string, string> = {
  "set_role_permissions.value": "Access rights",
  "update_dropdown_value.value": "New name",
  "create_dropdown_value.type": "Dropdown list",
  "create_dropdown_value.value": "New option",
  "bulk_set_help_status.status": "New status",
  "run_import_batch.summary": "What will be imported",
  id: "Record",
  ids: "Records",
  roleId: "Role",
  userId: "Member",
  inviteId: "Invite",
  helpId: "Ticket",
  toStatus: "New status",
  dryRun: "Count only, change nothing",
  active: "Switched on",
  required: "Everyone must read it",
  body: "Message",
  contentLink: "Link",
  helpType: "Type",
  screenRecordingLink: "Screen recording",
}

/** The module rows of a role's permission sheet, in the app's own words. */
const MODULE_LABELS = new Map(TEAM_MODULE_CATALOG.map((m) => [m.key, m.label]))

/** "screenRecordingLink" → "Screen recording link"; "member_roles" → "Member
 * roles". A trailing id/ids is dropped — "Batch id" reads like a database, "Batch"
 * reads like a sentence. */
function humanize(key: string): string {
  const words = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+ids?$/i, "")
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : "Detail"
}

/** What the panel calls one field of the body. Exported so the coverage test can
 * ask for the same label the renderer uses, rather than retyping it. */
export function fieldLabel(tool: string, key: string): string {
  return FIELD_LABELS[`${tool}.${key}`] ?? FIELD_LABELS[key] ?? humanize(key)
}

const clip = (text: string): string =>
  text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** One field's value as a single readable phrase, or null when there is nothing
 * to show (an omitted optional field changes nothing, so it says nothing).
 * `names` is the same id → friendly-name map the step summaries use. */
function renderValue(key: string, value: unknown, names?: Record<string, string>): string | null {
  if (value === undefined || value === null) return null
  if (SECRET_KEY.test(key)) return "hidden"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    // A ULID we can name reads as the person / role it points at. Newlines are
    // collapsed so a pasted ticket body can't smear across the panel.
    const text = (names?.[value] ?? value).replace(/\s+/g, " ").trim()
    return text ? clip(text) : null
  }
  if (Array.isArray(value)) {
    if (!value.length) return "none"
    const shown = value
      .slice(0, MAX_ITEMS)
      .map((v) => (typeof v === "string" ? (names?.[v] ?? v) : String(v)))
      .join(", ")
    return clip(value.length > MAX_ITEMS ? `${value.length} in total — ${shown}, …` : shown)
  }
  return null
}

/** A permission-sheet field, module by module.
 *
 * The door WRITES EVERY MODULE (a module the payload doesn't mention is set to
 * no access), so the panel walks the whole catalogue rather than the keys the
 * model bothered to send. A quietly-dropped module is a REMOVAL of access, and a
 * removal the reader can't see is exactly the hole this file exists to close. */
function renderGrid(grid: Record<string, unknown>): string[] {
  const keys = [...MODULE_LABELS.keys(), ...Object.keys(grid).filter((k) => !MODULE_LABELS.has(k))]
  return keys.map((key) => {
    const row = grid[key]
    const label = MODULE_LABELS.get(key) ?? humanize(key)
    // A key that isn't one of our modules, or isn't the rights shape, is shown
    // as whatever it actually is. Calling it "no access" would describe a
    // permission that was never being set — and a panel that says something
    // untrue is no better than one that stays quiet.
    if (!isPlainObject(row)) {
      if (!MODULE_LABELS.has(key)) return `${label}: ${renderValue(key, row) ?? "nothing"}`
      return `${label}: no access`
    }
    const on = Object.entries(row)
      .filter(([, v]) => v === true)
      .map(([right]) => right)
    return `${label}: ${on.length ? on.join(", ") : "no access"}`
  })
}

/** The `tool.field` positions that ARE a permission sheet.
 *
 * Keyed by the TOOL, never inferred from the payload. The payload is written by
 * the model, so any shape test on it is a test the model can fail on purpose: an
 * earlier version asked "do all the keys hold objects?", and `{ learning: {…},
 * note: "" }` answered no — which sent the whole sheet down the generic path and
 * silently dropped the nine modules being set to no access, while the door wrote
 * them anyway. The tool declares what a field means; the data does not get a
 * vote. */
const PERMISSION_GRID_FIELDS = new Set([
  "set_role_permissions.value",
  // A role CREATED with its matrix is the same grant in one call — it reaches
  // `setRolePermissions` through the same door, writing every module, so the
  // panel owes the reader the same module-by-module sheet. (R21 put this field
  // on the tool; the panel had to learn it in the same breath, or an admin would
  // have approved "Permissions — Learning — Read: Yes" and never been shown the
  // nine modules the same call sets to no access.)
  "create_role.permissions",
])

function isPermissionGrid(tool: string, key: string): boolean {
  return PERMISSION_GRID_FIELDS.has(`${tool}.${key}`)
}

/** The body a confirmed call will POST, as the lines the panel shows under the
 * one-line summary. `tool` names the tool only so an ambiguous field can carry a
 * clearer label. */
export function describePayload(
  tool: string,
  body: Record<string, unknown>,
  names?: Record<string, string>
): string[] {
  const lines: string[] = []
  // Set the moment a permission sheet is rendered — see MAX_LINES for why that
  // exempts the whole panel from the budget rather than just the grid's own
  // lines: the grid is the payload, and the two or three lines beside it are the
  // context that says WHOSE sheet it is.
  let hasGrid = false
  for (const [key, value] of Object.entries(body)) {
    if (isPlainObject(value)) {
      if (SECRET_KEY.test(key)) lines.push(`${fieldLabel(tool, key)}: hidden`)
      else if (isPermissionGrid(tool, key)) {
        hasGrid = true
        lines.push(...renderGrid(value))
      } else lines.push(...describePayload(tool, value, names).map((l) => `${fieldLabel(tool, key)} — ${l}`))
      continue
    }
    const shown = renderValue(key, value, names)
    if (shown !== null) lines.push(`${fieldLabel(tool, key)}: ${shown}`)
  }
  if (hasGrid || lines.length <= MAX_LINES) return lines
  const kept = lines.slice(0, MAX_LINES - 1)
  return [...kept, `…and ${lines.length - kept.length} more`]
}

/** THE seam that builds a proposed call for the confirm panel: the one-line
 * summary AND the payload behind it, so the two can never drift apart. Every
 * pause-for-approval goes through here. */
export function pendingCall(
  tool: {
    name: string
    buildBody?: (input: Record<string, unknown>) => Record<string, unknown>
    summarize: (input: Record<string, unknown>, names?: Record<string, string>) => string
  },
  input: Record<string, unknown>,
  names?: Record<string, string>
): PendingCall {
  // The BODY, not the model's raw arguments: buildBody is what the door receives,
  // and the door is what actually happens.
  const body = tool.buildBody ? tool.buildBody(input) : input
  return {
    name: tool.name,
    input,
    summary: tool.summarize(input, names),
    details: describePayload(tool.name, body, names),
  }
}
