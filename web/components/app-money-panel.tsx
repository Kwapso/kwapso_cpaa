"use client"

// WHAT ONE APP HAS GIVEN BACK — hours, and what those hours are worth
// (CHECKLIST 8.13, Aurora's ap3 over the owner's "client rate times hours").
//
// HER MODEL, SAID ONCE: each process names the ROLE that does it, each role has
// a rate, and the figure is the hours that role no longer spends times that
// rate. Before minus after. The hours half is the savings arithmetic every other
// screen already shows; this adds the price and the name of whose hour it was.
//
// A CHAIN OF THREE LINKS, AND EACH ONE CAN BE MISSING. process → role → rate.
// The money is only ever as complete as the weakest link, and when a link is
// missing the arithmetic is not wrong — it is silent. The owner opened this tab
// and reported "I was able to see hours, but I was not able to see money given
// back": the figure was there, it said 0.00, and nothing on the screen said why
// or what to do about it. A blank where a number should be is the bug, so this
// panel now names the missing link per process and links to the screen that
// closes it:
//
//   no role named      → open the map and say who does the work
//   role, no rate      → put an hourly cost against that role on Internal rates
//   rate of zero       → priced, deliberately, at nothing (the honest zero)
//
// Every one of those is read off the `lines` the door already sends — `roleName`
// and `centsPerHour` are in the payload and this screen simply never looked at
// the second one. No new door, no new field.
//
// ITS OWN FILE, AND THAT IS R24 RATHER THAN TIDINESS. The money here is computed
// from the ROLE RATE CARD, which is an internal number — so this component may
// never sit in a file that also reads what a client is charged, the door it
// calls refuses a portal caller, and nothing under web-portal/ may name it. The
// client's own value screen shows the HOURS from a different door with no price
// in it at all. That is also why the fixes below are LINKS INTO THIS APP and
// never a rate typed here: pricing a role is the rate card's job.
//
// R25 rides the payload: `caption` comes back with the figure and is rendered
// word for word. A savings number without the sentence that says what it is made
// of is a number nobody should be asked to believe.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Banknote, Route } from "lucide-react"

import { tenancy } from "@/lib/api"
import { appMoneyKey } from "@/lib/live-resources"
import { softNavigate } from "@/lib/nav"
import type { AppMoneyBack } from "@shared/types"
import { moneyText } from "@shared/web/money"
import { SAVINGS_CAPTION, hoursText } from "@shared/workers/savings"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** One process line's money, in the four states it can actually be in. Derived
 * from the two fields the door sends about the chain, so the screen and the
 * arithmetic can never disagree about which link is missing. */
type Priced =
  | { kind: "priced" }
  /** Nobody has said whose hours this takes. */
  | { kind: "no-role" }
  /** A role is named and the rate card has no live price for it. */
  | { kind: "no-rate"; roleName: string }
  /** Priced, at nothing. Legal, and worth saying out loud rather than showing a
   * zero that looks exactly like a broken one. */
  | { kind: "free"; roleName: string }

function priced(line: AppMoneyBack["lines"][number]): Priced {
  if (!line.roleName) return { kind: "no-role" }
  if (line.centsPerHour == null) return { kind: "no-rate", roleName: line.roleName }
  if (line.centsPerHour === 0) return { kind: "free", roleName: line.roleName }
  return { kind: "priced" }
}

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

  const states = view.lines.map((line) => ({ line, state: priced(line) }))
  const roleless = states.filter((s) => s.state.kind === "no-role")
  const rateless = states.filter((s) => s.state.kind === "no-rate")
  // The names, not the count: "Bookkeeper and Dispatcher have no rate" is a
  // sentence somebody can act on; "2 processes are unpriced" is a sentence they
  // have to go and investigate. Deduped — two maps often share one role.
  const unpricedRoles = [
    ...new Set(rateless.map((s) => (s.state as { roleName: string }).roleName)),
  ]

  return (
    <div className="flex flex-col gap-6">
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
        </div>
      </div>

      {/* THE MISSING LINK, NAMED, WITH THE DOOR TO IT. Said whether the total is
          zero or merely incomplete: a partial figure that does not say what it
          left out reads as the whole answer, which is the same bug quieter. */}
      {(roleless.length > 0 || unpricedRoles.length > 0) && (
        <div className="border-border/60 bg-muted/40 flex flex-col gap-4 rounded-xl border p-4">
          <p className="text-sm font-medium">
            {view.moneyCentsPerMonth === 0
              ? t("There is no money figure yet, and here is what it is waiting on.")
              : t("Part of these hours has no price on it yet.")}
          </p>

          {roleless.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                {roleless.length === 1
                  ? t("One process has no role attached, so there is no rate to price it with.")
                  : `${roleless.length} ${t("processes have no role attached, so there is no rate to price them with.")}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {roleless.map(({ line }) => (
                  <Button
                    key={line.processId}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => softNavigate(`${host.base}/processes/${line.processId}`)}
                  >
                    <Route className="size-3.5" />
                    {t("Say who does")} {line.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {unpricedRoles.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                {t("No hourly cost is set for:")} {unpricedRoles.join(", ")}
              </p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => softNavigate(`${host.base}/internal-rates`)}
                >
                  <Banknote className="size-3.5" />
                  {t("Price a role")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WHERE IT COMES FROM, process by process — the same drill-down every
          other savings screen offers, with the role and its price added. */}
      <ul className="flex flex-col gap-2">
        {states.map(({ line, state }) => (
          <li
            key={line.processId}
            className="border-border/60 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {/* The role, or the reason there is no money on this row. Each one
                  is a fact about a different link in the chain, so each gets its
                  own words — "No role named" was the only one that had any. */}
              {state.kind === "no-role"
                ? t("No role named")
                : state.kind === "no-rate"
                  ? `${line.roleName} · ${t("no rate set")}`
                  : state.kind === "free"
                    ? `${line.roleName} · ${t("priced at nothing")}`
                    : line.roleName}
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
