"use client"

// THE VALUE — hours given back, and every step they came from.
//
// The whole point of this panel is the DRILL, not the headline. A client asking
// "where does 208 hours come from?" gets an answer three clicks deep — App →
// Process → Step — and the last click shows the actual arithmetic: it took this
// long, it now takes this long, it happens this often. A savings figure a client
// cannot drill into is worse than no figure at all, because the first time they
// question it and nobody can answer, every other number in the app loses its
// credit too.
//
// R25: the caption ships WITH the number, from the one constant beside the
// arithmetic (shared/workers/savings.ts). It is not decoration around the
// feature — it is half of it. The times are estimates we agreed; the subtraction
// is arithmetic. A client who understands that trusts the figure; one who thinks
// we held a stopwatch stops trusting everything the day one figure looks wrong.
//
// REGRESSIONS ARE SHOWN, ALWAYS, on this side. A step that got slower is
// information: it is what tells the team a change cost somebody time. There is
// no filter here that hides one, and none anywhere else either — the client's
// side shows them too, with our explanation attached (BUILD-3 §3). What this
// panel adds is the nudge: it says how many of them we have not explained yet.

import * as React from "react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@shared/ui/controls/accordion/accordion"
import { Badge } from "@shared/ui/controls/badge/badge"
import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"

// Hours and minutes come from `shared/workers/savings.ts`, beside the rounding
// they spell — not written again here, which is what they were. Both front doors
// render this number, and a second copy of a formatter is the drift the money
// seam already had to be written to stop.
import {
  SAVINGS_CAPTION,
  hoursText,
  minutesText,
  type SavingsView,
  type StepSaving,
} from "@shared/workers/savings"
import { useT } from "@shared/web/language"

/** ONE step's arithmetic, said out loud. This line is the answer to the third
 * click, and it is deliberately the whole sum rather than its result.
 *
 * EXPORTED because a map's own detail screen answers the same question about the
 * same rows, and the answer has to be phrased identically in both places: a
 * client who reads "12 min before · 3 min now" on the value screen and a
 * differently-worded version of the same sum on the map is being asked to check
 * whether two sentences mean the same thing. One component, one wording. */
export function SavingStepLine({ step }: { step: StepSaving }) {
  const t = useT()
  const gain = step.savedSecondsPerMonth >= 0
  return (
    <div className="flex flex-col gap-1 border-t py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:justify-between">
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {step.name}
          {step.removed && (
            <Badge variant="secondary" className="ml-2 text-badge">
              {t("no longer done")}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          {minutesText(step.baselineSecondsPerRun)} {t("before ·")}{" "}
          {step.removed ? t("not done now") : `${minutesText(step.latestSecondsPerRun)} now`} ·{" "}
          {step.runsPerMonth.toLocaleString()}{t("× a month")}
        </p>
      </div>
      <div className="shrink-0 text-sm sm:text-right">
        <span className={gain ? "text-foreground font-medium" : "text-destructive font-medium"}>
          {gain ? "" : "−"}
          {hoursText(step.savedSecondsPerMonth)} {t("a month")}
        </span>
        {step.regression && (
          <p className="text-muted-foreground text-xs">
            {step.explained ? t("explained") : t("no explanation yet")}
          </p>
        )}
      </div>
    </div>
  )
}

export function ImpactPanel({ view }: { view: SavingsView | undefined }) {
  const t = useT()
  if (view === undefined) return <Skeleton variant="list" lines={4} />

  const unexplained = view.apps
    .flatMap((a) => a.processes.flatMap((p) => p.steps))
    .filter((s) => s.regression && !s.explained).length

  if (view.apps.length === 0)
    return (
      <div className="rounded-[var(--radius)] border p-4">
        <p className="text-sm font-medium">{t("No value to show yet.")}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("Map a process, write down how long each step took before, and the saving appears here as soon as a step gets faster.")}
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius)] border p-4">
        <p className="text-muted-foreground text-sm">{t("Time given back, every month")}</p>
        <p className="text-2xl font-medium tracking-tight">
          {hoursText(view.savedSecondsPerMonth)}
        </p>
        {/* R25 — the sentence that makes the number honest, from the one place it
            is written. Never assembled here. */}
        <p className="text-muted-foreground mt-2 text-xs">{view.caption ?? SAVINGS_CAPTION}</p>
        {unexplained > 0 && (
          <p className="text-destructive mt-2 text-xs">
            {unexplained === 1
              ? t("1 step takes longer than it used to and has no explanation yet.")
              : `${unexplained} steps take longer than they used to and have no explanation yet.`}{" "}
            {t("Add one on the map, the client sees these either way.")}
          </p>
        )}
      </div>

      <Accordion type="multiple" className="rounded-[var(--radius)] border px-4">
        {view.apps.map((app) => (
          <AccordionItem key={app.appId} value={app.appId} className="last:border-b-0">
            <AccordionTrigger>
              <span className="flex w-full items-baseline justify-between gap-2 pr-2">
                <span className="truncate">{app.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs font-normal">
                  {hoursText(app.savedSecondsPerMonth)} {t("a month")}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion type="multiple" className="pl-2">
                {app.processes.map((process) => (
                  <AccordionItem key={process.processId} value={process.processId} className="last:border-b-0">
                    <AccordionTrigger>
                      <span className="flex w-full items-baseline justify-between gap-2 pr-2">
                        <span className="truncate">{process.name}</span>
                        <span className="text-muted-foreground shrink-0 text-xs font-normal">
                          {hoursText(process.savedSecondsPerMonth)} {t("a month")}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-2">
                        {process.steps.map((step) => (
                          <SavingStepLine key={step.stepKey} step={step} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
