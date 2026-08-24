"use client"

// ONE place every screen asks "may I?" — mirrors the server's rights in the UI
// so you never see an action you can't perform (defense in depth: the server
// still enforces every write). Reads the SAME cached `my-perms:<teamId>` the
// page guard uses, so there's no extra fetch and it refreshes live when a role
// changes (AppShell invalidates it on a member_roles ping).

import type { PermissionValue } from "@shared/types"

import { tenancy } from "@/lib/api"
import { useCached } from "@shared/web/store"

export type Right = "read" | "create" | "edit" | "delete"
export type Can = (module: string, right: Right) => boolean

/** Your effective rights for a team + a `can(module, right)` check. While rights
 * are still loading, `can` returns false (so actions stay hidden until known).
 *
 * `error` IS RETURNED, and it has to be, because of where this hook sits. Every
 * record detail in the app opens by asking this hook whether you may read the
 * module — and the caller could only ask whether `perms` was still `undefined`,
 * which is true both while the answer is coming AND for ever after it failed.
 * So a single unlucky rights fetch — a cold worker, one 500 — froze navigation
 * into EVERY record type at once, behind a loading skeleton, until a hard
 * reload. The one hook nothing can render without was the one that could not
 * say it had failed.
 *
 * `can` stays false on an error, deliberately: an unknown right is not a
 * granted one, and the server refuses regardless. */
export function usePermissions(teamId: string | null): {
  perms: PermissionValue | undefined
  loading: boolean
  error: unknown
  can: Can
} {
  const q = useCached<PermissionValue>(teamId ? `my-perms:${teamId}` : null, () =>
    tenancy.myPermissions().then((r) => r.permissions)
  )
  const perms = q.data
  const can: Can = (module, right) => perms?.[module]?.[right] === true
  return { perms, loading: q.loading, error: q.error, can }
}
