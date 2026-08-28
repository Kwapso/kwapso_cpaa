"use client"

// WHAT ONE APP HAS GIVEN BACK — hours, and what those hours are worth
// (CHECKLIST 8.13, Aurora's ap3 over the owner's "client rate times hours").
//
// THE MODEL MOVED ON 25 Aug 2026, and this header is the record. Aurora's ap3
// priced a process by ONE role named on the process, against the internal rate
// card — and then the step work landed: every STEP names a client role whose
// rate is frozen onto it, and the ONE savings seam prices the subtraction
// step by step. For six days both arithmetics ran, and on the owner's screen
// they disagreed — €2,766.35 on the map, 0.00 here, "no role attached" about a
// map with four priced steps. Two ways of computing one number is the defect;
// the seam's way survives because it is the figure the client is shown.
//
// So the panel now reads the seam's money straight off the payload and names
// the one link that can still be missing:
//
//   no priced step   → open the map and say who does its steps
//   some steps bare  → the coverage is said on the row ("4 of 9 steps priced")
//
// STILL A STAFF DOOR. The door refuses a portal caller and nothing under
// web-portal/ names it; the client's own value screen shows hours from its own
// fenced door. Pricing lives where the roles live — the client's record.
//
// R25 rides the payload: `caption` comes back with the figure and is rendered
// word for word. A savings number without the sentence that says what it is made
// of is a number nobody should be asked to believe.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Route } from "@shared/ui/foundations/icons"

import { tenancy } from "@/lib/api"
import { appMoneyKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import type { AppMoneyBack } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { SAVINGS_CAPTION, hoursText } from "@shared/workers/savings"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"


export function AppMoneyPanel({ appId, host }: { appId: string; host: { base: string } }) {
  const t = useT()
  const q = useCached<AppMoneyBack>(appMoneyKey(appId), () => tenancy.appMoney(appId))

  if (q.error) return <p className="text-destructive text-sm">{t("Couldn't work out what this app gives back.")}</p>
  if (q.data === undefined) return <Skeleton variant="list" lines={3} />
  const view = q.data

  if (view.savedSecondsPerMonth === 0 && view.lines.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        {t("Nothing to add up yet. Map a process inside this app, give its steps their times, and the saving appears here.")}
      </p>
    )

  /** The one link that can be missing now: a map none of whose steps carries a
   * rate. Partial coverage is not in this box — it is said on the row, where
   * the number it qualifies is. */
  const unpriced = view.lines.filter((l) => l.moneyCentsPerMonth == null)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-sm">{t("Hours given back, every month")}</p>
          <p className="text-2xl font-medium tabular-nums">
            {hoursText(view.savedSecondsPerMonth)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">{t("What those hours are worth")}</p>
          <p className="text-2xl font-medium tabular-nums">
            {moneyText(view.moneyCentsPerMonth, null)}
          </p>
        </div>
      </div>

      {/* THE MISSING LINK, NAMED, WITH THE DOOR TO IT. Said whether the total is
          zero or merely incomplete: a partial figure that does not say what it
          left out reads as the whole answer, which is the same bug quieter. */}
      {unpriced.length > 0 && (
        <div className="border-border/60 bg-muted/40 flex flex-col gap-4 rounded-[var(--radius)] border p-4">
          <p className="text-sm font-medium">
            {view.moneyCentsPerMonth === 0
              ? t("There is no money figure yet, and here is what it is waiting on.")
              : t("Part of these hours has no price on it yet.")}
          </p>
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              {unpriced.length === 1
                ? t("One map has no role on any of its steps, so there is no rate to price it with.")
                : `${unpriced.length} ${t("maps have no role on any of their steps, so there is no rate to price them with.")}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {unpriced.map((line) => (
                <Button
                  key={line.processId}
                  variant="secondary"
                  size="sm"
                  className="min-w-0 max-w-full gap-1"
                  onClick={() => softNavigate(`${host.base}/processes/${line.processId}`)}
                >
                  <Route className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {t("Say who does")} {line.name}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WHERE IT COMES FROM, process by process — the same drill-down every
          other savings screen offers, with the role and its price added. */}
      <ul className="divide-border divide-y rounded-[var(--radius)] border">
        {view.lines.map((line) => (
          <li
            key={line.processId}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2"
          >
            <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{line.name}</span>
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {/* The money's own coverage, where the number it qualifies is. */}
              {line.pricedSteps === 0
                ? t("no step has a role yet")
                : line.pricedSteps < line.totalSteps
                  ? t("{priced} of {total} steps priced", {
                      priced: String(line.pricedSteps),
                      total: String(line.totalSteps),
                    })
                  : null}
            </span>
            <span className="text-sm tabular-nums whitespace-nowrap">{hoursText(line.savedSecondsPerMonth)}</span>
            <span className="text-sm tabular-nums whitespace-nowrap">
              {line.moneyCentsPerMonth == null ? "—" : moneyText(line.moneyCentsPerMonth, null)}
            </span>
          </li>
        ))}
      </ul>

      {/* R25 — the sentence that makes the number honest, from the one place it
          is written. The payload's own caption first; never assembled here. */}
      <p className="text-muted-foreground text-xs">{view.caption || SAVINGS_CAPTION}</p>
    </div>
  )
}
