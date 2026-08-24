"use client"

// THE REVIEW — the screen between a read call and a client's process map.
//
// A PERSON REVIEWS AND CONFIRMS, ALWAYS, NO EXCEPTION. That is the ruling this
// screen exists to carry out, and everything about its shape follows from it:
// nothing here is pre-approved by being on screen, nothing lands until Apply is
// pressed, and Apply writes ONLY what survived.
//
// ── WHY THREE TABS AND NOT ONE BUTTON ────────────────────────────────────────
//
// "You can accept the steps and reject the tools" — both respondents, in the
// same words. The three kinds are three different KINDS OF CLAIM:
//
//   • that a step HAPPENS is something the client said out loud;
//   • that it is done by the dispatch clerk rather than the adjuster, or in the
//     spreadsheet rather than the inbox, is an INFERENCE — the same sentence
//     supports several readings, and the one the model picked is the one worth
//     doubting on its own.
//
// One "looks right" button would collapse three decisions into one, and the one
// it would collapse them into is the one nobody checks.
//
// ── WHY EACH TAB HAS TWO GROUPS ──────────────────────────────────────────────
//
// Keeping and leaving out are shown as two lists rather than as a column of
// ticks, because a reviewer's real question is not "is this box ticked" but
// "what am I about to put on my client's record". The Keeping group IS that
// answer, at a glance, and a row moves between the groups as it is decided.
//
// ── THE NUMBERS ──────────────────────────────────────────────────────────────
//
// A duration of zero is not a blank to be tidied up: the extraction is
// instructed to answer 0 whenever the conversation did not actually say, and to
// write down what to ask. So a step with no time on it is shown as a QUESTION,
// with the question in it, and it is still perfectly applicable — the map takes
// it at zero and somebody goes and asks. `SAVINGS_CAPTION` rides at the bottom
// of the durations for the reason R25 gives: the sentence is what makes the
// number honest, and these numbers have not even been agreed yet.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Checkbox } from "@kwapso/ui/registry/primitives/checkbox/checkbox"
import { DialogDescription, DialogTitle } from "@kwapso/ui/registry/primitives/dialog/dialog"
import { TabsView, defaultTabsConfig } from "@kwapso/ui/registry/primitives/tabs/tabs"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { Ban, CheckCheck, HelpCircle, ListChecks, Undo2, UserRound, Wrench } from "lucide-react"

import type {
  DraftDecisions,
  DraftMatch,
  DraftStep,
  ProcessDraftDetail,
} from "@shared/process-drafts"
import type { DraftApplyResult } from "@shared/process-drafts"
import { minutesText } from "@shared/workers/savings"
import { FormShellDialog } from "@shared/web/form-shell"
import { useFormDraft } from "@shared/web/use-form-draft"
import { useT } from "@shared/web/language"
import { ApiFailure } from "@/lib/api"
import { formatCount } from "@shared/web/format-count"

/** What the reviewer has decided so far. Arrays rather than Sets because this is
 * persisted between visits (R7) and a Set does not survive a round trip through
 * session storage — the same shape the door takes, so nothing is translated on
 * the way out. */
type Decisions = DraftDecisions

