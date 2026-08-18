"use client"

// WHAT AN HOUR OF OUR OWN WORK COSTS US — the agency's own cost card.
//
// THIS FILE IS THE AGENCY'S SIDE OF THE FENCE, AND IT HAS NO CLIENT-FACING TWIN.
// SCOPE's ruling is absolute: an internal rate and the margin computed from it
// never render in the portal — "not behind a permission, not behind a feature
// toggle, not for an admin viewing the portal" — and Law R24 makes that a fact
// about the import graph rather than a promise: the doors below all refuse a
// portal caller AT THE DOOR, the portal gateway does not forward them, and the
// build goes red if anything under web-portal/ so much as names them.
//
// So this is a SEPARATE FILE from account-rate-card.tsx on purpose, and it is not
// that file with a flag on it. A condition can be inverted and a permission can
// be granted; a file the client's app never imports cannot be. The worker says
// the same sentence about the same numbers in lib/internal-money.ts — read that
// header before changing anything here.
//
// It is a TAB on the team area (Settings → the team), beside members, roles and
// the dropdown values, because it is the agency's own admin: one small settled
// list of the kinds of work we do and what each costs us. It is gated on
// `commercials` read/create/edit/delete, so a role without that right never sees
// the destination at all.
//
// Nothing is deleted. A rate is RETIRED and stays readable, because a margin
// worked out last quarter has to keep meaning what it meant.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kwapso/ui/registry/primitives/alert-dialog/alert-dialog"
import { Pencil, Plus, Power } from "lucide-react"

