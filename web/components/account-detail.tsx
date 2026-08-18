"use client"

// Account detail — one COMPANY at /accounts/<id>, as a tabbed record (Law R2):
// Overview / Contacts / its work / Rates / Knowledge / Activity.
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
// THE HIERARCHY IS STATED ONCE, IN THE HEADER — which account this one sits
// under, as a link one tap up the tree. It used to be stated twice, and the
// second telling was a tab called "Under this account" listing the rows whose
// parent pointer names this one. In this agency's data those rows are its
// people, so the record carried two tabs answering the same question under two
// names, which is the duplication the tester reported (7.2). The tab is gone and
// Contacts is the survivor; the parent pointer itself is untouched.
//
// Every count here is an exact server COUNT(*) through the ONE formatCount seam
// (R16) — never the length of a list the door capped. Every destructive action is
// red and asks first; nothing is ever deleted (archive, unlink, revoke all keep
// the row, so history and access survive).

import * as React from "react"

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

import type { Account, AccountDetail, AccountRate, AppRow } from "@shared/types"
import { SAVINGS_CAPTION, savedHours, type SavingsView } from "@shared/workers/savings"
import { RecordCover, RecordMark } from "@shared/web/record-mark"
import { moneyText } from "@shared/web/money"
import { AccountFormDialog, type AccountFormValues } from "@/components/account-form-dialog"
import { AccountRateCard } from "@/components/account-rate-card"
import { MarginPanel } from "@/components/margin-panel"
import {
  ContactsPanel,
  type Confirm,
  type PanelActions,
} from "@/components/account-detail-panels"
import {
  ContactCreateDialog,
  ContactLinkDialog,
  type ContactCreateValues,
  type ContactLinkValues,
} from "@/components/contact-link-dialog"
import { ContactDetailScreen } from "@/components/contact-detail"
import { AppFormDialog } from "@/components/app-form-dialog"
import { SprintFormDialog } from "@/components/sprint-form-dialog"
import { TodoFormDialog, type TodoFormValues } from "@/components/todo-form-dialog"
import { useAssignableMembers } from "@/lib/members"
import { KnowledgeAsk } from "@/components/knowledge-ask"
import { RichText } from "@shared/web/rich-text-view"
import { ValuePanel } from "@/components/value-panel"
import { createAppFrom } from "@/components/apps-screen"
import { AppsPanel, SprintsPanel, TodosPanel, sliceKey } from "@/components/work-panels"
import { accountStatus } from "@/components/deep-link/shape"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { formatCount } from "@shared/web/format-count"
import {
  accountKey,
  accountValueKey,
  accountsKey,
  appsKey,
  listFetch,
  ratesKey,
  sprintsKey,
  todosKey,
  totalKey,
} from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
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
  // Who can be put on an app (8.10), for the record-an-app dialog below.
  const members = useAssignableMembers(teamId)
  // THE SYSTEMS A SPRINT ON THIS CLIENT COULD COVER. The SAME cache key the
  // Apps screen (and every other form in the work engine) reads, narrowed here
  // rather than asked for again: a sprint covers one app and an app belongs to
  // one account, so offering another client's systems would be offering a row
  // the door would refuse.
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  const canReadKnowledge = can("knowledge", "read")
  const canEdit = can("accounts", "edit")
  const canArchive = can("accounts", "delete")
  // THE ADDRESS BOOK IS ITS OWN GRANT. `contacts` rather than `accounts`: a
  // developer opening a client sees the company and its apps, not the list of
  // people inside it (Aurora, 17 Aug 2026). The server withholds the rows too —
  // this only decides whether to draw the tab.
  const canSeeContacts = can("contacts", "read")
  const canLinkContacts = can("contacts", "create")
  const canUnlinkContacts = can("contacts", "delete")
  // MAKING a contact is two writes and therefore two rights: the person is an
  // `accounts` row and being a contact here is a `contacts` row. Both doors gate
  // on their own (R10) — this only decides whether to offer a button that would
  // come straight back a 403. Linking somebody we already hold stays one right.
  const canCreateContacts = canLinkContacts && can("accounts", "create")
  // THE WORK HANGING OFF THIS CLIENT. Apps are the record directly below an
  // account (an app belongs to ONE account, always — the owner's ruling), and
  // the sprints and to-dos beside them are the two other collections a door
  // will narrow to one account. Each tab is gated on its own module, so a role
  // that cannot read the work engine simply does not see those tabs.
  const canSeeApps = can("processes", "read")
  const canWriteApps = can("processes", "create")
  const canSeeWork = can("work", "read")
  // THE RIGHT ON THE CHILD, NEVER THE PARENT. Selling a block of work is
  // `work:create` and asking a client for something is `todos:create` — the
  // rights the SPRINT door and the TO-DO door gate on. Standing on an account
  // record is not a right; `accounts:*` says nothing about whether a person may
  // put work on the backlog. The door decides either way (R10); these only
  // decide whether we draw a button that would come back a 403.
  const canWriteWork = can("work", "create")
  const canSeeTodos = can("todos", "read")
  const canAskTodo = can("todos", "create")
  const canCancelTodo = can("todos", "delete")
  // WHAT THIS CLIENT IS CHARGED. A second module on the same record, like the
  // logins above: reading a phone number and seeing a price are different sized
  // decisions, so `commercials` is its own gate and the tab simply is not there
  // for a role without it. (The agency's OWN cost card is a different screen in
  // a different file — R24; see internal-rate-card.tsx.)
  const canSeeRates = can("commercials", "read")
  // The client's own rate card — read only to turn the hours above into money,
  // and only for a role that may see prices at all. It is the same cache the
  // Rates tab fills, so opening that tab costs nothing afterwards.
  const ratesQ = useCached<AccountRate[]>(
    can("commercials", "read") ? ratesKey(accountId) : null,
    () =>
      tenancy.accountRates(accountId).then((r) => {
        primeCache(totalKey("account-rates", accountId), r.total)
        return r.rates
      })
  )

  // THE BADGES, BEFORE THE CLICK. One bounded read of every child total on this
  // record, primed into the same sidecars below — so a tab with work behind it
  // says so on arrival instead of only once you open it. The ROWS stay lazy:
  // each panel still fetches its own when its tab is shown.
  useRecordCounts("accounts", accountId)
  // R16: the exact totals those tabs badge — from the counts read above, and
  // re-primed by each panel's own fetch over the same filter its rows came from.
  // `null` is a THIRD answer beside a number and an absence: the role holds no
  // read right on that module, so nobody counted (R18). It renders as nothing,
  // like a zero and like a still-loading total, and stays distinguishable from
  // both in the cache.
  const appsTotal = useCachedValue<number | null>(totalKey("apps-account", accountId))
  const sprintsTotal = useCachedValue<number | null>(totalKey("sprints-account", accountId))
  const todosTotal = useCachedValue<number | null>(totalKey("todos-account", accountId))
  const ratesTotal = useCachedValue<number | null>(totalKey("account-rates", accountId))

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [newContactOpen, setNewContactOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [appOpen, setAppOpen] = React.useState(false)
  const [sprintOpen, setSprintOpen] = React.useState(false)
  const [todoOpen, setTodoOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  /** Re-read what this screen shows after our own write. (Everyone else's screen
   * catches up from the live ping — see the accounts entries in live-resources.) */
  const refresh = React.useCallback(() => {
    invalidate(accountKey(accountId))
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

  // Saving the record. There is no MOVE half any more: the form stopped offering
  // a parent picker (18 Aug 2026 — account-form-dialog's header), so the only
  // write this makes is the record's own fields. Where the account SITS is still
  // shown on the Overview below and still moved by `/api/tenancy/accounts/parent`
  // — just never from here.
  async function save(values: AccountFormValues) {
    if (!detailQ.data?.account) return
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

  /** MAKE a person and put them on this company. Two writes, on purpose.
   *
   * THE LINK AND THE PARENT POINTER ARE DIFFERENT FACTS, and this does both.
   * The parent says "Marta sits under Bergman" — one company, the tree the
   * header draws. The LINK says "Marta is a contact of Bergman" — and the same
   * person can hold several of those, at companies she does not sit under,
   * which is precisely what a single pointer cannot express (see
   * contact-link-dialog's header). Creating with a parent does NOT create a
   * link, so the tab she was created on would not list her. Hence both.
   *
   * THE TYPE IS WRITTEN HERE, BY THE CODE. A contact is a person, always — it
   * is not a question this form asks, the way it is no longer a question the
   * account form asks (18 Aug 2026).
   *
   * WHEN THE SECOND WRITE FAILS. The person now exists and is not a contact.
   * We do NOT roll her back: undoing it means archiving an account, which needs
   * a right this caller may well not hold and is itself a write that can fail —
   * a rollback that fails silently is worse than the state it was fixing. So we
   * say exactly what happened and where she is. She is a live account, in the
   * accounts list and findable by the Add contact search on this very tab, so
   * the recovery is one button away and nothing is stranded in silence. The
   * dialog closes rather than staying open, because a second submit would make
   * a second Marta.
   */
  async function createContact(values: ContactCreateValues) {
    const name = values.name.trim()
    const { id } = await tenancy.createAccount({
      accountType: "individual",
      name,
      parentAccountId: accountId,
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
    })
    try {
      await tenancy.linkPerson({
        accountId,
        personAccountId: id,
        relationship: values.relationship.trim() || undefined,
        isMainStakeholder: values.isMainStakeholder,
      })
    } catch (err) {
      refresh()
      // Through `t` with a placeholder rather than a template literal: a
      // computed string has no English key, so the catalogue cannot hold it and
      // it would ship in English to somebody who chose German (R28 ·
      // shared/i18n.ts `fill`). The server's own sentence rides in the same way
      // when it has one — it is the half that knows WHY.
      toast.error(
        err instanceof ApiFailure
          ? t("{name} is now in your accounts, but not a contact here: {reason} Use Add contact to finish.", {
              name,
              reason: err.message,
            })
          : t("{name} is now in your accounts, but we couldn't make them a contact here. Use Add contact to finish.", {
              name,
            })
      )
      return
    }
    refresh()
    toast.success(t("Contact added."))
  }

  if (detailQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load the account.")}</p>
  if (detailQ.data === undefined) return <Skeleton variant="list" lines={5} />

  const { account, parent, links, linksTotal } = detailQ.data
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


  // WHAT THE HOURS ARE WORTH, at this client's own agreed rate. `null` when
  // there is no rate card yet (or the role may not see one), which is the honest
  // answer: an hours figure without a price beside it is still true, and a price
  // invented from a default rate is the kind of number that costs the whole
  // screen its credit. The FIRST live rate is the client's headline rate — the
  // rate card itself is the breakdown, one tab along.
  const headlineRate = (ratesQ.data ?? []).find((r) => r.active) ?? null
  const savedSeconds = valueQ.data?.savedSecondsPerMonth ?? 0
  const moneyBack =
    headlineRate && savedSeconds > 0
      ? moneyText(Math.round(savedHours(savedSeconds) * headlineRate.centsPerHour), headlineRate.currency)
      : null

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
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
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
      // NO "UNDER THIS ACCOUNT" TAB (7.2). It listed the account rows whose
      // parent pointer names this one, which — in the way this agency actually
      // uses the record — is the same list of people the Contacts tab above
      // already shows, under a second name. Two tabs answering "who is inside
      // this company" is the duplication the tester reported; the answer is the
      // one with the right word on it. The PARENT POINTER is untouched: a company
      // still sits under its holding company, the form still moves it, and the
      // header still links up the tree.
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
      // THE KNOWLEDGE BASE, IN CONTEXT (CHECKLIST 12.1). The same tab an app
      // record carries, asking about this client instead — the compartment is
      // named for it, so a question typed here can never be answered out of
      // another client's material (R23's `reason` says which it searched).
      ...(canReadKnowledge
        ? [
            {
              value: "knowledge",
              label: t("Knowledge"),
              icon: CONCEPT_ICON.knowledge,
              badge: "",
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

  /* B1 / CHECKLIST 11.2 — Edit stays visible, archiving moves into the menu with
   * its red and its confirm intact. */
  const overflow: RecordAction[] = canArchive
    ? [
        account.active
          ? {
              key: "archive",
              label: t("Archive"),
              icon: <Power className="size-3.5" />,
              disabled: busy,
              destructive: true,
              onSelect: () =>
                setConfirm({
                  title: `Archive ${account.name}?`,
                  body: "It stops showing in the everyday lists. Everything on it, its people and its history, stays exactly where it is, and you can bring it back any time.",
                  action: "Archive",
                  run: () =>
                    run(
                      () => tenancy.setAccountActive(accountId, false),
                      "Account archived.",
                      "Couldn't archive the account."
                    ),
                }),
            }
          : {
              key: "restore",
              label: t("Restore"),
              icon: <Power className="size-3.5" />,
              disabled: busy,
              onSelect: () =>
                void run(
                  () => tenancy.setAccountActive(accountId, true),
                  "Account restored.",
                  "Couldn't restore the account."
                ),
            },
      ]
    : []

  return (
    <RecordScreen
      // THE CLIENT'S OWN MARK, where every other record already puts one. The
      // column has been on this row since 0024 and the form has offered the
      // picker since — it was simply never drawn, so the widest, most-visited
      // record in the product opened with a bare title while a ticket three
      // clicks away led with a glyph. No logo falls back to the company's
      // initial, never to an empty square (shared/web/record-mark.tsx).
      leading={<RecordMark picture={account.logoUrl} name={account.name} size="band" />}
      eyebrow={[t("Company"), account.code, account.active ? null : t("Archived")]
        .filter(Boolean)
        .join(" · ")}
      title={account.name}
      status={statusText || undefined}
      actions={
        <>
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
      headerExtra={
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
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
      }
    >

      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(tabItem) => {
          if (tabItem.value === "overview")
            return (
              <div className="flex flex-col gap-4">
                {/* The cover, then the record. An image at the top of a company's
                    page is the fastest way to know you are on the right one. */}
                {/* A STORED PATH IS NOT THE SAME FACT AS THE BYTES BEING THERE.
                    This is the biggest picture in the app, so a 404 here is a
                    full-width torn-paper glyph across a client's own page —
                    and nothing reclaims a superseded cover, the column takes a
                    pasted URL, and the pictures in it came from an account
                    being cancelled. `RecordCover` renders exactly what having
                    no cover renders when the picture will not load: nothing. */}
                <RecordCover picture={account.coverUrl} className="h-32 w-full rounded-xl object-cover sm:h-40" />
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
                      {t("What this has been worth")}
                    </p>
                    <ValuePanel view={valueQ.data} />
                    {/* THE SAME HOURS, IN MONEY. Not a second calculation — it is
                        the drill-down's own total multiplied by what this client
                        agreed to pay for an hour of the work, which is why it is
                        only shown when there IS a rate card to multiply by. The
                        caption comes with it (R25) for exactly the reason it
                        comes with the hours: a figure a client cannot account
                        for is worse than no figure at all. */}
                    {moneyBack && (
                      <div className="rounded-xl border p-4">
                        <p className="text-muted-foreground text-sm">{t("Money given back, every month")}</p>
                        <p className="text-2xl font-semibold tracking-tight tabular-nums">{moneyBack}</p>
                        <p className="text-muted-foreground mt-2 text-xs">{SAVINGS_CAPTION}</p>
                      </div>
                    )}
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
                canCreatePerson={canCreateContacts}
                canArchive={canUnlinkContacts}
                actions={actions}
                onAdd={() => setLinkOpen(true)}
                onNew={() => setNewContactOpen(true)}
                onOpen={openAccount}
              />
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
                onNew={canWriteWork ? () => setSprintOpen(true) : undefined}
                emptyText={`Nothing has been sold to ${account.name} yet.`}
              />
            )
          if (tabItem.value === "todos")
            return (
              <TodosPanel
                teamId={teamId}
                accountId={accountId}
                canCancel={canCancelTodo}
                onNew={canAskTodo ? () => setTodoOpen(true) : undefined}
              />
            )
          // THE KNOWLEDGE BASE, IN CONTEXT (7.15), THE SAME WAY AN APP DOES IT
          // (8.9). Two things travel and they do different jobs. `accountId`
          // names the COMPARTMENT, so a question typed here cannot be answered
          // out of another client's material and R23's `reason` says which one
          // it searched. `context` is the record's own details prepended to the
          // question — and the panel SHOWS what it added, because a question
          // quietly changed on the way to the server is an answer nobody can
          // account for. It is written as a phrase that reads after the word
          // "About", exactly as the app's does.
          if (tabItem.value === "knowledge")
            return (
              <KnowledgeAsk
                accountId={accountId}
                context={[
                  `the client ${account.name}`,
                  account.industry ? `in ${account.industry}` : null,
                  statusText || null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                onOpenSource={(sourceId) =>
                  softNavigate(`${basePath.replace(/\/accounts$/, "")}/knowledge/${sourceId}`)
                }
                onOpenRecord={(path) => softNavigate(`${basePath.replace(/\/accounts$/, "")}/${path}`)}
              />
            )

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
        statusOptions={statusOptions}
        onSubmit={save}
      />

      {/* An app is recorded FROM the account it belongs to, with that account
          already chosen — whose system it is is set once and there is no
          move-app door, so being on the right record when you write it down is
          the whole safeguard. */}
      <AppFormDialog
        members={members}
        open={appOpen}
        onOpenChange={setAppOpen}
        teamId={teamId}
        accounts={[{ id: accountId, name: account.name }]}
        draftKey={`app:add:${accountId}`}
        onSubmit={async (v) => {
          await createAppFrom(teamId, { ...v, accountId })
          invalidate(sliceKey("apps-account", accountId))
        }}
      />

      {/* MOUNTED ONLY WHEN OPEN, unlike the app and contact dialogs above. These
          two resolve the team THEMSELVES (`useActiveTeam`) and fetch their own
          pickers, so keeping them mounted behind a closed dialog would cost every
          reader of an account record a router subscription and two list reads for
          a form nobody has asked for. The draft survives either way — it lives in
          session storage, which is the whole point of Law R7.

          A BLOCK OF WORK SOLD TO THIS CLIENT, written from their own record with
          the client already chosen. A sprint cannot be moved to another client
          afterwards (the update door refuses it), so being on the right record
          when you write it down is the whole safeguard — the same argument the
          app form above makes. The APP is left as a question: a client has more
          than one system and the sprint has to say which. */}
      {sprintOpen && (
      <SprintFormDialog
        open={sprintOpen}
        onOpenChange={setSprintOpen}
        apps={(appsQ.data ?? []).filter((a) => a.active && a.accountId === accountId).map((a) => ({ id: a.id, name: a.name }))}
        fixedAccount={{ id: accountId, name: account.name }}
        draftKey={`sprint:add:account:${accountId}`}
        onSubmit={async (v) => {
          await contentApi.createSprint({
            name: v.name,
            goal: v.goal || undefined,
            sprintType: v.sprintType || undefined,
            accountId,
            appId: v.appId || undefined,
            startsOn: v.startsOn || undefined,
            endsOn: v.endsOn || undefined,
            soldPriceCents: v.soldPriceCents,
            currency: v.currency || undefined,
          })
          // The new sprint arrives ALREADY on this client, so the slice this tab
          // reads is the one cache that has to be told. Everyone else's screen is
          // patched by the publish the door already sends (R1/R15).
          invalidate(sliceKey("sprints-account", accountId))
          invalidate(sprintsKey(teamId))
          toast.success(t("Sprint started."))
        }}
      />
      )}

      {/* SOMETHING WE NEED FROM THIS CLIENT. Same shape again: the client is a
          fact about where you are standing, and it is the field that decides
          whose portal this lands in. */}
      {todoOpen && (
      <TodoFormDialog
        open={todoOpen}
        onOpenChange={setTodoOpen}
        fixedAccount={{ id: accountId, name: account.name }}
        draftKey={`todo:add:account:${accountId}`}
        onSubmit={async (v: TodoFormValues) => {
          await contentApi.raiseTodo({
            accountId,
            title: v.title,
            detail: v.detail || undefined,
            dueOn: v.dueOn ? new Date(v.dueOn).toISOString() : undefined,
          })
          invalidate(sliceKey("todos-account", accountId))
          invalidate(todosKey(teamId))
          toast.success(t("Asked, and emailed to them."))
        }}
      />
      )}

      <ContactLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        teamId={teamId}
        accountName={account.name}
        draftKey={`account:contact:${accountId}`}
        excludeIds={[accountId, ...links.filter((l) => l.active).map((l) => l.personAccountId)]}
        onSubmit={addContact}
      />

      {/* The other way onto the same tab — a person who did not exist yet. Its own
       * draft key, because a half-typed new person and a half-picked existing one
       * are two different half-finished errands. */}
      <ContactCreateDialog
        open={newContactOpen}
        onOpenChange={setNewContactOpen}
        accountName={account.name}
        draftKey={`account:new-contact:${accountId}`}
        onSubmit={createContact}
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
    <RecordFooter
        audit={{
          createdByName: account.createdByName,
          createdAt: account.createdAt,
          editedByName: account.editedByName,
          updatedAt: account.updatedAt,
        }}
      />
    </RecordScreen>
  )
}