export function DraftReviewDialog({
  open,
  onOpenChange,
  detail,
  onApply,
  onDiscard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The proposal, already read. The screen never fetches — see the note on
   * `onApply`: this component knows what a review IS and nothing about doors. */
  detail: ProcessDraftDetail
  /** WRITE WHAT SURVIVED. Handed in rather than called from here so the door
   * list stays the one place a door is named (web/lib/api/), which is what both
   * gateway suites walk to prove a door reaches a worker and never reaches the
   * client portal. */
  onApply: (decisions: Decisions) => Promise<DraftApplyResult>
  /** Throw the whole proposal away. Nothing reaches the map. */
  onDiscard: () => Promise<void>
}) {
  const t = useT()
  const { payload } = detail

  // EVERYTHING STARTS KEPT, and that is a deliberate choice rather than a
  // default. The extraction has already refused to guess (a duration it did not
  // hear is a zero with a question beside it), so what is on screen is what it
  // actually heard — and a reviewer's job is to take things OUT. Starting with
  // nothing selected would make the common case eleven presses of agreement,
  // which is how a review becomes a formality.
  const initial: Decisions = React.useMemo(
    () => ({
      keepSteps: payload.steps.map((s) => s.key),
      keepRoles: payload.roles.map((r) => r.key),
      keepTools: payload.tools.map((r) => r.key),
    }),
    [payload]
  )
  const [values, setValues, clearDraft] = useFormDraft(`draft-review:${detail.draft.id}`, initial, open)
  const [busy, setBusy] = React.useState(false)
  const [tab, setTab] = React.useState("steps")

  const toggle = (kind: keyof Decisions, key: string, keep: boolean) =>
    setValues((v) => ({
      ...v,
      [kind]: keep ? [...new Set([...v[kind], key])] : v[kind].filter((k) => k !== key),
    }))
  const setWhole = (kind: keyof Decisions, keys: string[]) =>
    setValues((v) => ({ ...v, [kind]: keys }))

  const roleOf = new Map(payload.roles.map((r) => [r.key, r]))
  const toolOf = new Map(payload.tools.map((r) => [r.key, r]))

  // R16 — THE BADGE IS THE DOOR'S OWN COUNT, never the length of what happens to
  // be loaded. A draft's payload IS the whole proposal rather than a page of it,
  // so the two agree today; badging off the array anyway would be the exact
  // habit that made a 24,000-row catalogue advertise "1000", learned on the one
  // collection where it is currently harmless.
  const tabsConfig = {
    ...defaultTabsConfig,
    variant: "line" as const,
    tabs: [
      {
        value: "steps",
        label: t("Steps"),
        icon: "list-checks",
        badge: formatCount(detail.draft.stepCount),
        badgeVariant: "" as const,
      },
      {
        value: "roles",
        label: t("Who does it"),
        icon: "user-round",
        badge: formatCount(detail.draft.roleCount),
        badgeVariant: "" as const,
      },
      {
        value: "tools",
        label: t("What it is done in"),
        icon: "wrench",
        badge: formatCount(detail.draft.toolCount),
        badgeVariant: "" as const,
      },
    ],
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await onApply(values)
      if (!result.applied) {
        // Somebody else applied or threw away this proposal while it was open.
        // Said plainly rather than as an error: nothing went wrong, and nothing
        // was written twice, which is the whole point of the claim on the door.
        toast.info(t("Somebody had already dealt with this one. Nothing was changed."))
      } else {
        toast.success(
          t("{added} added, {revised} changed. The rest was left out.", {
            added: result.stepsAdded,
            revised: result.stepsRevised,
          })
        )
      }
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't apply that."))
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    setBusy(true)
    try {
      await onDiscard()
      toast.success(t("Thrown away. Nothing reached the map."))
      clearDraft()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't throw that away."))
    } finally {
      setBusy(false)
    }
  }

  const keptSteps = payload.steps.filter((s) => values.keepSteps.includes(s.key))

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      clearDraft={clearDraft}
      onSubmit={submit}
      title={<DialogTitle>{t("What the call proposed")}</DialogTitle>}
      subtitle={
        <DialogDescription>
          {t("Nothing here is on the record yet. Keep what is right, leave out what is not, then apply.")}
        </DialogDescription>
      }
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void discard()} className="gap-1">
          <Ban className="size-3.5" />
          {t("Throw it away")}
        </Button>
      }
      submit={{ busy, icon: <CheckCheck className="size-4" /> }}
    >
      {payload.summary ? (
        <p className="text-muted-foreground text-sm">{payload.summary}</p>
      ) : null}

      <TabsView
        config={tabsConfig}
        value={tab}
        onValueChange={setTab}
        renderPanel={(panel) => {
          if (panel.value === "roles")
            return (
              <MatchKind
                rows={payload.roles}
                kept={values.keepRoles}
                onToggle={(key, keep) => toggle("keepRoles", key, keep)}
                onWhole={(keys) => setWhole("keepRoles", keys)}
                unmatchedHint={t("Not one of this client's roles yet. Keeping it changes nothing until somebody records the role.")}
                emptyText={t("The call didn't name who does the work.")}
              />
            )
          if (panel.value === "tools")
            return (
              <MatchKind
                rows={payload.tools}
                kept={values.keepTools}
                onToggle={(key, keep) => toggle("keepTools", key, keep)}
                onWhole={(keys) => setWhole("keepTools", keys)}
                unmatchedHint={t("Not one of this client's tools yet. Keeping it changes nothing until somebody records the tool.")}
                emptyText={t("The call didn't name what the work is done in.")}
              />
            )
          return (
            <StepKind
              rows={payload.steps}
              kept={values.keepSteps}
              roleOf={roleOf}
              toolOf={toolOf}
              onToggle={(key, keep) => toggle("keepSteps", key, keep)}
              onWhole={(keys) => setWhole("keepSteps", keys)}
              caption={detail.savingsCaption}
            />
          )
        }}
      />

      {/* WHAT IS ABOUT TO HAPPEN, in one line, wherever the reviewer is. The
          button says Submit (F1) and the sentence above it says what to. */}
      <p className="text-muted-foreground text-sm">
        {t("Applying will put {kept} of {total} steps on the map.", {
          kept: keptSteps.length,
          total: payload.steps.length,
        })}
      </p>
    </FormShellDialog>
  )
}

