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

import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { toast } from "@shared/ui/components/sonner/sonner"
import {
  ScreenRenderer,
  type ScreenActionContext,
  type ScreenIntent,
} from "@shared/web/screen-engine/screen-renderer"
import type { ScreenRecipe, ScreenRights } from "@shared/web/screen-engine/recipe"

import { CollectionHeading } from "@/components/collection-heading"
import { LoadMore } from "@/components/load-more"
import { PagedFind } from "@/components/paged-find"
import { COLLECTION_SORTS, translatedSorts } from "@/lib/collection-sorts"
import { translatedFacets } from "@/lib/collection-filters"
import { SectionWithCreate } from "@/components/deep-link/screen-bits"
import { StoryFormDialog, type StoryFormValues } from "@/components/story-form-dialog"
import { StartTimerStrip } from "@/components/time-panel"
import { STORY_STATUS_LABEL } from "@/components/work-panels"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { appsKey, helpKey, listFetch, processesKey, sprintsKey, storiesKey } from "@/lib/live-resources"
import { withDataDrivenCollection } from "@/lib/screens"
import type { AppRow, HelpTicket, ProcessSummary, SelectableValue, Sprint, Story, TeamMember } from "@shared/types"
import { formatDate } from "@shared/web/format"
import { invalidate, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { assignableMembers } from "@/lib/members"
import { MARK_GROUP, markMap } from "@/lib/type-marks"
import { RecordMark } from "@shared/web/record-mark"
import { richTextPlain } from "@shared/web/rich-text"

/** One story, as a row. The summary line is a stand-up sentence: where it is,
 * who has it, when it is due, and which request it answers.
 *
 * `marks` is the STORY TYPE's glyph, keyed by the word the row stores (the same
 * lookup the tickets collection makes, `web/lib/type-marks.ts`). Tickets got
 * this and stories did not, which is why one collection led with a mark and the
 * one beside it led with nothing. */
function shapeStories(stories: Story[], marks?: Map<string, string>) {
  return {
    rows: stories.map((s) => ({
      id: s.id,
      // THE GLYPH THE ROW IS KNOWN BY (recipe `leading`). A NODE, not a string —
      // the slot renders whatever the column holds. A story whose type has no
      // mark falls back to the type's first letter rather than an empty box.
      mark: <RecordMark mark={marks?.get(s.storyType ?? "") ?? null} name={s.storyType ?? "?"} />,
      // The title alone (K1 / CHECKLIST 11.9). The reference leads the eyebrow on
      // the story's own screen, where it belongs (D4).
      name: s.title,
      // Three facts: where it is, who has it, when it is due. The sprint and the
      // ticket it answers are cross-links on the record, not row noise.
      detail:
        [
          STORY_STATUS_LABEL[s.status],
          s.assigneeName ?? "unassigned",
          s.sprintEndsOn ? `due ${formatDate(s.sprintEndsOn)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
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
  // The maps a story can say it changes (CHECKLIST 6.5). Same cache key the
  // Processes screen reads, so a person who has been there pays nothing.
  const processesQ = useCached<ProcessSummary[]>(processesKey(teamId), () => listFetch.processes(teamId))
  // The team's own word for the kind of work (CHECKLIST 6.2) — one cache, shared
  // with every other dropdown in the app.
  const selectableQ = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )
  return {
    // CHECKLIST 6.3: current or future only, each carrying its mark. Computed
    // from the two facts the row already holds rather than stored, so a mark can
    // never disagree with the dates it came from — and the FORM narrows further,
    // to the app being chosen, which is a fact only the form knows.
    sprints: (sprintsQ.data ?? [])
      .filter((s) => !s.completedAt && s.active && (!s.endsOn || s.endsOn >= todayISO()))
      .map((s) => ({
        id: s.id,
        name: s.name,
        appId: s.appId,
        mark: sprintMark(s),
      })),
    apps: (appsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    appNames: new Map((appsQ.data ?? []).map((a) => [a.id, a.name])),
    // CHECKLIST 6.4: OPEN tickets only, each tagged with the app it is about so
    // the form can narrow to the one being chosen.
    tickets: (ticketsQ.data ?? [])
      .filter((t) => t.status !== "resolved" && !t.archivedAt)
      .map((t) => ({
        id: t.id,
        label: t.ref ? `${t.ref} · ${richTextPlain(t.description)}` : richTextPlain(t.description),
        appId: t.appId,
      })),
    processes: (processesQ.data ?? [])
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, appId: p.appId })),
    processNames: new Map((processesQ.data ?? []).map((p) => [p.id, p.name])),
    storyTypes: (selectableQ.data ?? [])
      .filter((v) => v.type === "Story type" && v.active)
      .map((v) => v.value),
    // The dropdown rows themselves, so a screen can read a type's MARK as well
    // as its word (UI-RULEBOOK G2). The words above stay because a picker wants
    // words; a header band wants the glyph beside them.
    selectableValues: selectableQ.data,
    // Our people only — a story is internal work (lib/members).
    members: assignableMembers(membersQ.data),
    // WHO IS ON EACH APP (CHECKLIST 6.6). The staff set rides the app row, so
    // the picker narrows without a second read — and the DOOR enforces the same
    // rule, so a narrowed list is a courtesy rather than the control.
    appStaff: new Map((appsQ.data ?? []).map((a) => [a.id, a.staff.map((p) => p.userId)])),
  }
}

/** Today, as the ISO date the sprint columns are stored in. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** WHICH OF THE THREE MARKS A SPRINT CARRIES (CHECKLIST 6.3). Derived, never
 * stored: a completed sprint is completed whatever its dates say, one that has
 * not begun is upcoming, and everything else is running. */
function sprintMark(s: Sprint): "Active" | "Upcoming" | "Completed" {
  if (s.completedAt) return "Completed"
  if (s.startsOn && s.startsOn > todayISO()) return "Upcoming"
  return "Active"
}

/** Write a story through the door and re-read what changed. Shared by every
 * screen that can add one, so "adding work also moves a sprint's counts" is
 * stated once rather than remembered three times. */
export async function createStoryFrom(
  teamId: string,
  values: StoryFormValues,
  /** The caller's language — see `createAppFrom`. */
  t: (english: string) => string
): Promise<string | undefined> {
  try {
    const made = await contentApi.createStory({
      title: values.title,
      storyType: values.storyType,
      detail: values.detail || undefined,
      sprintId: values.sprintId || undefined,
      appId: values.appId || undefined,
      ticketId: values.ticketId || undefined,
      assigneeId: values.assigneeId || undefined,
      processIds: values.processIds,
      changesNoStep: values.changesNoStep,
    })
    invalidate(storiesKey(teamId))
    invalidate(sprintsKey(teamId))
    toast.success(t("Story added."))
    // THE NEW STORY'S ID, so the form can hang the screenshots somebody picked
    // before it existed. Undefined on an older worker, which the caller reads as
    // "nothing to attach to" rather than as an error.
    return made.createdId
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
  onAction,
  onIntent,
}: {
  teamId: string
  recipe: ScreenRecipe
  rights: ScreenRights
  /** the exact server total (R16) — never the loaded page's length */
  total: number | undefined
  canCreate: boolean
  onAction: (actionId: string, ctx: ScreenActionContext) => void
  onIntent: (intent: ScreenIntent) => void
}) {
  const t = useT()
  // Page one of the backlog, its next cursor parked in the sidecar <LoadMore>
  // reads (R14). The same fetcher primes the exact `total:` sidecar (R16).
  const storiesQ = useCached<Story[]>(storiesKey(teamId), () => listFetch.stories(teamId))
  const options = useStoryFormOptions(teamId)
  // THE STORY TYPE'S GLYPH, keyed by the word the row stores. The vocabulary is
  // already in hand — `useStoryFormOptions` reads the same `selectable:` cache
  // the Dropdown values screen writes — so this costs no extra request, and an
  // emoji changed on that screen reaches these rows the moment it lands.
  const storyMarks = markMap(options.selectableValues, MARK_GROUP.story)
  const [storyOpen, setStoryOpen] = React.useState(false)

  if (storiesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the work.")}</p>
  if (storiesQ.data === undefined) return <Skeleton variant="list" lines={4} />

  const loaded = storiesQ.data

  return (
    <div className="flex flex-col gap-6">
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
        placeholder={t("Search work…")}
        matches={{
          none: t("No stories match"),
          one: t("1 story matches"),
          many: t("{count} stories match"),
        }}
        sorts={translatedSorts("stories", t)}
        defaultSort={COLLECTION_SORTS.stories.defaultSort}
        // FOUR FILTERS, all of them the DOOR's. They were the frame's until
        // 18 Aug 2026, which is the objection this file already makes two
        // comments up about narrowing the backlog by app in the browser — made
        // about the search box, and true of the filter bar underneath it the
        // whole time. Note the NAMES: the door takes ids (`appId`, `sprintId`,
        // `assigneeId`) where the frame's facets took the shaped row's words.
        facets={translatedFacets("stories", t, {
          assigneeId: options.members.map((m) => ({ value: m.id, label: m.name })),
          sprintId: options.sprints.map((sp) => ({ value: sp.id, label: sp.name })),
          appId: options.apps.map((a) => ({ value: a.id, label: a.name })),
        })}
        fetchPage={(query, cursor) =>
          contentApi
            .stories({
              // `view: "all"` while FINDING, and only while finding: somebody
              // looking for a story by name, or asking for the done ones by
              // status, is as likely to want the finished one, and the everyday
              // backlog hides those. It sits here rather than in `fixed` because
              // `fixed` makes a find active — the resting screen would land in a
              // `find:` cache key the live registry does not patch (R15), showing
              // finished work nobody asked for.
              view: "all",
              // …then the whole question, spread over it. `listQuery` forwards
              // every key, so a filter cannot be lost on the way to the door.
              ...query,
              cursor,
            })
            .then((r) => ({ rows: r.stories, nextCursor: r.nextCursor, total: r.total }))
        }
      >
        {(found) => {
          const rows = found.active ? found.rows : loaded
          if (rows === null) return <Skeleton variant="list" lines={4} />
          const data = shapeStories(rows, storyMarks)
          const listRecipe = withDataDrivenCollection(recipe, data.rows, found.emptyText)
          return (
            <>
              <SectionWithCreate
                show={canCreate}
                label={t("New story")}
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
                label={t("Load more work")}
                fetchPage={found.fetchPage}
              />
            </>
          )
        }}
      </PagedFind>

      {/* THE ONE CLICK, beside the work it is against (BUILD-1 §5) — and the
          Monday morning question, which has to be answerable wherever you are.
          The TIMESHEET is no longer here: a list of everything ever logged, at
          the foot of the backlog, is where logged time went to hide. It has a
          page of its own now (/time), which is the link in the rail above. */}
      <StartTimerStrip teamId={teamId} canCreate={canCreate} />

      <StoryFormDialog
        teamId={teamId}
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        draftKey={`story:add:${teamId}`}
        onSubmit={(v) => createStoryFrom(teamId, v, t)}
      />
    </div>
  )
}
