"use client"

// Account detail — one company or one person at /accounts/<id>, as a tabbed record
// (Law R2): Overview / Contacts / Under this account / Portal access / Activity.
// Host-composed, because three of those tabs are collections with their own
// actions — link a person, give someone a login, take one away — and no engine
// block draws those. Those three list bodies live next door in
// account-detail-panels.tsx; this file owns the record itself — its data, its
// rights, its tabs and counts, its dialogs, and the one confirm they all share.
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
import {
  DescriptionList,
  defaultDescriptionListConfig,
} from "@kwapso/ui/registry/collections/description-list/description-list"
import {
  ActivityFeed,
  defaultActivityFeedConfig,
  type ActivityItem as ActivityFeedItem,
} from "@kwapso/ui/registry/collections/activity-feed/activity-feed"
import { Pencil, Power } from "lucide-react"

import type { Account, AccountDetail } from "@shared/types"
import { AccountFormDialog, type AccountFormValues } from "@/components/account-form-dialog"
import {
  ChildrenPanel,
  ContactsPanel,
  PortalAccessPanel,
  type Confirm,
  type PanelActions,
} from "@/components/account-detail-panels"
import { ContactLinkDialog, type ContactLinkValues } from "@/components/contact-link-dialog"
import { PortalAccessDialog } from "@/components/portal-access-dialog"
import { LoadMore } from "@/components/load-more"
import { ACCOUNT_TYPE, accountStatus } from "@/components/deep-link/shape"
import { ApiFailure, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { formatActivityWhen } from "@shared/web/format"
import { formatCount } from "@shared/web/format-count"
import { accountKey, accountsKey, childrenKey, listFetch, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"

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

  const { can } = usePermissions(teamId)
  const canEdit = can("accounts", "edit")
  const canCreate = can("accounts", "create")
  const canArchive = can("accounts", "delete")
  const canSeeLogins = can("portal_users", "read")
  const canGrant = can("portal_users", "create")
  const canRevoke = can("portal_users", "delete")

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [grantOpen, setGrantOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
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
    await tenancy.updateAccount({
      id: accountId,
      name: values.name.trim(),
      code: values.code.trim() || undefined,
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      address: values.address.trim() || undefined,
      status: values.status.trim() || undefined,
    })
    refresh()
    toast.success("Account updated.")
  }

  async function addContact(values: ContactLinkValues) {
    await tenancy.linkPerson({
      accountId,
      personAccountId: values.personAccountId,
      relationship: values.relationship.trim() || undefined,
      isMainStakeholder: values.isMainStakeholder,
    })
    refresh()
    toast.success("Contact added.")
  }

  async function giveAccess(personAccountId: string) {
    await tenancy.grantPortalAccess(accountId, personAccountId)
    refresh()
    toast.success("Access switched on.")
  }

  if (detailQ.error)
    return <p className="text-destructive text-sm">Couldn&apos;t load the account.</p>
  if (detailQ.data === undefined) return <Skeleton variant="list" lines={5} />

  const { account, parent, links, portalUsers, linksTotal, portalUsersTotal } = detailQ.data
  const children = childrenQ.data ?? []
  const statusText = accountStatus(account.status)

  const overviewItems = [
    { label: "Type", value: ACCOUNT_TYPE[account.accountType] },
    { label: "Parent account", value: parent ? parent.name : "Sits on its own" },
    { label: "Reference", value: account.code || "—" },
    { label: "Email", value: account.email || "—" },
    { label: "Phone", value: account.phone || "—" },
    { label: "Address", value: account.address || "—" },
    { label: "Status", value: statusText || "—" },
    ...auditItems({
      createdByName: account.createdByName,
      createdAt: account.createdAt,
      editedByName: account.editedByName,
      updatedAt: account.updatedAt,
      status: account.active ? "Active" : "Archived",
    }),
  ]

  const activityItems: ActivityFeedItem[] = activity.rows.map((a) => ({
    id: a.id,
    description: a.description,
    actor: a.actorName ?? undefined,
    timestamp: formatActivityWhen(a.createdAt),
  }))

  // Who could be given a login: the people linked to this account, plus the
  // account itself when it IS a person (a freelancer with no company above them).
  const loginCandidates = [
    ...(account.accountType === "individual"
      ? [{ id: account.id, name: account.name, email: account.email }]
      : []),
    ...links
      .filter((l) => l.active)
      .map((l) => ({ id: l.personAccountId, name: l.personName, email: null })),
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
      { value: "overview", label: "Overview", icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "contacts",
        label: "Contacts",
        icon: CONCEPT_ICON.contacts,
        badge: formatCount(linksTotal),
        badgeVariant: "" as const,
      },
      {
        value: "children",
        label: "Under this account",
        icon: CONCEPT_ICON.accounts,
        badge: formatCount(childrenTotal),
        badgeVariant: "" as const,
      },
      ...(canSeeLogins
        ? [
            {
              value: "portal",
              label: "Portal access",
              icon: CONCEPT_ICON.portal,
              badge: formatCount(portalUsersTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      {
        value: "activity",
        label: "Activity",
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
              {ACCOUNT_TYPE[account.accountType]}
            </Badge>
            {!account.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Archived
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
                Part of {parent.name}
              </button>
            ) : (
              <span>Sits on its own</span>
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
              Edit
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
                Archive
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
                Restore
              </Button>
            ))}
        </div>
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return (
              <DescriptionList
                config={{ ...defaultDescriptionListConfig, columns: 1 }}
                items={overviewItems}
              />
            )

          if (t.value === "activity")
            return (
              // R14: the badge above counts the WHOLE history, so the feed under
              // it must be able to reach all of it — page one, then Load more.
              <div className="flex flex-col gap-4">
                <ActivityFeed
                  config={{ ...defaultActivityFeedConfig, emptyText: "No activity yet." }}
                  items={activityItems}
                />
                <LoadMore
                  listKey={activity.listKey}
                  fetchPage={activity.fetchPage}
                  label="Load more activity"
                />
              </div>
            )

          if (t.value === "contacts")
            return (
              <ContactsPanel
                accountName={account.name}
                links={links}
                canCreate={canCreate}
                canArchive={canArchive}
                actions={actions}
                onAdd={() => setLinkOpen(true)}
                onOpen={openAccount}
              />
            )

          if (t.value === "children")
            return (
              <ChildrenPanel accountId={accountId} accounts={children} onOpen={openAccount} />
            )

          // Portal access — the login switch. Only rendered for someone who may
          // see logins at all (the tab itself is hidden otherwise).
          return (
            <PortalAccessPanel
              portalUsers={portalUsers}
              canGrant={canGrant}
              canRevoke={canRevoke}
              actions={actions}
              onGrant={() => setGrantOpen(true)}
            />
          )
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
          code: account.code ?? "",
          email: account.email ?? "",
          phone: account.phone ?? "",
          address: account.address ?? "",
          status: account.status ?? "",
        }}
        parentOptions={parentOptions}
        statusOptions={statusOptions}
        onSubmit={save}
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

      <PortalAccessDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        accountName={account.name}
        draftKey={`account:portal:${accountId}`}
        candidates={loginCandidates}
        onSubmit={giveAccess}
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
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
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
