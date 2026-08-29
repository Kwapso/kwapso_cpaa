"use client"

// THE WORK ENGINE'S NESTED COLLECTIONS — the same four lists, wherever they hang.
//
// The owner's ruling put every one of apps, sprints, stories and tasks in TWO
// places: a section of its own AND a tab on the record above it. Two places for
// four collections is eight lists, and eight hand-written lists is seven chances
// for the account's sprints and the app's sprints to disagree about what a
// sprint looks like. So each one is written ONCE here and hung wherever it is
// needed, exactly as account-detail-panels.tsx does for the customer spine.
//
// EACH PANEL ASKS THE SERVER ITS OWN QUESTION. That is the whole reason these
// are components with their own reads rather than a filter over a list the host
// already holds: the backlog is PAGED (R14), so narrowing a loaded page by app
// in the browser answers "this app's work among the newest fifty" — which looks
// exactly like an answer and is not one. The doors take `appId`, `sprintId`,
// `ticketId` and `accountId`, and the exact total (R16) that badges the tab comes
// back from the same call that fetched the rows, over the same WHERE.

import * as React from "react"

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Checklist } from "@shared/ui/components/checklist/checklist"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import { Ban, ChevronRight } from "@shared/ui/foundations/icons"

import { AppMark } from "@/components/app-tiles"
import { LoadMore } from "@/components/load-more"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { cursorKey, todosDoneKey, todosKey, totalKey } from "@/lib/live-resources"
import { RecordMark } from "@shared/web/record-mark"
import { softNavigate } from "@/lib/nav"
import type { AppRow, HelpTicket, Meeting, ProcessSummary, Sprint, Story, Todo, TodoViewName } from "@shared/types"
import { formatDate } from "@shared/web/format"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton, EmptyLine } from "@/components/deep-link/screen-bits"
import { richTextPlain, safeHref } from "@shared/web/rich-text"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { formatCount } from "@shared/web/format-count"

/** The four states a story moves through, in the words a person reads. The
 * states the code trusts are STORY_STATUSES; this is only their spelling. */
export const STORY_STATUS_LABEL: Record<Story["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
}

/** A row in one of these lists, faded when the record is switched off or
 * finished. Nothing here is ever hidden for being done: "finished" is a state,
 * not an absence, and a sprint's whole point is that you can look back at it.
 *
 * IT HAS NO BORDER OF ITS OWN ANY MORE, and its list carries one instead
 * (`RowList` below). A bordered box per row inside a gapped column draws TWO
 * cues at every boundary — a drawn line AND a space — where N6 allows exactly
 * one, and it did it seven times in this file alone. The COLLECTION is the block
 * that earns a container; a row inside one is a row. */
function Row({
  live,
  mark,
  children,
}: {
  live: boolean
  /** THE RECORD'S OWN FACE, and it is a REQUIRED prop on purpose (R35).
   *
   * A record is known by its picture as much as by its name, and these nested
   * lists were the largest place in the app where it was missing: a story inside
   * a sprint, a ticket inside an app, a contact inside an account — the same
   * record that leads with its glyph on its own collection led with nothing here.
   *
   * REQUIRED rather than optional because that is the only version of this rule a
   * twenty-first panel cannot quietly skip. `null` is a real answer and says so
   * out loud at the call site; an omitted optional prop says nothing at all, and
   * "did you remember?" is exactly the question source-scanning cannot ask. */
  mark: React.ReactNode | null
  children: React.ReactNode
}) {
  return (
    <li className={`flex flex-wrap items-center gap-2 px-3 py-2 ${live ? "" : "opacity-60"}`}>
      {mark}
      {children}
    </li>
  )
}

/** The container those rows sit in: one hairline round the collection and one
 * between each pair, which is N6's "a block earns a container when it holds a
 * collection of two or more rows". Written once so seven panels cannot drift
 * into seven spellings of one list. */
function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-border divide-y rounded-[var(--radius)] border">{children}</ul>
}

