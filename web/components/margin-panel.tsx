"use client"

// WHAT THIS ACCOUNT ACTUALLY LEAVES US — revenue, minus our own time, minus what
// the tools cost, with every line of the subtraction on screen.
//
// THE FILE THIS ONE IS NOT. account-rate-card.tsx shows what a client is
// CHARGED, and the portal may show a client their own copy of it. This panel
// shows what our hour COSTS and what is left over, and no client may ever see
// either figure under any flag (SCOPE · R24). The two live in different files on
// both sides of the wire for the same reason: a condition can be inverted, an
// import cannot be forgotten. Nothing in web-portal/ imports this file, and the
// law's check reads that from the import graph rather than taking my word.
//
// EVERY LINE IS SHOWN, NOT JUST THE ANSWER. A margin somebody cannot check is a
// margin they stop believing the first time it looks wrong — the same argument
// impact-panel.tsx makes about a saving, and the reason `lines` comes back off
// the door already computed rather than being assembled here.
//
// It lives on the Rates tab, under the rate card, because "what do we charge
// them" and "what do we keep" are one thought and nobody holds them apart.
//
// AND IT SAYS WHERE THE COST CARD IS. This panel is the one screen in the app
// that spends the internal rate — every line of "our time" is an hour multiplied
// by it — and it named the cost card in a sentence while giving no way to reach
// it. The screen itself was never missing (Settings → Internal rates, with its
// own edit action); the ROUTE to it from the number it explains was. Gated on
// `commercials:edit`, the same right the door behind that screen opens with, so
// nobody is offered a destination they would be refused at.

import * as React from "react"

import { Skeleton } from "@shared/ui/controls/skeleton/skeleton"
import { Banknote } from "@shared/ui/icons"

import { tenancy } from "@/lib/api"
import { InAppLink } from "@/components/in-app-link"
import { marginKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { moneyText } from "@shared/web/money"
import { useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** Logged seconds as a person says them. One decimal place: a line reading
 * "0 hours" beside a cost of 45.00 is the kind of row that makes somebody
 * distrust the column. */
function hoursOf(seconds: number): string {
  const hours = Math.round((seconds / 3600) * 10) / 10
  return `${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`
}

/** One row of the subtraction. `tone` carries whether the figure adds or takes
 * away, because a column of numbers with no sign is a column somebody has to
 * hold in their head. */
function Line({
  label,
  detail,
  cents,
  subtract,
}: {
  label: string
  detail?: string
  cents: number
  subtract?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        {detail && <p className="text-muted-foreground text-xs">{detail}</p>}
      </div>
      {/* No minus sign on a zero. "− 0.00" reads as a negative nothing, which is
          the sort of small wrongness that makes somebody stop trusting the
          column it sits in. A line that takes nothing away just says 0.00. */}
      <span className="shrink-0 text-sm tabular-nums">
        {subtract && cents !== 0 ? "− " : ""}
        {moneyText(cents)}
      </span>
    </div>
  )
}

export function MarginPanel({
  teamId,
  accountId,
  accountName,
}: {
  teamId: string
  accountId: string
  accountName: string
}) {
  const t = useT()
  const { can } = usePermissions(teamId)
  // Cache-first, keyed by the ACCOUNT — the same key the `account_rates`
  // listener drops, so a colleague changing a price moves this figure without a
  // reload. The store revalidates on mount as well, which is what closes the one
  // gap the live registry cannot: an INTERNAL rate is team-wide and its ping
  // cannot name the accounts whose margins it moved (see live-resources.ts).
  const marginQ = useCached(marginKey(accountId), () => tenancy.margin(accountId))

  if (marginQ.error) return <p className="text-destructive text-sm">{t("Couldn't work out the margin.")}</p>
  if (marginQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const m = marginQ.data

  const nothingYet = m.revenueCents === 0 && m.timeCostCents === 0 && m.toolCostCents === 0
  if (nothingYet)
    return (
      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">{t("Nothing to weigh up yet.")}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("Sell")} {accountName} {t("a sprint and log some time against it, and what the work leaves us appears here.")}
        </p>
      </div>
    )

  const down = m.marginCents < 0

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border p-4">
        <p className="text-muted-foreground text-sm">{t("What this account leaves us")}</p>
        <p
          className={`text-2xl font-medium tracking-tight tabular-nums ${down ? "text-destructive" : ""}`}
        >
          {down ? "−" : ""}
          {moneyText(Math.abs(m.marginCents))}
          {m.marginPercent !== null && (
            <span className="text-muted-foreground ml-2 text-base font-normal">
              {m.marginPercent}% of what we charged
            </span>
          )}
        </p>
        {/* The one sentence that keeps this figure honest. Our time is priced off
            the internal rate card, which is an agreed number rather than a
            measured one. Say so here rather than let somebody discover it. */}
        <p className="text-muted-foreground mt-2 text-xs">
          {t("Sold, minus our own time at our internal rates, minus what the tools cost each month. Our time is priced at agreed rates, not measured cost.")}
        </p>
        {/* …and this is the cost card that sentence means. Same shape as the
            "Manage dropdowns" link under a dropdown: small, gated, and it takes
            you to the screen that owns the number rather than explaining where
            it is. */}
        {can("commercials", "edit") && (
          <InAppLink
            href={`/t/${teamId}/internal-rates`}
            className="text-muted-foreground hover:text-foreground mt-2 inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
          >
            <Banknote className="size-3" aria-hidden />
            {t("Change what our hour costs")}
          </InAppLink>
        )}
        {down && (
          <p className="text-destructive mt-2 text-xs">
            {t("This account is costing more than it brings in.")}
          </p>
        )}
      </div>

      <div className="rounded-xl border px-4 py-1">
        <Line label={t("Sold")} detail="Everything priced on this account's sprints" cents={m.revenueCents} />
        {m.lines.map((l) => (
          <Line
            key={l.label}
            label={`Our time, ${l.label}`}
            detail={`${hoursOf(l.seconds)} at ${moneyText(l.centsPerHour)} an hour`}
            cents={l.costCents}
            subtract
          />
        ))}
        <Line
          label={t("Tools")}
          detail="What the systems built for this account cost to run each month"
          cents={m.toolCostCents}
          subtract
        />
      </div>

      {/* The honest refusal. When the work engine's tables aren't in this
          database there is no logged time to subtract, and revenue minus tool
          costs is NOT a margin — it just looks like one. Say which half is
          missing rather than show a confident wrong number. */}
      {!m.loggedTimeAvailable && (
        <p className="text-muted-foreground text-xs">
          {t("Our own time isn't counted in this yet, the work log for this account hasn't been set up, so the figure above is what was sold minus the tools only.")}
        </p>
      )}
    </div>
  )
}
