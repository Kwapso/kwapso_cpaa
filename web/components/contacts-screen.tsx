"use client"

// CONTACTS — every PERSON linked into the customer spine, across every account,
// in one list (client, 31 Aug 2026: "contacts as a real sidebar page, also
// remove the tab from inside accounts"). SAME table, SAME door, SAME
// `contacts:read` gate the Companies/All strip on Accounts already checks —
// this is a second address for rows the app already fetches, not a new
// capability.
//
// ITS OWN FILE, not a branch of `collection-content.tsx`'s big switch — not
// because it needs a hook (it does not; the tab still rides the URL, exactly
// the way `collection-content.tsx`'s own Accounts branch keeps its tab in
// `ctx.query` rather than local state), but because `web/test/rules.test.ts`'s
// "a tab strip is not nested inside another one" census counts how many times
// the TabsView element appears in one file, as its proxy for "one screen" (the
// client's ruling: "there can never be 2 rows of tabs … just never"). Accounts
// and Contacts are two different screens that happen to share one switch
// statement, never rendered together — but the census cannot tell that from
// two DIFFERENT screens simply stacked one after another in the same source
// file. Its own file keeps the census honest without asking for an exemption
// that would not even describe what is actually happening here (nothing is
// nested).
//
// A CONTACT'S ROW OPENS THE SAME RECORD IT ALWAYS DID. An individual account is
// one row of the SAME `accounts` table a company is, so `onIntent` (the
// deep-link host, deep-link-screen.tsx) resolves this list's "open" intent to
// `/accounts/<id>` — never a second address for a record that already has one.
//
// BY COMPANY / ALL — the client's explicit ruling that Contacts "is a min[main]
// screen so will need tabs like any main screen" (31 Aug 2026). The genuine
// distinction already lived here before it had a tab to sit on:
// `ContactsByCompany` is one arrangement of these same rows, and a flat list is
// the other — no second door question, unlike Accounts' own Companies/All
// (which narrows `type`). Both tabs badge the SAME exact total (R16), the same
// shape sprints-screen.tsx uses for its own three views of one collection.

import { defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { ScreenRenderer, type ScreenActionContext, type ScreenIntent } from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { CountedAbove } from "@/components/counted-tabs"
import { LoadError, CollectionCard } from "@/components/deep-link/screen-bits"
import { ContactsByCompany } from "@/components/contacts-by-company"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { shapeAccountsList } from "@/components/deep-link/shape"
import { tenancy } from "@/lib/api"
import { accountsKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import { formatCount } from "@shared/web/format-count"
import type { Account } from "@shared/types"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"

export function ContactsScreen({
  teamId,
  t,
  go,
  sectionPath,
  tab,
  accountsQ,
  total,
  recipe,
  rights,
  onAction,
  onIntent,
}: {
  teamId: string
  t: (english: string) => string
  go: (path: string, q?: Record<string, string>) => void
  sectionPath: string
  /** `ctx.query.tab` — the switch is pure, so the view rides the URL exactly
   * the way Accounts' own `accountTab` does, rather than local state. */
  tab: string | undefined
  accountsQ: { data: Account[] | undefined; error: unknown }
  /** the exact server total of individuals (R16) — never the loaded page's length */
  total: number | undefined
  recipe: ScreenRecipe
  rights: ScreenRights
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  if (accountsQ.error) return <LoadError what="contacts" />
  // WAS A WHOLE-SCREEN EARLY RETURN (2026-09-03 audit — "nine screens blank
  // their entire toolbar while loading"): unmounted the heading and the
  // whole PagedFind toolbar (search/sort/tabs) along with the rows.
  // Fixed the shared way — see processes-screen.tsx's identical note.
  const contactsLoading = accountsQ.data === undefined
  const loaded = (accountsQ.data ?? []).filter((a) => a.accountType === "individual")
  const contactsTab = tab === "all" ? "all" : "grouped"
  // ONE NUMBER, ON BOTH TABS (R16) — see the file header.
  const contactsBadge = formatCount(total)
  const contactsTabs = [
    { value: "grouped", label: t("By company"), icon: "building", badge: contactsBadge, badgeVariant: "" as const },
    { value: "all", label: t("All"), icon: "users", badge: contactsBadge, badgeVariant: "" as const },
  ]

  return (
    // ARBITRATION (R16 iii): the badged strip wins, and the heading stands down
    // through the arbitration context rather than saying the same number twice —
    // the same shape Accounts' own `CountedAbove` draws.
    <CountedAbove active={contactsBadge !== ""}>
      <div className="flex flex-col gap-4">
        <CollectionHeading sectionKey="contacts" total={total} />
        {/* R14's other half, exactly as Accounts: the list pages, so the search
            box and every filter are answered by the DOOR. */}
        <PagedFind<Account>
          listKey={accountsKey(teamId)}
          placeholder={t("Search contacts…")}
          matches={{
            none: t("No contacts match"),
            one: t("1 contact matches"),
            many: t("{count} contacts match"),
          }}
          sorts={translatedSorts("accounts", t)}
          defaultSort={COLLECTION_SORTS.accounts.defaultSort}
          // R50 — the resting, individuals-only read's own row count.
          restingEmpty={loaded.length === 0}
          // 2026-09-03 audit — see processes-screen.tsx's identical note.
          restingLoading={contactsLoading}
          // ALWAYS narrowed to people — this page has no Companies/All strip to
          // switch it off with, because it IS the "people" half of that strip.
          fixed={{ type: "individual" }}
          facets={translatedFacets("accounts", t, {})}
          fetchPage={(query, cursor) =>
            tenancy
              .accounts({ ...query, cursor })
              .then((r) => ({ rows: r.accounts, nextCursor: r.nextCursor, total: r.total }))
          }
          // THE CANONICAL SHAPE (client, 31 Aug 2026 — the same reference
          // Accounts' own strip draws from): the tab strip sits INSIDE the same
          // zero-gap join as the card below it. Contacts has no create button
          // of its own (a person is added by linking one to a company, from
          // that company's own record), so this row is the tabs alone —
          // exactly as Tickets' own row is when it has nothing to put beside
          // them either. `tabs` is a `FolderTabStrip`, so there is nowhere in
          // its shape for a button to have gone anyway.
          tabs={{
            config: { ...defaultTabsConfig, tabs: contactsTabs },
            value: contactsTab,
            onValueChange: (v) => go(sectionPath, v === "grouped" ? {} : { tab: v }),
          }}
          wrap={(inner) => <CollectionCard>{inner}</CollectionCard>}
        >
          {(found) => {
            const rows = found.active ? found.rows : contactsLoading ? null : loaded
            if (rows === null) return <Skeleton variant="list" lines={4} />
            return (
              <>
                {contactsTab === "all" ? (
                  // ALL — the flat arrangement, the same recipe as the grouped
                  // rows below draw per company, just not sliced by one. No
                  // heading names the company here, so the row does (the
                  // shaper's default), exactly as Accounts' own All tab.
                  <ScreenRenderer
                    recipe={withDataDrivenCollection(recipe, shapeAccountsList(rows).rows ?? [], found.emptyText)}
                    data={shapeAccountsList(rows)}
                    rights={rights}
                    onAction={onAction}
                    onIntent={onIntent}
                  />
                ) : (
                  // GROUPED BY COMPANY, the one arrangement the recipe engine
                  // cannot express, so it is a host-composed component
                  // (UI-GAPS #24). It renders the SAME recipe per group, so a
                  // contact row here is the row the account-scoped tab used to
                  // draw.
                  <ContactsByCompany
                    rows={rows}
                    // The names the team area is already holding — no second
                    // read for a heading, the same map apps-screen.tsx names an
                    // app's client from.
                    companyNames={new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]))}
                    recipe={recipe}
                    rights={rights}
                    listKey={found.listKey ?? accountsKey(teamId)}
                    emptyText={found.emptyText}
                    onAction={onAction}
                    onIntent={onIntent}
                  />
                )}
                <LoadMore
                  listKey={found.listKey ?? accountsKey(teamId)}
                  label={t("Load more contacts")}
                  fetchPage={found.fetchPage}
                />
              </>
            )
          }}
        </PagedFind>
      </div>
    </CountedAbove>
  )
}
