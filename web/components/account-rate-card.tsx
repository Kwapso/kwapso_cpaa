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

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Pencil, Power } from "@shared/ui/foundations/icons"
import { ShapeStateBody } from "@shared/ui/compositions/states/states"

import type { AccountRate } from "@shared/types"
import { RateFormDialog, type RateFormValues } from "@/components/rate-form-dialog"
import type { PanelActions } from "@/components/account-detail-panels"
import { tenancy } from "@/lib/api"
import { ratesKey, totalKey } from "@/lib/live-resources"
import { rateText } from "@shared/web/money"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"
import { RecordActionsMenu } from "@/components/record-chrome"

/** One account's card. Keyed by the ACCOUNT (`rates:<id>`) — the same key the
 * live registry's `account_rates` listener drops, so a colleague setting a price
 * lands on this panel without a reload. */
export function AccountRateCard({
  accountId,
  accountName,
  canCreate,
  canEdit,
  canDeactivate,
  actions: { busy, ask, act },
}: {
  accountId: string
  accountName: string
  canCreate: boolean
  canEdit: boolean
  canDeactivate: boolean
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

  if (ratesQ.error)
    return (
      <ShapeStateBody
        shape="recordChrome"
        state="error"
        copy={{ errorTitle: t("Couldn't load the rates.") }}
        action={
          <Button variant="secondary" onClick={() => ratesQ.refresh()}>
            {t("Try again")}
          </Button>
        }
      />
    )
  if (ratesQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const rates = ratesQ.data

  return (
    <div className="flex flex-col gap-4">
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
        <ul className="divide-border divide-y rounded-[var(--radius)] bg-surface-panel">
          {rates.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                r.active ? "" : "opacity-60"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
              <span className="text-sm tabular-nums">{rateText(r.centsPerHour, r.currency)}</span>
              {!r.active && (
                <Badge variant="secondary" className="text-muted-foreground text-badge">
                  {t("Inactive")}
                </Badge>
              )}
              {/* The third of the three rate rows, and the same fix as the other
                  two: facts on the line, the state as a badge, both actions in
                  the row's own menu (N4, B2). The confirm on Deactivate travels
                  with the action into the menu — moving a destructive act never
                  removes the question it asks first. It also settles the
                  narrow-phone note this row used to carry: one trigger cannot
                  clip a second one off the edge. */}
              <RecordActionsMenu
                tone="row"
                actions={[
                  ...(canEdit && r.active
                    ? [
                        {
                          key: "edit",
                          label: t("Edit"),
                          icon: <Pencil className="size-3.5" />,
                          disabled: busy,
                          onSelect: () => setEditing(r),
                        },
                      ]
                    : []),
                  ...(canDeactivate
                    ? [
                        r.active
                          ? {
                              key: "deactivate",
                              label: t("Deactivate"),
                              icon: <Power className="size-3.5" />,
                              disabled: busy,
                              destructive: true,
                              onSelect: () =>
                                ask({
                                  title: `${t("Deactivate the")} ${r.label} ${t("rate?")}`,
                                  body: t(
                                    "It stops being offered on new work. What has already been charged at it stays exactly as it is, and you can bring it back any time."
                                  ),
                                  action: t("Deactivate"),
                                  run: () =>
                                    act(
                                      () => tenancy.setAccountRateActive(r.id, false).then(refresh),
                                      t("Rate deactivated."),
                                      t("Couldn't deactivate that rate.")
                                    ),
                                }),
                            }
                          : {
                              key: "activate",
                              label: t("Activate"),
                              icon: <Power className="size-3.5" />,
                              disabled: busy,
                              onSelect: () =>
                                void act(
                                  () => tenancy.setAccountRateActive(r.id, true).then(refresh),
                                  t("Rate activated."),
                                  t("Couldn't activate that rate.")
                                ),
                            },
                      ]
                    : []),
                ]}
              />
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
