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

import type { InternalRate } from "@shared/types"
import { RateFormDialog, type RateFormValues } from "@/components/rate-form-dialog"
import { ApiFailure, tenancy } from "@/lib/api"
import { internalRatesKey, totalKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { rateText } from "@shared/web/money"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

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
  const canRetire = can("commercials", "delete")

  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<InternalRate | null>(null)
  const [retiring, setRetiring] = React.useState<InternalRate | null>(null)
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Internal rates")}</h1>
          {/* The sentence that says who may read this, on the screen rather than
              in a doc. Somebody setting these numbers should know before they
              type them, not after. */}
          <p className="text-muted-foreground mt-1 text-sm">
            {t("What an hour of our own work costs us, by kind of work. Ours alone — it never appears in a client's portal, and no client login can reach it.")}
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
            <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
              <Plus className="size-4" />
              {t("New internal rate")}
            </Button>
          </div>
        )}
      </div>

      {rates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("No internal rates yet. Until one is set, an hour of our time counts as costing nothing.")}
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
              {r.isDefault && (
                <Badge variant="secondary" className="text-[10px]">
                  {t("Used when unnamed")}
                </Badge>
              )}
              {!r.active && (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  {t("Retired")}
                </Badge>
              )}
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
                      onClick={() => setRetiring(r)}
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
                        void run(
                          () => tenancy.setInternalRateActive(r.id, true),
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
        draftKey={`internal-rate:add:${teamId}`}
        title={t("New internal rate")}
        subtitle="What this kind of work costs us for an hour of somebody's time."
        submitLabel={t("Add it")}
        showDefault
        onSubmit={add}
      />
      <RateFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        draftKey={editing ? `internal-rate:edit:${editing.id}` : undefined}
        title={t("Edit internal rate")}
        subtitle="It applies from now on. Figures already worked out keep the rate they were worked out with."
        submitLabel={t("Save")}
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
      <AlertDialog open={!!retiring} onOpenChange={(o) => !busy && !o && setRetiring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Retire the")} {retiring?.label} {t("rate?")}</AlertDialogTitle>
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
                const r = retiring
                if (!r) return
                void run(
                  () => tenancy.setInternalRateActive(r.id, false),
                  "Rate retired.",
                  "Couldn't retire that rate."
                ).then((ok) => ok && setRetiring(null))
              }}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Working…" : "Retire"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
