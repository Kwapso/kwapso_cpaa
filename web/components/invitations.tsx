"use client"

// The invites inbox — invites the signed-in person has RECEIVED (by email).
// The fix for "I was invited but have no way to see/accept it": this works for
// ANY signed-in user, not just a teamless one at onboarding. Accepting joins the
// team AND makes it active (the locked "join + switch" choice). Cache-first via
// useCached, with one shared key so the page, the Settings section and the
// switcher badge all stay in sync.
//
// ONE WORD, "INVITE" (shared/glossary.ts), on both lists: this RECEIVED one and
// the SENT one in the team section, which used to read Invitations and Invites.
// Neither English word carries direction, so the direction rides the line around
// it ("Invites waiting for you") rather than a second noun. The route, the cache
// key and this filename keep the longer spelling on purpose — every invite email
// already sent deep-links to /invitations, and a rename would break those.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { List } from "@shared/web/list-compat"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { toast } from "@shared/ui/components/sonner/sonner"

import type { ReceivedInvite } from "@shared/types"
import { ApiFailure, tenancy } from "@/lib/api"
import { letterMark } from "@/lib/identity"
import { softNavigate } from "@/lib/nav"
import { primeCache, useCached } from "@shared/web/store"
import { useT } from "@shared/web/language"

/** The signed-in person's pending received invitations. Shared cache key so the
 * inbox page, the Settings section and the switcher badge stay in lock-step. */
export function useReceivedInvites() {
  return useCached<ReceivedInvite[]>("invitations", () =>
    tenancy.receivedInvitations().then((r) => r.invitations)
  )
}

/** `refresh` is all this panel ever needed from ActiveTeam — narrowed so the
 * ONBOARDING page (which has no team context yet, by definition) can mount it:
 * the round-two review found the teamless screen telling people to ask for an
 * invite while the only surface that could ACCEPT one bounced them back here. */
export function InvitationsPanel({ refresh }: { refresh: () => Promise<void> }) {
  const t = useT()
  const invitesQ = useReceivedInvites()
  const invites = invitesQ.data
  const [accepting, setAccepting] = React.useState<string | null>(null)

  async function accept(inv: ReceivedInvite) {
    setAccepting(inv.id)
    try {
      const res = await tenancy.acceptInvitation(inv.id)
      primeCache("invitations", res.invitations)
      // Join + switch: refresh reloads the context, whose active team is now the
      // one just joined.
      await refresh()
      toast.success(`Joined ${inv.teamName}`)
      if (res.invitations.length === 0) softNavigate("/home")
    } catch (err) {
      toast.error(
        err instanceof ApiFailure ? err.message : t("Couldn't accept the invite.")
      )
    } finally {
      setAccepting(null)
    }
  }

  if (invitesQ.error)
    return <p className="text-destructive text-sm">{t("Couldn't load your invites.")}</p>
  if (invites === undefined) return <Skeleton variant="list" lines={2} />

  // Library List (flat surface + a fill to match the design language, per
  // BUILD-A-SCREEN §6.1 — separation is a fill or an inset shadow, never a
  // stroke). Rows aren't clickable — the trailing Accept button is the only
  // action.
  return (
    <List
      surface="none"
      className="rounded-[var(--radius)] bg-surface-panel"
      empty={t("No invites waiting for you.")}
      items={invites.map((inv) => ({
        id: inv.id,
        image: inv.teamLogoUrl,
        imageAlt: inv.teamName,
        initials: letterMark(inv.teamName),
        title: inv.teamName,
        subtitle: "Invited to join this team.",
        trailing: (
          <Button
            size="sm"
            onClick={() => void accept(inv)}
            disabled={accepting !== null}
            className="gap-1"
          >
            {accepting === inv.id ? <Spinner /> : null}
            {accepting === inv.id ? t("Joining…") : t("Accept")}
          </Button>
        ),
      }))}
    />
  )
}
