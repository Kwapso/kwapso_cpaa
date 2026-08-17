"use client"

// STORIES — the backlog, and the page the team actually lives in. A ticket is
// what a client asks for; a story is what somebody does today.
//
// This was the Work page, which carried the backlog, the sprints, the to-dos,
// our own admin and the time — five collections on one screen because none of
// them had anywhere else to be. Four of the five now have a section of their own
// (the owner's ruling), so what is left here is the backlog and the TIME logged
// against it, which belongs under the work rather than beside it: "where did my
// week go" is a question about these rows.
//
// The screen owns its own dialog rather than routing through the host's ?panel
// machinery, the way the maps screen does: a story needs the sprints, the apps,
// the open tickets and the team's members to be written at all, and that is this
// screen's data.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@kwapso/ui/registry/collections/screen-renderer/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@kwapso/ui/lib/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { TimePanel } from "@/components/time-panel"
import { STORY_STATUS_LABEL } from "@/components/work-panels"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { appsKey, helpKey, listFetch, sprintsKey, storiesKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { AppRow, HelpTicket, Sprint, Story, TeamMember } from "@shared/types"
import { formatDate } from "@shared/web/format"
import { invalidate, useCached } from "@shared/web/store"

/** One story, as a row. The summary line is a stand-up sentence: where it is,
 * who has it, when it is due, and which request it answers. */
function shapeStories(stories: Story[], appNames: Map<string, string>) {
  return {
    rows: stories.map((s) => ({
      id: s.id,
      name: s.ref ? `${s.ref} · ${s.title}` : s.title,
      detail:
        [
          STORY_STATUS_LABEL[s.status],
          s.assigneeName ?? "unassigned",
          s.dueOn ? `due ${formatDate(s.dueOn)}` : null,
          s.sprintName,
          s.ticketRef,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      // Facet columns (read by the filter engine, not the renderer).
      status: STORY_STATUS_LABEL[s.status],
      assignee: s.assigneeName ?? "Unassigned",
      sprint: s.sprintName ?? "No sprint",
      // The app a story is ON, named. It is a facet here (a way to narrow the
      // page you are looking at) — the honest, server-counted answer to "all the
      // work on this system" is the app's own screen, which asks the door.
      app: (s.appId && appNames.get(s.appId)) || "No app",
    })),
  }
}

/** WHAT A STORY NEEDS TO BE WRITTEN AT ALL — the sprints it could sit in, the
 * apps it could be on, the open requests it could answer, and the people it
 * could be given to. Lifted out because three screens open this same form (this
 * one, a sprint's, an app's) and each of them needs the same four lists. */
export function useStoryFormOptions(teamId: string) {
  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  const appsQ = useCached<AppRow[]>(appsKey(teamId), () => listFetch.apps(teamId))
  // Both are caches other screens already hold, so opening this page costs a team
  // that has been to Tickets or Apps nothing.
  const ticketsQ = useCached<HelpTicket[]>(helpKey(teamId, "all"), () => listFetch.help(teamId))
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  return {
    sprints: (sprintsQ.data ?? []).filter((s) => !s.completedAt).map((s) => ({ id: s.id, name: s.name })),
    apps: (appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    appNames: new Map((appsQ.data ?? []).map((a) => [a.id, a.name])),
    tickets: (ticketsQ.data ?? [])
      .filter((t) => t.status !== "resolved")
      .map((t) => ({ id: t.id, label: t.ref ? `${t.ref} · ${t.description}` : t.description })),
    members: (membersQ.data ?? []).map((m) => ({
      id: m.userId,
      name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
    })),
  }
}

/** Write a story through the door and re-read what changed. Shared by every
 * screen that can add one, so "adding work also moves a sprint's counts" is
 * stated once rather than remembered three times. */
export async function createStoryFrom(teamId: string, values: StoryFormValues): Promise<void> {
  try {
    await contentApi.createStory({
      title: values.title,
      detail: values.detail || undefined,
      sprintId: values.sprintId || undefined,
      appId: values.appId || undefined,
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

export function StoriesScreen({
  teamId,
  recipe,
  rights,
  total,
  canCreate,
  canEditTime,
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  canCreate: boolean
  /** `work:edit` — correcting a row of logged time, a step above logging one */
  canEditTime: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  // Page one of the backlog, its next cursor parked in the sidecar <LoadMore>
  // reads (R14). The same fetcher primes the exact `total:` sidecar (R16).
  const storiesQ = useCached<Story[]>(storiesKey(teamId), () => listFetch.stories(teamId))
  const options = useStoryFormOptions(teamId)
  const [storyOpen, setStoryOpen] = React.useState(false)

  if (storiesQ.error) return <p className="text-destructive text-sm">Couldn&apos;t load the work.</p>
  if (storiesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const loaded = storiesQ.data

  return (
    <div className="flex flex-col gap-4">
      {/* R16: the count lives in the heading (a sidebar page has no tab strip to
          badge), and it is the door's exact COUNT(*) — never the loaded page's
          length, which on a paged list is just "50" for ever. */}
      <CollectionHeading sectionKey="stories" total={total} />

      {/* R14's other half: 3,677 stories arrived from the previous system on day
          one, so a search box filtering the loaded page would answer "among the
          newest fifty" — the same objection this file already makes about
          narrowing the backlog by app in the browser. The door answers it. */}
      <PagedFind<Story>
        listKey={storiesKey(teamId)}
        placeholder="Search work…"
        noun="stories"
        fetchPage={(query, cursor) =>
          contentApi
            // `view: "all"` while searching: somebody looking for a story by name
            // is as likely to want the finished one, and the everyday backlog
            // hides those.
            .stories({ filter: { q: query.q, view: "all" }, cursor })
            .then((r) => ({ rows: r.stories, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          const rows = found.active ? found.rows : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          const data = shapeStories(rows, options.appNames)
          const listRecipe = withDataDrivenCollection(recipe, data.rows, found.emptyText)
          return (
            <>
              <SectionWithCreate
                show={canCreate}
                label="New story"
                icon="plus"
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
                listKey={found.listKey ?? storiesKey(teamId)}
                label="Load more work"
                fetchPage={found.fetchPage}
              />
            </>
          )
        }}
      </PagedFind>

      {/* Time, under the work it is against. BUILD-1 §5: one click is the
          acceptance bar — the Start control is on the header bar once a timer is
          running, and this is where a person sees where their week went. */}
      <TimePanel teamId={teamId} canCreate={canCreate} canEdit={canEditTime} />

      <StoryFormDialog
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        members={options.members}
        draftKey={`story:add:${teamId}`}
        onSubmit={(v) => createStoryFrom(teamId, v)}
      />
    </div>
  )
}
