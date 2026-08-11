// DRAG-RANK, the algebra — shared/workers/rank.ts.
//
// A rank key is only worth anything if ONE property holds: the value it returns
// sorts strictly between its two neighbours, under the SAME comparison SQLite
// will use (plain lexicographic over the string). Everything the feature promises
// — that a drag writes one row, that two people dragging different rows cannot
// collide, that a list stays in the order somebody arranged — rests on it.
//
// So this suite does not check a handful of hand-picked pairs and call it proved.
// It DRIVES the generator the way the product will: hundreds of inserts at the
// top, at the bottom, and into the middle of a list, re-sorting after each one and
// demanding the order is exactly what was asked for. A midpoint function that is
// subtly wrong survives spot-checks and dies here on iteration forty.

import { describe, expect, it } from "vitest"

import { rankAtTop, rankBetween } from "@shared/workers/rank"

/** The comparison SQLite makes on a TEXT column, said once so no assertion below
 * can quietly use a different one (JS `<` on strings IS lexicographic by code
 * unit, and the rank alphabet is ASCII, so the two agree by construction). */
const below = (a: string, b: string) => a < b

describe("rankBetween: the value lands strictly between its neighbours", () => {
  it("splits an ordinary pair", () => {
    const mid = rankBetween("A", "C")
    expect(below("A", mid) && below(mid, "C"), `${mid} must sit between A and C`).toBe(true)
  })

  it("splits a pair with no room at the first character by going deeper", () => {
    // "A" and "B" are adjacent — there is no character between them, so the only
    // answer is a longer string starting with "A".
    const mid = rankBetween("A", "B")
    expect(below("A", mid) && below(mid, "B"), `${mid} must sit between A and B`).toBe(true)
    expect(mid.length).toBeGreaterThan(1)
  })

  it("goes above everything when there is no upper neighbour", () => {
    expect(below("M", rankBetween("M", null))).toBe(true)
  })

  it("goes below everything when there is no lower neighbour", () => {
    expect(below(rankBetween(null, "M"), "M")).toBe(true)
  })

  it("answers an empty list", () => {
    expect(rankBetween(null, null).length).toBeGreaterThan(0)
  })

  // THE INVARIANT THE DEGENERATE CASE RESTS ON. rankBetween cannot serve an
  // `after` made entirely of the alphabet's first character, and the reason it
  // never has to is that it never PRODUCES one — the midpoint of a range whose
  // top is at least two above its bottom is at least one. Said out loud here, so
  // the day someone changes the midpoint arithmetic this goes red rather than
  // the feature going strange six months later.
  it("never emits a rank that ends at the alphabet's floor", () => {
    let value = rankBetween(null, null)
    for (let i = 0; i < 300; i++) {
      expect(value.endsWith("0"), `${value} ends at the floor — nothing can ever be ranked below it`).toBe(false)
      value = rankBetween(null, value) // keep pushing toward the bottom
    }
  })
})

describe("rankBetween: a list stays in the order somebody arranged", () => {
  /** Sort the way the ticket list does: `ORDER BY rank DESC` — highest first. */
  const listed = (rows: { id: string; rank: string }[]) =>
    [...rows].sort((a, b) => (a.rank < b.rank ? 1 : a.rank > b.rank ? -1 : 0)).map((r) => r.id)

  it("200 tickets raised in turn read newest-first", () => {
    const rows: { id: string; rank: string }[] = []
    for (let i = 0; i < 200; i++) {
      // Exactly what createTicket does: the new row goes above the highest rank
      // anyone can see.
      const highest = rows.length ? rows.map((r) => r.rank).sort().at(-1)! : null
      rows.push({ id: `t${i}`, rank: rankAtTop(highest) })
    }
    // Newest first, which is what "raise a ticket and it appears at the top" means.
    expect(listed(rows)[0]).toBe("t199")
    expect(listed(rows).at(-1)).toBe("t0")
  })

  it("200 drags into the middle each land exactly where they were dropped", () => {
    // Start with three, then repeatedly drag the last row between the first two.
    let rows = [
      { id: "a", rank: rankBetween(null, null) },
      { id: "b", rank: "" },
      { id: "c", rank: "" },
    ]
    rows[1].rank = rankBetween(null, rows[0].rank) // b below a
    rows[2].rank = rankBetween(null, rows[1].rank) // c below b

    for (let i = 0; i < 200; i++) {
      const order = listed(rows)
      const moving = order.at(-1)! // take the bottom one…
      const above = rows.find((r) => r.id === order[0])!
      const below_ = rows.find((r) => r.id === order[1])!
      // …and drop it between the top two. `afterId` is the row above it in the
      // list (the HIGHER rank), so the new key goes between the lower one's and
      // the higher one's — low bound first, exactly as setTicketRank calls it.
      rows.find((r) => r.id === moving)!.rank = rankBetween(below_.rank, above.rank)
      const after = listed(rows)
      expect(after[0], `drag ${i}: the top row must not move`).toBe(above.id)
      expect(after[1], `drag ${i}: the dragged row must land second`).toBe(moving)
      expect(after[2], `drag ${i}: the row it was dropped above must follow it`).toBe(below_.id)
      rows = rows.map((r) => ({ ...r }))
    }
  })
})