/* --------------------------------- the kinds -------------------------------- */

/** ONE TAB'S TWO GROUPS. Written once and handed the rows, because the shape of
 * a decision does not change between a step and a tool — only what a row says
 * about itself does. */
function Groups({
  keptCount,
  totalCount,
  onKeepAll,
  onDropAll,
  children,
}: {
  keptCount: number
  totalCount: number
  onKeepAll: () => void
  onDropAll: () => void
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("Keeping {kept} of {total}.", { kept: keptCount, total: totalCount })}
        </span>
        <span className="flex-1" />
        {/* Two buttons with two fixed variants — never one button whose variant
            reports the state, which is a tab strip in disguise (R3). */}
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onKeepAll}>
          <CheckCheck className="size-3.5" />
          {t("Keep all")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onDropAll}>
          <Undo2 className="size-3.5" />
          {t("Leave all out")}
        </Button>
      </div>
      {children}
    </div>
  )
}

/** A GROUP HEADING — "Keeping" or "Leaving out", with what is under it. */
function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <ul className="divide-border divide-y rounded-xl border">{children}</ul>
    </div>
  )
}

/** One row, in whichever group it is currently in. The checkbox is what moves
 * it, so keeping and dropping are the same gesture rather than two. */
function Row({
  keep,
  onToggle,
  label,
  children,
}: {
  keep: boolean
  onToggle: (keep: boolean) => void
  label: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <Checkbox
        className="mt-1 shrink-0"
        checked={keep}
        onCheckedChange={(c) => onToggle(c === true)}
        aria-label={label}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </div>
    </li>
  )
}

