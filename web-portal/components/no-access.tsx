"use client"

// "You're signed in, and there is nothing here for you."
//
// This screen is the visible face of the hardest rule in the product: INVITE-ONLY
// IS ABSOLUTE — signing in never creates access, the invite does (SCOPE ch.06).
// A system that enforces that rule silently looks broken; a system that softens
// it isn't enforcing it. So this says the true thing, in the fewest words that
// still tell someone what to do next.
//
// What it must NOT do:
//   • Offer a way in. There is no "request access" button, because access is a
//     decision someone at the agency makes about a person they know.
//   • Guess why. We know the login worked and the world is empty; we do not know
//     whether the grant is pending, revoked, or was never made. Saying the wrong
//     reason is worse than saying none.
//   • Look like an error. Nothing is broken. Their login is fine.

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { LogOut } from "lucide-react"

import { brand } from "@shared/brand"
import { clearAllFormDrafts } from "@web/lib/use-form-draft"
import { invalidate } from "@web/lib/store"
import { reportError } from "@web/lib/log"
import { auth } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"

export function NoAccess({ email }: { email: string }) {
  async function signOut() {
    // The session cookie is HttpOnly, so ONLY the server's Set-Cookie clears it.
    // Swallowing a failed sign-out wipes the local state, redirects, and looks
    // exactly like success — while the cookie survives. On a shared device the
    // next person lands on the home screen still signed in as the last one. So
    // it is reported, and the person is told plainly rather than shown a door
    // they did not actually walk through.
    try {
      await auth.logout()
    } catch (e) {
      reportError("no-access.signOut", e)
      toast.error("We couldn't sign you out. Check your connection and try again.")
      return
    }
    clearAllFormDrafts()
    invalidate(cacheKeys.session)
    location.assign("/login")
  }

  return (
    <main className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re signed in</h1>
      <p className="text-muted-foreground">
        There&apos;s nothing here for <span className="text-foreground">{email}</span> yet. Someone at{" "}
        {brand.name} needs to switch your access on before your company&apos;s work shows up.
      </p>
      <p className="text-muted-foreground text-sm">
        Ask whoever you work with here, and try again after they&apos;ve done it.
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        <LogOut className="size-3.5" />
        Sign out
      </Button>
    </main>
  )
}
