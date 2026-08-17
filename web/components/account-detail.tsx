"use client"

// Account detail — one COMPANY at /accounts/<id>, as a tabbed record (Law R2):
// Overview / Contacts / Under this account / its work / Rates / Activity.
// Host-composed, because most of those tabs are collections with their own
// actions — link a person, add an app, retire a rate — and no engine block draws
// those. Those list bodies live next door in account-detail-panels.tsx; this file
// owns the record itself — its data, its rights, its tabs and counts, its
// dialogs, and the one confirm they all share.
//
// A PERSON GETS A DIFFERENT SCREEN. Companies and people are one table (SCOPE
// ch.03) and were, until now, one screen — which drew a human being with sprints,
// a rate card and a Contacts tab of their own. This file reads the record and
// hands an individual straight to contact-detail.tsx: one door, one read, two
// screens. What splits is the SCREEN and the PERMISSION, never the table.
//
// THE LOGINS MOVED WITH THEM. Only a person can hold one (the owner's ruling), so
// the Portal access tab is on the contact's page now rather than on the company's
// — where it invited the question "who exactly is signing in?" and answered it
// with a list.
//
// THE PEOPLE ARE THEIR OWN PERMISSION. The Contacts tab is behind `contacts:read`
// — a developer opening a client sees the company and its apps, and not the
// address book. The server withholds the rows too (routes/accounts.ts): a tab
// that is not drawn is not a permission.
//
// The hierarchy is meant to be readable at a glance, so it is stated twice over:
// the header says which account this one sits under (a link, one tap up the tree),
// and a tab lists the accounts sitting under it — with an exact count on both, and
// a Load more when a holding company has more than a page of businesses.
//
// Every count here is an exact server COUNT(*) through the ONE formatCount seam
// (R16) — never the length of a list the door capped. Every destructive action is
// red and asks first; nothing is ever deleted (archive, unlink, revoke all keep
// the row, so history and access survive).

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kwapso/ui/registry/primitives/alert-dialog/alert-dialog"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Pencil, Power } from "lucide-react"

import type { Account, AccountDetail } from "@shared/types"
import type { SavingsView } from "@shared/workers/savings"
import { AccountFormDialog, type AccountFormValues } from "@/components/account-form-dialog"
import { AccountRateCard } from "@/components/account-rate-card"
import { MarginPanel } from "@/components/margin-panel"
import {
  ChildrenPanel,
  ContactsPanel,
  type Confirm,
  type PanelActions,
} from "@/components/account-detail-panels"
import { ContactLinkDialog, type ContactLinkValues } from "@/components/contact-link-dialog"
import { ContactDetailScreen } from "@/components/contact-detail"
import { AppFormDialog } from "@/components/app-form-dialog"
import { RichText } from "@/components/rich-text"
import { safeSrc } from "@/lib/rich-text"
import { ValuePanel } from "@/components/value-panel"
import { createAppFrom } from "@/components/apps-screen"
import { AppsPanel, SprintsPanel, TodosPanel, sliceKey } from "@/components/work-panels"
import { accountStatus } from "@/components/deep-link/shape"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatCount } from "@shared/web/format-count"
import {
  accountKey,
  accountValueKey,
  accountsKey,
  childrenKey,
  listFetch,
  totalKey,
} from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"

