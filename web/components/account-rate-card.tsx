"use client"

// WHAT THIS ACCOUNT IS CHARGED — the rate card, on the account's own record.
//
// It is a tab rather than a page because a rate card is not a thing anybody goes
// looking for on its own: the question is always "what do we charge Bergman",
// and Bergman is a record. So it sits beside their contacts and their apps, on
// the screen somebody is already on when the question comes up.
//
// THE OTHER CARD IS A DIFFERENT FILE, AND THAT IS THE LAW. What we charge a
// client and what our own hour costs us are the same shape and opposite
// audiences (SCOPE · R24): this one MAY be shown to a client through the
// portal's own value door when their price visibility is on; the internal one
// never leaves the agency, under any flag, ever. Two numbers with opposite
// audiences do not share a file, a door, a table or a screen — see
// internal-rate-card.tsx, which is deliberately not this file with a flag on it.
//
// Nothing here is deleted. A rate is RETIRED and stays readable, because what an
// account was charged last year has to stay true.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Pencil, Power } from "lucide-react"

import type { AccountRate } from "@shared/types"
import { RateFormDialog, type RateFormValues } from "@/components/rate-form-dialog"
import type { PanelActions } from "@/components/account-detail-panels"
import { tenancy } from "@/lib/api"
import { ratesKey, totalKey } from "@/lib/live-resources"
import { rateText } from "@shared/web/money"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"

/** One account's card. Keyed by the ACCOUNT (`rates:<id>`) — the same key the
 * live registry's `account_rates` listener drops, so a colleague setting a price
 * lands on this panel without a reload. */
export function AccountRateCard({
  accountId,
  accountName,
  canCreate,
  canEdit,
  canRetire,
  actions: { busy, ask, act },
}: {
  accountId: string
  accountName: string
  canCreate: boolean
  canEdit: boolean
  canRetire: boolean
  /** the host's confirm + write verbs — one confirm dialog on the record */
  actions: PanelActions
}) {
  const t = useT()
  const ratesQ = useCached<AccountRate[]>(ratesKey(accountId), () =>
    tenancy.accountRates(accountId).then((r) => {
      // R16: the door's exact COUNT(*), primed by the same fetch that loaded the
      // rows, so the tab badge above and the rows here are one answer.
      primeCache(totalKey("account-rates", accountId), r.total)
      return r.rates
    })
  )
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<AccountRate | null>(null)

  /** Re-read this card after our own write. (Everybody else's catches up from
   * the ping — see the `account_rates` entry in live-resources.) */
  const refresh = React.useCallback(async () => {
    const r = await tenancy.accountRates(accountId)
    primeCache(totalKey("account-rates", accountId), r.total)
    primeCache(ratesKey(accountId), r.rates)
  }, [accountId])

  async function add(values: RateFormValues) {
    await tenancy.createAccountRate({
      accountId,
      label: values.label,
      centsPerHour: values.centsPerHour,
      currency: values.currency || undefined,
    })
    await refresh()
  }

  async function save(values: RateFormValues) {
    if (!editing) return
    await tenancy.updateAccountRate({
      id: editing.id,
      label: values.label,
      centsPerHour: values.centsPerHour,
      currency: values.currency || null,
    })
    await refresh()
  }

  if (ratesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the rates.")}</p>
  if (ratesQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const rates = ratesQ.data

  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddButton label={t("New rate")} onClick={() => setAdding(true)} />
        </div>
      )}

      {rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("No rates set for")} {accountName} {t("yet, nothing is being charged by the hour.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rates.map((r) => (
            <li
              key={r.id}
              className={`border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                r.active ? "" : "opacity-60"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
              <span className="text-sm tabular-nums">{rateText(r.centsPerHour, r.currency)}</span>
              {!r.active && (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  {t("Retired")}
                </Badge>
              )}
              {/* ml-auto on the GROUP so a narrow phone reflows instead of
                  clipping the leftmost button off the edge (UI-CONVENTIONS §4). */}
              <span className="ml-auto flex shrink-0 gap-1">
                {canEdit && r.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setEditing(r)}
                    className="gap-1.5"
                  >
                    <Pencil className="size-3.5" />
                    {t("Edit")}
                  </Button>
                )}
                {canRetire &&
                  (r.active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        ask({
                          title: `Retire the ${r.label} rate?`,
                          body: "It stops being offered on new work. What has already been charged at it stays exactly as it is, and you can bring it back any time.",
                          action: "Retire",
                          run: () =>
                            act(
                              () => tenancy.setAccountRateActive(r.id, false).then(refresh),
                              "Rate retired.",
                              "Couldn't retire that rate."
                            ),
                        })
                      }
                      className="text-destructive hover:text-destructive gap-1.5"
                    >
                      <Power className="size-3.5" />
                      {t("Retire")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => tenancy.setAccountRateActive(r.id, true).then(refresh),
                          "Rate restored.",
                          "Couldn't restore that rate."
                        )
                      }
                      className="gap-1.5"
                    >
                      <Power className="size-3.5" />
                      {t("Restore")}
                    </Button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <RateFormDialog
        open={adding}
        onOpenChange={setAdding}
        draftKey={`account-rate:add:${accountId}`}
        title={t("New rate")}
        subtitle={`What ${accountName} is charged for an hour of this kind of work.`}
        onSubmit={add}
      />
      <RateFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        draftKey={editing ? `account-rate:edit:${editing.id}` : undefined}
        title={t("Edit rate")}
        subtitle="Changing it affects what is charged from now on, not what has already been charged."
        initial={
          editing
            ? { label: editing.label, centsPerHour: editing.centsPerHour, currency: editing.currency }
            : undefined
        }
        onSubmit={save}
      />
    </div>
  )
}
