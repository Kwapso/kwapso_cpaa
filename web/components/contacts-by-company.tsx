"use client"

// CONTACTS, UNDER THE COMPANY EACH ONE SITS AT — the Contacts tab of the
// accounts screen, and the only place in the agency app a collection is grouped
// by another record.
//
// The owner asked for it in one line: contacts should be "grouped by company"
// rather than a flat list. The library has no grouped collection — `List` draws
// rows and nothing else, and only `kanban` groups (UI-GAPS #24) — so this is a
// host-composed component, which is the sanctioned shape for a screen the recipe
// engine cannot express. Each group still renders through `ScreenRenderer` on
// the accounts recipe, so a row here is the same row as on the other two tabs:
// same fields, same click-through, same gating. Only the arrangement is ours.
// The pattern is `apps-screen.tsx`'s, deliberately — one card, `<section>` per
// group, a heading above each — because a second way to draw a grouped list is
// a second thing to keep in step.
//
// ── GROUPING A LIST THAT PAGES, AND WHAT WE DECIDED ─────────────────────────
//
// The accounts collection is PAGED (R14): fifty rows at a time, keyset cursor,
// newest first. That makes grouping a trap, because there are two honest
// arrangements and only one of them was available:
//
//   (a) GROUP THE ROWS WE HOLD, and say so. Every contact loaded is filed under
//       her own company, so no row is ever under the wrong heading and no
//       company is ever split in two — the map is built over EVERYTHING loaded,
//       not per page, so pressing "Load more" fills groups in rather than
//       starting new ones. What can be wrong is a group being SHORT: Bergman may
//       have five contacts and two of them loaded. So the screen says that, once,
//       above the groups, and only while there is more to load.
//
//   (b) ASK THE DOOR TO ORDER BY COMPANY, so a company's contacts are contiguous
//       and a group is complete the moment the next one starts. This is the
//       better arrangement and it is NOT AVAILABLE: `ACCOUNT_SORTS`
//       (workers/tenancy/src/lib/accounts.ts) offers name, created, updated,
//       status and code, and none of them is the parent. Adding one is not a
//       line — the sorting seam requires the ORDER BY and the CURSOR KEY to be
//       the same value (shared/workers/sorting.ts, property 2), so ordering by
//       the company's NAME means carrying that name on every account row, which
//       is a new column on a type that crosses the client portal's fence, where
//       a parent's name is not always the caller's to read. Ordering by the
//       parent's ID instead needs no new column and would give contiguity — but
//       the headings would then run in the order the companies were added, under
//       a control labelled "Company", which is the kind of order that reads as
//       broken.
//
// So this is (a), said out loud rather than implied. (b) is worth doing on its
// own, with the door change reviewed as the fence change it is.
//
// THE NAME OF A COMPANY comes from the accounts the team area has already
// loaded — the same map `apps-screen.tsx` names an app's client from, and the
// same one `shape.tsx` writes "under Bergman S.A." with. A company we are not
// holding cannot be named, so those contacts go into one honest trailing group
// rather than several headed with the same vague phrase. Both lines are true;
// one is just more specific, which is the compromise the summary line on these
// very rows already makes.

import * as React from "react"

import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { shapeAccountsList } from "@/components/deep-link/shape"
import { cursorKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { Account } from "@shared/types"
import { useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** One heading and the contacts under it. `key` is the company's id, or one of
 * the two sentinels for the groups that are not one company. */
type CompanyGroup = { key: string; title: string; rows: Account[] }

export function ContactsByCompany({
  rows,
  companyNames,
  recipe,
  rights,
  listKey,
  emptyText,
  onAction,
  onIntent,
}: {
  /** the contacts on screen — the door's page, or the find's matches. */
  rows: Account[]
  /** every account name the team area is holding, by id. */
  companyNames: Map<string, string>
  /** the accounts list recipe, so a row here is a row there. */
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the cache key whose cursor sidecar says whether there is more to load —
   * the same one `<LoadMore>` below the list reads. */
  listKey: string
  /** the empty line to use (the find's, while one is on). */
  emptyText?: string
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  // undefined = the first page has not landed; null = that was the last one.
  // Anything else is a cursor, which means a group can still be short.
  const more = useCachedValue<string | null>(cursorKey(listKey))

  // Nothing to group. The recipe's own empty state is the right one, and it is
  // the same one the other two tabs show.
  if (rows.length === 0)
    return (
      <ScreenRenderer
        recipe={withDataDrivenCollection(recipe, [], emptyText)}
        data={{ rows: [] }}
        rights={rights}
        onAction={onAction}
        onIntent={onIntent}
      />
    )

  const named = new Map<string, CompanyGroup>()
  const elsewhere: Account[] = []
  const unattached: Account[] = []
  for (const row of rows) {
    const companyId = row.parentAccountId
    if (!companyId) {
      unattached.push(row)
      continue
    }
    const name = companyNames.get(companyId)
    if (name === undefined) {
      elsewhere.push(row)
      continue
    }
    const group = named.get(companyId) ?? { key: companyId, title: name, rows: [] }
    group.rows.push(row)
    named.set(companyId, group)
  }

  // Alphabetical by company, then the two groups that are not a company, last,
  // in that order: "we know where they work, just not the name" is closer to an
  // answer than "nobody has said where they work".
  const groups: CompanyGroup[] = [...named.values()].sort((a, b) => a.title.localeCompare(b.title))
  if (elsewhere.length > 0)
    groups.push({ key: "elsewhere", title: t("Other companies"), rows: elsewhere })
  if (unattached.length > 0)
    groups.push({ key: "unattached", title: t("No company yet"), rows: unattached })

  return (
    <div className="flex flex-col gap-10">
      {/* The one sentence that keeps this honest — see (a) in the header. It is
          not shown once everything is loaded, because then a group IS the
          company's contacts and saying otherwise would be the opposite lie. */}
      {more != null && (
        <p className="text-muted-foreground text-sm">
          {t("Grouped by company, over the contacts loaded so far. Load more to fill a company in.")}
        </p>
      )}
      {groups.map((group) => {
        // `sayParent: false` — the heading above these rows already names the
        // company, so the summary line spends its three facts on something else.
        const data = shapeAccountsList(group.rows, false)
        return (
          <section key={group.key} className="flex flex-col gap-4">
            <h2 className="text-lg font-medium">{group.title}</h2>
            <ScreenRenderer
              recipe={withDataDrivenCollection(recipe, data.rows ?? [])}
              data={data}
              rights={rights}
              onAction={onAction}
              onIntent={onIntent}
            />
          </section>
        )
      })}
    </div>
  )
}
