"use client"

// APP DETAIL — one system at /apps/<id>, as a tabbed record (Law R2): Overview /
// Sprints / Stories / Process maps / Activity.
//
// THIS SCREEN IS THE CROSS-LINK the owner named as mattering more than any single
// path: from an app to its account, from an app to its other stories. So the
// header says whose it is (a link, one tap to the account) and three of the tabs
// are the work hanging off it — each asked of the SERVER by `appId`, never
// narrowed in the browser, because the backlog is paged and "this app's work
// among the newest fifty" is an answer that looks like an answer.
//
// Host-composed, because those three tabs are collections with their own actions
// and no engine block draws them. Every count is an exact server COUNT(*) through
// the one formatCount seam (R16).

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Pencil, Power } from "lucide-react"

import { AppFormDialog, type AppFormValues } from "@/components/app-form-dialog"
import { useAssignableMembers } from "@/lib/people"
import { ProcessFormDialog } from "@/components/process-form-dialog"
import { HelpFormDialog } from "@/components/help-form-dialog"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { SprintFormDialog } from "@/components/sprint-form-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createSprintFrom } from "@/components/sprints-screen"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import {
  AppMeetingsPanel,
  AppTicketsPanel,
  ProcessesPanel,
  SprintsPanel,
  StoriesPanel,
  sliceKey,
} from "@/components/work-panels"
import { KnowledgeAsk } from "@/components/knowledge-ask"
import { AppMoneyPanel } from "@/components/app-money-panel"
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
  accountsKey,
  appMoneyKey,
  appsKey,
  helpKey,
  listFetch,
  meetingsKey,
  totalKey,
  valueKey,
} from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { appStageMark } from "@shared/app-stages"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Account, AppRow, MeetingPurpose, SelectableValue } from "@shared/types"
import { invalidate, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"

export function AppDetailScreen({
  teamId,
  appId,
  basePath,
}: {
  teamId: string
  appId: string
  /** the apps list in the URL form we arrived through (/apps or /t/<team>/apps) */
  basePath: string
}) {
  const t = useT()
  // The apps set is bounded and read whole, so the record comes out of the same
  // cache the list holds — opening one costs no round-trip.
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  const accountsQ = useCached<Account[]>(accountsKey(teamId), () => listFetch.accounts(teamId))
  // The ONE web-side read of a record's history (R5) — rows, the door's exact
  // COUNT(*) for the tab badge, and the cursor the feed below spends.
  const activity = useRecordActivity("apps", appId)
  // THE BADGES, BEFORE THE CLICK. Five collections hang off a system and all
  // five used to be blank until you opened the tab — this record is the one the
  // owner named first. One bounded read of every total, primed into the same
  // sidecars below; the ROWS behind each tab stay lazy.
  useRecordCounts("apps", appId)
  // The exact totals the five collection tabs badge (R16) — from the counts read
  // above, and re-primed by each panel's own fetch over the same filter its rows
  // came from. `null` is the third answer: the role may not read that module
  // (R18), which renders as nothing exactly as a zero does.
  const sprintsTotal = useCachedValue<number | null>(totalKey("sprints-app", appId))
  const storiesTotal = useCachedValue<number | null>(totalKey("stories-app", appId))
  const mapsTotal = useCachedValue<number | null>(totalKey("processes-app", appId))
  const meetingsTotal = useCachedValue<number | null>(totalKey("meetings-app", appId))
  const ticketsTotal = useCachedValue<number | null>(totalKey("tickets-app", appId))

  const { can } = usePermissions(teamId)
  const canEdit = can("processes", "edit")
  const canArchive = can("processes", "delete")
  const canWriteWork = can("work", "create")
  const canReadKnowledge = can("knowledge", "read")
  // 8.13 — the money half of "what this app gave back" is an INTERNAL figure, so
  // the tab is behind the right that decides whether a person may see money at
  // all. The door refuses a client login besides (R24).
  const canSeeMoney = can("commercials", "read")
  const canReadTickets = can("help", "read")
  // THE RIGHT ON THE CHILD, NEVER THE PARENT. Raising a request about this
  // system is `help:create` and putting a meeting in the diary is
  // `meetings:create` — the rights those two doors gate on. `processes:edit`,
  // which is what lets somebody edit the app record itself, says nothing about
  // either. The door decides (R10); these only decide whether we draw a button
  // that would come back a 403.
  const canRaiseTicket = can("help", "create")
  const canArrangeMeeting = can("meetings", "create")
  // Who can be put on this app (8.10) — the team, from the cache the members
  // screen already fills.
  const members = useAssignableMembers(teamId)
  // The client's own people, by name — see the note beside `contactNames` below
  // for why this is a second read rather than the accounts cache.
  const clientId = appsQ.data?.find((a) => a.id === appId)?.accountId ?? null
  const contactsQ = useCached(clientId ? `account-detail:${clientId}` : null, () =>
    tenancy.accountDetail(clientId as string)
  )

  // WHAT THE TWO NEW FORMS NEED, and nothing more. Both read the SAME cache keys
  // their own sections read, and both are conditional on the right that draws
  // the button: a role that cannot arrange a meeting never fetches the purposes.
  const purposesQ = useCached<MeetingPurpose[]>(
    canArrangeMeeting ? `purposes:${teamId}` : null,
    () => listFetch.purposes(teamId)
  )
  const selectableQ = useCached<SelectableValue[]>(
    canRaiseTicket ? `selectable:${teamId}` : null,
    () => tenancy.selectable().then((r) => r.values)
  )

  const [tab, setTab] = React.useState("overview")
  const [editOpen, setEditOpen] = React.useState(false)
  const [sprintOpen, setSprintOpen] = React.useState(false)
  const [mapOpen, setMapOpen] = React.useState(false)
  const [storyOpen, setStoryOpen] = React.useState(false)
  const [ticketOpen, setTicketOpen] = React.useState(false)
  const [meetingOpen, setMeetingOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)

  // The URL PREFIX we are standing in — "" at the top level, "/t/<teamId>" inside
  // a team — so every cross-link off this record stays in the shape the person
  // arrived through. `basePath` ends in the section, which is one segment more.
  const host = { base: basePath.replace(/\/apps$/, "") }

  const refresh = React.useCallback(() => {
    invalidate(appsKey(teamId))
    invalidate(valueKey(teamId))
    invalidate(`activity:record:apps:${appId}`)
  }, [appId, teamId])

  async function save(values: AppFormValues) {
    await tenancy.updateApp({
      id: appId,
      name: values.name.trim(),
      url: values.url || null,
      stage: values.stage || null,
      toolCostCentsPerMonth: values.toolCostCentsPerMonth,
      about: values.about || null,
      clientContext: values.clientContext || null,
      solution: values.solution || null,
      keyActors: values.keyActors || null,
      // The two sets are re-sent WHOLE — the door replaces what it is given and
      // touches nothing it is not, so an edit that changed only the stage would
      // leave both alone and this one says both out loud.
      staffUserIds: values.staffUserIds,
      leadUserId: values.leadUserId || null,
      stakeholderContactIds: values.stakeholderContactIds,
      mainStakeholderContactId: values.mainStakeholderContactId || null,
    })
    refresh()
    toast.success(t("App updated."))
  }

  async function setActive(active: boolean) {
    setBusy(true)
    try {
      await tenancy.setAppActive(appId, active)
      refresh()
      toast.success(active ? "App restored." : "App archived.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that app.")
    } finally {
      setBusy(false)
    }
  }

  if (appsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the app.")}</p>
  if (appsQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const app = appsQ.data.find((a) => a.id === appId) ?? null
  if (!app) return <p className="text-muted-foreground text-sm">{t("That app no longer exists.")}</p>

  const account = app.accountId ? (accountsQ.data ?? []).find((a) => a.id === app.accountId) : null
  const accountName = account?.name ?? (app.accountId ? "A client" : null)

  // ONLY THE STAFF ON IT AND AN ADMIN OPEN THIS PAGE (CHECKLIST 8.11, Aurora's
  // ap1 over the narrower reading). The refusal is the DOOR's — the app row
  // arrived with its context fields, its address and its people withheld — and
  // this is the sentence that explains what happened rather than the thing that
  // enforces it. An overview tile is still theirs to see; the record is not.
  if (!app.canOpen)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
        <p className="text-muted-foreground text-sm">
          {t(
            "You're not on this app, so its page is closed. Ask an admin to add you to the team on it."
          )}
        </p>
      </div>
    )

  // The people on it, as NAMES. The row carries ids — a staff row points at a
  // login in the core database and a stakeholder at an account row.
  //
  // THE STAFF NAMES come out of the members cache, which is bounded and read
  // whole. THE CONTACT NAMES do not come out of the accounts cache, and that is
  // the bug this comment exists to stop somebody re-introducing: accounts are a
  // GROWING collection that PAGES, so a contact who is not in page one resolved
  // to "Somebody". They come off the account's own detail door instead — the
  // same read the form uses to offer them, so the name a person picked and the
  // name they are shown are the one answer.
  const memberNames = new Map(members.map((m) => [m.id, m.name]))
  const contactNames = new Map(
    (contactsQ.data?.links ?? []).map((l) => [l.personAccountId, l.personName])
  )
  const staffLine = app.staff.length
    ? app.staff
        .map((p) => `${memberNames.get(p.userId) ?? "Somebody"}${p.isLead ? " (team lead)" : ""}`)
        .join(", ")
    : "Nobody yet"
  const stakeholderLine = app.stakeholders.length
    ? app.stakeholders
        .map((p) => `${contactNames.get(p.contactId) ?? "Somebody"}${p.isMain ? " (main)" : ""}`)
        .join(", ")
    : "Nobody yet"

  // THE CONTEXT AN APP CARRIES, above the housekeeping. The four prose fields
  // are what somebody joining the account reads first and what the assistant
  // answers "what is this system for?" out of, so they lead the Overview rather
  // than trailing the address. A field nobody has filled in is dropped rather
  // than shown empty (UI-RULEBOOK W2 — `hideEmpty` is the default).
  const overviewItems = [
    { label: t("Client"), value: accountName ?? "Ours, no client" },
    { label: t("Stage"), value: app.stage ? `${appStageMark(app.stage)} ${app.stage}`.trim() : "—" },
    { label: t("About"), value: app.about ? <RichText html={app.about} /> : "—" },
    {
      label: t("Client context"),
      value: app.clientContext ? <RichText html={app.clientContext} /> : "—",
    },
    { label: t("Solution"), value: app.solution ? <RichText html={app.solution} /> : "—" },
    { label: t("Key actors"), value: app.keyActors || "—" },
    // WHO IS ON IT, both sides (8.10 + 8.5). High on the Overview rather than
    // under the audit block: "who do I ask about this?" is the question a person
    // opens an app record to answer.
    { label: t("Who is on it"), value: staffLine },
    { label: t("Their people"), value: stakeholderLine },
    { label: t("Address"), value: app.url || "—" },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "sprints",
        label: t("Sprints"),
        icon: CONCEPT_ICON.sprints,
        badge: formatCount(sprintsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "stories",
        label: t("Stories"),
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "maps",
        label: t("Processes"),
        icon: CONCEPT_ICON.processes,
        badge: formatCount(mapsTotal),
        badgeVariant: "" as const,
      },
      {
        value: "meetings",
        label: t("Meetings"),
        icon: CONCEPT_ICON.meetings,
        badge: formatCount(meetingsTotal),
        badgeVariant: "" as const,
      },
      // TICKETS ABOUT THIS SYSTEM (8.6). Behind the caller's own help right: a
      // role without it sees no tab at all rather than a tab that refuses.
      ...(canReadTickets
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
      // WHAT IT GIVES BACK (8.13) — hours, and what those hours are worth at the
      // rate of the role that used to spend them. Not a collection and so not
      // counted; see RECORD_TAB_COUNT_EXCEPTIONS.
      ...(canSeeMoney
        ? [
            {
              value: "value",
              label: t("Value"),
              icon: CONCEPT_ICON["internal-rates"],
              badge: "",
              badgeVariant: "" as const,
            },
          ]
        : []),
      // THE KNOWLEDGE BASE, IN CONTEXT (8.9 + 12.1). Not a collection and so not
      // counted — see RECORD_TAB_COUNT_EXCEPTIONS. What it is instead is the
      // ordinary ask box with THIS record's own details already in the question,
      // which is what Aurora meant by "in context": nobody should have to retype
      // which system they are asking about while standing on its page.
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
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  /* B1 / CHECKLIST 11.2 — an app has no lifecycle button, so its one visible
   * action is Edit and everything else is in the menu. Archive keeps its red and
   * its confirm by moving. */
  const overflow: RecordAction[] = canArchive
    ? [
        app.active
          ? {
              key: "archive",
              label: t("Archive"),
              icon: <Power className="size-3.5" />,
              disabled: busy,
              destructive: true,
              onSelect: () => void setActive(false),
            }
          : {
              key: "restore",
              label: t("Restore"),
              icon: <Power className="size-3.5" />,
              disabled: busy,
              onSelect: () => void setActive(true),
            },
      ]
    : []

  return (
    <RecordScreen
      // An app's own mark is its STAGE mark, from the same shared list the tiles
      // read, so a system looks the same wherever it appears (G3).
      mark={appStageMark(app.stage)}
      eyebrow={t("App")}
      title={app.name}
      status={[app.stage, accountName || t("Ours, no client"), app.active ? undefined : t("Archived")]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
      headerExtra={
        /* THE CROSS-LINK UP THE TREE — an app belongs to one account, always, so
           its account is one tap away from every screen it appears on. */
        app.accountId ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => softNavigate(`${host.base}/accounts/${app.accountId}`)}
              className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              {t("Built for")} {accountName}
            </button>
          </p>
        ) : undefined
      }
    >
      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "sprints")
            return (
              <SprintsPanel
                ownerKind="app"
                ownerId={appId}
                filter={{ appId }}
                host={host}
                onNew={canWriteWork ? () => setSprintOpen(true) : undefined}
                emptyText="No work has been sold against this app yet."
              />
            )
          if (t.value === "stories")
            return (
              <StoriesPanel
                ownerKind="app"
                ownerId={appId}
                filter={{ appId }}
                host={host}
                onNew={canWriteWork ? () => setStoryOpen(true) : undefined}
                emptyText="Nothing has been done on this app yet."
              />
            )
          if (t.value === "maps")
            return (
              <ProcessesPanel
                appId={appId}
                host={host}
                onNew={canEdit ? () => setMapOpen(true) : undefined}
              />
            )
          if (t.value === "meetings")
            return (
              <AppMeetingsPanel
                appId={appId}
                host={host}
                onNew={canArrangeMeeting ? () => setMeetingOpen(true) : undefined}
              />
            )
          if (t.value === "tickets")
            return (
              <AppTicketsPanel
                appId={appId}
                host={host}
                onNew={canRaiseTicket ? () => setTicketOpen(true) : undefined}
              />
            )
          if (t.value === "value") return <AppMoneyPanel appId={appId} host={host} />
          if (t.value === "knowledge")
            return (
              <KnowledgeAsk
                accountId={app.accountId}
                context={[
                  `the app "${app.name}"`,
                  accountName ? `built for ${accountName}` : "one of our own systems",
                  app.stage ? `at stage ${app.stage}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                onOpenSource={(sourceId) => softNavigate(`${host.base}/knowledge/${sourceId}`)}
                onOpenRecord={(path) => softNavigate(`${host.base}/${path}`)}
              />
            )
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      <AppFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        teamId={teamId}
        members={members}
        accounts={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        initial={{
          name: app.name,
          accountId: app.accountId ?? "",
          url: app.url ?? "",
          stage: app.stage ?? "",
          // A cost we have never been told is ZERO on the way into the form, not
          // absent: the field asks for an amount, and an amount nobody has given
          // is nothing rather than a blank the door would read as "leave it".
          toolCostCentsPerMonth: app.toolCostCentsPerMonth ?? 0,
          about: app.about ?? "",
          clientContext: app.clientContext ?? "",
          solution: app.solution ?? "",
          keyActors: app.keyActors ?? "",
          staffUserIds: app.staff.map((p) => p.userId),
          leadUserId: app.staff.find((p) => p.isLead)?.userId ?? "",
          stakeholderContactIds: app.stakeholders.map((p) => p.contactId),
          mainStakeholderContactId: app.stakeholders.find((p) => p.isMain)?.contactId ?? "",
        }}
        draftKey={`app:edit:${appId}`}
        onSubmit={save}
      />

      {/* A REQUEST ABOUT THIS SYSTEM, RAISED FROM ITS OWN RECORD. The app rides in
          as `fixedApp` — which system it is about is a fact about where you are
          standing, and it is the field that routes the request and decides who
          gets told when it is answered (5.8). The CLIENT is left as a question:
          a ticket about one of our systems may be raised on behalf of a client
          or be our own housekeeping, and the app cannot answer that.

          It arrives already related, which is the entire point: the tab behind
          this dialog asks the server for `?appId=`, so the new row and the exact
          count above it move together on the next read. */}
      <HelpFormDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        teamId={teamId}
        helpTypeOptions={(selectableQ.data ?? [])
          .filter((v) => v.type === "Ticket type" && v.active)
          .map((v) => v.value)}
        fixedApp={{ id: appId, name: app.name }}
        draftKey={`help:add:app:${appId}`}
        onSubmit={async (v) => {
          await contentApi.createHelp(v)
          invalidate(sliceKey("tickets-app", appId))
          invalidate(helpKey(teamId, "all"))
          toast.success(t("Ticket raised."))
        }}
      />

      {/* A MEETING ABOUT THIS SYSTEM, arranged from its own record. Same shape,
          same reason — and the CLIENT is again left as a question, because a
          meeting about an app is not always with the client who owns it. */}
      <MeetingFormDialog
          teamId={teamId}
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        accountOptions={(accountsQ.data ?? [])
          .filter((a) => a.active && a.accountType === "entity")
          .map((a) => ({ id: a.id, name: a.name }))}
        appOptions={[{ id: appId, name: app.name }]}
        purposeOptions={(purposesQ.data ?? [])
          .filter((x) => x.active)
          .map((x) => ({ id: x.id, name: x.name }))}
        fixedApp={{ id: appId, name: app.name }}
        draftKey={`meeting:add:app:${appId}`}
        onSubmit={async (v: MeetingFormValues) => {
          await contentApi.createMeeting({
            title: v.title,
            startsAt: v.startsAt,
            endsAt: v.endsAt || undefined,
            accountId: v.accountId || undefined,
            appId,
            purposeId: v.purposeId || undefined,
            location: v.location || undefined,
            agenda: v.agenda || undefined,
            notes: v.notes || undefined,
          })
          invalidate(sliceKey("meetings-app", appId))
          invalidate(meetingsKey(teamId))
          toast.success(t("It's in the diary."))
        }}
      />

      {/* A MAP IS DRAWN FROM THE APP IT BELONGS TO (8.12). Process maps stopped
          being a nav destination on 17 Aug 2026, so this button is the way in —
          without it the tab could only ever show maps somebody made elsewhere. */}
      <ProcessFormDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        apps={[{ id: appId, name: app.name }]}
        fixedApp={{ id: appId, name: app.name }}
        draftKey={`process:add:app:${appId}`}
        onSubmit={async (v) => {
          await tenancy.createProcess({
            appId: v.appId,
            name: v.name,
            description: v.description || undefined,
            baselineLabel: v.baselineLabel || undefined,
            // Who does it — the answer the form collects and this call used to
            // drop, which is why the money half of the Value tab was 0.00.
            roleName: v.roleName || undefined,
          })
          invalidate(sliceKey("processes-app", appId))
          invalidate(valueKey(teamId))
          // The money is computed from this map's role, so the panel that shows
          // it has to be told a priced map just appeared.
          invalidate(appMoneyKey(appId))
          toast.success(t("Process mapped."))
        }}
      />

      {/* Both forms open with THIS app already chosen — you are standing on it,
          so it is a fact rather than a question. */}
      <SprintFormDialog
        open={sprintOpen}
        onOpenChange={setSprintOpen}
        apps={options.apps}
        fixedApp={{ id: appId, name: app.name }}
        draftKey={`sprint:add:${appId}`}
        onSubmit={async (v) => {
          await createSprintFrom(teamId, v)
          invalidate(sliceKey("sprints-app", appId))
        }}
      />
      <StoryFormDialog
        teamId={teamId}
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        fixedApp={{ id: appId, name: app.name }}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        draftKey={`story:add:app:${appId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, v)
          invalidate(sliceKey("stories-app", appId))
        }}
      />
    <RecordFooter
        audit={{
          createdByName: app.createdByName,
          createdAt: app.createdAt,
          editedByName: app.editedByName,
          updatedAt: app.updatedAt,
        }}
      />
    </RecordScreen>
  )
}
