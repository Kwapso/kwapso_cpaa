"use client"

// WORK — the sidebar page the team actually lives in: the backlog, and the
// sprints it sits inside.
//
// The BACKLOG comes first, and the sprints sit under it as a small block rather
// than a second list of equal weight. That is the honest ordering of a working
// day: a person opens this page to see what they are doing, not to administer
// the block it was sold in. The sprint block is where a sprint is started and
// completed, because completing one is what cuts a version of every process map
// beneath it — a consequence big enough that it should not hide inside a row's
// overflow menu.
//
// Same shape as processes-screen.tsx: the screen owns its own dialogs rather
// than routing through the host's ?panel machinery, because a story needs the
// sprints, the open tickets and the team's members to be written at all, and
// that is this screen's data.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"
import { CalendarRange, CheckCheck, Plus, RotateCcw } from "lucide-react"

import { CollectionHeading } from "@/components/collection-heading"
import { LoadMore } from "@/components/load-more"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { SprintFormDialog, type SprintFormValues } from "@/components/sprint-form-dialog"
import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { TimePanel } from "@/components/time-panel"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { helpKey, listFetch, sprintsKey, storiesKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { HelpTicket, Sprint, Story, TeamMember } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"

/** The four states, in the words a person reads. The states the code trusts are
 * STORY_STATUSES; this is only how they are spelled on screen. */
const STATUS_LABEL: Record<Story["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
}

/** One story, as a row. The summary line is a stand-up sentence: where it is,
 * who has it, when it is due, and which request it answers. */
function shapeStories(stories: Story[]) {
  return {
    rows: stories.map((s) => ({
      id: s.id,
      name: s.ref ? `${s.ref} · ${s.title}` : s.title,
      detail:
        [
          STATUS_LABEL[s.status],
          s.assigneeName ?? "unassigned",
          s.dueOn ? `due ${s.dueOn}` : null,
          s.sprintName,
          s.ticketRef,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      // Facet columns (read by the filter engine, not the renderer).
      status: STATUS_LABEL[s.status],
      assignee: s.assigneeName ?? "Unassigned",
      sprint: s.sprintName ?? "No sprint",
    })),
  }
}

/** A sprint, in one line: what it is, when, and how much of it is left. The
 * counts are exact server counts computed over the stories themselves (R16) —
 * never a length of whatever happened to be loaded. */
function sprintLine(s: Sprint): string {
  const done = s.storyCount - s.openStoryCount
  return (
    [
      s.sprintType,
      s.accountName,
      s.startsOn && s.endsOn ? `${s.startsOn} → ${s.endsOn}` : (s.startsOn ?? s.endsOn),
      s.storyCount > 0 ? `${done} of ${s.storyCount} done` : "no work in it yet",
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

export function WorkScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  canEdit,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  canCreate: boolean
  canEdit: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  // Page one of the backlog, its next cursor parked in the sidecar <LoadMore>
  // reads (R14). The same fetcher primes the exact `total:` sidecar (R16).
  const storiesQ = useCached<Story[]>(storiesKey(teamId), () => listFetch.stories(teamId))
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  // The open requests a story can answer, and the people who can be given one.
  // Both are caches other screens already hold, so opening this page costs a
  // team that has been to Tickets nothing.
  const ticketsQ = useCached<HelpTicket[]>(helpKey(teamId, "all"), () => listFetch.help(teamId))
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )

  const [storyOpen, setStoryOpen] = React.useState(false)
  const [sprintOpen, setSprintOpen] = React.useState(false)

  async function createStory(values: StoryFormValues) {
    try {
      await contentApi.createStory({
        title: values.title,
        detail: values.detail || undefined,
        sprintId: values.sprintId || undefined,
        ticketId: values.ticketId || undefined,
        assigneeId: values.assigneeId || undefined,
        dueOn: values.dueOn || undefined,
      })
      invalidate(storiesKey(teamId))
      invalidate(sprintsKey(teamId))
      toast.success("Story added.")
    } catch (err) {
      throw err instanceof ApiFailure ? err : new Error("Couldn't add that story.")
    }
  }

  async function createSprint(values: SprintFormValues) {
    await contentApi.createSprint({
      name: values.name,
      goal: values.goal || undefined,
      sprintType: values.sprintType || undefined,
      accountId: values.accountId || undefined,
      startsOn: values.startsOn || undefined,
      endsOn: values.endsOn || undefined,
      soldPriceCents: values.soldPriceCents,
      currency: values.currency || undefined,
    })
    invalidate(sprintsKey(teamId))
    toast.success("Sprint started.")
  }

  async function completeSprint(sprint: Sprint) {
    try {
      await contentApi.setSprintComplete(sprint.id, sprint.completedAt === null)
      invalidate(sprintsKey(teamId))
      toast.success(sprint.completedAt === null ? "Sprint completed." : "Sprint reopened.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't change that sprint.")
    }
  }

  if (storiesQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the work.</p>
  if (storiesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const data = shapeStories(storiesQ.data)
  const listRecipe = withDataDrivenCollection(recipe, data.rows)
  const sprints = sprintsQ.data ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* R16: the count lives in the heading (a sidebar page has no tab strip to
          badge), and it is the door's exact COUNT(*) — never the loaded page's
          length, which on a paged list is just "50" for ever. */}
      <CollectionHeading sectionKey="work" total={total} />

      <SectionWithCreate
        show={canCreate}
        label="New story"
        icon="plus"
        secondary={{ show: canCreate, label: "Start a sprint", onClick: () => setSprintOpen(true) }}
        onCreate={() => setStoryOpen(true)}
      >
        <ScreenRenderer
          recipe={listRecipe}
          data={data}
          rights={rights}
          onAction={onAction}
          onIntent={onIntent}
        />
      </SectionWithCreate>

      {/* R14: the backlog only grows and a done story is never deleted, so it pages. */}
      <LoadMore
        listKey={storiesKey(teamId)}
        label="Load more work"
        fetchPage={(c: string) =>
          contentApi.stories({ cursor: c }).then((r) => ({ rows: r.stories, nextCursor: r.nextCursor }))
        }
      />

      {sprints.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <CalendarRange className="size-3.5" />
            Sprints
          </h2>
          <ul className="divide-border divide-y rounded-md border">
            {sprints.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.ref ? `${s.ref} · ${s.name}` : s.name}
                    {s.completedAt && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        Complete
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{sprintLine(s)}</p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => completeSprint(s)}
                  >
                    {s.completedAt ? <RotateCcw className="size-3.5" /> : <CheckCheck className="size-3.5" />}
                    {s.completedAt ? "Reopen" : "Complete"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sprints.length === 0 && canCreate && (
        <Button variant="outline" className="gap-1.5 self-start" onClick={() => setSprintOpen(true)}>
          <Plus className="size-3.5" />
          Start a sprint
        </Button>
      )}

      {/* Time, under the work it is against. BUILD-1 §5: one click is the
          acceptance bar — the Start control is on the header bar once a timer is
          running, and this is where a person sees where their week went. */}
      <TimePanel teamId={teamId} canCreate={canCreate} />

      <StoryFormDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={sprints.filter((s) => !s.completedAt).map((s) => ({ id: s.id, name: s.name }))}
        tickets={(ticketsQ.data ?? [])
          .filter((t) => t.status !== "resolved")
          .map((t) => ({ id: t.id, label: t.ref ? `${t.ref} · ${t.description}` : t.description }))}
        members={(membersQ.data ?? []).map((m) => ({
          id: m.userId,
          name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
        }))}
        draftKey={`story:add:${teamId}`}
        onSubmit={createStory}
      />

      <SprintFormDialog
        open={sprintOpen}
        onOpenChange={setSprintOpen}
        draftKey={`sprint:add:${teamId}`}
        onSubmit={createSprint}
      />
    </div>
  )
}
