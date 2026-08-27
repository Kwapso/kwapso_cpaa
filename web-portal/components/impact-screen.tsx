"use client"

// WHAT THIS HAS BEEN WORTH — the client's own side of the savings figure.
//
// It is the same arithmetic the agency sees, drilled the same way (App →
// Process → Step), because it has to be: a client who asks "where does 208
// hours come from?" and gets a different answer from the one their account
// manager has is a client who stops believing both.
//
// THREE THINGS ARE DELIBERATE HERE.
//
// 1. THE CAPTION SHIPS WITH THE NUMBER (R25), word for word, from the one
//    constant beside the arithmetic. The times are estimates we agreed with
//    them; the subtraction is arithmetic. A client who understands that trusts
//    the figure. One who believes we held a stopwatch stops trusting every other
//    number in the app the day one of them looks wrong.
//
// 2. A STEP THAT GOT SLOWER IS SHOWN, and it is counted. There is no filter on
//    this screen that drops one, and the totals never quietly lose one — the
//    rule was "build the attachment; do not build a filter that hides them". So
//    a regression appears with our EXPLANATION beside it, and when we have not
//    written one yet it says so plainly rather than disappearing. Hiding it
//    would be the version of this screen that costs the most the first time
//    somebody notices.
//
// 3. PRICES ARE ABSENT UNLESS THEY WERE SENT. The per-account switch is decided
//    at the door: when it is off, the `prices` key is not in the response at
//    all. This screen has no flag of its own to get wrong — it renders what it
//    was given. And what it can never be given, under any setting, is the
//    agency's own margin or internal rates (R24).

import * as React from "react"
import dynamic from "next/dynamic"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@shared/ui/components/accordion/accordion"
import { Badge } from "@shared/ui/components/badge/badge"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Comments } from "@shared/ui/components/comments/comments"
import { toast } from "@shared/ui/components/sonner/sonner"

import { SAVINGS_CAPTION, hoursText, minutesText, savedHours, type StepSaving } from "@shared/workers/savings"
import type { ProcessComment } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { invalidate, useCached } from "@shared/web/store"
import { ApiFailure, impact as impactApi, type PortalImpact } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import type { PortalReady } from "@/components/portal-shell"
import { useT } from "@shared/web/language"

// Money comes from `shared/web/money.ts`, and hours and minutes from
// `shared/workers/savings.ts` beside the rounding they spell — imported at the
// top of this file, not written again here, which is what they were.
//
// The local money copy left `minimumFractionDigits` off, so this screen rendered
// a round rate as "12.5" where the agency's own rate card, reading the SAME cents,
// rendered "12.50". A client and the person who set their price were looking at
// two spellings of one number. That is the exact divergence the shared file was
// written to stop, and its header says so — a formatter knows no table, no door
// and no audience, so it is safe on both sides of the R24 fence and there is no
// reason for a second one to exist.

/** THE PICTURE, FETCHED AFTER THE FIGURE IT ILLUSTRATES.
 *
 * The headline of this screen is a number and the sentence that makes it honest
 * (R25), and Recharts is ~112 kB. Behind a static import, a client on a phone
 * would wait on a charting library before being told what their figure is made
 * of. Behind this one, the number and its caption paint immediately and the
 * picture arrives underneath. `ssr: false` because a static export has no server
 * to render it on; the placeholder holds the chart's own height so the accordion
 * below it does not jump when the chunk lands. */
const AppSavingsChart = dynamic(
  () => import("@/components/impact-chart").then((m) => m.AppSavingsChart),
  { ssr: false, loading: () => <Skeleton className="h-[190px] w-full rounded-[var(--radius)]" /> }
)

