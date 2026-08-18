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
//
// AND THERE IS A FOURTH TAB NOW: the diary entry itself. The owner asked for the
// link that opens the meeting in Google Calendar and for "location, stakeholders,
// or any other calendar data or metadata… pulled in and organised correctly", and
// this is where organised correctly lands. It is a TAB rather than more rows on
// Overview because it is a different KIND of fact: everything on Overview is
// something one of us decided, and everything here is something Google is telling
// us, with a stamp saying when it last did.
//
// THE STAKEHOLDERS ARE TWO READS DELIBERATELY. Who was invited and what they
// answered is on the meeting row, mirrored by the sweep; which of those addresses
// belongs to a colleague or a client is asked separately, because that second
// fact has a different lifetime — a contact added next week should light up on a
// meeting held last week, and a link frozen at sync time never would.
//
// AND THE TRANSCRIPT SITS UNDER THE NOTES, not in a tab of its own, because the
// agenda, the notes and what was actually said are the same question asked three
// ways and a person reads them in that order.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { Notes } from "@kwapso/ui/registry/primitives/notes/notes"
import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { CalendarPlus, CheckCheck, ExternalLink, FileText, Pencil, Power, Video } from "lucide-react"

import type { Account, AppRow, Meeting, MeetingPersonLink, MeetingPurpose } from "@shared/types"
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content, tenancy } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { appsKey, listFetch, meetingPeopleKey, meetingsKey, meetingTranscriptKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { formatCount } from "@shared/web/format-count"
import { formatDateTime, toLocalInput } from "@shared/web/format"
import { RichText } from "@shared/web/rich-text-view"
import { invalidate, primeCache, useCached } from "@shared/web/store"
import { recordActivityKey, useRecordActivity } from "@/lib/use-record-activity"
// Every URL bound to an attribute goes through the seam, Google's included —
// see the note in google-source-dialog.tsx for why "it came from Google" is not
// a reason to skip it.
import { richTextValue, safeHref, safeSrc } from "@shared/web/rich-text"
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

  // THE TWO READS THE LIST NEVER MAKES. Both are keyed off this meeting and both
  // are asked only when there is something to ask about: a meeting that was never
  // in a calendar has no guests to resolve, and one with nothing captured has no
  // words to fetch. Their keys hang off the meetings live registry entry, so a
  // ping about this row drops them with it.
  const peopleQ = useCached<MeetingPersonLink[]>(
    item?.googleGuests.length ? meetingPeopleKey(meetingId) : null,
    () => content.meetingPeople(meetingId).then((r) => r.links)
  )
  const transcriptQ = useCached<{ text: string; note: string | null; url: string | null }>(
    item?.transcriptCapturedAt ? meetingTranscriptKey(meetingId) : null,
    () => content.meetingTranscript(meetingId)
  )

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
        notes: richTextValue(notes) || null,
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
      // ONLY WHEN THERE IS ONE. A meeting nobody put in a calendar has nothing
      // to show here, and an empty tab is a promise the record cannot keep.
      ...(item.googleEventId
        ? [
            {
              value: "calendar",
              label: t("In the calendar"),
              icon: "calendar",
              // NO BADGE, and the rule caught this rather than a reviewer: the
              // mirrored guest list is CAPPED by the calendar read that produced
              // it, so its length is a ceiling and not a count (R16). An
              // invitation with sixty people on it would badge fifty, which is
              // the one number that is certainly wrong. The tab lists them, and
              // a list you can see the end of does not need a number on it.
              badge: "",
              badgeVariant: "" as const,
            },
          ]
        : []),
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
        // NAMED `panel`, not `t` — the shadowing bit once. Everything a person
        // reads on this screen goes through the translate function called `t`
        // (R28), and a panel renderer that takes the same letter silently turns
        // every sentence inside it into a call on a tab object.
        renderPanel={(panel) => {
          if (panel.value === "overview")
            return <OverviewList items={overviewItems} />
          if (panel.value === "activity")
            return <ActivityPanel activity={activity} />
          if (panel.value === "calendar")
            return (
              <CalendarPanel
                meeting={item}
                links={peopleQ.data ?? null}
                loadingLinks={peopleQ.data === undefined && item.googleGuests.length > 0}
              />
            )
          return (
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-medium">Agenda</h2>
                {item.agenda ? (
                  <RichText html={item.agenda} />
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
                    {/* Uncontrolled, and keyed on the ROW so the editor re-seeds
                        when the saved notes change under it (a colleague typing
                        into the same meeting) but not on every keystroke. */}
                    <Notes
                      key={item.id}
                      defaultValue={item.notes ?? ""}
                      onChange={(html) => setNotesDraft(html)}
                      placeholder="Type as you go, this is the part worth keeping."
                      className="min-h-40"
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
                  <RichText html={item.notes} />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nothing written up yet, the notes are the part worth keeping.
                  </p>
                )}
              </section>
              {/* WHAT WAS ACTUALLY SAID. Third, under the agenda and the notes,
                  because that is the order the three were written in and the
                  order a person reads them: what we meant to cover, what we took
                  down, and then the record of the whole thing.
                  It is a SEPARATE READ (a transcript is up to a megabyte and the
                  diary list is fifty meetings), and it is scrollable rather than
                  laid out down the page: an hour of talking is a very long
                  column, and a record whose other tabs are a scroll away is a
                  record nobody uses. */}
              {item.transcriptCapturedAt && (
                <section className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-muted-foreground text-sm font-medium">{t("What was said")}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* HOW WE KNOW THIS IS THE RIGHT TRANSCRIPT. The three
                          hunts do not prove the same thing — one is a fact
                          Google recorded against this entry, the other two are
                          matches — so the record says which one found it rather
                          than presenting all three as equally certain. */}
                      <Badge variant="outline" className="text-[10px]">
                        {FOUND_BY[item.transcriptFoundBy ?? ""] ?? t("Found in Google")}
                      </Badge>
                      {item.transcriptUrl && (
                        <a
                          href={safeHref(item.transcriptUrl)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                        >
                          <ExternalLink className="size-3" aria-hidden /> {t("Open the document")}
                        </a>
                      )}
                    </div>
                  </div>
                  {transcriptQ.data === undefined ? (
                    <Skeleton variant="list" lines={3} />
                  ) : transcriptQ.data.text ? (
                    <>
                      <div className="max-h-96 overflow-y-auto rounded-xl border p-3">
                        <p className="text-sm whitespace-pre-wrap">{transcriptQ.data.text}</p>
                      </div>
                      {/* NEVER SILENTLY TRIMMED. A transcript longer than one
                          row may hold is cut and says so, in the same words a
                          knowledge file uses. */}
                      {transcriptQ.data.note && (
                        <p className="text-muted-foreground text-xs">{transcriptQ.data.note}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t("The document was found but we couldn't read any words out of it. Open it in Google to read it there.")}
                    </p>
                  )}
                </section>
              )}
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

/* ─────────────────────── THE DIARY ENTRY, ORGANISED ────────────────────────
 *
 * Everything below is Google's fact about this meeting, mirrored onto the row by
 * the calendar sweep. It is a tab of its own rather than more lines on Overview
 * because it is a different KIND of fact — Overview is what one of us decided,
 * this is what Google is telling us — and because it carries a stamp saying when
 * it was last true, which nothing on Overview needs.
 *
 * THE ORDER IS THE ORDER SOMEBODY NEEDS IT IN. The two things a person opens a
 * meeting to DO are at the top (join it, open it in their calendar); who is
 * coming is next, because it is the question the rest of the tab exists to
 * answer; and the facts that rarely change — where, which zone, how often it
 * repeats — sit under them.
 */

/** WHICH HUNT FOUND THE TRANSCRIPT, in words. The three do not prove the same
 * thing, and a record that said only "transcript" would be presenting a name
 * match with the same confidence as a file Google itself filed against this
 * entry. */
const FOUND_BY: Record<string, string> = {
  attachment: "On the calendar entry",
  drive: "In a shared folder",
  mail: "From a Google notice",
}

/** What each guest ANSWERED, in the words a person uses. Google's own four are
 * `accepted`, `declined`, `tentative` and `needsAction`, and the last of those
 * is the one worth translating hardest: "needsAction" is machine for "they have
 * not replied", which is the single most useful thing on a guest list. */
const RESPONSE: Record<string, string> = {
  accepted: "Coming",
  declined: "Not coming",
  tentative: "Maybe",
  needsAction: "No reply yet",
}

function CalendarPanel({
  meeting,
  links,
  loadingLinks,
}: {
  meeting: Meeting
  links: MeetingPersonLink[] | null
  loadingLinks: boolean
}) {
  const t = useT()
  const linkFor = new Map((links ?? []).map((l) => [l.email, l]))
  // ROOMS ARE NOT STAKEHOLDERS. Google puts meeting rooms on the same attendee
  // list as people, and a room shown as a stakeholder is a stakeholder nobody
  // can ring — so they are separated rather than dropped, because "which room"
  // is a real fact about a meeting.
  const people = meeting.googleGuests.filter((g) => !g.resource)
  const rooms = meeting.googleGuests.filter((g) => g.resource)

  return (
    <div className="flex flex-col gap-6">
      {/* THE TWO THINGS A PERSON CAME HERE TO DO. The owner asked for the first
          of them by name: "there should be a calendar link, like a link that I
          can open the meeting within my calendar." */}
      <div className="flex flex-wrap gap-2">
        {meeting.googleJoinUrl && (
          <Button asChild size="sm" className="gap-1.5">
            <a href={safeHref(meeting.googleJoinUrl)} target="_blank" rel="noreferrer noopener">
              <Video className="size-3.5" aria-hidden /> {t("Join the call")}
            </a>
          </Button>
        )}
        {meeting.googleEventUrl && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={safeHref(meeting.googleEventUrl)} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-3.5" aria-hidden /> {t("Open in Google Calendar")}
            </a>
          </Button>
        )}
      </div>

      {/* WHO IS COMING — the "stakeholders" the owner asked for, and the reason
          this tab is worth having. An address that matches one of our own people
          or a contact on one of our accounts is shown as that RECORD; everybody
          else is shown as themselves, which is the honest answer for most people
          on most invitations. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">{t("Who was invited")}</h2>
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("Nobody else is on the invitation.")}</p>
        ) : (
          <div className="flex flex-col rounded-xl border">
            {people.map((g) => {
              const known = linkFor.get(g.email)
              return (
                <div
                  key={g.email}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b p-3 text-sm last:border-0"
                >
                  <span className="font-medium">{g.name || g.email}</span>
                  {g.name && <span className="text-muted-foreground text-xs">{g.email}</span>}
                  {g.organizer && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("Organiser")}
                    </Badge>
                  )}
                  {g.optional && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("Optional")}
                    </Badge>
                  )}
                  {/* WHO THEY ARE TO US. Two different badges because they are
                      two different relationships, and somebody can be neither —
                      which is what an empty row here honestly says. */}
                  {known?.memberName && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("One of us")}
                    </Badge>
                  )}
                  {known?.accountName && (
                    <Badge variant="secondary" className="text-[10px]">
                      {known.accountName}
                    </Badge>
                  )}
                  {loadingLinks && !known && (
                    <span className="text-muted-foreground text-[10px]">{t("…")}</span>
                  )}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {RESPONSE[g.response] ?? g.response}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* FILES HANGING OFF THE ENTRY — the agenda doc, the deck, and the one this
          whole lane turns on: the transcript Google Meet files here once the call
          is over. Each carries Google's own icon for its type, which is a static
          unauthenticated link and therefore the one piece of Drive chrome that
          can go straight into a page. */}
      {meeting.googleAttachments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-sm font-medium">{t("Attached to the entry")}</h2>
          <div className="flex flex-col rounded-xl border">
            {meeting.googleAttachments.map((a) => (
              <a
                key={a.fileId || a.url || a.title}
                href={safeHref(a.url)}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:bg-muted/50 flex items-center gap-2 border-b p-3 text-sm last:border-0"
              >
                {a.iconUrl && (
                  <img src={safeSrc(a.iconUrl)} alt="" width={16} height={16} className="shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{a.title || a.fileId}</span>
                <ExternalLink className="text-muted-foreground size-3 shrink-0" aria-hidden />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* THE FACTS THAT RARELY CHANGE. An OverviewList so it reads exactly like
          the tab beside it — the shape of a record's facts should not depend on
          which tab they are on. */}
      <OverviewList
        items={[
          { label: t("Where"), value: meeting.location ?? "—" },
          {
            label: t("Time zone"),
            // AN HOUR IS NOT A FACT WITHOUT ONE. The same stamp read in two
            // places is two different meetings to the people reading it.
            value: meeting.googleTimeZone ?? "—",
          },
          { label: t("Organiser"), value: meeting.googleOrganizer ?? "—" },
          {
            label: t("Repeats"),
            // Google's own RRULE is not a sentence anybody reads, so it is shown
            // as a yes with the rule beside it rather than as the rule alone.
            value: meeting.googleRecurrence ?? (meeting.recurringEventId ? "Yes, one of a series" : "No"),
          },
          {
            label: t("In Google"),
            value:
              meeting.googleStatus === "cancelled"
                ? "Called off"
                : meeting.googleStatus === "tentative"
                  ? "Not confirmed"
                  : meeting.googleStatus === "confirmed"
                    ? "Confirmed"
                    : "—",
          },
          {
            label: t("Rooms"),
            value: rooms.length ? rooms.map((r) => r.name || r.email).join(", ") : "—",
          },
        ]}
      />

      {/* WHEN THIS WAS LAST TRUE. A mirror that does not say how old it is is a
          mirror somebody will one day trust over the thing it reflects. */}
      <p className="text-muted-foreground text-xs">
        {meeting.googleSyncedAt
          ? `${t("Read from your calendar")} ${formatDateTime(meeting.googleSyncedAt)}`
          : t("This hasn't been read from a calendar yet.")}
      </p>
    </div>
  )
}