/** The clickable name of a record, in the URL form the caller arrived through. */
function OpenLink({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    // The kit's `link` variant IS this control: no box, inherited ink, an
    // underline that arrives on hover. Everything overridden below is LAYOUT,
    // not look — the name has to flex and truncate inside a row, and the base
    // skin is `shrink-0 justify-center`. `shrink` is spelled out rather than
    // left to `flex-1`, because `flex-1` and `shrink-0` are different
    // tailwind-merge groups and both would survive, leaving which one paints
    // to stylesheet order.
    <Button
      type="button"
      variant="link"
      onClick={onOpen}
      className="hover:text-primary min-w-0 flex-1 shrink justify-start text-left underline-offset-2"
    >
      {/* The truncation lives on a SPAN inside, not on the control. `truncate`
          is `text-overflow: ellipsis`, and that applies to a block container's
          line box — the kit's skin is `inline-flex`, so the label becomes an
          anonymous flex item and the ellipsis is silently dropped: the name
          still clips at exactly the same width, with no "…" to say it did.
          Measured, both at 283.71px. */}
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  )
}

/** THE ARROW AT THE END OF A ROW, AND IT DOES SOMETHING.
 *
 * It was a bare `<ChevronRight>` — no click target, no label, not inside a
 * button. The owner reported the Processes row as "unable to expand", which is
 * exactly right and exactly the fault: a chevron is the universal "this opens"
 * glyph, so a decorative one is a promise the row does not keep. Only the NAME
 * was clickable, which is a small target and an invisible rule.
 *
 * It is not an expander — the row opens the record, and the row's own list has
 * no steps in it to expand (the door returns a count, not the steps). So it does
 * what it looks like it does, and says so to a screen reader. */
function OpenChevron({ label, onOpen }: { label: string; onOpen: () => void }) {
  const t = useT()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onOpen}
      aria-label={t("Open {name}", { name: label })}
      // `ghost` IS this treatment — `--ink-tertiary` is `--muted-foreground`
      // and its hover is the ink going to full, which is what was written by
      // hand here. The overrides are the touch box only: `size="icon"` is a
      // 40-square, and this one is touch padding (UI-RULEBOOK S6) taken back
      // out of the row with the negative margin, so the box measures the same
      // 30 it did before and the row does not grow. The glyph is untouched:
      // `--icon-button` is 1rem, which is what `size-4` already was — measured,
      // 15x15 on both sides of the swap.
      className="-m-2 size-auto shrink-0 p-2"
    >
      <ChevronRight className="size-4" />
    </Button>
  )
}

/** What a panel needs from whoever hung it. `base` is the URL PREFIX the person
 * is already in — "" at the top level (so a link reads /stories/<id>) or
 * "/t/<teamId>" inside a team — so a cross-link never bounces them between the
 * two shapes of the same address. */
export type PanelHost = { base: string }

/** THE CACHE KEY FOR ONE NARROWED SLICE. Keyed by the record it hangs off, not
 * by the team: the app's stories and the sprint's stories are two collections
 * that happen to come from one table, and one key for both would mean opening a
 * second app showed the first one's work until it refetched. */
export function sliceKey(kind: string, ownerId: string): string {
  return `${kind}-of:${ownerId}`
}

/* ------------------------------- the stories ------------------------------ */

/** One story, in one line: where it is, who has it, when it is due, and which
 * request it answers. The same sentence the backlog row says, because it is the
 * same record — a person reading it on a sprint should not have to re-learn it. */
