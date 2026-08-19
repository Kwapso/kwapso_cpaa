// A RECORD SOMEBODY CAN CHOOSE, AND ITS FACE (R35).
//
// Seventeen prop declarations across nine dialogs said `{ id: string; name:
// string }[]`, and every one of them was handed rows that carried a logo, a
// photo or a glyph. The type dropped the picture before the component saw it —
// so the picker could not have drawn it even if somebody had thought to, and
// nobody could tell from the call site that anything was missing.
//
// THAT IS THE FAILURE THIS FILE EXISTS TO END, and it is worth naming precisely
// because it is not forgetfulness. A field that is not carried cannot be
// forgotten later; it is already gone, silently, at a line nobody reads. Widening
// one shared type is what makes the omission visible at every call site at once,
// which is the same argument `RecordMark` makes about thirteen implementations
// of a placeholder.
//
// It is deliberately the LOOSEST shape that still carries a face: the doors
// return `Account`, `AppRow` and `TeamMember`, all of which structurally satisfy
// this, so no caller has to map anything. Optional, because a meeting purpose
// and a role genuinely have no picture and must stay pickable.

/** A record a picker can offer: what a door stores, what a person reads, and the
 * picture it is known by. */
export type PickableRecord = {
  id: string
  name: string
  /** the stored path to its own logo or photo, if it has one */
  logoUrl?: string | null
}

/** One picker option built from a record — the shape nine dialogs were writing
 * out by hand, minus the line that lost the picture.
 *
 * `shape` is left to the caller rather than guessed here: this cannot tell a
 * sole trader from a company, and getting it wrong is a face in a square. */
export function asOption(r: PickableRecord) {
  return { value: r.id, label: r.name, picture: r.logoUrl ?? null }
}
