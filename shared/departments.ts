// THE FIVE DEPARTMENTS a piece of our own admin belongs to — and the ONE thing
// each of them changes about the form.
//
// They are not an enum. The five names are seeded as ordinary values in the
// `Department` dropdown group (SELECTABLE_GROUPS.department, the same group a
// meeting purpose already pick-or-creates into), so a team adds or retires one on
// the Dropdown values screen without a deploy — the owner's answer to c1. What
// lives HERE is the part a dropdown row cannot carry: the mark and the colour the
// agency already chose for each of the five in the app they are leaving, and the
// SECOND QUESTION each one asks.
//
// The names, marks and colours are read off the legacy data (glide/data/
// agency.departments.json, the `departments` table) rather than invented: Sales
// paper-airplane #F4C600, Admin folder #6738E8, Production code-bracket #B1E847,
// Marketing star #f584e3, Business rocket-launch #C497FE. The legacy set had
// eight rows; three of them (System, Operations, Support) carried no colour and
// no icon, which is what "the five" means.
//
// A department a team invents itself is a first-class value with no mark and no
// second question — `departmentMark` answers null and `departmentAsks` answers
// "nothing else", which is the honest reading of a word the code has never met.

/** One of the five the agency already runs on: its name, its mark, its colour. */
export type DepartmentStyle = {
  name: string
  /** a lucide icon name, the nearest equivalent of the legacy mark */
  icon: "send" | "folder" | "code" | "star" | "rocket"
  /** the hex the agency chose for it, used as a small dot beside the name */
  color: string
}

export const TASK_DEPARTMENTS: DepartmentStyle[] = [
  { name: "Sales", icon: "send", color: "#F4C600" },
  { name: "Admin", icon: "folder", color: "#6738E8" },
  { name: "Production", icon: "code", color: "#B1E847" },
  { name: "Marketing", icon: "star", color: "#f584e3" },
  { name: "Business", icon: "rocket", color: "#C497FE" },
]

/** The mark and colour for a department, or null for one a team invented. */
export function departmentMark(name: string | null | undefined): DepartmentStyle | null {
  if (!name) return null
  return TASK_DEPARTMENTS.find((d) => d.name === name) ?? null
}

/** The department's mark as a CHARACTER, for the places a mark has to be text —
 * a table cell, a select option, a row title. Each is the nearest plain glyph to
 * the icon the agency chose (paper aeroplane, folder, code brackets, star,
 * rocket). It is a MARK, never an emoji in copy: it sits where an icon sits and
 * never inside a sentence, which is the distinction UI-RULEBOOK G1 draws. A
 * department the code has never met has no mark, and reads as itself. */
export function departmentGlyph(name: string | null | undefined): string {
  const mark = departmentMark(name)
  if (!mark) return ""
  if (mark.icon === "send") return "➤"
  if (mark.icon === "folder") return "▤"
  if (mark.icon === "code") return "⟨⟩"
  if (mark.icon === "star") return "★"
  return "▲"
}

/** WHAT ELSE THE DEPARTMENT ASKS FOR — the second field, decided by the first.
 *
 * "A Production task must name an app" (settled, CHECKLIST 3.5 / c6); a Sales
 * task names the client it is about; an Admin task may name one. The rest ask
 * nothing else. It is stated once, here, because the FORM has to show the field
 * the moment the department is picked and the DOOR has to refuse a save without
 * it — two places, one sentence, or they drift into a field that appears and is
 * then not required (or worse, is required and never appears). */
export function departmentAsks(name: string | null | undefined): {
  field: "app" | "account" | null
  required: boolean
} {
  if (name === "Production") return { field: "app", required: true }
  if (name === "Sales") return { field: "account", required: true }
  if (name === "Admin") return { field: "account", required: false }
  return { field: null, required: false }
}

/** THE EISENHOWER SCORE — 1 to 4, from the two ticks.
 *
 * `(important × 2) + urgent + 1`, which is the formula the agency's own legacy
 * screen used and not one of the several sensible alternatives: neither tick is
 * 1 (do it when you get to it), urgent alone is 2, important alone is 3, both is
 * 4 (do it now). It replaces a high/medium/low picker, which asked one question
 * where the answer needs two. */
export function priorityScore(important: boolean, urgent: boolean): 1 | 2 | 3 | 4 {
  return ((important ? 2 : 0) + (urgent ? 1 : 0) + 1) as 1 | 2 | 3 | 4
}

/** What each of the four scores is CALLED, so a list can show them distinctly and
 * every screen calls them the same thing. */
export const PRIORITY_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Whenever",
  2: "Urgent",
  3: "Important",
  4: "Do it now",
}