import type { InternalRate, RoleRate } from "@shared/types"
import { RateFormDialog, type RateFormValues } from "@/components/rate-form-dialog"
import { RecordActionsMenu } from "@/components/record-chrome"
import { ApiFailure, tenancy } from "@/lib/api"
import { internalRatesKey, roleRatesKey, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { rateText } from "@shared/web/money"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"

export function InternalRateCardScreen({ teamId }: { teamId: string }) {
  const t = useT()
  const ratesQ = useCached<InternalRate[]>(internalRatesKey(teamId), () =>
    tenancy.internalRates().then((r) => {
      // R16: the door's exact COUNT(*), primed by the same fetch that loaded the
      // rows — the team tab strip badges this sidecar, so the number above and
      // the rows here can never disagree.
      primeCache(totalKey("internal_rates", teamId), r.total)
      return r.internalRates
    })
  )
  const { can } = usePermissions(teamId)
  const canCreate = can("commercials", "create")
  const canEdit = can("commercials", "edit")
  const canDeactivate = can("commercials", "delete")

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<InternalRate | null>(null)
  const [deactivating, setDeactivating] = React.useState<InternalRate | null>(null)
  const [busy, setBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const r = await tenancy.internalRates()
    primeCache(totalKey("internal_rates", teamId), r.total)
    primeCache(internalRatesKey(teamId), r.internalRates)
  }, [teamId])

  /** Run a write, say plainly if it was refused, re-read. Returns false on
   * failure so the confirm stays open beside the message rather than closing as
   * if it had happened. The two unique indexes behind this table (one live rate
   * per kind of work, at most one fallback) answer with their own sentences — so
   * "that kind of work already has an internal rate" reaches the person as
   * written, not as "something went wrong". */
  const run = React.useCallback(
    async (what: () => Promise<unknown>, done: string, fallback: string) => {
      setBusy(true)
      try {
        await what()
        await refresh()
        toast.success(done)
        return true
      } catch (err) {
        toast.error(err instanceof ApiFailure ? err.message : fallback)
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  async function add(values: RateFormValues) {
    await tenancy.createInternalRate({
      label: values.label,
      centsPerHour: values.centsPerHour,
      currency: values.currency || undefined,
      isDefault: values.isDefault,
    })
    await refresh()
  }

  async function save(values: RateFormValues) {
    if (!editing) return
    await tenancy.updateInternalRate({
      id: editing.id,
      label: values.label,
      centsPerHour: values.centsPerHour,
      currency: values.currency || null,
      isDefault: values.isDefault,
    })
    await refresh()
  }

  if (ratesQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load the internal rates.")}</p>
  if (ratesQ.data === undefined) return <Skeleton variant="list" lines={4} />
  const rates = ratesQ.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Internal rates")}</h1>
          {/* The sentence that says who may read this, on the screen rather than
              in a doc. Somebody setting these numbers should know before they
              type them, not after. */}
          <p className="text-muted-foreground mt-1 text-sm">
            {t("What an hour of our own work costs us, by kind of work. Ours alone, it never appears in a client's portal, and no client login can reach it.")}
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
            <AddButton label={t("New internal rate")} onClick={() => setAdding(true)} />
          </div>
        )}
      </div>

      {rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("No internal rates yet. Until one is set, an hour of our time counts as costing nothing.")}
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {rates.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                r.active ? "" : "opacity-60"
              }`}
            >
              {/* ONE QUESTION PER PART OF THE ROW (N4). It read `label · rate ·
                  "Used when unnamed" · "Inactive" · Edit · Deactivate`: two facts,
                  two states and two actions in a single left-to-right sweep, and
                  the rule book uses this exact row as its worked example of the
                  "twisted" fault. Split by the question each part answers — the
                  NAME on the left, the PRICE right-aligned in tabular-nums so a
                  column of rates can be compared down the page (T4), the state
                  as one badge after it, and both actions in the row's own menu
                  (B2), confirms untouched. H 6 → 3. */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
              <span className="text-sm tabular-nums">{rateText(r.centsPerHour, r.currency)}</span>
              {!r.active ? (
                <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
                  {t("Inactive")}
                </Badge>
              ) : (
                r.isDefault && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t("Used when unnamed")}
                  </Badge>
                )
              )}
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
                              onSelect: () => setDeactivating(r),
                            }
                          : {
                              key: "activate",
                              label: t("Activate"),
                              icon: <Power className="size-3.5" />,
                              disabled: busy,
                              onSelect: () =>
                                void run(
                                  () => tenancy.setInternalRateActive(r.id, true),
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
        draftKey={`internal-rate:add:${teamId}`}
        title={t("New internal rate")}
        subtitle="What this kind of work costs us for an hour of somebody's time."
        showDefault
        onSubmit={add}
      />
      <RateFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        draftKey={editing ? `internal-rate:edit:${editing.id}` : undefined}
        title={t("Edit internal rate")}
        subtitle="It applies from now on. Figures already worked out keep the rate they were worked out with."
        showDefault
        initial={
          editing
            ? {
                label: editing.label,
                centsPerHour: editing.centsPerHour,
                currency: editing.currency,
                isDefault: editing.isDefault,
              }
            : undefined
        }
        onSubmit={save}
      />

      {/* Red and asks first, like every destructive action in the app — and the
          body says what survives, because nothing here is deleted. */}
      <AlertDialog open={!!deactivating} onOpenChange={(o) => !busy && !o && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Deactivate the")} {deactivating?.label} {t("rate?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("It stops being applied to time from now on. Everything already worked out with it stays exactly as it is, and you can bring it back any time.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                const r = deactivating
                if (!r) return
                void run(
                  () => tenancy.setInternalRateActive(r.id, false),
                  "Rate deactivated.",
                  "Couldn't deactivate that rate."
                ).then((ok) => ok && setDeactivating(null))
              }}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Working…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* THE ROLE RATE CARD, on the same screen (8.13) — see its own header. */}
      <RoleRateCard teamId={teamId} />
    </div>
  )
}

/* ------------------------- what a ROLE's hour is worth --------------------- */

/** THE THIRD RATE CARD (CHECKLIST 8.13) — what an hour of a KIND OF PERSON is
 * worth, which is what Aurora's savings model multiplies the hours saved by.
 *
 * It sits on this screen and not its own, beside the card it is a sibling of:
 * both are INTERNAL and both are one small settled list. R24's fourth clause
 * forbids one component from reading the internal card AND the account card,
 * and it is right to — but two internal cards are one screen's worth of the
 * agency's own housekeeping, and splitting them would have made "what do we pay
 * for an hour?" two destinations.
 *
 * ONE FORM, ONE DOOR, ALL THREE MOVES. The ROLE is the key, so typing a role
 * that already has a price re-prices it, a new one adds it, and Deactivate
 * turns it off. There is no edit dialog because there is nothing to edit that is not the
 * two fields already on the screen.
 */
export function RoleRateCard({ teamId }: { teamId: string }) {
  const t = useT()
  const ratesQ = useCached<RoleRate[]>(roleRatesKey(teamId), () =>
    tenancy.roleRates().then((r) => {
      // R16: the door's exact COUNT(*), primed by the fetch that loaded the rows.
      primeCache(totalKey("role_rates", teamId), r.total)
      return r.roleRates
    })
  )
  const { can } = usePermissions(teamId)
  const canEdit = can("commercials", "edit")

  const [role, setRole] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const r = await tenancy.roleRates()
    primeCache(totalKey("role_rates", teamId), r.total)
    primeCache(roleRatesKey(teamId), r.roleRates)
  }, [teamId])

  async function set(roleName: string, centsPerHour: number, active: boolean, done: string) {
    setBusy(true)
    try {
      await tenancy.setRoleRate({ roleName, centsPerHour, active })
      await refresh()
      toast.success(done)
      return true
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't save that rate.")
      return false
    } finally {
      setBusy(false)
    }
  }

  if (ratesQ.error) return <p className="text-destructive text-sm">{t("Couldn't load the role rates.")}</p>
  if (ratesQ.data === undefined) return <Skeleton variant="list" lines={3} />
  const rates = ratesQ.data
  // Whole units in, whole cents out — the same conversion every price on this
  // screen makes, so nothing can be a hundred times wrong in one place only.
  const cents = Math.round(Number(amount.trim()) * 100)
  const ready = role.trim() !== "" && Number.isFinite(cents) && cents >= 0

  return (
    <div className="flex flex-col gap-4 border-t pt-6">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{t("Role rates")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("What an hour of each role is worth, the bookkeeper, the dispatcher, whoever actually does the work a process describes. This is what turns hours given back into money given back. Ours alone: it never appears in a client's portal.")}
        </p>
      </div>

      {rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("No role rates yet. Until one is set, an app's hours are reported without a money figure beside them.")}
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {rates.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                r.active ? "" : "opacity-60"
              }`}
            >
              {/* The same row as the internal rates above it, so it takes the
                  same treatment: name, price, one state badge, and the actions
                  in the row's menu (N4, B2). */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.roleName}</span>
              <span className="text-sm tabular-nums">{rateText(r.centsPerHour, null)}</span>
              {!r.active && (
                <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
                  {t("Inactive")}
                </Badge>
              )}
              {canEdit && (
                <RecordActionsMenu
                  tone="row"
                  actions={[
                    {
                      key: "edit",
                      label: t("Edit"),
                      icon: <Pencil className="size-3.5" />,
                      disabled: busy,
                      onSelect: () => {
                        setRole(r.roleName)
                        setAmount(String(r.centsPerHour / 100))
                      },
                    },
                    {
                      key: r.active ? "deactivate" : "activate",
                      label: r.active ? t("Deactivate") : t("Activate"),
                      icon: <Power className="size-3.5" />,
                      disabled: busy,
                      destructive: r.active,
                      onSelect: () =>
                        void set(
                          r.roleName,
                          r.centsPerHour,
                          !r.active,
                          r.active ? t("Rate deactivated.") : t("Rate activated.")
                        ),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
            {t("Role")}
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("e.g. Bookkeeper")}
              disabled={busy}
            />
          </label>
          <label className="flex w-32 flex-col gap-1 text-sm">
            {t("An hour")}
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="45"
              disabled={busy}
            />
          </label>
          <Button
            size="sm"
            disabled={busy || !ready}
            onClick={() =>
              void set(role.trim(), cents, true, "Rate saved.").then((ok) => {
                if (ok) {
                  setRole("")
                  setAmount("")
                }
              })
            }
            className="gap-1"
          >
            {busy ? <Spinner /> : <Plus className="size-4" />}
            {t("Save")}
          </Button>
        </div>
      )}
    </div>
  )
}
