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

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Textarea } from "@kwapso/ui/registry/primitives/textarea/textarea"
import { CalendarPlus, CheckCheck, FileText, Pencil, Power } from "lucide-react"

import type { Account, AppRow, Meeting, MeetingPurpose } from "@shared/types"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { TranslateAction, useHumanTranslation } from "@/components/translate-human-text"
import { ApiFailure, content, tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { appsKey, listFetch, meetingsKey } from "@/lib/live-resources"
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
  // WHICH SYSTEM A MEETING WAS ABOUT. Read on the same condition as the accounts
  // above, and out of the SAME bounded cache the apps page holds — an agency has
  // tens of apps, so the picker costs nothing anybody has not already paid.
  const appsQ = useCached<AppRow[]>(canEdit ? appsKey(teamId) : null, () => listFetch.apps(teamId))
  const purposesQ = useCached<MeetingPurpose[]>(canEdit ? `purposes:${teamId}` : null, () =>
    listFetch.purposes(teamId)
  )

  const [tab, setTab] = React.useState("notes")
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState<"held" | "active" | "calendar" | "transcript" | "notes" | null>(null)
  // 9.6 — the notes are an OPEN FIELD on this screen until the meeting is held or
  // closed, and only on the edit page afterwards. The draft lives here rather
  // than in the form so a person can type straight into the record, which is
  // what "open field" means and what the edit dialog was getting in the way of.
  const [notesDraft, setNotesDraft] = React.useState<string | null>(null)

  // READ THE WRITE-UP IN YOUR OWN LANGUAGE, if you ask. The agenda and the notes
  // are the two things on a meeting a person typed; they go in one array, so one
  // press is one call. A hook, so it sits above the early returns below.
  const translation = useHumanTranslation(teamId, [item?.agenda, item?.notes])

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
      appId: values.appId || null,
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

  /** 9.4 AND 9.2, IN ONE PRESS. The transcript arriving is what tells the app the
   * conversation happened, so reading it ticks "held" and writes a row of time
   * for each of our own people who was in the room. The door does all of that;
   * this reports what it did, including the honest nothing. */
  async function readTranscript() {
    setBusy("transcript")
    try {
      const r = await content.readMeetingTranscript(meetingId)
      patchLists(r.meeting)
      if (!r.captured) toast.info(r.note ?? "Nothing to read yet.")
      else
        toast.success(
          r.logsWritten > 0
            ? `Transcript read. Marked held, and ${r.logsWritten} ${
                r.logsWritten === 1 ? "person's" : "people's"
              } time was logged.`
            : "Transcript read, and the meeting is marked held."
        )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't read the transcript.")
    } finally {
      setBusy(null)
    }
  }

  /** 9.6 — the notes, saved from the record itself. It goes through the ordinary
   * edit door with every one of the meeting's own values beside the new notes,
   * because that door REPLACES what it is given: sending the notes alone would
   * quietly blank the title. */
  async function saveNotes(now: Meeting, notes: string) {
    setBusy("notes")
    try {
      const { meeting } = await content.updateMeeting({
        id: meetingId,
        title: now.title,
        startsAt: now.startsAt,
        endsAt: now.endsAt,
        accountId: now.accountId,
        appId: now.appId,
        purposeId: now.purposeId,
        location: now.location,
        agenda: now.agenda,
        notes: notes || null,
      })
      patchLists(meeting)
      setNotesDraft(null)
      toast.success(t("Notes saved."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save the notes.")
    } finally {
      setBusy(null)
    }
  }

  async function setActive(active: boolean) {
    setBusy("active")
    try {
      const { meeting } = await content.setMeetingActive(meetingId, active)
      patchLists(meeting)
      toast.success(active ? "Back in the diary." : "Cancelled, the record and its notes are kept.")
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
    { label: t("Who it is with"), value: item.accountName ?? "Nobody, it is ours" },
    { label: t("Which app"), value: item.appName ?? "—" },
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
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
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

  /* B1 / CHECKLIST 11.2 — this title carried five. "Mark held" is the act that
   * moves the meeting on, so it is the primary; Edit is the everyday one, so it
   * is the secondary. Reading the transcript, adding it to a calendar and
   * calling it off go into the menu, the last of them still red. */
  const overflow: RecordAction[] = [
    // 9.4 — the transcript is what tells the app the conversation happened, so
    // this one act ticks "held" and logs everybody's time. Offered only once the
    // entry is in a calendar (there is nowhere else to look) and only while
    // nothing has been read yet.
    ...(canEdit && canPush && item.active && item.googleEventId && !item.transcriptCapturedAt
      ? [
          {
            key: "transcript",
            label: t("Read the transcript"),
            icon: <FileText className="size-3.5" />,
            disabled: busy !== null,
            onSelect: readTranscript,
          },
        ]
      : []),
    ...(canPush && item.active && !item.googleEventId
      ? [
          {
            key: "calendar",
            label: t("Add to my calendar"),
            icon: <CalendarPlus className="size-3.5" />,
            disabled: busy !== null,
            onSelect: addToCalendar,
          },
        ]
      : []),
    ...(canCancel
      ? [
          {
            key: "active",
            label: item.active ? t("Cancel it") : t("Put it back"),
            icon: <Power className="size-3.5" />,
            disabled: busy !== null,
            destructive: item.active,
            onSelect: () => setActive(!item.active),
          },
        ]
      : []),
  ]

  return (
    <RecordScreen
      eyebrow={[t("Meeting"), item.ref].filter(Boolean).join(" · ")}
      title={item.title}
      status={[
        formatDateTime(item.startsAt),
        item.accountName ?? undefined,
        !item.active ? t("Cancelled") : item.status === "held" ? t("Held") : undefined,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          {canEdit && item.active && (
            <Button
              disabled={busy !== null}
              onClick={() => setHeld(item.status !== "held")}
              className="gap-1.5"
            >
              {busy === "held" ? <Spinner /> : <CheckCheck className="size-3.5" />}
              {item.status === "held" ? t("Not held after all") : t("Mark held")}
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="size-3.5" />
              {t("Edit")}
            </Button>
          )}
          <RecordActionsMenu actions={overflow} />
        </>
      }
    >
      <TabsView
        className={STICKY_TABS}
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
              {/* Above the two things somebody typed, and out of the header's
                  one-primary-one-secondary-and-a-menu discipline. */}
              <div className="flex justify-end">
                <TranslateAction translation={translation} />
              </div>
              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-medium">Agenda</h2>
                {item.agenda ? (
                  <p className="text-sm whitespace-pre-wrap">{translation.of(item.agenda)}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Nothing written down yet.</p>
                )}
              </section>
              {/* THE NOTES ARE AN OPEN FIELD UNTIL THE MEETING IS OVER (9.6).
                  Somebody types into the record while the conversation is still
                  happening; once it is held or cancelled the writing-up is done
                  and the field closes, so a later correction is a deliberate
                  edit on the edit page rather than a stray keystroke.
                  The AGENDA is never editable here — it is set beforehand, on
                  the edit page, which is the other half of the same rule. */}
              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-medium">Notes</h2>
                {canEdit && item.active && item.status !== "held" ? (
                  <>
                    <Textarea
                      rows={8}
                      value={notesDraft ?? item.notes ?? ""}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Type as you go, this is the part worth keeping."
                      disabled={busy !== null}
                      aria-label="Notes"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={busy !== null || notesDraft === null}
                        onClick={() => void saveNotes(item, notesDraft ?? "")}
                        className="gap-1.5"
                      >
                        {busy === "notes" ? <Spinner /> : null}
                        Save notes
                      </Button>
                    </div>
                  </>
                ) : item.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{translation.of(item.notes)}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nothing written up yet, the notes are the part worth keeping.
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
        appOptions={(appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        purposeOptions={(purposesQ.data ?? []).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        initial={{
          appId: item.appId ?? "",
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
    <RecordFooter
        audit={{
          createdByName: item.creatorName,
          createdAt: item.createdAt,
          editedByName: item.editorName,
          updatedAt: item.updatedAt,
        }}
      />
    </RecordScreen>
  )
}
