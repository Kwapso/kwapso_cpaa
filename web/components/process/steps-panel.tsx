"use client"
import { Trash2 } from "@shared/ui/foundations/icons"
import { SAVINGS_CAPTION, hoursText, minutesText } from "@shared/workers/savings"
import { frequencyText } from "@shared/web/frequency"
import { moneyText } from "@shared/web/money"
import { ProcessDateSlider } from "@/components/process-date-slider"
import { ReadACall } from "@/components/read-a-call"
import { ProcessFlowchart } from "@/components/process-flowchart"
import { SavingStepLine } from "@/components/impact-panel"
import { RecordPicker } from "@/components/record-picker"
import { AddButton } from "@/components/deep-link/screen-bits"
import { ProcessMap } from "@/components/process-map"
import type { Confirm } from "@/components/process-detail"
import { RecordActionsMenu } from "@/components/record-chrome"

// THE STEPS PANEL — the map itself, its version picker, its money and its
// savings, lifted out of `process-detail.tsx` on 26 Aug 2026.
//
// WHY IT MOVED. The screen had reached 1,400 lines and this was 405 of them:
// a reader looking for how a version is CHOSEN had to scroll past the whole of
// how one is DRAWN, and the two have nothing to say to each other.
//
// WHY THREE PROPS AND NOT TWENTY-ONE. The block closed over twenty-four things,
// which is the honest signal that it is coupled to the screen's derived state
// rather than a widget that happens to live there. Listing all of them would
// have moved the mess rather than removed it, so they arrive as the three
// groups they already formed: what is being SHOWN, what the reader may DO, and
// the two ways to act. A prop list that names a shape is a decomposition; one
// that names twenty-one variables is a cut-and-paste with extra typing.
//
// NOTHING ELSE CHANGED. Same JSX, same order, same copy. The type checker is
// what proves it: every one of those twenty-four had to arrive from somewhere.

import * as React from "react"
import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { TabsView, defaultTabsConfig } from "@shared/web/screen-engine/tabs-view"
import { Pencil, Power } from "@shared/ui/foundations/icons"
import type { ProcessSaving } from "@shared/workers/savings"
import { tenancy } from "@/lib/api"
import { useT } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"
import type {
  ProcessDetail,
  ProcessStep,
  Meeting,
  ProcessVersion,
} from "@shared/types"

/** WHAT THIS PANEL IS LOOKING AT — one version of one map, and everything the
 * screen already worked out about it. Derived on the host because the header,
 * the tab badges and this panel must agree about which version is shown. */
export type StepsPanelView = {
  process: ProcessDetail["process"]
  versions: ProcessVersion[]
  current: ProcessVersion | undefined
  shownVersion: ProcessVersion | undefined
  shownSteps: ProcessStep[] | undefined
  shownTotalSeconds: number
  isCurrent: boolean
  auditDate: string | null
  revisionDates: string[]
  saving: ProcessSaving | null
  savingsCaption: string
  againstQ: { data?: ProcessDetail }
  meetingsQ: { data?: Meeting[] }
  /** The two comparisons this panel offers — a DAY to read the map as of, and
   * another VERSION to read it against. Lifted with `shown` and for the same
   * reason: each is a cache key the host reads through. */
  asOf: string | null
  againstId: string | null
  /** A write in flight somewhere on this screen. One flag, so two controls can
   * never both think they are the only thing happening. */
  busy: boolean
}

/** THE HOST'S OWN DIALOGS, opened from here. Callbacks rather than state,
 * because every one of them belongs to a control the SCREEN owns — a panel that
 * held these would be a second place deciding what "editing a step" means. */
export type StepsPanelActions = {
  onAsOf: (day: string | null) => void
  onAgainst: (versionId: string | null) => void
  onAddStep: () => void
  onEditStep: (step: ProcessStep | null) => void
  onConfirm: (c: Confirm | null) => void
}

/** WHAT THE READER MAY DO. Four answers the host already has — a panel that
 * asked the permission layer again could disagree with the screen around it. */
export type StepsPanelRights = {
  canCreate: boolean
  canEdit: boolean
  canArchive: boolean
}

