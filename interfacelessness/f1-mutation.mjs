import { readFileSync } from "node:fs"
// Replicate staff-only.test.ts:169-187 extraction EXACTLY, against the real fence.
const fence = readFileSync("/Users/alaap_kanchwala_apple/Desktop/kwapso_cpaa/shared/workers/account-scope.ts", "utf8")
function verdict(src, label) {
  const at = src.indexOf("FROM portal_users")
  const where = src.slice(at, src.indexOf("[guard.userId]", at))
  const clause = /WHERE([\s\S]*?)ORDER BY/.exec(where)?.[1] ?? ""
  const pass = clause.trim() === "user_id = ?"
  console.log(`${label}: clause=${JSON.stringify(clause.trim())} -> ${pass ? "PASS" : "FAIL (assertion fires)"}`)
  return pass
}
const today = verdict(fence, "real fence today")
// Mutation 1: the exact regression named (liveness filter added, ORDER kept)
const m1 = fence.replace(/WHERE user_id = \?/, "WHERE user_id = ? AND deactivated_at IS NULL")
const r1 = verdict(m1, "mutant: AND deactivated_at IS NULL")
// Mutation 2: liveness filter, ORDER BY dropped entirely
const at = fence.indexOf("FROM portal_users")
const seg = fence.slice(at, fence.indexOf("[guard.userId]", at))
const m2seg = seg.replace(/WHERE user_id = \?[\s\S]*?LIMIT 1/, "WHERE user_id = ? AND deactivated_at IS NULL LIMIT 1")
const m2 = fence.slice(0, at) + m2seg + fence.slice(fence.indexOf("[guard.userId]", at))
const r2 = verdict(m2, "mutant: filter + no ORDER BY")
// Mutation 3: some OTHER proxy column
const m3 = fence.replace(/WHERE user_id = \?/, "WHERE user_id = ? AND revoked = 0")
const r3 = verdict(m3, "mutant: AND revoked = 0")
console.log("VERDICT:", today && !r1 && !r2 && !r3 ? "lock is LIVE (passes today, fires on all mutants)" : "LOCK STILL INERT SOMEWHERE")
