// CSV building for the export endpoints (RFC-4180 shape). One rule: a field is
// quoted whenever it contains a comma, a quote, or a newline, with internal
// quotes doubled — so titles like `Say "hi", then wait` survive a round-trip
// through Excel/Numbers and back through the CSV importer. Rows end CRLF and the
// file opens with a UTF-8 BOM (Excel mis-decodes accents without it).
// Export is READ-gated at the route (the cross-cutting rule: export needs READ,
// import needs CREATE) and always built from the caller's OWN team database.

import { fail } from "./http"

const needsQuoting = /[",\r\n]/
// CSV / formula injection: a cell a spreadsheet would evaluate as a formula
// (leads with = + - @, or a tab/CR) is neutralized with a leading apostrophe —
// Excel/Sheets treat `'` as the text-literal marker and HIDE it, so legit values
// (a "-50% off" description) still read right while `=HYPERLINK(...)` can't run.
const formulaLead = /^[=+\-@\t\r]/

function field(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ""
  let s = typeof v === "boolean" ? (v ? "yes" : "no") : String(v)
  if (formulaLead.test(s)) s = `'${s}`
  return needsQuoting.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(
  header: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines = [header.map(field).join(","), ...rows.map((r) => r.map(field).join(","))]
  return "﻿" + lines.join("\r\n") + "\r\n"
}

/** The standard download response: text/csv + an attachment filename. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

/** AN EXPORT IS ONE WHOLE DOCUMENT, OR IT IS AN ERROR.
 *
 * R14 caps every read, and a cap is an honest refusal to answer — but a CSV
 * download is not a page, it is the file, and half a file is the one answer
 * nobody can act on. Worse here than anywhere: every export's columns LEAD WITH
 * THE IMPORT FORMAT so the file goes straight back in through the importer, and
 * a silently-truncated export re-imported is data loss wearing a round trip's
 * clothes. The roles export made that literal — a role whose permission rows fell
 * off the end of a capped read renders as an all-off matrix, so the short file
 * did not merely omit roles, it REVOKED them on the way back in.
 *
 * So every export reader hands back `complete` alongside its rows, and its door
 * refuses rather than serving a short file that looks whole. ONE sentence for all
 * four doors, because a refusal that exists four times is a refusal three of them
 * can drift out of: `noun` names the collection, `narrow` says how to ask for
 * less. */
export function exportTooLarge(cap: number, noun: string, narrow: string): Response {
  return fail(
    413,
    "export_too_large",
    `That's more than ${cap.toLocaleString("en-GB")} ${noun}, which is more than one file can carry. ${narrow}`
  )
}