/** One step, and the whole sum behind it. This line is the answer to the third
 * click — deliberately the arithmetic rather than its result.
 *
 * FOUR THINGS, AND IT USED TO BE SEVEN: the step's name, "no longer needed",
 * the baseline minutes, the latest minutes, how often it runs, the hours saved
 * and — when a step got slower — a sentence of explanation, all on one line.
 * That made it the densest band in the client portal, on the screen a client is
 * most likely to turn round and show somebody else (N1 caps a band at four).
 *
 * Now: the NAME is the title. The two times are ONE unit, an arrow between them,
 * because "twelve minutes became four" is one fact a reader decodes in one go
 * and not two facts to be compared. How often it runs is the second. The HOURS
 * SAVED is the trailing number, because it is the point of the line. And the
 * regression sentence drops to a line of its OWN underneath — a sentence is
 * never a unit on a band beside numbers (N4: one band, one question).
 *
 * Nothing was removed and no figure changed; R25's caption is untouched. */
function StepLine({ step }: { step: StepSaving }) {
  const t = useT()
  const gain = step.savedSecondsPerMonth >= 0
  return (
    <div className="flex flex-col gap-1 border-t py-3 first:border-t-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">
            {step.name}
            {step.removed && (
              <Badge variant="secondary" className="ml-2 text-badge">
                {t("no longer needed")}
              </Badge>
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {minutesText(step.baselineSecondsPerRun)} →{" "}
            {step.removed ? t("not needed now") : minutesText(step.latestSecondsPerRun)} ·{" "}
            {step.runsPerMonth.toLocaleString()}
            {t("× a month")}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm sm:text-right ${gain ? "text-foreground font-medium" : "text-destructive font-medium"}`}
        >
          {gain ? "" : "−"}
          {hoursText(step.savedSecondsPerMonth)} {t("a month")}
        </span>
      </div>
      {/* A step that takes LONGER. Shown, always, and counted in the totals —
          with our explanation when we have written one, and an honest sentence
          when we have not. On its own line, because it is a sentence. */}
      {step.regression && (
        <p className="text-muted-foreground text-xs">
          {step.explained
            ? t("your team has explained this below")
            : t("your team is writing an explanation")}
        </p>
      )}
    </div>
  )
}

export function ImpactScreen({ ready }: { ready: PortalReady }) {
  const t = useT()
  void ready // the account is decided by the server from the caller's own stamp
  const { data, loading } = useCached<PortalImpact>(cacheKeys.impact, () => impactApi.read())
  const [openProcessId, setOpenProcessId] = React.useState<string | null>(null)
  // The chart's rows, built above the early returns so the hook order is fixed
  // whatever the read is doing. Hours to one decimal, from the SAME rounding the
  // text below uses (savedHours), so a bar and the line under it can never say
  // two different numbers about one app.
  const appChart = (data?.apps ?? []).map((app) => ({
    label: app.name,
    hours: savedHours(app.savedSecondsPerMonth),
  }))

  if (loading && !data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      </div>
    )
  if (!data) return null

  if (data.apps.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-medium">{t("What this has been worth")}</h1>
        <p className="text-muted-foreground rounded-[var(--radius)] border border-dashed p-8 text-center">
          {t("Nothing to show yet. As soon as we've mapped how a job used to be done and changed it, the time it gives back appears here.")}
        </p>
      </div>
    )

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium">{t("What this has been worth")}</h1>
        <p className="text-muted-foreground">
          {t("Time your team gets back, every month, and where every hour of it comes from.")}
        </p>
      </div>

      {/* THE HEADLINE, BARE ON THE PAGE. It is a label, a number and the
          sentence that makes the number honest — not a collection of two or more
          rows and not a form of two or more fields, so it never earned a
          container (N6). A 3xl figure with `gap-6` round it is found by the eye
          without a box drawn to point at it, and on the screen a client is most
          likely to show somebody else, one fewer drawn line is worth having. */}
      <section className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">{t("Time given back, every month")}</p>
        <p className="text-3xl font-medium">
          {hoursText(data.savedSecondsPerMonth)}
        </p>
        {/* R25 — the sentence that makes the number honest, from the one place it
            is written. Never assembled here. */}
        <p className="text-muted-foreground text-sm">{data.caption ?? SAVINGS_CAPTION}</p>
      </section>

      {/* WHAT YOU BOUGHT — only when we were sent it. No flag on this side. */}
      {data.prices && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">{t("What you bought")}</h2>
          {data.prices.soldCents !== null && (
            <p className="text-sm">
              {t("Agreed so far:")}{" "}
              <span className="font-medium">
                {moneyText(data.prices.soldCents, data.prices.rates[0]?.currency ?? null)}
              </span>
            </p>
          )}
          {data.prices.rates.length > 0 && (
            <div className="rounded-[var(--radius)] border">
              {data.prices.rates.map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-2 border-b p-3 last:border-b-0"
                >
                  <span className="text-sm">{r.label}</span>
                  <span className="text-muted-foreground text-sm">
                    {moneyText(r.centsPerHour, r.currency)} {t("an hour")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t("Where it comes from")}</h2>

        {/* THE SAME DRILL-DOWN, SEEN AT ONCE. The accordion below answers "where
            does 208 hours come from?" one click at a time, which is right for
            checking the arithmetic and wrong for the first look: a client with
            six apps has to open six rows to learn which one matters. A bar per
            app answers that before anybody clicks.

            It is drawn from the rows already in hand — no second request, no
            second door, and no number this screen was not already showing.

            TWO OR MORE APPS ONLY: on one, the bar would be the headline figure
            above it drawn again. AND A NEGATIVE IS DRAWN, below the line, for the
            reason this whole file is built around — a step that got slower is
            information, and no filter on this screen hides one. The zero line and
            the axis are on for exactly that: a bar going the wrong way has to be
            readable as such. */}
        {appChart.length > 1 && (
          // A chart is one picture, not a collection of rows — bare (N6).
          <AppSavingsChart rows={appChart} label={t("Hours a month")} />
        )}

        <Accordion type="multiple" className="rounded-[var(--radius)] border px-4">
          {data.apps.map((app) => (
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
                    <AccordionItem
                      key={process.processId}
                      value={process.processId}
                      className="last:border-b-0"
                    >
                      <AccordionTrigger onClick={() => setOpenProcessId(process.processId)}>
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
                            <StepLine key={step.stepKey} step={step} />
                          ))}
                        </div>
                        <ProcessConversation
                          processId={process.processId}
                          open={openProcessId === process.processId}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}

/** The conversation on one map — theirs and ours, in one thread. It loads only
 * once the map is opened: a client with a dozen processes should not pay for
 * twelve conversations to read one number.
 *
 * A staff author has no name here (SCOPE ch.06 — the portal shows work status,
 * never which staff member is doing it); the server withholds it, and this
 * screen renders what it was given. */
function ProcessConversation({ processId, open }: { processId: string; open: boolean }) {
  const t = useT()
  const { data } = useCached<{ comments: ProcessComment[]; total: number }>(
    open ? cacheKeys.processComments(processId) : null,
    () => impactApi.comments(processId)
  )
  const [busy, setBusy] = React.useState(false)
  if (!open) return null

  async function add(body: string) {
    setBusy(true)
    try {
      await impactApi.comment(processId, body)
      invalidate(cacheKeys.processComments(processId))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't send that. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      <p className="mb-2 text-sm font-medium">{t("Questions about this?")}</p>
      <Comments
        items={(data?.comments ?? []).map((c) => ({
          id: c.id,
          author: c.createdByName ?? (c.fromStaff ? "Your team" : "A colleague"),
          body: c.explainsStepKey ? `Why a step takes longer, ${c.body}` : c.body,
          timestamp: new Date(c.createdAt).toLocaleDateString(),
        }))}
        composer="inline"
        onSend={busy ? undefined : (body: string) => void add(body)}
      />
    </div>
  )
}