/** THE STEPS. */
function StepKind({
  rows,
  kept,
  roleOf,
  toolOf,
  onToggle,
  onWhole,
  caption,
}: {
  rows: DraftStep[]
  kept: string[]
  roleOf: Map<string, DraftMatch>
  toolOf: Map<string, DraftMatch>
  onToggle: (key: string, keep: boolean) => void
  onWhole: (keys: string[]) => void
  caption: string
}) {
  const t = useT()
  const keeping = rows.filter((r) => kept.includes(r.key))
  const leaving = rows.filter((r) => !kept.includes(r.key))
  if (rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t("The call didn't describe any steps.")}</p>

  const line = (step: DraftStep) => (
    <Row
      key={step.key}
      keep={kept.includes(step.key)}
      onToggle={(keep) => onToggle(step.key, keep)}
      label={step.name}
    >
      {step.description ? (
        <span className="text-muted-foreground text-sm">{step.description}</span>
      ) : null}
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {step.revisesStepId ? <Badge variant="outline">{t("Changes a step you already have")}</Badge> : null}
        <span>{step.secondsPerRun > 0 ? minutesText(step.secondsPerRun) : t("No time agreed")}</span>
        <span>{howOften(t, step)}</span>
        {step.roleKey ? <span>{roleOf.get(step.roleKey)?.said ?? ""}</span> : null}
        {step.toolKey ? <span>{toolOf.get(step.toolKey)?.said ?? ""}</span> : null}
      </span>
      {step.askAbout ? (
        <span className="text-warning flex items-start gap-1 text-xs">
          <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
          {step.askAbout}
        </span>
      ) : null}
    </Row>
  )

  return (
    <Groups
      keptCount={keeping.length}
      totalCount={rows.length}
      onKeepAll={() => onWhole(rows.map((r) => r.key))}
      onDropAll={() => onWhole([])}
    >
      <Group title={t("Keeping")} count={keeping.length}>
        {keeping.map(line)}
      </Group>
      <Group title={t("Leaving out")} count={leaving.length}>
        {leaving.map(line)}
      </Group>
      {/* R25 — the sentence the times must be quoted with, carried from the door
          with them rather than written here. These have not even been agreed
          yet, which makes it matter more rather than less. */}
      <p className="text-muted-foreground flex items-start gap-1 text-xs">
        <ListChecks className="mt-0.5 size-3.5 shrink-0" />
        {caption}
      </p>
    </Groups>
  )
}

/** THE ROLES AND THE TOOLS — the same decision, twice, so the same component. */
function MatchKind({
  rows,
  kept,
  onToggle,
  onWhole,
  unmatchedHint,
  emptyText,
}: {
  rows: DraftMatch[]
  kept: string[]
  onToggle: (key: string, keep: boolean) => void
  onWhole: (keys: string[]) => void
  unmatchedHint: string
  emptyText: string
}) {
  const t = useT()
  const keeping = rows.filter((r) => kept.includes(r.key))
  const leaving = rows.filter((r) => !kept.includes(r.key))
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>

  const line = (row: DraftMatch) => (
    <Row key={row.key} keep={kept.includes(row.key)} onToggle={(keep) => onToggle(row.key, keep)} label={row.said}>
      {row.matchedName ? (
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <UserRound className="size-3.5 shrink-0" />
          {t("Matched to {name} on this client's record.", { name: row.matchedName })}
        </span>
      ) : (
        <span className="text-warning flex items-start gap-1 text-xs">
          <Wrench className="mt-0.5 size-3.5 shrink-0" />
          {unmatchedHint}
        </span>
      )}
    </Row>
  )

  return (
    <Groups
      keptCount={keeping.length}
      totalCount={rows.length}
      onKeepAll={() => onWhole(rows.map((r) => r.key))}
      onDropAll={() => onWhole([])}
    >
      <Group title={t("Keeping")} count={keeping.length}>
        {keeping.map(line)}
      </Group>
      <Group title={t("Leaving out")} count={leaving.length}>
        {leaving.map(line)}
      </Group>
    </Groups>
  )
}

/** HOW OFTEN, AS A WHOLE SENTENCE PER PERIOD.
 *
 * Four sentences rather than `t(period)` with a number glued in front, and it is
 * not verbosity: `t("day")` is a string the extractor REFUSES (all lowercase,
 * three letters — the rule that keeps "en", "de" and "px" out of the catalogue),
 * so it would be translated nowhere and a German reader would get the English
 * word beside a translated number. A whole sentence with a hole in it is also
 * the only shape a translator can reorder, and several of these languages need
 * to. */
function howOften(t: (english: string, vars?: Record<string, string | number>) => string, step: DraftStep): string {
  if (step.runsPerPeriod <= 0) return t("No frequency agreed")
  const count = step.runsPerPeriod
  if (step.frequencyPeriod === "day") return t("{count} a day", { count })
  if (step.frequencyPeriod === "week") return t("{count} a week", { count })
  if (step.frequencyPeriod === "year") return t("{count} a year", { count })
  return t("{count} a month", { count })
}