function storyLine(s: Story, ownerKind: "sprint" | "app" | "ticket"): string {
  return (
    [
      STORY_STATUS_LABEL[s.status],
      s.assigneeName ?? "unassigned",
      s.sprintEndsOn ? `due ${formatDate(s.sprintEndsOn)}` : null,
      // THE OWNER IS NOT A FACT ABOUT THE ROW. This list hangs off a sprint, an
      // app or a ticket, and it used to name the sprint and the ticket on every
      // row of all three — so the sprint's own Stories tab said "Sprint 14" forty
      // times under a heading that said Sprint 14, and the ticket's said its own
      // reference. Five facts against D5's three, and the fifth was the record
      // the reader was already looking at. The one that is NOT the owner still
      // earns its place: on an app's stories, which sprint a story sits in is
      // real information.
      ownerKind === "sprint" ? null : s.sprintName,
      ownerKind === "ticket" ? null : s.ticketRef,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

/** THE WORK ON ONE THING — a sprint's, an app's, or a ticket's. Paged (R14),
 * because the backlog it is a slice of only ever grows: a two-year app has
 * hundreds of stories against it and the oldest is the one somebody is looking
 * for. `total` is the door's exact COUNT(*) over this same filter, parked in the
 * sidecar the tab badge reads. */
export function StoriesPanel({
  ownerKind,
  ownerId,
  filter,
  marks,
  host,
  onNew,
  emptyText,
}: {
  /** what it hangs off — only ever part of the cache key */
  ownerKind: "sprint" | "app" | "ticket"
  ownerId: string
  filter: { sprintId?: string; appId?: string; ticketId?: string }
  /** THE TEAM'S GLYPH FOR EACH TYPE (R35), handed in rather than fetched.
   * A panel hangs off three different records and has no team id of its own;
   * the screens that mount it all hold the vocabulary already, so passing it
   * costs nothing and fetching it here would cost a round trip per panel. */
  marks?: Map<string, string>
  host: PanelHost
  /** present = the caller may add work here, and this opens the form */
  onNew?: () => void
  emptyText: string
}) {
  const t = useT()
  const key = sliceKey(`stories-${ownerKind}`, ownerId)
  const q = useCached<Story[]>(key, () =>
    // `view: "all"` on purpose: this is the record of what was done, not a
    // backlog to work through, so hiding the finished work would hide the point.
    contentApi.stories({ ...filter, view: "all" }).then((r) => {
      primeCache(totalKey(`stories-${ownerKind}`, ownerId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.stories
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the work.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("New story")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <RowList>
          {rows.map((s) => (
            <Row key={s.id} live={s.status !== "done"} mark={<RecordMark mark={marks?.get(s.storyType ?? "") ?? null} name={s.storyType ?? s.title} />}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={s.ref ? `${s.ref} · ${s.title}` : s.title}
                  onOpen={() => softNavigate(`${host.base}/stories/${s.id}`)}
                />
                <p className="text-muted-foreground truncate px-0 text-xs">{storyLine(s, ownerKind)}</p>
              </div>
              {s.status === "done" && (
                <Badge variant="secondary" className="text-badge">
                  {t("Done")}
                </Badge>
              )}
            </Row>
          ))}
        </RowList>
      )}
      {/* R14: the badge above counts ALL of this slice, so the list under it has
          to be able to reach the rest of it. */}
      <LoadMore
        listKey={key}
        label={t("Load more work")}
        fetchPage={(c: string) =>
          contentApi
            .stories({ ...filter, view: "all", cursor: c })
            .then((r) => ({ rows: r.stories, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/* ------------------------------- the sprints ------------------------------ */

/** A sprint, in one line: what kind, whose, when, and how much of it is left.
 * The counts are the door's own exact counts over the stories inside it (R16),
 * never the length of anything loaded here. */
export function sprintLine(s: Sprint): string {
  const done = s.storyCount - s.openStoryCount
  return (
    [
      s.sprintType,
      s.accountName,
      s.appName,
      // Dates through the ONE formatter (shared/web/format.ts), never raw. A row
      // reading "2026-02-23T00:00:00.000Z → 2026-03-20T00:00:00.000Z" is a
      // timestamp somebody has to decode, on a list built for a manager to scan.
      s.startsOn && s.endsOn
        ? `${formatDate(s.startsOn)} → ${formatDate(s.endsOn)}`
        : (formatDate(s.startsOn) || formatDate(s.endsOn) || null),
      s.storyCount > 0 ? `${done} of ${s.storyCount} done` : "no work in it yet",
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

/** THE SAME SPRINT, ON A LIST THAT HAS ALREADY SAID ITS KIND — three facts, not
 * five.
 *
 * The Sprints overview groups by kind and puts the kind's own word above each
 * group, and then every row underneath repeated it: "Retainer · Northwind ·
 * Portal · 3 Feb → 20 Mar · 3 of 11 done", under a heading that said Retainer.
 * A fact restated once per row is not information, it is noise with a job title,
 * and it took that band to seven units against N1's four.
 *
 * So the KIND comes off (the heading says it) and HOW MUCH IS DONE comes off
 * (it becomes the row's trailing number, where a number belongs — T4), leaving
 * the three facts D5 allows a status line: whose, which app, and when.
 *
 * `sprintLine` above is unchanged and still carries all five, because the flat
 * "All sprints" list and the panels on an account and an app are NOT grouped by
 * kind, and there the kind is the one word telling you what sort of block of
 * work you are looking at. Two lines, because there are two situations, not
 * because there are two opinions. */
export function sprintLineInKindGroup(s: Sprint): string {
  return (
    [
      s.accountName,
      s.appName,
      s.startsOn && s.endsOn
        ? `${formatDate(s.startsOn)} → ${formatDate(s.endsOn)}`
        : (formatDate(s.startsOn) || formatDate(s.endsOn) || null),
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

/** THE BLOCKS OF WORK SOLD on one app, or to one account. Bounded, not paged —
 * a sprint is a contract, so the whole set is the answer and its exact total
 * comes back beside it. */
export function SprintsPanel({
  ownerKind,
  ownerId,
  filter,
  marks,
  host,
  onNew,
  emptyText,
}: {
  ownerKind: "app" | "account"
  ownerId: string
  filter: { appId?: string; accountId?: string }
  /** THE TEAM'S GLYPH FOR EACH TYPE (R35), handed in rather than fetched.
   * A panel hangs off three different records and has no team id of its own;
   * the screens that mount it all hold the vocabulary already, so passing it
   * costs nothing and fetching it here would cost a round trip per panel. */
  marks?: Map<string, string>
  host: PanelHost
  onNew?: () => void
  emptyText: string
}) {
  const t = useT()
  const key = sliceKey(`sprints-${ownerKind}`, ownerId)
  const q = useCached<Sprint[]>(key, () =>
    contentApi.sprints(filter).then((r) => {
      primeCache(totalKey(`sprints-${ownerKind}`, ownerId), r.total)
      return r.sprints
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the sprints.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("Start a sprint")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <RowList>
          {rows.map((s) => (
            <Row key={s.id} live={!s.completedAt} mark={<RecordMark mark={marks?.get(s.sprintType ?? "") ?? null} name={s.sprintType ?? s.name} />}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={s.ref ? `${s.ref} · ${s.name}` : s.name}
                  onOpen={() => softNavigate(`${host.base}/sprints/${s.id}`)}
                />
                <p className="text-muted-foreground truncate text-xs">{sprintLine(s)}</p>
              </div>
              {s.completedAt && (
                <Badge variant="secondary" className="text-badge">
                  {t("Complete")}
                </Badge>
              )}
            </Row>
          ))}
        </RowList>
      )}
    </div>
  )
}

/* --------------------------------- the apps -------------------------------- */

/** An app, in one line: whose it is, where it is up to, and its address. */
function appLine(a: AppRow, accountName?: string | null): string {
  return [accountName ?? "the agency's own", a.stage, a.url].filter(Boolean).join(" · ") || "—"
}

/** THE SYSTEMS BUILT FOR ONE ACCOUNT. An app belongs to ONE account, always (the
 * owner's ruling), so this is that account's whole inventory and the door counts
 * exactly it. */
export function AppsPanel({
  accountId,
  accountName,
  host,
  onNew,
}: {
  accountId: string
  accountName: string
  host: PanelHost
  onNew?: () => void
}) {
  const t = useT()
  const key = sliceKey("apps-account", accountId)
  const q = useCached<AppRow[]>(key, () =>
    tenancy.apps(accountId).then((r) => {
      primeCache(totalKey("apps-account", accountId), r.total)
      return r.apps
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the apps.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("Record an app")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyLine concept="apps">{t("Nothing built for")} {accountName} {t("yet.")}</EmptyLine>
      ) : (
        <RowList>
          {rows.map((a) => (
            <Row key={a.id} live={a.active} mark={null}>
              {/* THE SAME RECORD, THE SAME SQUARE. These rows and the tiles on
                  the apps screen list the identical AppRow, and only one of them
                  drew the client's mark — so an app was a picture on one screen
                  and a line of text on the next. */}
              <AppMark app={a} size="row" />
              <div className="min-w-0 flex-1">
                <OpenLink label={a.name} onOpen={() => softNavigate(`${host.base}/apps/${a.id}`)} />
                <p className="text-muted-foreground truncate text-xs">{appLine(a, accountName)}</p>
              </div>
              {!a.active && (
                <Badge variant="secondary" className="text-muted-foreground text-badge">
                  {t("Archived")}
                </Badge>
              )}
            </Row>
          ))}
        </RowList>
      )}
    </div>
  )
}

/* -------------------------------- the maps -------------------------------- */

/** THE PROCESS MAPS DRAWN INSIDE ONE APP. Paged (R14) like the maps list itself:
 * every app of every client grows them and none is ever deleted, because a
 * saving computed from a baseline has to stay checkable years later. */
export function ProcessesPanel({
  appId,
  host,
  onNew,
}: {
  appId: string
  host: PanelHost
  /** Map a process from inside the app it belongs to (CHECKLIST 8.12). Absent
   * when the reader cannot create one, which is why it is a prop rather than a
   * permission this panel re-derives. */
  onNew?: () => void
}) {
  const t = useT()
  const key = sliceKey("processes-app", appId)
  const q = useCached<ProcessSummary[]>(key, () =>
    tenancy.processes({ appId }).then((r) => {
      primeCache(totalKey("processes-app", appId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.processes
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the processes.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("Map a process")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("No processes drawn inside this app yet.")}
        </p>
      ) : (
        <RowList>
          {rows.map((p) => (
            <Row key={p.id} live={p.active} mark={<RecordMark name={p.name} />}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={p.name}
                  onOpen={() => softNavigate(`${host.base}/processes/${p.id}`)}
                />
                <p className="text-muted-foreground truncate text-xs">
                  {[
                    `${p.stepCount} step${p.stepCount === 1 ? "" : "s"}`,
                    p.versionCount > 1 ? `version ${p.versionCount}` : "baseline only",
                  ].join(" · ")}
                </p>
              </div>
              <OpenChevron
                label={p.name}
                onOpen={() => softNavigate(`${host.base}/processes/${p.id}`)}
              />
            </Row>
          ))}
        </RowList>
      )}
      <LoadMore
        listKey={key}
        label={t("Load more processes")}
        fetchPage={(c: string) =>
          tenancy
            .processes({ appId, cursor: c })
            .then((r) => ({ rows: r.processes, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/* --------------------------- the meetings list ----------------------------- */

/** THE MEETINGS ABOUT ONE APP. Asked of the SERVER by `appId`, never narrowed in
 * the browser: the meetings list is paged, and "this app's meetings among the newest
 * fifty" is an answer that looks like an answer. Paged (R14) for the same
 * reason — a two-year system accumulates meetings and the oldest is the one
 * somebody is digging for. `total` is the door's exact COUNT(*) over this same
 * filter, parked in the sidecar the tab badge reads (R16). */
export function AppMeetingsPanel({
  appId,
  host,
  onNew,
}: {
  appId: string
  host: PanelHost
  /** present = the caller may arrange one from here, and this opens the form */
  onNew?: () => void
}) {
  const t = useT()
  const key = sliceKey("meetings-app", appId)
  const q = useCached<Meeting[]>(key, () =>
    contentApi.meetings({ appId }).then((r) => {
      primeCache(totalKey("meetings-app", appId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.meetings
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the meetings.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("Arrange a meeting")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyLine concept="meetings">{t("No meetings about this app yet.")}</EmptyLine>
      ) : (
        <RowList>
          {rows.map((m) => (
            <Row key={m.id} live={m.active} mark={<RecordMark name={m.accountName ?? m.title} />}>
              <div className="min-w-0 flex-1">
                <OpenLink label={m.title} onOpen={() => softNavigate(`${host.base}/meetings/${m.id}`)} />
                <p className="text-muted-foreground truncate text-xs">
                  {[formatDate(m.startsAt), m.accountName].filter(Boolean).join(" · ")}
                </p>
              </div>
              {/* A "Held" badge sat here, reading a status column that is
                  retired: the date on the line above already says whether the
                  meeting has happened, and a badge repeating it in a word
                  somebody had to remember to tick could contradict it. */}
            </Row>
          ))}
        </RowList>
      )}
      <LoadMore
        listKey={key}
        label={t("Load more meetings")}
        fetchPage={(c: string) =>
          contentApi
            .meetings({ appId, cursor: c })
            .then((r) => ({ rows: r.meetings, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/** THE TICKETS ABOUT ONE APP (CHECKLIST 8.6). Asked of the SERVER by `appId`,
 * exactly like the meetings above and for the same reason: the ticket list is a
 * GROWING collection that pages, so "this app's tickets among the newest fifty"
 * would be an answer that looks like an answer. `total` is the door's exact
 * COUNT(*) over the same narrowing, parked where the tab badge reads it (R16). */
export function AppTicketsPanel({
  appId,
  marks,
  host,
  onNew,
}: {
  appId: string
  /** THE TEAM'S GLYPH FOR EACH TYPE (R35), handed in rather than fetched.
   * A panel hangs off three different records and has no team id of its own;
   * the screens that mount it all hold the vocabulary already, so passing it
   * costs nothing and fetching it here would cost a round trip per panel. */
  marks?: Map<string, string>
  host: PanelHost
  /** present = the caller may raise one from here, and this opens the form */
  onNew?: () => void
}) {
  const t = useT()
  const key = sliceKey("tickets-app", appId)
  const q = useCached<HelpTicket[]>(key, () =>
    contentApi.help({ appId }).then((r) => {
      primeCache(totalKey("tickets-app", appId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.tickets
    })
  )

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't load the tickets.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data
  // Tickets live at their own top-level URL, so the link is built off the host
  // prefix rather than the section we are standing in.
  return (
    <div className="flex flex-col gap-4">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("Raise a ticket")} onClick={onNew} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyLine concept="tickets">{t("Nothing has been raised about this app yet.")}</EmptyLine>
      ) : (
        <RowList>
          {rows.map((ticket) => (
            <Row key={ticket.id} live={!ticket.archivedAt} mark={<RecordMark mark={marks?.get(ticket.helpType ?? "") ?? null} name={ticket.helpType ?? "?"} />}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={richTextPlain(ticket.description)}
                  onOpen={() => softNavigate(`${host.base}/tickets/${ticket.id}`)}
                />
                <p className="text-muted-foreground truncate text-xs">
                  {[ticket.ref, ticket.helpType, ticket.status].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Row>
          ))}
        </RowList>
      )}
      <LoadMore
        listKey={key}
        label={t("Load more tickets")}
        fetchPage={(c: string) =>
          contentApi
            .help({ appId, cursor: c })
            .then((r) => ({ rows: r.tickets, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/* -------------------------------- the to-dos ------------------------------- */

/** WHICH LIST THIS PANEL IS HOLDING — one key per (client, pile).
 *
 * FOUR KEYS AND NOT ONE, because each is a separate paged read with its own
 * cursor sidecar and its own ordering. Sharing a key between the open pile and
 * the done pile would park a cursor minted under one ordering beside rows from
 * the other, and `<LoadMore>` would hand it back to a door that (correctly)
 * refuses it — or, before the two orderings carried different signatures, would
 * have been answered with a page that read as an answer and skipped rows.
 *
 * Every key but the plain open one sits inside `TODO_SLICE_PREFIX`, which the
 * live registry drops on any `todos` ping. */
export function todosListKey(teamId: string, accountId: string | undefined, view: TodoViewName): string {
  if (accountId) return sliceKey(view === "done" ? "todos-account-done" : "todos-account", accountId)
  return view === "done" ? todosDoneKey(teamId) : todosKey(teamId)
}

/** The count sidecar each of this panel's two tabs badges (R16) — the exact
 * server number for THAT pile, over the same narrowing the rows came from.
 *
 * The record tab ABOVE the panel badges `todos-account`, which is BOTH piles:
 * the tab reveals a panel that shows either, so a badge counting one of them is
 * a number the list can walk away from. Three keys, three questions, no number
 * said twice. */
function todoTotalKey(teamId: string, accountId: string | undefined, view: TodoViewName): string {
  if (accountId) return totalKey(view === "done" ? "todos-account-done" : "todos-account-open", accountId)
  return view === "done" ? totalKey("todos-done", teamId) : totalKey("todos", teamId)
}

/** WHAT WE ARE WAITING ON A CLIENT FOR — and WHAT HAS COME BACK.
 *
 * The one collection in the work engine a client login writes to: they complete
 * it and upload a file in their own portal, so this panel only ever WITHDRAWS
 * one — we stop needing it.
 *
 * IT HAS TWO VIEWS NOW, and the second one is the whole point of this file
 * changing. `completeTodo` writes `file_url` and `completed_at` in the SAME
 * UPDATE, so a to-do carries the document a client sent us if and only if it is
 * completed — and every list on both front doors filtered the completed out. The
 * only rows that could hold a client's file were exactly the rows nobody could
 * see. The `Done` badge below has been in this file since it was written and was
 * unreachable the whole time, which is the tell that the open-only default was a
 * later regression rather than a design.
 *
 * R14: the done pile accumulates for ever, so the collection PAGES — keyset
 * cursor, exact totals, and the `<LoadMore>` at the bottom that reaches page two.
 *
 * `accountId` narrows it to one client (the account record's own tab); without
 * it, it is everything anywhere. */
export function TodosPanel({
  teamId,
  accountId,
  canCancel,
  onNew,
}: {
  teamId: string
  accountId?: string
  canCancel: boolean
  onNew?: () => void
}) {
  const t = useT()
  const [view, setView] = React.useState<TodoViewName>("open")
  const key = todosListKey(teamId, accountId, view)
  const openTotal = useCachedValue<number | null>(todoTotalKey(teamId, accountId, "open"))
  const doneTotal = useCachedValue<number | null>(todoTotalKey(teamId, accountId, "done"))

  const q = useCached<Todo[]>(key, () =>
    contentApi.todos({ ...(accountId ? { accountId } : {}), view }).then((r) => {
      // EVERY NUMBER OFF ONE READ, whichever pile was asked for (R16): the badge
      // on the tab you are not looking at cannot be counted from the rows you
      // are, and the record tab above wants both piles added up.
      primeCache(todoTotalKey(teamId, accountId, "open"), r.openTotal)
      primeCache(todoTotalKey(teamId, accountId, "done"), r.doneTotal)
      if (accountId) primeCache(totalKey("todos-account", accountId), r.allTotal)
      primeCache(cursorKey(key), r.nextCursor)
      return r.todos
    })
  )

  async function cancel(id: string) {
    try {
      await contentApi.cancelTodo(id)
      invalidate(key)
      toast.success(t("Withdrawn."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't withdraw that."))
    }
  }

  // The two piles, as the library's own strip (R3 — never a hand-rolled toggle).
  // `line` rather than the folder shape, for the reason tickets-collection.tsx
  // gives at its own: the kit's folder tab is drawn to be attached to the card
  // below it, and this panel's list has no card of its own.
  const tabs = (
    <TabsView
      config={{
        ...defaultTabsConfig,
        variant: "line",
        tabs: [
          {
            value: "open",
            label: t("Open"),
            icon: "inbox",
            badge: formatCount(openTotal),
            badgeVariant: "" as const,
          },
          {
            value: "done",
            label: t("Done"),
            icon: "check",
            badge: formatCount(doneTotal),
            badgeVariant: "" as const,
          },
        ],
      }}
      value={view}
      onValueChange={(v) => setView(v as TodoViewName)}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tabs}
        {onNew && <AddButton label={t("Ask for something")} onClick={onNew} />}
      </div>

      {q.error ? (
        <p className="text-destructive text-sm">{t("Couldn't load the to-dos.")}</p>
      ) : q.data === undefined ? (
        <Skeleton variant="list" lines={3} />
      ) : q.data.length === 0 ? (
        <EmptyLine concept="todos">
          {view === "done"
            ? t("Nothing has come back from a client yet.")
            : t("Nothing outstanding with a client.")}
        </EmptyLine>
      ) : view === "done" ? (
        // THE DONE PILE IS A RECORD, NOT A LIST OF ACTIONS — the open pile's
        // row carries one (Withdraw), and Checklist's row has no slot for it
        // (checked: mark/number/label/owner+when, nothing else). A finished
        // to-do offers nothing to press, so the shape that had no action slot
        // to miss fits it exactly, and its mark says "done" as a real
        // checkmark where the open-pile row said nothing at all. `onToggle`
        // omitted is the composition's own read-only register (its own doc
        // header: "Absent, the whole list is read-only and no mark is
        // interactive") — verified by rendering, not assumed: the checkbox
        // comes back `disabled`, `aria-checked="true"`, `aria-readonly` on
        // the list.
        <Checklist
          numbered={false}
          showProgress={false}
          label={t("Sent back by the client")}
          items={q.data.map((todo) => {
            const fileLink = safeHref(todo.fileUrl)
            return {
              id: todo.id,
              done: true,
              // Checklist's own label span has no truncation of its own —
              // the kit draws a multi-line task description there, and a
              // to-do's title mid-length is closer to a table row's single
              // line. Truncated here rather than left to wrap: at 27 rows,
              // five or six lines apiece (measured against real staging
              // titles) turned the list into something nobody scans.
              label: (
                <span className="block truncate">
                  {todo.ref ? `${todo.ref} · ${todo.title}` : todo.title}
                </span>
              ),
              owner: todo.accountName,
              when: todo.completedAt ? t("done {date}", { date: formatDate(todo.completedAt) }) : null,
              dateTime: todo.completedAt ?? undefined,
              meta:
                todo.completedByName || todo.fileName ? (
                  <>
                    {todo.completedByName}
                    {todo.completedByName && todo.fileName ? " · " : null}
                    {todo.fileName &&
                      (fileLink ? (
                        <a
                          href={fileLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {todo.fileName}
                        </a>
                      ) : (
                        todo.fileName
                      ))}
                  </>
                ) : null,
            }
          })}
        />
      ) : (
        <RowList>
          {q.data.map((todo) => {
            // WHAT THE CLIENT ACTUALLY SENT US, as a thing you can open.
            //
            // The filename used to be a third item in the ` · ` join below — a
            // string in a paragraph — while `todo.fileUrl` sat on the row and
            // was read by no component in either front door. So the agency asked
            // a client for a document, the client uploaded it through the
            // portal's "Send a file", the door wrote the bytes to the bucket and
            // the row, and a member of staff was shown the word "invoice.pdf"
            // that they could not click. The upload worked every time; nothing
            // ever led back to it — and then the row itself stopped rendering,
            // because attaching the file is what completes the to-do.
            //
            // Through `safeHref` like every other file on a screen, even though
            // this path is one THIS app minted (/media/…): the seam decides, not
            // the origin of the string. A URL it refuses prints as the plain
            // text it always was — the same fallback `staff-panel.tsx` gives a
            // certificate, whose shape this copies rather than inventing a third.
            const fileLink = safeHref(todo.fileUrl)
            const meta = [
              todo.accountName,
              todo.dueOn ? t("due {date}", { date: formatDate(todo.dueOn) }) : t("no date"),
            ]
            return (
              <Row
                key={todo.id}
                live={!todo.completedAt && !todo.cancelled}
                mark={<RecordMark name={todo.title} />}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{todo.ref ? `${todo.ref} · ${todo.title}` : todo.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {meta.filter(Boolean).join(" · ")}
                    {todo.fileName && (
                      <>
                        {" · "}
                        {fileLink ? (
                          <a
                            href={fileLink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            {todo.fileName}
                          </a>
                        ) : (
                          todo.fileName
                        )}
                      </>
                    )}
                  </p>
                </div>
                {/* The row that has just been completed under the reader's
                    eyes, patched in place by the live layer, before the tab
                    it now belongs to has caught up. */}
                {todo.completedAt && (
                  <Badge variant="secondary" className="text-badge">
                    {t("Done")}
                  </Badge>
                )}
                {canCancel && !todo.completedAt && !todo.cancelled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t("Withdraw this to-do")}
                    onClick={() => void cancel(todo.id)}
                  >
                    <Ban className="size-3.5" />
                  </Button>
                )}
              </Row>
            )
          })}
        </RowList>
      )}

      {/* R14: page two. The key carries the view, so each pile walks its own
          cursor under its own ordering. */}
      <LoadMore
        listKey={todosListKey(teamId, accountId, view)}
        label={t("Load more to-dos")}
        fetchPage={(c: string) =>
          contentApi
            .todos({ ...(accountId ? { accountId } : {}), view, cursor: c })
            .then((r) => ({ rows: r.todos, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}
