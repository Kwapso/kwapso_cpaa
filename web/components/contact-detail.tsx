"use client"

// CONTACT DETAIL — a PERSON's own screen, at /accounts/<id> when that account is
// an individual.
//
// WHY THIS FILE EXISTS AT ALL. Companies and people are one table (SCOPE ch.03,
// and the owner ruled it twice: two tables would cap a person at one company and
// Marta is a contact at two). What was never true is that they are one SCREEN. A
// person was being drawn with a company's tabs — sprints they are not on, a rate
// card that is nobody's, a Contacts tab listing the people inside a human being —
// and the fix is a second screen over the same row, not a second table under it.
//
// So a contact's page carries exactly what a contact has, and the list came from
// the people who use it: their details, the companies they belong to, the to-dos
// we are waiting on them for, the tickets raised for them, the meetings they were
// in, their portal login, and their history.
//
// THE LOGIN LIVES HERE NOW, and that is the other half of the ruling: only a
// PERSON can hold one. It used to be a tab on the company, which invited the
// question "who exactly is signing in?" and answered it with a list. A login
// belongs to somebody with a name.
//
// TWO DIFFERENT QUESTIONS ABOUT COMPANIES, and this screen answers both without
// confusing them. WHO THEY WORK FOR is the parent account: one company, the one
// the address book files them under and the one whose Contacts tab groups them
// in. THE COMPANIES THEY ARE A CONTACT OF are the links, plural, on the
// Companies tab and in the chips under the title — Marta can be a contact of
// Bergman and of Delaval at once, which is the thing a single pointer cannot say
// and the reason both exist.
//
// THE EMPLOYER IS THE ONE THAT GETS A CONTROL HERE. The parent picker came off
// the account form on 18 Aug 2026 on the owner's ruling — right for a company,
// which is its own thing and never a subsidiary of one already on the books —
// and it left a person who changes jobs with no screen that could move her. The
// answer was never to put the picker back on a company's form; it is this, on
// the person. The links keep their own control where it belongs, on the
// COMPANY's Contacts tab, beside the list it changes. Nothing here writes one.
//
// Host-composed rather than a recipe, for the reason the account screen is: three
// of these tabs are collections with their own actions, and no engine block draws
// one. Its counts are exact server totals through the one formatCount seam (R16),
// its tabs are the library TabsView (R2/R3), and its history is the shared
// ActivityPanel (R5).

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/controls/alert-dialog/alert-dialog"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { KeyRound, Pencil, Power } from "@shared/ui/icons"

