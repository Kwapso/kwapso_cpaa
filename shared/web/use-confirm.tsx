"use client"

// THE ONE CONFIRM DIALOG EVERY BESPOKE RECORD SCREEN SHARES.
//
// account-detail.tsx, contact-detail.tsx and process-detail.tsx each carried
// an identical `Confirm` type, a `useState<Confirm | null>`, a `run` helper
// (busy + toast + refresh, returns whether it worked) and a bottom
// `<AlertDialog>` block wired to all three — byte for byte the same shape,
// differing only in which door each screen called. Client feedback (31 Aug
// 2026 — "when i do destructive actions it requires confirmation... we
// already built that!") pointed at exactly this: the pattern was right and
// three screens had it; a growing list of others (help-detail.tsx,
// app-detail.tsx, staff-panel.tsx, knowledge-detail.tsx…) had red,
// irreversible-looking buttons with no ask-first step at all. This is that
// pattern, extracted once, so the fourth screen a "destructive" button lands
// on gets it for free.
//
// NOT THE KIT'S `overlays/delete-confirmation.tsx` COMPOSITION. That
// composition's whole premise is IRREVERSIBLE deletion — a `recordNumber`
// baked as a REQUIRED prop into the title's own sentence assembly, escalating
// to a typed-word gate above ten records — where this app's law is
// deactivate-never-delete (CONVENTIONS.md): every confirm this hook renders
// guards a REVERSIBLE action with a Restore/Restore-adjacent path, and half
// this app's records (roles, accounts, members, invites…) carry no number to
// fill that title's slot with even if the premise fit. Recorded as a reasoned
// mismatch in `COMPOSITION_EXEMPT["overlays/delete-confirmation.tsx"]`
// (shared/rules/registry.ts, R45) — this file is what the exemption points
// to as the in-rule alternative: the kit's plain `AlertDialog`
// (`shared/ui/components/alert-dialog`), the same primitive the engine's own
// recipe-driven confirm step (`screen-renderer.tsx`'s `ActionButton`) and the
// deep-link host's URL-driven confirms (`confirm-action.tsx`, `write-panels.tsx`)
// already render through — one component, three call shapes.
//
// THE HOUSE RULE THIS SERVES: a confirm pairs with the DESTRUCTIVE (red)
// colour, not with "archive" as a category. A reversible toggle that stays
// visible and undoes itself one press later (a to-do's Withdraw, a
// deliverable's fade-in-place) is deliberately not styled destructive and
// deliberately carries no confirm — see deliverables-panel.tsx and
// work-panels.tsx's own TodosPanel for the documented reasoning. This hook is
// for the other case: a red action that takes something out of view.

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/components/alert-dialog/alert-dialog"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"
import { ApiFailure } from "@shared/web/api"
import { useT } from "@shared/web/language"

/** A destructive action waiting for a yes. One dialog per screen serves all of
 * them — they differ only in their words and what they run. `run` answers
 * whether it worked, so a refusal leaves the dialog open beside the message
 * rather than closing as if it had happened. */
export type Confirm = {
  title: React.ReactNode
  body: React.ReactNode
  action: React.ReactNode
  run: () => Promise<boolean>
}

/** What a panel borrows from the host that owns the one confirm dialog on its
 * record (ContactsPanel, AccountRateCard, PortalAccessPanel…): ask first, then
 * do it. `done` may be a function because a few callers only know what
 * happened once it has (a portal grant reporting whether the welcome email
 * actually went out) — a plain string still satisfies it for every other
 * caller. */
export type PanelActions = {
  busy: boolean
  ask: (c: Confirm) => void
  act: (
    what: () => Promise<unknown>,
    done: string | (() => string),
    fallback: string
  ) => Promise<boolean>
}

/**
 * One confirm dialog for a whole screen. `refresh` (optional) is called after
 * every write `run` completes successfully — the screen's own cache
 * invalidation, exactly as each of the three original call sites already did.
 *
 * Returns `dialog`, a single element to render once near the bottom of the
 * screen (where the old hand-rolled `<AlertDialog>` block used to sit) — never
 * conditionally, so it can track its own open state from `ask`.
 */
export function useConfirm(refresh?: () => void) {
  const t = useT()
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  const [busy, setBusy] = React.useState(false)

  const ask = React.useCallback((c: Confirm) => setConfirm(c), [])

  /** Run a write, tell the person plainly if it was refused, and re-read.
   * Returns false when it failed, so a confirm dialog can stay open beside
   * the message rather than closing as if it had happened. */
  const run = React.useCallback(
    async (
      what: () => Promise<unknown>,
      done: string | (() => string),
      fallback: string
    ): Promise<boolean> => {
      setBusy(true)
      try {
        await what()
        refresh?.()
        toast.success(typeof done === "function" ? done() : done)
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

  const dialog = (
    <AlertDialog open={!!confirm} onOpenChange={(o) => !busy && !o && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("Cancel")}</AlertDialogCancel>
          {/* RED, ALWAYS — client correction, 2026-08-31, verbatim: "not
              everywhere, if its red it's destructive... in the confirmation
              screen, the archive/cancel whatever destructive action on
              confirmation screen, make the button red." This hook's own
              docblock already scopes it to exactly that case ("a red action
              that takes something out of view"), so every `useConfirm`
              dialog IS a destructive confirm — the kit's `AlertDialogAction`
              defaults to `variant="default"` (mango), which is the
              non-destructive brand fill this hook never draws. One `variant`
              here fixes every call site rather than 13. */}
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              const c = confirm
              if (!c) return
              void c.run().then((ok) => ok && setConfirm(null))
            }}
          >
            {busy ? <Spinner /> : null}
            {busy ? t("Working…") : confirm?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, busy, ask, run, dialog }
}
