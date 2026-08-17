"use client"

// WHAT ONE APP HAS GIVEN BACK — hours, and what those hours are worth
// (CHECKLIST 8.13, Aurora's ap3 over the owner's "client rate times hours").
//
// HER MODEL, SAID ONCE: each process names the ROLE that does it, each role has
// a rate, and the figure is the hours that role no longer spends times that
// rate. Before minus after. The hours half is the savings arithmetic every other
// screen already shows; this adds the price and the name of whose hour it was.
//
// ITS OWN FILE, AND THAT IS R24 RATHER THAN TIDINESS. The money here is computed
// from the ROLE RATE CARD, which is an internal number — so this component may
// never sit in a file that also reads what a client is charged, the door it
// calls refuses a portal caller, and nothing under web-portal/ may name it. The
// client's own value screen shows the HOURS from a different door with no price
// in it at all.
//
// R25 rides the payload: `caption` comes back with the figure and is rendered
// word for word. A savings number without the sentence that says what it is made
// of is a number nobody should be asked to believe.

import * as React from "react"

import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"

import { tenancy } from "@/lib/api"
import { appMoneyKey } from "@/lib/live-resources"
import type { AppMoneyBack } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { SAVINGS_CAPTION, hoursText } from "@shared/workers/savings"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

export function AppMoneyPanel({ appId }: { appId: string }) {
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

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-sm">{t("Hours given back, every month")}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {hoursText(view.savedSecondsPerMonth)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">{t("What those hours are worth")}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {moneyText(view.moneyCentsPerMonth, null)}
          </p>
          {/* SAID, NEVER HIDDEN. A process with no role, or a role nobody has
              priced, contributes its hours and no money — so a total that left
              work out has to say how much it left out, or it reads as the whole
              answer. */}
          {view.unpricedProcesses > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {view.unpricedProcesses === 1
                ? t("One process has no priced role, so its hours are counted and its money is not.")
                : `${view.unpricedProcesses} ${t("processes have no priced role, so their hours are counted and their money is not.")}`}
            </p>
          )}
        </div>
      </div>

      {/* WHERE IT COMES FROM, process by process — the same drill-down every
          other savings screen offers, with the role and its price added. */}
      <ul className="flex flex-col gap-1.5">
        {view.lines.map((line) => (
          <li
            key={line.processId}
            className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {line.roleName ?? t("No role named")}
            </span>
            <span className="text-sm tabular-nums">{hoursText(line.savedSecondsPerMonth)}</span>
            <span className="text-sm tabular-nums">
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
