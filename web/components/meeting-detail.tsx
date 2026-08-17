"use client"

// ONE MEETING, as a tabbed record: Notes / Overview / Activity (the standard
// every record gets, R2).
//
// NOTES IS THE FIRST TAB, not Overview, and that is the whole argument for this
// module existing. Somebody opening a meeting from six months ago is not looking
// for who created the row — they are looking for what was agreed. The agenda sits
// above the notes because that is the order the two were written in.
//
// THE ONE BUTTON THAT REACHES OUTSIDE THIS APP is here too: "Add to my calendar".
// It needs a connected Calendar account and the "Calendar on your behalf" right,
// and pressing it twice makes ONE entry — the door claims the event id on the row
// under a `google_event_id IS NULL` predicate, so the second press is answered
// with the entry that already exists.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { CalendarPlus, CheckCheck, Pencil, Power } from "lucide-react"

import type { Account, Meeting, MeetingPurpose } from "@shared/types"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { auditItems } from "@/lib/audit-overview"
import { listFetch, meetingsKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { formatCount } from "@shared/web/format-count"
import { formatDateTime, toLocalInput } from "@shared/web/format"
import { invalidate, primeCache, useCached } from "@shared/web/store"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"
import { useT } from "@shared/web/language"

export function MeetingDetailScreen({ teamId, meetingId }: { teamId: string; meetingId: string }) {
  const t = useT()
  const meetingsQ = useCached<Meeting[]>(meetingsKey(teamId), () => listFetch.meetings(teamId))
  // The list is a PAGE (R14), so the record may not be in it — a link straight to
  // a meeting the loaded prefix doesn't reach must still open. One read by id,
  // only when the page didn't already have it.
  const inPage = meetingsQ.data?.find((m) => m.id === meetingId) ?? null
  const oneQ = useCached<Meeting | null>(
    meetingsQ.data !== undefined && !inPage ? `meeting:one:${meetingId}` : null,
    () => content.meetingOne(meetingId)
  )
  const item = inPage ?? oneQ.data ?? null

  // The generic record feed (R5) + the exact server total its tab badges (R8 for
  // the place, R16 for the number — never the loaded page's length).
  const activity = useRecordActivity("meetings", meetingId)

  const { can } = usePermissions(teamId)
  const canEdit = can("meetings", "edit")
  const canCancel = can("meetings", "delete")
  // Pushing to a calendar is two rights on top of reading the meeting: kwapso may
  // use your connection, and kwapso may put an event in your diary. The door
  // demands both — this only decides whether the button is worth offering.
  const canPush = can("google", "edit") && can("google_events", "create")

  const accountsQ = useCached<Account[]>(canEdit ? `accounts:${teamId}` : null, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  const purposesQ = useCached<MeetingPurpose[]>(canEdit ? `purposes:${teamId}` : null, () =>
    listFetch.purposes(teamId)
  )

  const [tab, setTab] = React.useState("notes")
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState<"held" | "active" | "calendar" | null>(null)

  function patchLists(next: Meeting | null) {
    if (!next) return
    primeCache(`meeting:one:${meetingId}`, next)
    const cur = meetingsQ.data
    if (cur) primeCache(meetingsKey(teamId), cur.map((m) => (m.id === meetingId ? next : m)))
    // The Activity tab's rows AND its badge come from one fetcher, so dropping
    // the key re-primes both.
    invalidate(recordActivityKey("meetings", meetingId))
  }

  async function save(values: MeetingFormValues) {
    const { meeting } = await content.updateMeeting({
      id: meetingId,
      title: values.title,
      startsAt: values.startsAt,
      endsAt: values.endsAt || null,
      accountId: values.accountId || null,
      purposeId: values.purposeId || null,
      location: values.location || null,
      agenda: values.agenda || null,
      notes: values.notes || null,
    })
    patchLists(meeting)
    toast.success(t("Meeting updated."))
  }

  async function setHeld(held: boolean) {
    setBusy("held")
    try {
      const { meeting } = await content.setMeetingHeld(meetingId, held)
      patchLists(meeting)
      toast.success(held ? "Marked as held." : "Back in the diary.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that.")
    } finally {
      setBusy(null)
    }
  }

  async function setActive(active: boolean) {
    setBusy("active")
    try {
      const { meeting } = await content.setMeetingActive(meetingId, active)
      patchLists(meeting)
      toast.success(active ? "Back in the diary." : "Cancelled — the record and its notes are kept.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that.")
    } finally {
      setBusy(null)
    }
  }

  async function addToCalendar() {
    setBusy("calendar")
    try {
      const { alreadyThere } = await content.googleMeetingToCalendar(meetingId)
      // The door moved the MEETING row (it remembers the entry it became), so the
      // record re-reads rather than being patched from a response that is about
      // the calendar entry.
      invalidate(`meeting:one:${meetingId}`)
      invalidate(meetingsKey(teamId))
      invalidate(recordActivityKey("meetings", meetingId))
      toast.success(alreadyThere ? "It was already in your calendar." : "It's in your calendar.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't add it to your calendar.")
    } finally {
      setBusy(null)
    }
  }

  if (meetingsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the meeting.")}</p>
  if (meetingsQ.data === undefined) return <Skeleton variant="list" lines={4} />
  if (!item && oneQ.data === undefined && !inPage) return <Skeleton variant="list" lines={4} />
  if (!item) return <p className="text-muted-foreground text-sm">{t("That meeting doesn't exist.")}</p>

  const overviewItems = [
    { label: t("Who it is with"), value: item.accountName ?? "Nobody — it is ours" },
    { label: t("Why we are meeting"), value: item.purposeName ?? "—" },
    { label: t("When"), value: formatDateTime(item.startsAt) },
    { label: t("Until"), value: item.endsAt ? formatDateTime(item.endsAt) : "—" },
    { label: t("Where"), value: item.location ?? "—" },
    { label: t("Reference"), value: item.ref ?? "—" },
    {
      label: t("In your calendar"),
      // Said as a fact rather than as a link: the entry lives in the person's own
      // Google, and whether THIS reader can see it depends on whose connection
      // pushed it.
      value: item.googleEventId ? "Yes" : "Not yet",
    },
    ...auditItems({
      createdByName: item.creatorName,
      createdAt: item.createdAt,
      editedByName: item.editorName,
      updatedAt: item.updatedAt,
      status: !item.active ? "Cancelled" : item.status === "held" ? "Held" : "Scheduled",
    }),
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      { value: "notes", label: t("Agenda & notes"), icon: "notebook-pen", badge: "", badgeVariant: "" as const },
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "activity",
        label: t("Activity"),
        icon: "history",
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="truncate">{item.title}</span>
            {!item.active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                {t("Cancelled")}
              </Badge>
            )}
            {item.active && item.status === "held" && (
              <Badge variant="secondary" className="text-[10px]">
                {t("Held")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDateTime(item.startsAt)}
            {item.accountName ? ` · ${item.accountName}` : ""}
            {item.purposeName ? ` · ${item.purposeName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          {canEdit && item.active && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => setHeld(item.status !== "held")}
              className="gap-1.5"
            >
              {busy === "held" ? <Spinner /> : <CheckCheck className="size-3.5" />}
              {item.status === "held" ? "Not held after all" : "Mark held"}
            </Button>
          )}
          {canPush && item.active && !item.googleEventId && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={addToCalendar}
              className="gap-1.5"
            >
              {busy === "calendar" ? <Spinner /> : <CalendarPlus className="size-3.5" />}
              {t("Add to my calendar")}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => setActive(!item.active)}
              className={`gap-1.5 ${item.active ? "text-destructive hover:text-destructive" : ""}`}
            >
              {busy === "active" ? <Spinner /> : <Power className="size-3.5" />}
              {item.active ? "Cancel it" : "Put it back"}
            </Button>
          )}
        </div>
      </div>

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(t) => {
          if (t.value === "overview")
            return <OverviewList items={overviewItems} />
          if (t.value === "activity")
            return <ActivityPanel activity={activity} />
          return (
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-medium">Agenda</h2>
                {item.agenda ? (
                  <p className="text-sm whitespace-pre-wrap">{item.agenda}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Nothing written down yet.</p>
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-medium">Notes</h2>
                {item.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nothing written up yet — the notes are the part worth keeping.
                  </p>
                )}
              </section>
            </div>
          )
        }}
      />

      <MeetingFormDialog
        open={editing}
        onOpenChange={setEditing}
        draftKey={`meeting:edit:${meetingId}`}
        accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        purposeOptions={(purposesQ.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        initial={{
          title: item.title,
          startsAt: toLocalInput(item.startsAt),
          endsAt: toLocalInput(item.endsAt),
          accountId: item.accountId ?? "",
          purposeId: item.purposeId ?? "",
          location: item.location ?? "",
          agenda: item.agenda ?? "",
          notes: item.notes ?? "",
        }}
        onSubmit={save}
      />
    </div>
  )
}
