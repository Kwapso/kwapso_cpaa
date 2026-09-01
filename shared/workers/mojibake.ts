// THE CHARACTERS THAT WERE LOST ON THE WAY IN, mended where the truth is known.
//
// ══════════════════════════════════════════════════════════════════════════════
// WHAT IS WRONG
//
// The Google account's own display name is mangled IN GOOGLE'S PROFILE DATA:
// "Ãlaap Kanchawala" where "Alaap" belongs. Not our decoder — proof from a
// single Google-composed email body in this base, where "⋅" and "–" decode
// perfectly and the name beside them does not, same string, same decoder.
//
// Google then writes that spelling into everything it composes: an invitation's
// SUBJECT LINE, a transcript's attendee list, a chat space's member roster. On
// 2026-08-31 that was 311 rows on staging across four kinds.
//
// ── WHY A TABLE OF KNOWN STRINGS AND NOT AN ALGORITHM ────────────────────────
//
// The principled repair for mojibake is a round trip: re-encode as CP1252,
// decode as strict UTF-8, accept only if both steps are lossless. It is general,
// it is safe, and IT DOES NOT WORK HERE — measured on these exact rows:
//
//   "kwapso sweep … Ã¢Â€Â” sweep"   round-trips to "… â sweep"   (still wrong)
//   "Ãlaap Kanchawala"               round-trips to itself        (refuses)
//
// The damage is LOSSY. CP1252 leaves five bytes undefined (81, 8D, 8F, 90, 9D)
// and the decoder that mangled these DROPPED them rather than failing. "Á" is
// UTF-8 C3 81; read as CP1252 with 81 discarded it becomes "Ã" and the second
// byte is simply gone. No algorithm inverts a deletion, and anything claiming to
// would be guessing at somebody's NAME.
//
// So every entry carries the SOURCE OF ITS TRUTH, from outside the mangled data,
// and nothing is mended that has none. Anything unmatched is left exactly as
// Google sent it and stays visible.
//
// ── WHY THIS RUNS AT INGEST AND NOT AS A REPAIR SCRIPT ───────────────────────
//
// It was a repair script first (`scripts/repair-mangled-titles.mjs`) and that
// script's own header explains why that was not enough: the Google kinds are
// `windowed`, so the sweep re-reads what Google currently holds every fifteen
// minutes, and the upsert sets `title = excluded.title` unconditionally. A row
// repaired at noon is mangled again by quarter past.
//
// The owner corrected the display name on the Google account, which fixes this
// at the source for everything Google composes FROM NOW ON. It cannot reach what
// is already written: measured on 2026-08-31, of 311 damaged rows only the 43
// chat threads are re-composed from the live directory and can heal themselves.
// The other 268 are an email's subject, an email's body or a document's text —
// frozen at the moment they were sent, and re-read verbatim by every sweep for
// as long as they sit inside Google's window.
//
// So the mend belongs on the way IN, where it is applied to every sweep of every
// lane and maintains itself. The repair script still exists for rows that have
// already fallen out of the window and will never be swept again.

/** EVERY ENTRY CARRIES THE SOURCE OF ITS TRUTH. A line without one does not
 *  belong here — that is the whole discipline of this file. Longest first: an
 *  entry must be matched before any entry that is a prefix of it. */
export const MOJIBAKE_REPAIRS: readonly { from: string; to: string; why: string }[] = [
  {
    from: "ÃƒÂƒÃ‚Â¢ÃƒÂ‚Ã¢Â‚Â¬ÃƒÂ‚Ã¢Â€Â ",
    to: "—",
    why:
      "An em dash that went through the send/receive loop TWICE. Ground truth is this repo: " +
      "scripts/google-sweep.mjs sends `${tag} — sweep`. Longest pattern first, so it is matched " +
      "before its own single-round prefix below.",
  },
  {
    from: "Ã¢Â€Â”",
    to: "—",
    why: "The same em dash, one round of mangling. Same ground truth: scripts/google-sweep.mjs.",
  },
  {
    from: "Ãlaap",
    to: "Alaap",
    why:
      "The Google account's own display name, mangled upstream. Ground truth from OUTSIDE the " +
      "mangled data, twice: a meeting-notes email in this same base writes 'Alaap Kanchawala' in " +
      "plain ASCII, and the core `users` row for alaap@kwapso.com reads first_name 'Alaap'. " +
      "The lost byte cannot be recovered — 'Á', 'Í', 'Ï', 'Ð' and 'Ý' all collapse to 'Ã' when " +
      "CP1252 drops their second byte — so this restores the name the app itself uses rather " +
      "than choosing between five accents nobody can distinguish from here.",
  },
]

/** The one sequence that says a string may be damaged. Every entry above
 *  contains it, which is what makes the early return below exact rather than an
 *  optimisation that could skip a real repair. */
export const MOJIBAKE_MARKER = "Ã"

/** Mend what is known and leave everything else alone.
 *
 *  `null`/`undefined` pass through unchanged so a caller can hand this a nullable
 *  column without a dance. A string with no marker in it is returned as-is, by
 *  identity — the overwhelmingly common case, and the sweep runs it over every
 *  body of every row on every tick. */
export function mendMojibake<T extends string | null | undefined>(text: T): T {
  if (typeof text !== "string" || !text.includes(MOJIBAKE_MARKER)) return text
  let out: string = text
  for (const r of MOJIBAKE_REPAIRS) out = out.split(r.from).join(r.to)
  return out as T
}
