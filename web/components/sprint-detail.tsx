"use client"

// SPRINT DETAIL — one block of sold work at /sprints/<id>, as a tabbed record
// (Law R2): Overview / Stories / Activity.
//
// COMPLETING A SPRINT LIVES HERE, deliberately and nowhere else. It is not a
// status word: it is the moment that cuts a version of every process map beneath
// it, which is what every savings figure afterwards is subtracted from. A
// consequence that size gets a button on the record's own screen with a sentence
// beside it, never a control in a row's overflow menu.
//
// Host-composed: the Stories tab is a collection with its own create action, and
// no engine block draws it.

import * as React from "react"

import { Button } from "@shared/ui/controls/button/button"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import { toast } from "@shared/ui/controls/sonner/sonner"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { CheckCheck, Pencil, RotateCcw } from "@shared/ui/icons"

import {
  SprintFormDialog,
  sprintTypeLabel,
  sprintTypeName,
  useSprintTypes,
} from "@/components/sprint-form-dialog"
import { StoryFormDialog } from "@/components/story-form-dialog"
import { createStoryFrom, useStoryFormOptions } from "@/components/stories-screen"
import { StoriesPanel, sliceKey } from "@/components/work-panels"
import { OverviewList } from "@/components/overview-list"
import { ActivityPanel } from "@/components/activity-panel"
import { ApiFailure, content as contentApi } from "@/lib/api"
import {
  RecordActionsMenu,
  RecordFooter,
  RecordScreen,
  STICKY_TABS,
  type RecordAction,
} from "@/components/record-chrome"
import { formatCount } from "@shared/web/format-count"
import { formatDate } from "@shared/web/format"
import { listFetch, sprintsKey, totalKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import { CONCEPT_ICON } from "@/lib/pages"
import { usePermissions } from "@/lib/perms"
import { useRecordActivity } from "@/lib/use-record-activity"
import { useRecordCounts } from "@/lib/use-record-counts"
import type { Sprint } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { invalidate, primeCache, useCached, useCachedValue } from "@shared/web/store"
import { useLanguage } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"
import { MARK_GROUP, markMap } from "@/lib/type-marks"
import type { SelectableValue } from "@shared/types"
import { tenancy } from "@/lib/api"

/** Whole cents → what a person would say. The FORMATTING is the shared seam
 * (shared/web/money.ts) now that the two rate cards render prices of their own;
 * what stays here is the only part that is about a sprint — that a sprint with
 * no price of its own was sold inside something else, which is a sentence rather
 * than a zero. */
function priceSold(cents: number, currency: string | null): string {
  if (!cents) return "Not sold separately"
  return moneyText(cents, currency)
}

export function SprintDetailScreen({
  teamId,
  sprintId,
  basePath,
}: {
  teamId: string
  sprintId: string
  /** the sprints list in the URL form we arrived through */
  basePath: string
}) {
  const { t, lang } = useLanguage()
  // Sprints are bounded and read whole, so the record comes out of the same cache
  // the list holds — opening one costs no round-trip.
  // THE TEAM'S GLYPHS (R35), read once for this screen and handed to every
  // nested panel on it. The same key the Dropdown values manager writes, so
  // an emoji changed there reaches these rows with no deploy.
  const teamVocabulary = useCached<SelectableValue[]>(`selectable:${teamId}`, () =>
    tenancy.selectable().then((r) => r.values)
  )

  const sprintsQ = useCached<Sprint[]>(sprintsKey(teamId), () => listFetch.sprints(teamId))
  const activity = useRecordActivity("sprints", sprintId)
  // THE BADGE, BEFORE THE CLICK — the work inside this block, counted when the
  // sprint opens rather than when the tab is opened; the rows stay lazy.
  useRecordCounts("sprints", sprintId)
  // `null` is the third answer beside a number and an absence: the role holds no
  // `work:read` (R18), and it renders as nothing exactly as a zero does.
  const storiesTotal = useCachedValue<number | null>(totalKey("stories-sprint", sprintId))
  // The team's own sprint-type vocabulary, for the mark and the standard length
  // the Type row shows. Cache-first: the form beside it reads the same key.
  const sprintTypes = useSprintTypes(teamId)

  const { can } = usePermissions(teamId)
  const canEdit = can("work", "edit")
  const canCreate = can("work", "create")

  const [tab, setTab] = React.useState("overview")
  const [storyOpen, setStoryOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = useStoryFormOptions(teamId)
    // NEST, DON'T REPLACE. This used to strip the collection segment off the path
  // before the panels appended to it, so opening a related record from here
  // threw away the record you opened it FROM — a story reached from a client
  // landed on /stories/<id> with no way back to the client. The base is now this
  // record's own address, so a related record lands INSIDE it and the trail is
  // in the URL for the crumbs, the Back button and anybody you send it to.
  const host = { base: `${basePath}/${sprintId}` }

  async function setComplete(complete: boolean) {
    setBusy(true)
    try {
      await contentApi.setSprintComplete(sprintId, complete)
      invalidate(sprintsKey(teamId))
      invalidate(`activity:record:sprints:${sprintId}`)
      toast.success(complete ? t("Sprint completed.") : t("Sprint reopened."))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't change that sprint."))
    } finally {
      setBusy(false)
    }
  }

  if (sprintsQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the sprint.")}</p>
  if (sprintsQ.data === undefined) return <Skeleton variant="list" lines={5} />
  const sprint = sprintsQ.data.find((s) => s.id === sprintId) ?? null
  if (!sprint) return <p className="text-muted-foreground text-sm">{t("That sprint no longer exists.")}</p>

  const kindOption = sprintTypes.find((o) => o.value === sprint.sprintType)
  const kindLine = !sprint.sprintType
    ? "—"
    : kindOption
      ? `${sprintTypeLabel(kindOption, lang)}${kindOption.standardDays === null ? "" : `, normally ${kindOption.standardDays} days`}`
      : sprint.sprintType
  // THE KIND, SAID TWICE AND ON PURPOSE — as a mark in the leading slot beside
  // the title, and as the WORD on the eyebrow directly above it. That pairing is
  // what makes a mark legal rather than decoration (UI-CONVENTIONS §5): it sits
  // where an icon sits, it is `aria-hidden`, and the word is never further away
  // than the line above. A sprint nobody typed a kind on still gets an eyebrow —
  // "Sprint" is what it is — and simply carries no mark.
  const kindWord = kindOption ? sprintTypeName(kindOption, lang) : sprint.sprintType || t("Sprint")
  const kindMark = kindOption?.mark ?? null

  const done = sprint.storyCount - sprint.openStoryCount
  const overviewItems = [
    { label: t("Reference"), value: sprint.ref || "—" },
    // THE KIND, AND WHAT THE KIND CARRIES. A sprint type used to be a bare word;
    // since team-schema 0025 it also holds the mark somebody recognises it by,
    // the label a German client reads, and how long a block of this kind
    // normally runs — the delivery catalogue's fields, on the thing they were
    // always describing. The DATES are still the ones somebody agreed; this
    // number is what to expect, said beside them.
    { label: t("Type"), value: kindLine },
    { label: t("Client"), value: sprint.accountName || "Ours, no client" },
    { label: t("App"), value: sprint.appName || "—" },
    // THE PACKAGE IT WAS SOLD INSIDE. A sprint can be sold on its own, so "—" is
    // an ordinary answer rather than a gap. Where there IS a wave the name is a
    // way in: a reader who wants to know what else was in the package should not
    // have to go and look for it by name.
    {
      label: t("Wave"),
      value:
        sprint.waveId && sprint.waveName ? (
          <button
            type="button"
            onClick={() => softNavigate(`${host.base}/waves/${sprint.waveId}`)}
            className="hover:text-foreground text-left underline-offset-2 hover:underline"
          >
            {sprint.waveName}
          </button>
        ) : (
          "—"
        ),
    },
    { label: t("What it's for"), value: sprint.goal ? <RichText html={sprint.goal} /> : "—" },
    {
      label: t("Runs"),
      value:
        sprint.startsOn && sprint.endsOn
          ? `${formatDate(sprint.startsOn)} → ${formatDate(sprint.endsOn)}`
          : (formatDate(sprint.startsOn) || formatDate(sprint.endsOn) || "—"),
    },
    { label: t("Price sold"), value: priceSold(sprint.soldPriceCents, sprint.currency) },
    {
      label: t("Work inside it"),
      value: sprint.storyCount > 0 ? `${done} of ${sprint.storyCount} done` : "Nothing in it yet",
    },
    // The audit rows moved to the record footer (D7 / CHECKLIST 11.3).
  ]

  const tabsConfig = {
    ...defaultTabsConfig,
    tabs: [
      { value: "overview", label: t("Overview"), icon: "info", badge: "", badgeVariant: "" as const },
      {
        value: "stories",
        label: t("Stories"),
        icon: CONCEPT_ICON.stories,
        badge: formatCount(storiesTotal),
        badgeVariant: "" as const,
      },
      {
        value: "activity",
        label: t("Activity"),
        icon: CONCEPT_ICON.activity,
        badge: formatCount(activity.total),
        badgeVariant: "" as const,
      },
    ],
  }

  /* B1 / CHECKLIST 11.2 — Complete (the act that moves the sprint on) is the
   * primary; Edit goes into the three-dot menu. Neither is destructive, so
   * neither asks first (UI-CONVENTIONS §4). */
  const overflow: RecordAction[] = canEdit
    ? [
        {
          key: "edit",
          label: t("Edit"),
          icon: <Pencil className="size-3.5" />,
          disabled: busy,
          onSelect: () => setEditOpen(true),
        },
      ]
    : []

  return (
    <RecordScreen
      mark={kindMark}
      eyebrow={[kindWord, sprint.ref].filter(Boolean).join(" · ")}
      title={sprint.name}
      status={[
        sprint.completedAt ? t("Complete") : sprint.active ? t("Running") : t("Cancelled"),
        sprint.appName ?? undefined,
        sprint.accountName ?? undefined,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        canEdit ? (
          <>
            <Button disabled={busy} onClick={() => void setComplete(!sprint.completedAt)} className="gap-1">
              {busy ? (
                <Spinner />
              ) : sprint.completedAt ? (
                <RotateCcw className="size-3.5" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              {sprint.completedAt ? t("Reopen") : t("Complete")}
            </Button>
            <RecordActionsMenu actions={overflow} />
          </>
        ) : undefined
      }
      headerExtra={
        <>
          {/* THE CROSS-LINKS UP THE TREE, the app it covers and the client who
              bought it, both one tap away. */}
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {sprint.appId && sprint.appName && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/apps/${sprint.appId}`)}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t("On")} {sprint.appName}
              </button>
            )}
            {sprint.accountId && sprint.accountName && (
              <button
                type="button"
                onClick={() => softNavigate(`${host.base}/accounts/${sprint.accountId}`)}
                className="hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline"
              >
                {t("For")} {sprint.accountName}
              </button>
            )}
          </p>
        </>
      }
    >
      {/* WHAT COMPLETING IT WILL DO — a C8 warning band UNDER the header, which
          is where this book already says a warning band goes, rather than a
          third paragraph inside the header itself. The header's job is who and
          what; a consequence of pressing a button is a different question, and
          two questions on one band is N4's fault. The cross-links stay in the
          header, because they ARE who and what. */}
      {canEdit && !sprint.completedAt && (
        <p className="text-muted-foreground bg-muted/40 rounded-xl border p-3 text-sm">
          {t("Completing this sprint cuts a new version of every process inside its app, so the savings can be measured from what changed.")}
        </p>
      )}

      <TabsView
        className={STICKY_TABS}
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "stories")
            return (
              <StoriesPanel
                marks={markMap(teamVocabulary.data, MARK_GROUP.story)}
                ownerKind="sprint"
                ownerId={sprintId}
                filter={{ sprintId }}
                host={host}
                onNew={canCreate ? () => setStoryOpen(true) : undefined}
                emptyText={t("No work in this sprint yet.")}
              />
            )
          if (panel.value === "activity")
            return <ActivityPanel activity={activity} />
          return <OverviewList items={overviewItems} />
        }}
      />

      <RecordFooter
        audit={{
          createdByName: sprint.createdByName,
          createdAt: sprint.createdAt,
          // A sprint keeps no editor snapshot, so the footer shows the half it
          // knows rather than two rows of dashes.
        }}
      />

      <StoryFormDialog
        teamId={teamId}
        open={storyOpen}
        onOpenChange={setStoryOpen}
        sprints={options.sprints}
        apps={options.apps}
        {...(sprint.appId && sprint.appName
          ? { fixedApp: { id: sprint.appId, name: sprint.appName } }
          : {})}
        tickets={options.tickets}
        members={options.members}
        appStaff={options.appStaff}
        processes={options.processes}
        storyTypes={options.storyTypes}
        draftKey={`story:add:sprint:${sprintId}`}
        onSubmit={async (v) => {
          await createStoryFrom(teamId, { ...v, sprintId }, t)
          invalidate(sliceKey("stories-sprint", sprintId))
        }}
      />

      {/* The edit form. The response is the whole (bounded) sprint list, which is
          the same cache this screen reads its record out of — so priming it is
          what makes the new price appear here and on the list behind it at once.
          Everyone else gets the row-level live ping. */}
      <SprintFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        apps={options.apps}
        draftKey={`sprint:edit:${sprintId}`}
        initial={{
          name: sprint.name,
          goal: sprint.goal,
          sprintType: sprint.sprintType,
          accountName: sprint.accountName,
          appName: sprint.appName,
          startsOn: sprint.startsOn,
          endsOn: sprint.endsOn,
          soldPriceCents: sprint.soldPriceCents,
          currency: sprint.currency,
        }}
        onSubmit={async (v) => {
          const { sprints } = await contentApi.updateSprint({
            id: sprintId,
            name: v.name,
            goal: v.goal || undefined,
            sprintType: v.sprintType || undefined,
            startsOn: v.startsOn || undefined,
            endsOn: v.endsOn || undefined,
            soldPriceCents: v.soldPriceCents,
            currency: v.currency || undefined,
          })
          primeCache(sprintsKey(teamId), sprints)
          invalidate(`activity:record:sprints:${sprintId}`)
          toast.success(t("Sprint updated."))
        }}
      />
    </RecordScreen>
  )
}