import type { AccountDetail } from "@shared/types"
import { AccountFormDialog, type AccountFormValues } from "@/components/account-form-dialog"
import {
  PortalAccessPanel,
  type Confirm,
  type PanelActions,
} from "@/components/account-detail-panels"
import { CompaniesPanel, ContactMeetingsPanel, ContactTicketsPanel } from "@/components/contact-panels"
import { RecordPicker } from "@/components/record-picker"
import { pickerKey, searchAccounts } from "@/lib/picker-sources"
import { TodosPanel } from "@/components/work-panels"
import { OverviewList } from "@/components/overview-list"
import { RecordMark } from "@shared/web/record-mark"
import { RichText } from "@shared/web/rich-text-view"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { formatCount } from "@shared/web/format-count"
import { accountKey, accountsKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { invalidate, useCachedValue } from "@shared/web/store"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import { useT } from "@shared/web/language"

export function ContactDetailScreen({
  teamId,
  detail,
  basePath,
  onSaved,
}: {
  teamId: string
  /** The record, already read by the account screen — one door, one read, two
   * screens. Handing it in rather than re-fetching is what stops the two screens
   * disagreeing about the same row while both are warm. */
  detail: AccountDetail
  /** the accounts list in the URL form we arrived through — sibling links stay
   * in that same form. */
  basePath: string
  /** re-read what this screen shows after our own write */
  onSaved: () => void
}) {
  const t = useT()
  const { account, parent, companies, portalUsers } = detail
  const accountId = account.id

  const activity = useRecordActivity("accounts", accountId)
  // A READ OF PAGE ONE STOOD HERE, for the parent picker and the statuses in
  // use. The statuses went with the column (0042) and the picker gets its own
  // list, so this record now opens without it.

  const { can } = usePermissions(teamId)
  const canEdit = can("accounts", "edit")
  const canArchive = can("accounts", "delete")
  const canSeeContacts = can("contacts", "read")
  const canSeeLogins = can("portal_users", "read")
  const canGrant = can("portal_users", "create")
  const canRevoke = can("portal_users", "delete")
  const canSeeTodos = can("todos", "read")
  const canCancelTodo = can("todos", "delete")
  const canSeeTickets = can("help", "read")
  const canSeeMeetings = can("meetings", "read")

  // THE BADGES, BEFORE THE CLICK. A person and a company are one table, so this
  // is the same one bounded read the company screen makes — the door skips any
  // collection whose module this role cannot read, and the three tabs a person
  // does not have are three numbers nothing on this screen looks at.
  useRecordCounts("accounts", accountId)
  // R16: the exact server totals the tabs badge — from the counts read above,
  // and re-primed by each panel's own fetch over the same narrowed question its
  // rows came from. `null` means the role may not read that module (R18), which
  // renders as nothing exactly as a zero does and stays a different fact.
  const todosTotal = useCachedValue<number | null>(totalKey("todos-account", accountId))
  const ticketsTotal = useCachedValue<number | null>(totalKey("tickets-account", accountId))
  const meetingsTotal = useCachedValue<number | null>(totalKey("meetings-account", accountId))

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [busy, setBusy] = React.useState(false)

  // WHICH COMPANY THEY WORK FOR, as the picker holds it while somebody decides.
  // `""` is the picker's own "no company" row and the door's `null`. It re-seeds
  // from the record whenever the record changes, so somebody else's move landing
  // through the live layer moves this control too rather than leaving a stale
  // name sitting over a row that has already gone somewhere else.
  const atCompany = account.parentAccountId ?? ""
  const [company, setCompany] = React.useState(atCompany)
  React.useEffect(() => {
    setCompany(atCompany)
  }, [atCompany])

  const refresh = React.useCallback(() => {
    invalidate(accountKey(accountId))
    invalidate(`activity:record:accounts:${accountId}`)
    invalidate(accountsKey(teamId))
    onSaved()
  }, [accountId, teamId, onSaved])

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

  const actions: PanelActions = { busy, ask: setConfirm, act: run }

  // The edit form has no MOVE half and is not getting one back: it stopped
  // offering a parent picker on either kind of account (18 Aug 2026 —
  // account-form-dialog's header), because a company an agency takes on is a
  // company. Moving a PERSON is a different sentence and it is its own control,
  // below the Overview list — see `moveToCompany`.
  async function save(values: AccountFormValues) {
    // An emptied box is NULL, not a missing key: the door treats a field it never
    // heard about as "leave it alone", so clearing one is something this form has
    // to say out loud.
    await tenancy.updateAccount({
      id: accountId,
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      street: values.street.trim() || null,
      postalCode: values.postalCode.trim() || null,
      city: values.city.trim() || null,
      country: values.country.trim() || null,
      about: values.about.trim() || null,
      logoUrl: values.logoUrl || null,
      coverUrl: values.coverUrl || null,
      locale: values.locale.trim() || null,
    })
    refresh()
    toast.success(t("Contact updated."))
  }

  /** MOVE THEM TO THE COMPANY THEY WORK FOR — people change jobs, and until now
   * the only thing that could say so was the assistant or an import.
   *
   * It is the PARENT pointer, not a link. The two are different facts and this
   * screen shows both: the parent is the one company she sits under, which is
   * what the address book files her by and what a company's Contacts tab groups
   * her into; the links on the Companies tab are the companies she is a contact
   * of, and she can hold several of those at once. So this control moves her
   * employer and touches no link — a person who leaves Bergman for Delaval is
   * still, quite possibly, someone we talk to about Bergman.
   *
   * The three refusals are all the door's, said in its own words: it will not
   * put her under herself, will not close a ring, and will not reach an account
   * outside the caller's fence. Choosing the company she is already at is not a
   * refusal at all — it moves nothing and writes nothing (R17). */
  async function moveToCompany() {
    await run(
      () => tenancy.setAccountParent(accountId, company || null),
      t("Contact moved."),
      t("Couldn't move the contact.")
    )
  }

  /** THE COMPANY A LOGIN IS RECORDED AGAINST. A person's login is stored on the
   * PERSON — that is what the fence walks from — but the grant is MADE on a
   * company, which is what the door checks the granter's own reach against. The
   * first company they belong to is that company; a freelancer with none is
   * their own. */
  const onAccountId = companies.find((c) => c.active)?.accountId ?? accountId
  const liveLogin = portalUsers.find((p) => p.active) ?? null

  async function giveAccess() {
    await run(
      () => tenancy.grantPortalAccess(onAccountId, accountId),
      "Access switched on.",
      "Couldn't switch that login on."
    )
  }

  const where = [account.street, account.postalCode, account.city, account.country]
    .filter(Boolean)
    .join(", ")

  // WHICH COMPANY THEY WORK FOR — the parent account, and it is not the same
  // question the Companies tab answers. This row used to list the LINKS under the
  // singular word "Company", which was the third place on this one screen saying
  // the same thing (the chips under the title say it, the Companies tab says it
  // with a count) — while the fact that decides where the address book FILES her,
  // and where she appears on a company's Contacts tab, was on no screen at all.
  const overviewItems = [
    { label: t("Parent account"), value: parent ? parent.name : t("No company yet") },
    { label: t("Email"), value: account.email || "—" },
    { label: t("Phone"), value: account.phone || "—" },
    { label: t("Where they are"), value: where || "—" },
    { label: t("Language"), value: account.locale || "Ours" },
    { label: t("Reference"), value: account.code || "—" },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      // WHICH COMPANIES THEY BELONG TO — the same link table the company screen
      // reads from the other end. Behind `contacts:read`, like everything else
      // about who works where.
      ...(canSeeContacts
        ? [
            {
              value: "companies",
              label: t("Companies"),
              icon: CONCEPT_ICON.accounts,
              badge: formatCount(detail.companiesTotal),
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
      ...(canSeeTickets
        ? [
            {
              value: "tickets",
              label: t("Tickets"),
              icon: CONCEPT_ICON.tickets,
              badge: formatCount(ticketsTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      ...(canSeeMeetings
        ? [
            {
              value: "meetings",
              label: t("Meetings"),
              icon: CONCEPT_ICON.meetings,
              badge: formatCount(meetingsTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      ...(canSeeLogins
        ? [
            {
              value: "portal",
              label: t("Portal access"),
              icon: CONCEPT_ICON.portal,
              badge: formatCount(detail.portalUsersTotal),
              badgeVariant: "" as const,
            },
          ]
        : []),
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

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
                  body: "They stop showing in the everyday lists. Everything they are attached to stays exactly where it is, and you can bring them back any time.",
                  action: "Archive",
                  run: () =>
                    run(
                      () => tenancy.setAccountActive(accountId, false),
                      "Contact archived.",
                      "Couldn't archive the contact."
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
                  "Contact restored.",
                  "Couldn't restore the contact."
                ),
            },
      ]
    : []

  return (
    <RecordScreen
      // THE SAME SQUARE THE ACCOUNTS LIST DRAWS. It is the same `logo_url`
      // column a company's mark lives in — one table, one door — and
      // `scripts/glide-visuals.mjs` carried thirty-one real faces into it, none
      // of which this screen has ever drawn. The band follows the row rather
      // than disagreeing with it: a record cannot be a circle on its own screen
      // and a square in the list that links to it. `fit` keeps the face cropped.
      // No photo falls back to the initial.
      leading={<RecordMark picture={account.logoUrl} name={account.name} fit="cover" size="band" />}
      eyebrow={[
        t("Contact"),
        account.active ? null : t("Archived"),
        liveLogin ? t("Can sign in") : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      title={account.name}
      status={account.email ?? ""}
      actions={
        <>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
      headerExtra={
        companies.some((c) => c.active) ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {companies
              .filter((c) => c.active)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => softNavigate(`${basePath}/${c.accountId}`)}
                  className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {c.relationship ? `${c.relationship} at ${c.personName}` : c.personName}
                </button>
              ))}
          </p>
        ) : undefined
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
                <OverviewList items={overviewItems} />
                {/* WHO THEY WORK FOR, and the one control that can change it.
                    People change jobs; before this, moving one was a sentence
                    somebody said to the assistant. It sits under the row it
                    edits, and it stays a two-step — pick, then press — because
                    where a person sits decides what a client login can see.

                    IT OFFERS COMPANIES AND NOTHING ELSE (`type: "entity"`), which
                    is what makes "put her under herself" unreachable from this
                    screen rather than merely refused by the door: a contact is a
                    person, and no person is in this list. Archived companies are
                    left out too (`searchAccounts` asks the door for the live
                    ones) — a put-away company is not something new work is filed
                    against — while somebody ALREADY under one still reads it by
                    name here, from the record's own parent, and can be moved off
                    it. The remaining refusals belong to the door: a ring, and an
                    account outside the caller's fence. */}
                {canEdit && (
                  <div className="flex flex-col gap-3 rounded-xl border p-4">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {t("Parent account")}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <RecordPicker
                        ariaLabel={t("Parent account")}
                        value={company}
                        onChange={setCompany}
                        search={(term) => searchAccounts(term, { type: "entity" })}
                        searchKey={pickerKey("companies", teamId)}
                        selectedLabel={parent?.name}
                        emptyOption={{ value: "", label: t("No company yet") }}
                        placeholder={t("Choose a company")}
                        searchPlaceholder={t("Search companies…")}
                        emptyText={t("No company matched.")}
                        disabled={busy}
                        className="w-full sm:w-80"
                      />
                      <Button
                        size="sm"
                        disabled={busy || company === atCompany}
                        onClick={() => void moveToCompany()}
                        className="gap-1 self-start sm:self-auto"
                      >
                        {busy ? <Spinner /> : <Pencil className="size-3.5" />}
                        {t("Save")}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {t(
                        "The company they work for. Being a contact of a company is a separate thing, and the same person can be a contact of several."
                      )}
                    </p>
                  </div>
                )}
                {account.about && (
                  <div className="rounded-xl border p-4">
                    <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      {t("About")}
                    </p>
                    <RichText html={account.about} />
                  </div>
                )}
              </div>
            )

          if (tabItem.value === "companies")
            return (
              <CompaniesPanel
                companies={companies}
                onOpen={(id) => softNavigate(`${basePath}/${id}`)}
              />
            )

          if (tabItem.value === "todos")
            return <TodosPanel teamId={teamId} accountId={accountId} canCancel={canCancelTodo} />

          if (tabItem.value === "tickets")
            return <ContactTicketsPanel accountId={accountId} basePath={basePath} />

          if (tabItem.value === "meetings")
            return <ContactMeetingsPanel accountId={accountId} basePath={basePath} />

          if (tabItem.value === "activity") return <ActivityPanel activity={activity} />

          // THE LOGIN SWITCH — a person's, and only a person's. Granting it is
          // one button here rather than a picker, because there is nobody to
          // pick: the person IS this record.
          return (
            <div className="flex flex-col gap-4">
              {canGrant && !liveLogin && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void giveAccess()} className="gap-1">
                    {busy ? <Spinner /> : <KeyRound className="size-4" />}
                    {t("Switch their login on")}
                  </Button>
                </div>
              )}
              <PortalAccessPanel
                portalUsers={portalUsers}
                // The button above is the one way in, so the panel's own Give
                // access button stays off: two buttons for one act is how one of
                // them ends up doing something slightly different.
                canGrant={false}
                canRevoke={canRevoke}
                actions={actions}
                onGrant={() => undefined}
              />
            </div>
          )
        }}
      />

      <AccountFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        draftKey={`contact:edit:${accountId}`}
        initial={{
          accountType: "individual",
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
        }}
        onSubmit={save}
      />

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
              {busy ? t("Working…") : confirm?.action}
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
