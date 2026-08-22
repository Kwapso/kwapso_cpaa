// Completion math for the learning ProgressDashboard — pure + unit-tested. Given
// members, items, and the set of {memberId,itemId} completions, it produces the
// per-member and per-item rollup counts and a fast "is this cell done?" lookup.

export interface ProgressEntry {
  memberId: string
  itemId: string
}

export interface CompletionStats {
  /** `${memberId}::${itemId}` for each completion. */
  doneSet: Set<string>
  /** Items completed, per member id. */
  perMember: Record<string, number>
  /** Members who completed it, per item id. */
  perItem: Record<string, number>
  totalItems: number
  totalMembers: number
  isDone: (memberId: string, itemId: string) => boolean
}

const key = (memberId: string, itemId: string) => `${memberId}::${itemId}`

export function completionStats(
  members: { id: string }[],
  items: { id: string }[],
  done: ProgressEntry[]
): CompletionStats {
  const memberIds = new Set(members.map((m) => m.id))
  const itemIds = new Set(items.map((i) => i.id))

  const doneSet = new Set<string>()
  const perMember: Record<string, number> = {}
  const perItem: Record<string, number> = {}
  for (const m of members) perMember[m.id] = 0
  for (const i of items) perItem[i.id] = 0

  for (const d of done) {
    // ignore completions for members/items not in scope, and dedupe
    if (!memberIds.has(d.memberId) || !itemIds.has(d.itemId)) continue
    const k = key(d.memberId, d.itemId)
    if (doneSet.has(k)) continue
    doneSet.add(k)
    perMember[d.memberId] += 1
    perItem[d.itemId] += 1
  }

  return {
    doneSet,
    perMember,
    perItem,
    totalItems: items.length,
    totalMembers: members.length,
    isDone: (memberId, itemId) => doneSet.has(key(memberId, itemId)),
  }
}
