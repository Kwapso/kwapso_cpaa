"use client"

// MY COMPANY — the record we hold for them, and the people in it.
//
// This is the one screen where "account" appears as a concept, and the one where
// the iron rule is easiest to break: ACCOUNT NEVER MEANS A LOGIN (SCOPE ch.02).
// So the heading is "Your details", the people are CONTACTS, and the word
// "account" is not used for a person's ability to sign in anywhere on this page.
// Portal access is not shown at all — who can sign in is a staff decision, and
// showing it here would invite exactly the confusion the rule exists to prevent.
//
// Everything comes from ONE fenced door (`/api/tenancy/accounts/detail`), read
// with the id the server itself handed us in the portal context. The portal
// never composes an account id, never reads one from the URL, and never asks for
// one it wasn't given — the fence would refuse it anyway, with the same 404 a
// made-up id gets, but not asking is the cheaper guarantee.

import { DescriptionList } from "@shared/ui/components/description-list/description-list"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Badge } from "@shared/ui/components/badge/badge"
import { List } from "@shared/ui/components/list/list"

import type { AccountDetail } from "@shared/types"
import { postalAddress } from "@shared/web/format"
import { useCached } from "@shared/web/store"
import { portal } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { CollectionHeading } from "@/components/collection-heading"
import type { PortalReady } from "@/components/portal-shell"
import { useT } from "@shared/web/language"

export function CompanyScreen({ ready }: { ready: PortalReady }) {
  const t = useT()
  const accountId = ready.currentAccountId
  const { data, loading } = useCached<AccountDetail>(cacheKeys.company(accountId), () =>
    portal.company(accountId)
  )

  if (loading && !data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      </div>
    )
  if (!data) return null

  const { account, links, linksTotal } = data
  // Only the people who are currently contacts. An unlinked person keeps their
  // row (so "who was a contact when" stays true) but is not who you'd call today.
  const contacts = links.filter((l) => l.active)

  const details = [
    account.code ? { label: t("Reference"), value: account.code } : null,
    account.email ? { label: t("Email"), value: account.email } : null,
    account.phone ? { label: t("Phone"), value: account.phone } : null,
    // The postal address, read as one line from the four fields it is stored in
    // — a client reading their own record wants the address, not four rows.
    postalAddress(account) ? { label: t("Address"), value: postalAddress(account) } : null,
  ].filter((d): d is { label: string; value: string } => d !== null)

  return (
    <div className="flex flex-col gap-12">
      {/* NO MARK ON THE TITLE — client ruling, 2026-09-01, verbatim: "for now
          there are no - under no case - images on title. remove it
          everywhere." This page used to lead with the account's own
          `RecordMark` beside the `<h1>` (see git history for the prior
          reasoning); that is exactly the shape the ruling reaches — a
          picture beside a title — regardless of front door, so it is gone
          here too, the same as every detail screen's own header
          (record-chrome.tsx) and the main-screen heading (collection-
          heading.tsx). `RecordMark` itself is untouched — it still draws in
          an ordinary list row, just never beside a title. */}
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-3xl font-medium">{account.name}</h1>
        <p className="text-muted-foreground">
          {t("What we hold for you. If any of it is wrong, tell us and we'll fix it.")}
        </p>
      </div>

      {details.length > 0 ? (
        <section>
          <h2 className="mb-4 text-lg font-medium">{t("Your details")}</h2>
          <DescriptionList layout="rows" items={details.map((d, n) => ({ id: `${n}-${d.label}`, label: d.label, value: d.value }))} />
        </section>
      ) : null}

      <section>
        {/* R16: the door's exact server total, not the number of rows on screen. */}
        <CollectionHeading label={t("Contacts")} total={linksTotal} />
        {/* THE KIT'S ROW, not our own. `variant="rows"` is the standalone
            rounded row this screen was drawing by hand — same shape, and it
            brings the hover, the 56px floor and the empty register with it. The
            agency app's rows have gone through this component since the engine
            was built; the portal's had not, which is most of what made the two
            look like different products. */}
        <List
          variant="rows"
          label={t("Contacts")}
          state={contacts.length === 0 ? "empty" : "ready"}
          emptyTitle={t("Just you, for now.")}
          rows={contacts.map((c) => ({
            id: c.id,
            title: c.personName,
            /* Staff often type the relationship as "Main contact" too, and then
               the row says it twice. Say it once — the badge is the stronger
               of the two. */
            description:
              c.relationship && c.relationship.trim().toLowerCase() !== "main contact"
                ? c.relationship
                : undefined,
            action: c.isMainStakeholder ? <Badge variant="secondary">{t("Main contact")}</Badge> : undefined,
          }))}
        />
      </section>
    </div>
  )
}
