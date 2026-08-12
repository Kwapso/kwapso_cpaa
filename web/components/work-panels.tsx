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

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Ban, ChevronRight, Plus } from "lucide-react"

import { LoadMore } from "@/components/load-more"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { cursorKey, todosKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import type { AppRow, ProcessSummary, Sprint, Story, Todo } from "@shared/types"
import { invalidate, primeCache, useCached } from "@shared/web/store"

/** The four states a story moves through, in the words a person reads. The
 * states the code trusts are STORY_STATUSES; this is only their spelling. */
export const STORY_STATUS_LABEL: Record<Story["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
}

/** A row in one of these lists — bordered, faded when the record is switched off
 * or finished. Nothing here is ever hidden for being done: "finished" is a state,
 * not an absence, and a sprint's whole point is that you can look back at it. */
function Row({ live, children }: { live: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
        live ? "" : "opacity-60"
      }`}
    >
      {children}
    </li>
  )
}

/** The clickable name of a record, in the URL form the caller arrived through. */
function OpenLink({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm underline-offset-2 hover:underline"
    >
      {label}
    </button>
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
export function storyLine(s: Story): string {
  return (
    [
      STORY_STATUS_LABEL[s.status],
      s.assigneeName ?? "unassigned",
      s.dueOn ? `due ${s.dueOn}` : null,
      s.sprintName,
      s.ticketRef,
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
  host,
  onNew,
  emptyText,
}: {
  /** what it hangs off — only ever part of the cache key */
  ownerKind: "sprint" | "app" | "ticket"
  ownerId: string
  filter: { sprintId?: string; appId?: string; ticketId?: string }
  host: PanelHost
  /** present = the caller may add work here, and this opens the form */
  onNew?: () => void
  emptyText: string
}) {
  const key = sliceKey(`stories-${ownerKind}`, ownerId)
  const q = useCached<Story[]>(key, () =>
    // `view: "all"` on purpose: this is the record of what was done, not a
    // backlog to work through, so hiding the finished work would hide the point.
    contentApi.stories({ filter: { ...filter, view: "all" } }).then((r) => {
      primeCache(totalKey(`stories-${ownerKind}`, ownerId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.stories
    })
  )

  if (q.error) return <p className="text-destructive text-sm">Couldn&apos;t load the work.</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-3">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onNew} className="gap-1.5">
            <Plus className="size-4" />
            New story
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((s) => (
            <Row key={s.id} live={s.status !== "done"}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={s.ref ? `${s.ref} · ${s.title}` : s.title}
                  onOpen={() => softNavigate(`${host.base}/stories/${s.id}`)}
                />
                <p className="text-muted-foreground truncate px-0 text-xs">{storyLine(s)}</p>
              </div>
              {s.status === "done" && (
                <Badge variant="secondary" className="text-[10px]">
                  Done
                </Badge>
              )}
            </Row>
          ))}
        </ul>
      )}
      {/* R14: the badge above counts ALL of this slice, so the list under it has
          to be able to reach the rest of it. */}
      <LoadMore
        listKey={key}
        label="Load more work"
        fetchPage={(c: string) =>
          contentApi
            .stories({ filter: { ...filter, view: "all" }, cursor: c })
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
      s.startsOn && s.endsOn ? `${s.startsOn} → ${s.endsOn}` : (s.startsOn ?? s.endsOn),
      s.storyCount > 0 ? `${done} of ${s.storyCount} done` : "no work in it yet",
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
  host,
  onNew,
  emptyText,
}: {
  ownerKind: "app" | "account"
  ownerId: string
  filter: { appId?: string; accountId?: string }
  host: PanelHost
  onNew?: () => void
  emptyText: string
}) {
  const key = sliceKey(`sprints-${ownerKind}`, ownerId)
  const q = useCached<Sprint[]>(key, () =>
    contentApi.sprints(filter).then((r) => {
      primeCache(totalKey(`sprints-${ownerKind}`, ownerId), r.total)
      return r.sprints
    })
  )

  if (q.error) return <p className="text-destructive text-sm">Couldn&apos;t load the sprints.</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-3">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onNew} className="gap-1.5">
            <Plus className="size-4" />
            Start a sprint
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((s) => (
            <Row key={s.id} live={!s.completedAt}>
              <div className="min-w-0 flex-1">
                <OpenLink
                  label={s.ref ? `${s.ref} · ${s.name}` : s.name}
                  onOpen={() => softNavigate(`${host.base}/sprints/${s.id}`)}
                />
                <p className="text-muted-foreground truncate text-xs">{sprintLine(s)}</p>
              </div>
              {s.completedAt && (
                <Badge variant="secondary" className="text-[10px]">
                  Complete
                </Badge>
              )}
            </Row>
          ))}
        </ul>
      )}
    </div>
  )
}

/* --------------------------------- the apps -------------------------------- */

/** An app, in one line: whose it is, where it is up to, and its address. */
export function appLine(a: AppRow, accountName?: string | null): string {
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
  const key = sliceKey("apps-account", accountId)
  const q = useCached<AppRow[]>(key, () =>
    tenancy.apps(accountId).then((r) => {
      primeCache(totalKey("apps-account", accountId), r.total)
      return r.apps
    })
  )

  if (q.error) return <p className="text-destructive text-sm">Couldn&apos;t load the apps.</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-3">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onNew} className="gap-1.5">
            <Plus className="size-4" />
            Record an app
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing built for {accountName} yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((a) => (
            <Row key={a.id} live={a.active}>
              <div className="min-w-0 flex-1">
                <OpenLink label={a.name} onOpen={() => softNavigate(`${host.base}/apps/${a.id}`)} />
                <p className="text-muted-foreground truncate text-xs">{appLine(a, accountName)}</p>
              </div>
              {!a.active && (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  Archived
                </Badge>
              )}
            </Row>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------- the maps -------------------------------- */

/** THE PROCESS MAPS DRAWN INSIDE ONE APP. Paged (R14) like the maps list itself:
 * every app of every client grows them and none is ever deleted, because a
 * saving computed from a baseline has to stay checkable years later. */
export function ProcessesPanel({ appId, host }: { appId: string; host: PanelHost }) {
  const key = sliceKey("processes-app", appId)
  const q = useCached<ProcessSummary[]>(key, () =>
    tenancy.processes({ appId }).then((r) => {
      primeCache(totalKey("processes-app", appId), r.total)
      primeCache(cursorKey(key), r.nextCursor)
      return r.processes
    })
  )

  if (q.error) return <p className="text-destructive text-sm">Couldn&apos;t load the process maps.</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No process maps drawn inside this app yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((p) => (
            <Row key={p.id} live={p.active}>
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
              <ChevronRight className="text-muted-foreground size-4" />
            </Row>
          ))}
        </ul>
      )}
      <LoadMore
        listKey={key}
        label="Load more process maps"
        fetchPage={(c: string) =>
          tenancy
            .processes({ appId, cursor: c })
            .then((r) => ({ rows: r.processes, nextCursor: r.nextCursor }))
        }
      />
    </div>
  )
}

/* -------------------------------- the to-dos ------------------------------- */

/** WHAT WE ARE WAITING ON A CLIENT FOR. The one collection in the work engine a
 * client login writes to — they complete it and upload a file in their own
 * portal — so this panel only ever WITHDRAWS one: we stop needing it. Bounded
 * (R14): a to-do shrinks as fast as it grows.
 *
 * `accountId` narrows it to one client (the account record's own tab); without
 * it, it is everything outstanding anywhere. */
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
  const key = accountId ? sliceKey("todos-account", accountId) : todosKey(teamId)
  const q = useCached<Todo[]>(key, () =>
    contentApi.todos(accountId ? { accountId } : {}).then((r) => {
      primeCache(accountId ? totalKey("todos-account", accountId) : totalKey("todos", teamId), r.total)
      return r.todos
    })
  )

  async function cancel(id: string) {
    try {
      await contentApi.cancelTodo(id)
      invalidate(key)
      toast.success("Withdrawn.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't withdraw that.")
    }
  }

  if (q.error) return <p className="text-destructive text-sm">Couldn&apos;t load the to-dos.</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const rows = q.data

  return (
    <div className="flex flex-col gap-3">
      {onNew && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={onNew} className="gap-1.5">
            <Plus className="size-4" />
            Ask for something
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing outstanding with a client.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((t) => (
            <Row key={t.id} live={!t.completedAt && !t.cancelled}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.ref ? `${t.ref} · ${t.title}` : t.title}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {[
                    t.accountName,
                    t.dueOn ? `due ${t.dueOn.slice(0, 10)}` : "no date",
                    t.fileName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {t.completedAt && (
                <Badge variant="secondary" className="text-[10px]">
                  Done
                </Badge>
              )}
              {canCancel && !t.completedAt && !t.cancelled && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Withdraw this to-do"
                  onClick={() => void cancel(t.id)}
                >
                  <Ban className="size-3.5" />
                </Button>
              )}
            </Row>
          ))}
        </ul>
      )}
    </div>
  )
}
