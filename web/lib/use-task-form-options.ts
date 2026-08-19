"use client"

// THE PICKERS A TASK FORM NEEDS — in a lib rather than beside one screen, because
// two screens open that form now: the Tasks list writes a new one, and a task's
// own record CORRECTS one (the edit door, 19 Aug 2026). Two copies of this hook
// would be two forms offering different clients, or one of them missing a
// department the other had.
//
// `teamId` may be null, for a caller who cannot open the form at all: a person
// without `work:edit` should not pay four reads for pickers they will never see.

import { assignableMembers } from "@/lib/members"
import { appsKey, listFetch } from "@/lib/live-resources"
import { tenancy } from "@/lib/api/tenancy"
import { SELECTABLE_GROUPS } from "@shared/selectable-groups"
import { useCached } from "@shared/web/store"
import type { Account, AppRow, SelectableValue, TeamMember } from "@shared/types"

/** WHAT A TASK NEEDS TO BE WRITTEN AT ALL — the people it can be given to, the
 * apps a Production one must name, the clients a Sales one must name, and the
 * agency's own five departments. Every one is a cache another screen already
 * holds, so opening this form costs a team that has been anywhere else nothing. */
export function useTaskFormOptions(teamId: string | null) {
  const membersQ = useCached<TeamMember[]>(teamId ? `members:${teamId}` : null, () =>
    tenancy.members().then((r) => r.members)
  )
  const appsQ = useCached<AppRow[]>(teamId ? appsKey(teamId) : null, () => listFetch.apps(teamId as string))
  const accountsQ = useCached<Account[]>(teamId ? `accounts:${teamId}` : null, () => listFetch.accounts(teamId as string))
  const valuesQ = useCached<SelectableValue[]>(teamId ? `selectable:${teamId}` : null, () => listFetch.selectable(teamId as string))
  return {
    // Who's doing it: OUR people. A client login is an ordinary member and
    // was in this dropdown until the one seam started deciding (lib/members).
    members: assignableMembers(membersQ.data),
    apps: (appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    accounts: (accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    // A retired department never appears as a pickable option, exactly as a
    // retired ticket type does not — but a task already filed under one still
    // reads truthfully.
    departments: (valuesQ.data ?? [])
      .filter((v) => v.active && v.type === SELECTABLE_GROUPS.department)
      .map((v) => v.value),
  }
}

