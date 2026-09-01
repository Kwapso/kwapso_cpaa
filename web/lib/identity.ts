// Shared identity display helpers — ONE source for turning a person or team into
// a display name, two-letter initials, or a single-letter avatar fallback, so
// every screen renders the same person the same way (no per-component drift).

/** A person's display name: "First Last", falling back to their email, else "". */
export function personName(p: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || (p.email ?? "")
}

/** Two-letter initials for a person-avatar fallback (e.g. "AK"); "?" if unknown. */
export function personInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?"
}

/** Same two-letter contract as `personInitials`, for a caller that only has a
 * joined display name to work with — an activity row's `actorName` is a name
 * SNAPSHOT (the door never carries first/last separately for it, on purpose:
 * the sentence should still read correctly for someone who has since renamed
 * or left), so the first and last name pieces have to be split back out of
 * one string rather than read off two fields. */
export function nameInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  return personInitials(parts[0], parts.length > 1 ? parts[parts.length - 1] : undefined)
}

/** Single-letter mark for a team / single-name avatar fallback; "?" if blank. */
export function letterMark(name?: string | null): string {
  return name?.[0]?.toUpperCase() ?? "?"
}