export function AccountDetailScreen({
  teamId,
  accountId,
  basePath,
}: {
  teamId: string
  accountId: string
  /** the accounts list in the URL form we arrived through (/accounts or
   * /t/<teamId>/accounts) — sibling links stay in that same form. */
  basePath: string
}) {
  const t = useT()
  const detailQ = useCached<AccountDetail>(accountKey(accountId), () =>
    tenancy.accountDetail(accountId)
  )
  // The accounts nested under this one — its own paged list (a holding company can
  // hold more than a page of businesses).
  const childrenQ = useCached<Account[]>(childrenKey(accountId), () =>
    listFetch.accountChildren(accountId)
  )
  const childrenTotal = useCachedValue<number>(totalKey("account-children", accountId))
  // The ONE web-side read of a record's history (R5) — rows, the door's exact
  // COUNT(*) for the tab badge, and the cursor the feed below spends. Hand-rolling
  // this read is what let a badge and its feed disagree elsewhere.
  const activity = useRecordActivity("accounts", accountId)
  // The same page-one cache the list screen holds — it feeds the parent picker and
  // the statuses already in use, so opening this record adds no round-trip.
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  // TOTAL IMPACT — the hours this client's apps have given back, and the money
  // that is worth, from the ONE savings door (it narrows by account, so the
  // arithmetic here is the same arithmetic the maps screen shows for everybody).
  // R25: the panel renders SAVINGS_CAPTION with it, word for word.
  const valueQ = useCached<SavingsView>(accountValueKey(accountId), () =>
    tenancy.value({ accountId })
  )

  const { can } = usePermissions(teamId)
  const canEdit = can("accounts", "edit")
  const canArchive = can("accounts", "delete")
  // THE ADDRESS BOOK IS ITS OWN GRANT. `contacts` rather than `accounts`: a
  // developer opening a client sees the company and its apps, not the list of
  // people inside it (Aurora, 17 Aug 2026). The server withholds the rows too —
  // this only decides whether to draw the tab.
  const canSeeContacts = can("contacts", "read")
  const canLinkContacts = can("contacts", "create")
  const canUnlinkContacts = can("contacts", "delete")
  // THE WORK HANGING OFF THIS CLIENT. Apps are the record directly below an
  // account (an app belongs to ONE account, always — the owner's ruling), and
  // the sprints and to-dos beside them are the two other collections a door
  // will narrow to one account. Each tab is gated on its own module, so a role
  // that cannot read the work engine simply does not see those tabs.
  const canSeeApps = can("processes", "read")
  const canWriteApps = can("processes", "create")
  const canSeeWork = can("work", "read")
  const canSeeTodos = can("todos", "read")
  const canCancelTodo = can("todos", "delete")
  // WHAT THIS CLIENT IS CHARGED. A second module on the same record, like the
  // logins above: reading a phone number and seeing a price are different sized
  // decisions, so `commercials` is its own gate and the tab simply is not there
  // for a role without it. (The agency's OWN cost card is a different screen in
  // a different file — R24; see internal-rate-card.tsx.)
  const canSeeRates = can("commercials", "read")
  // R16: the exact totals those tabs badge, each primed by the panel's own fetch
  // over the same filter its rows came from.
  const appsTotal = useCachedValue<number>(totalKey("apps-account", accountId))
  const sprintsTotal = useCachedValue<number>(totalKey("sprints-account", accountId))
  const todosTotal = useCachedValue<number>(totalKey("todos-account", accountId))
  const ratesTotal = useCachedValue<number>(totalKey("account-rates", accountId))

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [appOpen, setAppOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  /** Re-read what this screen shows after our own write. (Everyone else's screen
   * catches up from the live ping — see the accounts entries in live-resources.) */
  const refresh = React.useCallback(() => {
    invalidate(accountKey(accountId))
    invalidate(childrenKey(accountId))
    invalidate(`activity:record:accounts:${accountId}`)
    invalidate(accountsKey(teamId))
  }, [accountId, teamId])

  /** Run a write, tell the person plainly if it was refused, and re-read. Returns
   * false when it failed, so a confirm dialog can stay open. */
  const run = React.useCallback(
    async (what: () => Promise<unknown>, done: string, fallback: string) => {
      setBusy(true)
      try {
        await what()
        refresh()
        toast.success(done)
        return true
      } catch (err) {
        toast.error(err instanceof ApiFailure ? err.message : fallback)
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  /** What the three collection tabs borrow from this screen: ask first, then do
   * it. Bundled so a panel takes one prop rather than three, and so there is
   * exactly one confirm dialog on the record (at the bottom of this file). */
  const actions: PanelActions = { busy, ask: setConfirm, act: run }

  // Saving the record: the MOVE goes first, because it is the one the server can
  // refuse (an account cannot be put inside itself). Refused first = nothing
  // changed at all, rather than a saved name beside a move that didn't happen.
  async function save(values: AccountFormValues) {
    const account = detailQ.data?.account
    if (!account) return
    const nextParent = values.parentAccountId || null
    if (nextParent !== account.parentAccountId)
      await tenancy.setAccountParent(accountId, nextParent)
    // An emptied box is NULL, not a missing key. The door treats a field it never
    // heard about as "leave it alone" (so an assistant renaming an account can't
    // erase the rest of the record), which means clearing one is now something
    // this form has to SAY. It also means the three fields this form doesn't
    // carry — currency, language, time zone — survive a save, where they used to
    // be wiped by every edit made from this screen.
    await tenancy.updateAccount({
      id: accountId,
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      street: values.street.trim() || null,
      postalCode: values.postalCode.trim() || null,
      city: values.city.trim() || null,
      country: values.country.trim() || null,
      industry: values.industry.trim() || null,
      about: values.about.trim() || null,
      logoUrl: values.logoUrl || null,
      coverUrl: values.coverUrl || null,
      locale: values.locale.trim() || null,
      status: values.status.trim() || undefined,
    })
    refresh()
    toast.success(t("Account updated."))
  }

  async function addContact(values: ContactLinkValues) {
    await tenancy.linkPerson({
      accountId,
      personAccountId: values.personAccountId,
      relationship: values.relationship.trim() || undefined,
      isMainStakeholder: values.isMainStakeholder,
    })
    refresh()
    toast.success(t("Contact added."))
  }

  if (detailQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load the account.")}</p>
  if (detailQ.data === undefined) return <Skeleton variant="list" lines={5} />

  const { account, parent, links, linksTotal } = detailQ.data
  const children = childrenQ.data ?? []
  const statusText = accountStatus(account.status)

  // A PERSON IS A DIFFERENT SCREEN. One table, one door, one read — and from here
  // two compositions, because a contact has no sprints, no rate card and no
  // contacts of their own. Everything below this line is about a COMPANY.
  if (account.accountType === "individual")
    return (
      <ContactDetailScreen
        teamId={teamId}
        detail={detailQ.data}
        basePath={basePath}
        onSaved={refresh}
      />
    )

  // THE STORED PATH, through the one URL boundary (lib/rich-text safeSrc): the
  // column is ordinary text a machine caller can write, so what reaches a `src`
  // is checked here rather than trusted because we happen to have written it.
  const cover = safeSrc(account.coverUrl)

  const where = [account.street, account.postalCode, account.city, account.country]
    .filter(Boolean)
    .join(", ")

  const overviewItems = [
    { label: t("Parent account"), value: parent ? parent.name : "Sits on its own" },
    { label: t("Reference"), value: account.code || "—" },
    { label: t("Industry"), value: account.industry || "—" },
    { label: t("Email"), value: account.email || "—" },
    { label: t("Phone"), value: account.phone || "—" },
    { label: t("Address"), value: where || "—" },
    { label: t("Language"), value: account.locale || "Ours" },
    { label: t("Status"), value: statusText || "—" },
    ...auditItems({
      createdByName: account.createdByName,
      createdAt: account.createdAt,
      editedByName: account.editedByName,
      updatedAt: account.updatedAt,
      status: account.active ? "Active" : "Archived",
    }),
  ]

  // The parent picker: the account it sits under TODAY (which may be archived, or
  // sit past the first page) plus every other account we've loaded — so the form
  // always shows the truth about where this record sits. A move that would close
  // a loop is refused by the server, in a sentence the form shows as it is.
  const parentOptions = [
    ...(parent ? [{ id: parent.id, name: parent.name }] : []),
    ...(accountsQ.data ?? [])
      .filter((a) => a.id !== accountId && a.id !== parent?.id && a.active)
      .map((a) => ({ id: a.id, name: a.name })),
  ]
  const statusOptions = [
    ...new Set((accountsQ.data ?? []).map((a) => a.status).filter((s): s is string => !!s)),
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      // THE ADDRESS BOOK, behind its own right. A role without `contacts:read`
      // does not see this tab — and the door sends it no rows either, so the tab
      // is the consequence of the permission rather than the permission itself.
      ...(canSeeContacts
        ? [
            {
              value: "contacts",
              label: t("Contacts"),
              icon: CONCEPT_ICON.contacts,
              badge: formatCount(linksTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      {
        value: "children",
        label: t("Under this account"),
        icon: CONCEPT_ICON.accounts,
        badge: formatCount(childrenTotal),
        badgeVariant: "" as const,
      },
      // The work hanging off this client, each behind its own read right.
      ...(canSeeApps
        ? [
            {
              value: "apps",
              label: t("Apps"),
              icon: CONCEPT_ICON.apps,
              badge: formatCount(appsTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      ...(canSeeWork
        ? [
            {
              value: "sprints",
              label: t("Sprints"),
              icon: CONCEPT_ICON.sprints,
              badge: formatCount(sprintsTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      ...(canSeeTodos
        ? [
            {
              value: "todos",
              label: t("To-dos"),
              icon: CONCEPT_ICON.todos,
              badge: formatCount(todosTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      ...(canSeeRates
        ? [
            {
              value: "rates",
              label: t("Rates"),
              icon: CONCEPT_ICON["internal-rates"],
              // R8/R16: the tab reveals a collection, so it carries that
              // collection's exact server total through the one seam.
              badge: formatCount(ratesTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      // NO PORTAL TAB. Only a person can hold a login (the owner's ruling), so
      // the switch lives on the contact's own page — see contact-detail.tsx.
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        // R8: a tab that reveals a collection carries its count, and R16 says the
        // number is the server total through the one seam — never the loaded page.
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  const openAccount = (id: string) => softNavigate(`${basePath}/${id}`)

  return (
    <div className="flex flex-col gap-5">
      {/* Header — what this is, where it sits, and what you can do to it. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{account.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {t("Company")}
            </Badge>
            {!account.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                {t("Archived")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {account.code && <span>{account.code}</span>}
            {statusText && <span>{statusText}</span>}
            {parent ? (
              <button
                type="button"
                onClick={() => openAccount(parent.id)}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t("Part of")} {parent.name}
              </button>
            ) : (
              <span>{t("Sits on its own")}</span>
            )}
          </p>
        </div>
        {/* ml-auto on the GROUP so a narrow phone reflows instead of clipping. */}
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          {canArchive &&
            (account.active ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: `Archive ${account.name}?`,
                    body: "It stops showing in the everyday lists. Everything on it — its people, its history — stays exactly where it is, and you can bring it back any time.",
                    action: "Archive",
                    run: () =>
                      run(
                        () => tenancy.setAccountActive(accountId, false),
                        "Account archived.",
                        "Couldn't archive the account."
                      ),
                  })
                }
                className="text-destructive hover:text-destructive gap-1.5"
              >
                <Power className="size-3.5" />
                {t("Archive")}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => tenancy.setAccountActive(accountId, true),
                    "Account restored.",
                    "Couldn't restore the account."
                  )
                }
                className="gap-1.5"
              >
                {busy ? <Spinner /> : <Power className="size-3.5" />}
                {t("Restore")}
              </Button>
            ))}
        </div>
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(tabItem) => {
          if (tabItem.value === "overview")
            return (
              <div className="flex flex-col gap-4">
                {/* The cover, then the record. An image at the top of a company's
                    page is the fastest way to know you are on the right one. */}
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-32 w-full rounded-xl object-cover sm:h-40" />
                )}
                <OverviewList items={overviewItems} />
                {account.about && (
                  <div className="rounded-xl border p-4">
                    <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      {t("About")}
                    </p>
                    <RichText html={account.about} />
                  </div>
                )}
                {/* WHAT WE HAVE GIVEN THEM BACK, summed across their apps — the
                    question a client asks first and the one the whole product is
                    for. The panel carries the caption that makes the number
                    honest (R25); it is never assembled here. */}
                {canSeeApps && (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {t("Total impact")}
                    </p>
                    <ValuePanel view={valueQ.data} />
                  </div>
                )}
              </div>
            )

          if (tabItem.value === "activity")
            return <ActivityPanel activity={activity} />

          if (tabItem.value === "contacts")
            return (
              <ContactsPanel
                accountName={account.name}
                links={links}
                canCreate={canLinkContacts}
                canArchive={canUnlinkContacts}
                actions={actions}
                onAdd={() => setLinkOpen(true)}
                onOpen={openAccount}
              />
            )

          if (tabItem.value === "children")
            return (
              <ChildrenPanel accountId={accountId} accounts={children} onOpen={openAccount} />
            )

          // THE WORK HANGING OFF THIS CLIENT. Each panel asks the SERVER its own
          // narrowed question (?accountId=), so the rows and the badge above are
          // the same answer — never a page of everything filtered in the browser.
          if (tabItem.value === "apps")
            return (
              <AppsPanel
                accountId={accountId}
                accountName={account.name}
                host={{ base: basePath.replace(/\/accounts$/, "") }}
                onNew={canWriteApps ? () => setAppOpen(true) : undefined}
              />
            )
          if (tabItem.value === "sprints")
            return (
              <SprintsPanel
                ownerKind="account"
                ownerId={accountId}
                filter={{ accountId }}
                host={{ base: basePath.replace(/\/accounts$/, "") }}
                emptyText={`Nothing has been sold to ${account.name} yet.`}
              />
            )
          if (tabItem.value === "todos")
            return <TodosPanel teamId={teamId} accountId={accountId} canCancel={canCancelTodo} />

          // WHAT WE CHARGE THEM. The door answers about ONE account, so the rows
          // and the badge above are the same narrowed question — never a page of
          // every account's prices filtered in the browser.
          //
          // AND WHAT WE KEEP, under it. The margin door has computed revenue
          // minus our time minus tool costs since the money went in, and until
          // now nothing rendered it — an answer with no question attached. It
          // belongs here rather than on a page of its own: "what do we charge
          // them" and "what does that leave us" are one thought.
          //
          // Both are inside `commercials: read`, which is the same gate the two
          // doors open with — and the margin door additionally refuses a portal
          // caller outright, so this tab cannot leak our own cost even to a
          // client who reached the agency origin (R24).
          if (tabItem.value === "rates")
            return (
              <div className="flex flex-col gap-6">
                <AccountRateCard
                  accountId={accountId}
                  accountName={account.name}
                  canCreate={can("commercials", "create")}
                  canEdit={can("commercials", "edit")}
                  canRetire={can("commercials", "delete")}
                  actions={actions}
                />
                <MarginPanel teamId={teamId} accountId={accountId} accountName={account.name} />
              </div>
            )

          // ACTIVITY is the last tab, and the fall-through. The login switch is
          // not here any more — only a person can hold one.
          return <ActivityPanel activity={activity} />
        }}
      />

      <AccountFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        draftKey={`account:edit:${accountId}`}
        initial={{
          accountType: account.accountType,
          name: account.name,
          parentAccountId: account.parentAccountId ?? "",
          email: account.email ?? "",
          phone: account.phone ?? "",
          street: account.street ?? "",
          postalCode: account.postalCode ?? "",
          city: account.city ?? "",
          country: account.country ?? "",
          industry: account.industry ?? "",
          about: account.about ?? "",
          logoUrl: account.logoUrl ?? "",
          coverUrl: account.coverUrl ?? "",
          locale: account.locale ?? "",
          status: account.status ?? "",
        }}
        parentOptions={parentOptions}
        statusOptions={statusOptions}
        onSubmit={save}
      />

      {/* An app is recorded FROM the account it belongs to, with that account
          already chosen — whose system it is is set once and there is no
          move-app door, so being on the right record when you write it down is
          the whole safeguard. */}
      <AppFormDialog
        open={appOpen}
        onOpenChange={setAppOpen}
        accounts={[{ id: accountId, name: account.name }]}
        draftKey={`app:add:${accountId}`}
        onSubmit={async (v) => {
          await createAppFrom(teamId, { ...v, accountId })
          invalidate(sliceKey("apps-account", accountId))
        }}
      />

      <ContactLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        teamId={teamId}
        accountName={account.name}
        draftKey={`account:contact:${accountId}`}
        excludeIds={[accountId, ...links.filter((l) => l.active).map((l) => l.personAccountId)]}
        onSubmit={addContact}
      />

      {/* One confirm for every red action — nothing here deletes, so each one says
       * plainly what survives. */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !busy && !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                const c = confirm
                if (!c) return
                void c.run().then((ok) => ok && setConfirm(null))
              }}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Working…" : confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
