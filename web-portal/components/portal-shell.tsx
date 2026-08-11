"use client"

// THE PORTAL SHELL — the frame every signed-in screen sits in, and the one place
// the five session states are turned into something to look at.
//
// It is not the agency AppShell with items removed. The agency shell carries a
// team switcher, a module sidebar built from a permission-filtered page
// registry, a section nav with count badges, an assistant launcher and a profile
// menu, because staff live in it. This shell has three destinations, a name, and
// a way out. Three is the whole point: a person who has never used software like
// this can hold three places in their head, and there is no fourth to wonder
// about.
//
// It also owns the live link. One socket on the team channel; every ping goes
// through the portal's own listener registry (lib/live-resources), which knows
// which of the client's screens each resource touches and ignores the rest.

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ModeToggle } from "@kwapso/ui/registry/primitives/mode-toggle/mode-toggle"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { Building2, House, LifeBuoy, LogOut } from "lucide-react"

import { brand } from "@shared/brand"
import { useRealtime } from "@shared/web/realtime"
import { clearAllFormDrafts } from "@shared/web/use-form-draft"
import { invalidate } from "@shared/web/store"
import { reportError } from "@shared/web/log"
import { auth } from "@/lib/api"
import { applyLivePing, cacheKeys, replayAfterReconnect } from "@/lib/live-resources"
import { usePortalSession, type PortalSession } from "@/lib/session"
import { NeedsName } from "@/components/needs-name"
import { NoAccess } from "@/components/no-access"
import { AccountSwitcher } from "@/components/account-switcher"

/** The three places. A client can hold three in their head; a fourth would be a
 * thing to wonder about. */
const DESTINATIONS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/company", label: "My company", icon: Building2 },
] as const

/** What every screen is handed once the shell has decided the person is real and
 * standing somewhere. Nothing is nullable: a screen never has to ask again. */
export type PortalReady = Extract<PortalSession, { state: "ready" }>

export function PortalShell({ children }: { children: (ready: PortalReady) => React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { session, refresh } = usePortalSession()
  /** A company switch is in flight. Held HERE rather than in the switcher because
   * the thing that has to wait is the body, not the menu. */
  const [switching, setSwitching] = React.useState(false)

  // Signed out is a NAVIGATION, not a screen: the sign-in door lives at /login so
  // the address bar always says where you are.
  React.useEffect(() => {
    if (session.state === "signed-out") router.replace("/login")
  }, [session.state, router])

  // The team channel, keyed on WHERE THIS PERSON IS STANDING as well as which
  // team it is. Switching company changes the account fence but not the team, so
  // without the fourth argument the socket was never re-opened: the server had
  // stamped it with the previous company's account set at the handshake and went
  // on filtering the new company's pings out. Everything looked fine and nothing
  // arrived. Passing the account id makes a switch a NEW socket, re-stamped from
  // the session — see useRealtime for why this is a key and never a claim.
  const accountId = session.state === "ready" ? session.currentAccountId : null
  useRealtime(
    session.state === "ready" ? session.teamId : null,
    React.useCallback((e) => applyLivePing(e.resource, accountId), [accountId]),
    React.useCallback(() => replayAfterReconnect(accountId), [accountId]),
    accountId
  )

  if (session.state === "loading" || session.state === "signed-out")
    return (
      <main className="flex min-h-[100svh] items-center justify-center">
        <Spinner />
      </main>
    )

  // Ours, not theirs. Say so, and offer the only useful thing — try again —
  // rather than the sign-in screen, which would read as "you were logged out".
  if (session.state === "unavailable")
    return (
      <main className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">We can&apos;t reach your account</h1>
        <p className="text-muted-foreground">
          Something on our side isn&apos;t responding. Nothing is lost — try again in a moment.
        </p>
        <Button onClick={refresh}>Try again</Button>
      </main>
    )

  if (session.state === "needs-name") return <NeedsName onDone={refresh} />
  if (session.state === "no-access") return <NoAccess email={session.user.email} />

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
      reportError("portal-shell.signOut", e)
      toast.error("We couldn't sign you out. Check your connection and try again.")
      return
    }
    clearAllFormDrafts() // one person's half-typed ticket is never the next one's
    invalidate(cacheKeys.session)
    router.replace("/login")
  }

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 py-3">
          <AccountSwitcher
            accounts={session.accounts}
            currentAccountId={session.currentAccountId}
            onSwitched={refresh}
            onSwitching={setSwitching}
          />
          <div className="flex-1" />
          <ModeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {/* Mid-switch the rows below still belong to the company being left, so
         * they are held back rather than shown under the new company's name.
         * Skeletons in the SHAPE of what's coming — a heading, then request rows
         * — which is how every other wait in this app is drawn (home-screen),
         * not a spinner floating in an empty page. */}
        {switching ? (
          <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
            <span className="sr-only">Switching company…</span>
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : (
          children(session)
        )}
      </main>

      {/* The nav sits at the BOTTOM on a phone, where a thumb is — and it is the
       * same three items on every screen, always in the same order, always
       * showing where you are. Nothing collapses, nothing hides in a menu. */}
      <nav className="bg-background/90 sticky bottom-0 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl">
          {DESTINATIONS.map(({ href, label, icon: Icon }) => {
            const here = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                aria-current={here ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs ${
                  here ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

/** The signed-out frame — the sign-in door and nothing else. Exported so /login
 * and the shell agree on what "not yet" looks like. */
export function PortalDoor({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center gap-8 p-6">
      <div className="fixed right-4 top-4 z-30">
        <ModeToggle />
      </div>
      {children}
      <p className="text-muted-foreground text-xs">{brand.motto}</p>
    </main>
  )
}