/** How a version is named out loud, everywhere on this screen: its number, then
 * what somebody called it. Written once so the picker, the banner and the
 * versions list cannot describe the same version three ways. */
export function versionLabel(v: ProcessVersion): string {
  return `Version ${v.versionNo}${v.label ? `, ${v.label}` : ""}${v.isBaseline ? " (baseline)" : ""}`
}

/** One step's whole monthly cost: how long it takes, times how often it happens.
 * The number a reader adds up in their head as they go down the list — so the
 * screen shows the same one rather than leaving them to multiply. */
export function stepSecondsPerMonth(step: ProcessStep): number {
  return step.secondsPerRun * step.runsPerMonth
}

export function StepsPanel({
  processId,
  view,
  rights,
  actions,
  shown,
  onShowVersion,
  run,
  refresh,
}: {
  processId: string
  view: StepsPanelView
  rights: StepsPanelRights
  actions: StepsPanelActions
  /** THE READ THIS PANEL IS DRAWING — whichever of the host's three it turned
   * out to be (today's map, an older version, or the map as of a day). Its
   * `error` and its undefined `data` are what the panel paints a refusal and a
   * skeleton from, so it arrives whole rather than unwrapped.
   *
   * `versionId` is LIFTED for the same reason it always was: the host reads
   * that version's steps through its own cache key, so a panel holding it
   * privately would be picking a version nothing fetched. */
  shown: { data?: ProcessDetail; error?: unknown }
  onShowVersion: (id: string | null) => void
  /** The host's one mutation seam: does the call, toasts, refreshes. */
  run: (what: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>
  refresh: () => void
}) {
  const t = useT()
  // OWNED HERE, because nothing outside this panel reads it: which of the three
  // ways to look at the steps is showing. It was host state only because the
  // block used to live there.
  const [stepView, setStepView] = React.useState("list")
  const {
    process, versions, current, shownVersion, shownSteps, shownTotalSeconds,
    isCurrent, auditDate, revisionDates, saving, savingsCaption, againstQ, meetingsQ,
    asOf, againstId, busy,
  } = view
  const { canCreate, canEdit, canArchive } = rights
  const { onAsOf, onAgainst, onAddStep, onEditStep, onConfirm } = actions

  return (
    <div className="flex flex-col gap-4">
      {/* WHICH VERSION AM I READING. A picker rather than a strip of
          buttons: R3 forbids a hand-rolled toggle, and a map cut once
          per completed sprint grows more versions than a strip can
          hold anyway. It is the first thing on the panel because
          everything under it means something different per version. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-sm">{t("Showing")}</span>
          <RecordPicker
            value={shownVersion?.id ?? ""}
            onChange={(v) => onShowVersion(v === current?.id ? null : v)}
            options={versions.map((v) => ({
              value: v.id,
              label: versionLabel(v),
              hint: v.id === current?.id ? t("current") : undefined,
            }))}
            placeholder={t("Pick a version")}
            searchPlaceholder={t("Search versions…")}
            emptyText={t("Nothing matched.")}
            clearable={false}
            className="w-[19rem] max-w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* THE VIEW SWITCH. A TabsView rather than two buttons —
              R3 forbids a hand-rolled toggle, and this is exactly the
              shape it means. */}
          <TabsView
            config={{
              ...defaultTabsConfig,
              // A LINE. This switches the VIEW of the steps already
              // chosen by the folder above it — it is inside that
              // tab, not beside it — and a folder tab is drawn with
              // feet that attach to a card. Two folders stacked put
              // one strip's feet through the other's toolbar.
              variant: "line" as const,
              tabs: [
                { value: "list", label: t("List"), icon: "list", badge: "", badgeVariant: "" as const },
                { value: "flow", label: t("Flow"), icon: "git-branch", badge: "", badgeVariant: "" as const },
                { value: "compare", label: t("Compare"), icon: "arrows-left-right", badge: "", badgeVariant: "" as const },
              ],
            }}
            value={stepView}
            onValueChange={(v) => setStepView(v as "list" | "flow" | "compare")}
          />
        </div>
        {/* READ A CALL — the other way steps get onto a map. It sits
            beside "Add step" because it answers the same question at a
            different speed: one is a person typing what they heard,
            the other is the app proposing it and the person going
            through the list. Neither writes anything the person has
            not agreed to. */}
        {canCreate && isCurrent && (
          <ReadACall
            processId={processId}
            meetings={(meetingsQ.data ?? [])
              .filter((m) => !process.accountId || m.accountId === process.accountId)
              .map((m) => ({ value: m.id, label: m.ref ?? m.title }))}
            onApplied={refresh}
          />
        )}
        {canCreate && isCurrent && (
          <AddButton
            label={t("Add step")}
            onClick={() => {
              onEditStep(null)
              onAddStep()
            }}
          />
        )}
      </div>

      {/* An older version is READ-ONLY, and the screen says why rather
          than greying a button and leaving a person to guess. The
          server refuses the write regardless — this is the sentence,
          not the lock. */}
      {!isCurrent && (
        <p className="text-muted-foreground bg-muted/40 rounded-[var(--radius)] border p-3 text-xs">
          {t("This is how the work was described when")}{" "}
          {shownVersion ? versionLabel(shownVersion).toLowerCase() : t("this version")}{" "}
          {t("was cut")}
          {shownVersion ? ` on ${new Date(shownVersion.createdAt).toLocaleDateString()}` : ""}.{" "}
          {t("Older versions can be read but never edited, every saving is a subtraction from them, so they stay exactly as they were agreed.")}
        </p>
      )}

      {shown.error ? (
        // A version that can't be read says so and offers the way back
        // — a skeleton that never resolves is the same screen as a hang.
        <div className="flex flex-col items-start gap-2">
          <p className="text-destructive text-sm">{t("Couldn't load that version.")}</p>
          <Button variant="secondary" size="sm" onClick={() => onShowVersion(null)}>
            {t("Show the current version")}
          </Button>
        </div>
      ) : shownSteps === undefined ? (
        <Skeleton variant="list" lines={4} />
      ) : stepView === "flow" ? (
        // THE PICTURE. Read-only and built from the form (Aurora's
        // ruling) — it draws the same rows the list draws, in the same
        // order, from the same read, so it has nothing to disagree
        // with. The slider above it moves the whole thing through
        // time.
        <div className="flex flex-col gap-5">
          <ProcessDateSlider
            dates={revisionDates}
            auditDate={auditDate ?? ""}
            value={asOf}
            onChange={onAsOf}
          />
          <ProcessFlowchart
            steps={shownSteps}
            emptyMessage={
              asOf
                ? t("This map had no steps on that day.")
                : t("Nothing mapped yet.")
            }
          />
        </div>
      ) : stepView === "compare" && shownSteps.length > 0 ? (
        // THE PICTURE. Same steps, same read — it is a view, not a
        // second source, so flipping the switch cannot show you
        // something the list disagrees with.
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-muted-foreground shrink-0 text-sm">{t("Compare with")}</span>
            <RecordPicker
              value={againstId ?? ""}
              onChange={(v) => onAgainst(v || null)}
              options={versions
                .filter((v) => v.id !== shownVersion?.id)
                .map((v) => ({ value: v.id, label: versionLabel(v) }))}
              placeholder={t("Nothing — just show this one")}
              searchPlaceholder={t("Search versions…")}
              emptyText={t("Nothing matched.")}
              className="w-[19rem] max-w-full"
            />
          </div>
          <ProcessMap
            left={againstId ? (againstQ.data?.steps ?? null) : null}
            right={shownSteps}
            leftLabel={
              againstId
                ? versionLabel(versions.find((v) => v.id === againstId) ?? shownVersion!)
                : undefined
            }
            rightLabel={shownVersion ? versionLabel(shownVersion) : undefined}
            leftShort={
              againstId
                ? `V${(versions.find((v) => v.id === againstId) ?? shownVersion!).versionNo}`
                : undefined
            }
            rightShort={shownVersion ? `V${shownVersion.versionNo}` : undefined}
          />
        </div>
      ) : shownSteps.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {isCurrent
            ? t("No steps yet. Add the first one and say how long it takes and how often it happens, that is what a saving is measured from.")
            : t("This version has no steps recorded.")}
        </p>
      ) : (
        <div className="rounded-[var(--radius)] border">
          {/* ONE STEP, AS A TITLE AND A META LINE (K1), and it used to
              be eight things on one sweep: number, name, "no longer
              done", minutes each time, runs a month, hours a month,
              Edit and Stopped. N1 caps a band at four, and this was the
              joint-worst row in the app.

              The NUMBER now rides with the NAME, because a step's place
              in the sequence and its name are one thing the eye reads
              together, not two. The three TIMES stay together on the
              meta line — they are the point of this screen and the
              third is the product of the first two, so splitting them
              would break the arithmetic a reader checks. "No longer
              done" is a STATE and sits at the end of the line as a
              badge. And the two ACTIONS leave the band entirely for the
              row's three-dot menu (B2), keeping their confirms: facts
              and actions never interleave (N4). H 8 → 4. */}
          {shownSteps.map((step, i) => (
            <div
              key={step.id}
              className="flex items-start justify-between gap-2 border-b p-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="block truncate text-sm font-medium">
                  {i + 1}. {step.name}
                  {step.removed && (
                    <Badge variant="secondary" className="ml-2 text-badge">
                      {t("no longer done")}
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {minutesText(step.secondsPerRun)} {t("each time")} ·{" "}
                  {frequencyText(step.runsPerPeriod, step.frequencyPeriod, t)} ·{" "}
                  {hoursText(stepSecondsPerMonth(step))} {t("a month")}
                </p>
                {/* WHO DOES IT AND WHAT IN, on their own line under the
                    times, because they are the OTHER half of what makes
                {/* WHO DOES IT AND WHAT IN, under the times, because
                    they are the OTHER half of what makes a saving a
                    number: the minutes above are the amount of work,
                    and the role is what an hour of it costs. Left out
                    entirely when nobody has said — an empty "Who does
                    it: —" would be a field to fill in rather than a
                    fact, and this line is facts. */}
                {(step.roleName || step.toolName || step.branchLabel) && (
                  <p className="text-muted-foreground text-xs">
                    {[
                      step.branchLabel ? `${t("only when")} ${step.branchLabel}` : null,
                      step.roleName,
                      step.toolName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {step.description && (
                  <RichText
                    html={step.description}
                    className="text-muted-foreground mt-1 text-xs"
                  />
                )}
              </div>
              <RecordActionsMenu
                tone="row"
                actions={[
                  ...(canEdit && isCurrent && !step.removed
                    ? [
                        {
                          key: "edit",
                          label: t("Edit"),
                          icon: <Pencil className="size-3.5" />,
                          onSelect: () => {
                            onEditStep(step)
                            onAddStep()
                          },
                        },
                      ]
                    : []),
                  ...(canArchive && isCurrent && !step.removed
                    ? [
                        {
                          key: "stopped",
                          label: t("Stopped"),
                          icon: <Power className="size-3.5" />,
                          disabled: busy,
                          destructive: true,
                          onSelect: () =>
                            onConfirm({
                              // ONE question with the step's name in it. It was
                              // t("Does") + the name + t("still happen?"), which asks
                              // a translator to write the two ends of a sentence
                              // without seeing the middle — and languages that front
                              // the verb, or carry the question in a particle, have no
                              // two ends to write.
                              title: t('Does "{step}" still happen?', { step: step.name }),
                              body: t(
                                "Recording that it stopped is how its whole time becomes a saving. The step keeps its place in this version and in every older one, nothing is deleted."
                              ),
                              action: t("It no longer happens"),
                              run: () =>
                                run(
                                  () => tenancy.removeStep(step.id),
                                  t("Step recorded as no longer done."),
                                  t("Couldn't record that.")
                                ),
                            }),
                        },
                      ]
                    : []),
                  // DELETE, for the step that should never have
                  // existed (owner, 25 Aug 2026). Distinct from
                  // Stopped on purpose: stopping is a FACT about the
                  // work and the largest saving there is; deleting is
                  // an admission the row was a mistake. The door
                  // refuses when the step is woven in — cut into an
                  // agreed version, or a loop's target — and its
                  // refusal names the reason.
                  ...(canArchive && isCurrent
                    ? [
                        {
                          key: "delete",
                          label: t("Delete"),
                          icon: <Trash2 className="size-3.5" />,
                          disabled: busy,
                          destructive: true,
                          onSelect: () =>
                            onConfirm({
                              title: t('Delete "{step}" completely?', { step: step.name }),
                              body: t(
                                "For a step added by mistake: it disappears from the map and its history, as if it was never added, and this cannot be undone. A step that is already part of an agreed version, or that another step sends work back to, can only be switched off."
                              ),
                              action: t("Delete it"),
                              run: () =>
                                run(
                                  () => tenancy.deleteStep(step.id),
                                  t("Step deleted."),
                                  t("Couldn't delete it.")
                                ),
                            }),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          ))}
          {/* THE TOTAL AT THE END — the plain sum of the column above
              it, so a reader who adds the rows up gets this number.
              It is a WORKLOAD, not a saving: how much of somebody's
              month this way of working costs. The subtraction between
              two of these is the saving, and it is shown below with
              the sentence it has to be quoted with. */}
          <div className="bg-muted/40 flex items-baseline justify-between gap-2 border-t p-3">
            <span className="text-sm font-medium">
              {t("Total, as")}{" "}
              {shownVersion ? versionLabel(shownVersion).toLowerCase() : t("this version")}{" "}
              {t("describes it")}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {hoursText(shownTotalSeconds)} {t("a month")}
            </span>
          </div>
        </div>
      )}

      {/* BOTH SIDES OF THE SUBTRACTION, on the screen that produced
          them. The rows come from the door through the ONE savings
          seam — the same statement and the same arithmetic the value
          screen and the client's own portal read — so this figure and
          the one a client is looking at cannot drift apart.
          Every step is here, including the ones we REMOVED between the
          two versions: dropping work entirely is the largest saving
          there is, and a comparison that showed only surviving steps
          would leave it out. */}
      {saving && saving.steps.length > 0 && (
        <div className="rounded-[var(--radius)] border p-4">
          <p className="text-muted-foreground text-sm">
            {t("Time given back, measured from")} {auditDate}
          </p>
          {/* HOURS AND MONEY, SIDE BY SIDE, and BOTH periods — Aurora's
              two rulings, and they are the same ruling twice: a person
              selling this quotes a year and a person running it feels a
              month, and making either of them multiply in their head is
              how the two figures stop matching in a meeting. */}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="text-2xl font-semibold tracking-tight">
                {hoursText(saving.savedSecondsPerMonth)}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("a month")} · {hoursText(saving.savedSecondsPerMonth * 12)}{" "}
                {t("a year")}
              </p>
            </div>
            {/* THE MONEY IS SHOWN ONLY WHEN SOMETHING IS PRICED. A
                €0 beside real hours would read as "this work is
                free" — see savings.ts, where an unpriced step is
                null rather than zero for exactly this reason. */}
            {saving.pricedSteps > 0 && (
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {moneyText(saving.savedCentsPerMonth)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("a month")} · {moneyText(saving.savedCentsPerMonth * 12)}{" "}
                  {t("a year")}
                </p>
              </div>
            )}
          </div>
          {/* WHEN THE MONEY IS INCOMPLETE, SAY SO. A figure built from
              four steps out of nine is not wrong, it is partial — and a
              screen that cannot tell the difference will let somebody
              quote it to a client as the whole picture. */}
          {saving.pricedSteps < saving.totalSteps && (
            <p className="text-muted-foreground mt-2 text-xs">
              {saving.pricedSteps === 0
                ? t("No money yet — none of these steps says what an hour of the person doing it costs.")
                : t("The money covers {priced} of {total} steps — the rest have no hourly cost yet.", {
                    priced: saving.pricedSteps,
                    total: saving.totalSteps,
                  })}
            </p>
          )}
          {/* R25 — the sentence that makes the number honest, from the
              one place it is written. Never assembled here. */}
          <p className="text-muted-foreground mt-2 text-xs">
            {savingsCaption || SAVINGS_CAPTION}
          </p>
          <div className="mt-3">
            {saving.steps.map((s) => (
              <SavingStepLine key={s.stepKey} step={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
