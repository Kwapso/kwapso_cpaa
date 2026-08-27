"use client"

// THE PORTAL SHELL — the frame every signed-in screen sits in, and the one place
// the five session states are turned into something to look at.
//
// It is not the agency AppShell with items removed. The agency shell carries a
// team switcher, a module sidebar built from a permission-filtered page
// registry, a section nav with count badges, an assistant launcher and a profile
// menu, because staff live in it. This shell has a short list of destinations, a
// name, and a way out. The shortness is the whole point: a person who has never
// used software like this should be able to hold the whole app in their head.
// The list is DESTINATIONS below, which says what each one had to earn to be on
// it — it has grown twice and it is nearly full.
//
// It also owns the live link. One socket on the team channel; every ping goes
// through the portal's own listener registry (lib/live-resources), which knows
// which of the client's screens each resource touches and ignores the rest.

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@shared/ui/components/button/button"
import { toast } from "@shared/ui/components/sonner/sonner"
import { AppearanceMenu } from "@shared/web/appearance-menu"
import { AmbientBackground } from "@shared/ui/components/ambient-background/ambient-background"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Building2, House, LifeBuoy, LogOut, Package, PiggyBank } from "@shared/ui/foundations/icons"

import { brand } from "@shared/brand"
import { useRealtime } from "@shared/web/realtime"
import { clearAllFormDrafts } from "@shared/web/use-form-draft"
import { clearCache } from "@shared/web/store"
import { reportError } from "@shared/web/log"
import { useT, LanguageProvider } from "@shared/web/language"
import { LanguageMenu } from "@shared/web/language-menu"
import { MarkLoader } from "@shared/web/mark-loader"
import { auth } from "@/lib/api"
import { applyLivePing, PORTAL_SUBSCRIPTIONS, replayAfterReconnect } from "@/lib/live-resources"
import { usePortalSession, type PortalSession } from "@/lib/session"
import { NeedsName } from "@/components/needs-name"
import { NoAccess } from "@/components/no-access"
import { AccountSwitcher } from "@/components/account-switcher"
import { AuthLogotype, AuthPhotograph } from "@/components/auth-artwork"

/** The five places. Three was the rule — a client can hold three in their head —
 * and Value earned the fourth, because it is the one screen that answers the
 * question the whole engagement is judged on. It sits before "My company" for
 * the same reason: what the work is worth is read far more often than an address.
 *
 * DELIVERABLES IS THE FIFTH, and it is the only one of the five that is a place
 * to GO AND FETCH something rather than a thing to read. It sits after Value and
 * before "My company" because that is the order of how often they are wanted: the
 * saving, then the material, then the address. It is deliberately not folded into
 * Home — a client looking for the SOP we wrote them in March is on a errand, and
 * an errand needs a door with a name on it, not a section they have to scroll to
 * remember exists.
 *
 * Five is the ceiling this bar can carry on a phone; a sixth needs a different
 * navigation, not a smaller icon. */
const DESTINATIONS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/tickets", label: "Tickets", icon: LifeBuoy },
  { href: "/impact", label: "Impact", icon: PiggyBank },
  { href: "/deliverables", label: "Deliverables", icon: Package },
  { href: "/company", label: "My company", icon: Building2 },
] as const

/** What every screen is handed once the shell has decided the person is real and
 * standing somewhere. Nothing is nullable: a screen never has to ask again. */
export type PortalReady = Extract<PortalSession, { state: "ready" }>

export function PortalShell({ children }: { children: (ready: PortalReady) => React.ReactNode }) {
  const t = useT()
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
    accountId,
    // ONLY WHAT THIS APP HANDLES. `applyLivePing` already ignored everything else;
    // this stops the channel spending a send on it in the first place.
    PORTAL_SUBSCRIPTIONS
  )

  // THE APP IS STARTING. Not one screen's own wait — nothing is drawn yet and
  // nothing is known yet, including whether there is anything here for this
  // person — so it wears the mark the front door opens on rather than a spinner
  // in an empty page. It is the SAME animation, not a second one wearing the
  // same picture, and it is the one place that proves it: signing in happens
  // long after a cold boot is over, so this wait has to stand up on its own.
  // The mid-switch wait further down is the opposite case and stays a skeleton:
  // the page IS drawn, and what is coming has a shape.
  if (session.state === "loading" || session.state === "signed-out")
    return <MarkLoader label={t("Loading…")} />

  // Ours, not theirs. Say so, and offer the only useful thing — try again —
  // rather than the sign-in screen, which would read as "you were logged out".
  if (session.state === "unavailable")
    return (
      <main className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-2xl font-medium tracking-tight">{t("We can't reach your account")}</h1>
        <p className="text-muted-foreground">
          {t("Something on our side isn't responding. Nothing is lost. Try again in a moment.")}
        </p>
        <Button onClick={refresh}>{t("Try again")}</Button>
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
      toast.error(t("We couldn't sign you out. Check your connection and try again."))
      return
    }
    clearAllFormDrafts() // one person's half-typed ticket is never the next one's
    // The whole cache, not just the session key: every list in it is one
    // company's rows, and none of them is the next person's to see. Same
    // sentence the drafts line above already makes.
    clearCache()
    router.replace("/login")
  }

  return (
    // The whole portal reads one language: the header's own picker, the three
    // screens, and every dialog opened from them. `session.user.language` is
    // already resolved by the time this paints, so there is no flash of English.
    <LanguageProvider value={session.user?.language}>
    <div className="flex min-h-[100svh] flex-col">
      <header className="bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl items-center gap-2 overflow-hidden px-5 py-3">
          <AccountSwitcher
            accounts={session.accounts}
            currentAccountId={session.currentAccountId}
            onSwitched={refresh}
            onSwitching={setSwitching}
          />
          <div className="flex-1" />
          {/* Beside the light/dark toggle, not behind a fourth nav entry: the
           * three destinations below are fixed by design, and a language is the
           * same class of thing as a theme — a personal display preference,
           * wanted from every screen, about nothing in the client's own data. */}
          <LanguageMenu save={(lang) => auth.setLanguage(lang)} />
          {/* BEHIND AN ICON, the same size as the flag beside it. The bare pill
              is three segments wide and did not fit a phone next to the account
              switcher and sign out, which is how this header took the page
              sideways. See shared/web/appearance-menu.tsx. */}
          <AppearanceMenu />
          <Button variant="ghost" size="icon" aria-label={t("Sign out")} onClick={() => void signOut()}>
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* THE ROUTE TRANSITION (motion.css §2) is the `motion-page-in` below, on
       * the SCREEN and never on the header or the bottom nav — they are the same
       * items on every screen and must not restage themselves when the screen
       * under them changes, or every move reads as a full page load. There is no
       * key on it: the portal is one route per page, so the component the shell
       * is handed IS the change.
       *
       * It sits in the false branch of the switch below and nothing else does:
       * switcher-waiting.test.ts reads this file and wants `switching ?` and
       * `children(session)` inside 600 characters of each other, which is its way
       * of saying the flag still gates the body. Keep prose out of that gap. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {/* Mid-switch the rows below still belong to the company being left, so
         * they are held back rather than shown under the new company's name.
         * Skeletons in the SHAPE of what's coming — a heading, then request rows
         * — which is how every other wait in this app is drawn (home-screen),
         * not a spinner floating in an empty page. */}
        {switching ? (
          <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
            <span className="sr-only">{t("Switching company…")}</span>
            <Skeleton className="h-8 w-56 rounded-[var(--radius)]" />
            <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
            <Skeleton className="h-20 w-full rounded-[var(--radius)]" />
          </div>
        ) : (
          <div className="motion-page-in">{children(session)}</div>
        )}
      </main>

      {/* The nav sits at the BOTTOM on a phone, where a thumb is — and it is the
       * same three items on every screen, always in the same order, always
       * showing where you are. Nothing collapses, nothing hides in a menu.
       *
       * THE LABELS WRAP, AND THAT IS NOT A STYLE CHOICE. Five `flex-1` slots on
       * a 375px screen give each label 75px. Measured in this bar's own font
       * (Saans 12.75/500), the last one needs:
       *
       *     en  "My company"        76px   ✗ over by 1
       *     de  "Mein Unternehmen" 112px   ✗ over by 37
       *     ca  "La meva empresa"  102px   ✗ over by 27
       *     es  "Mi empresa"        70px   ✓
       *
       * A bare text node in a `flex-col items-center` is not stretched, so it
       * takes its max-content width and OVERFLOWS the slot — and since
       * `overflow-x: clip` went on the page, that overflow is now cut in
       * silence instead of scrolling. The bar looks finished in English and
       * loses the end of a word in German and Catalan, which is the shape of
       * bug nobody reports because nobody sees it happen.
       *
       * So the label gets a box (`w-full`) it is allowed to wrap inside, and
       * the slot gets `min-w-0` so it can actually be that narrow. A second
       * line costs about 16px of bar height, in the two languages that need
       * one. Nothing is truncated and no word had to be shortened. */}
      <nav className="bg-background sticky bottom-0 border-t">
        <div className="mx-auto flex w-full max-w-3xl px-1">
          {DESTINATIONS.map((dest) => {
            const { label, icon: Icon } = dest
            const here = pathname === dest.href || pathname.startsWith(`${dest.href}/`)
            return (
              <Link
                key={dest.href}
                href={dest.href}
                aria-current={here ? "page" : undefined}
                /* `min-w-0`, and the label in a box of its own — see the note
                   above the bar. Without both, a five-slot `flex-1` row gives
                   every label exactly a fifth of the screen and a longer word
                   simply overflows it. */
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-xs ${
                  here ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-5 shrink-0" />
                <span className="w-full text-center leading-tight">{t(label)}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
    </LanguageProvider>
  )
}

/** The signed-out frame — the sign-in door and nothing else. Exported so /login
 * and the shell agree on what "not yet" looks like.
 *
 * IT IS THE KIT'S SHELL, DRAWN HERE BECAUSE THE KIT'S OWN COPY WILL NOT
 * COMPILE IN THIS APP — and that sentence is the whole of what is bespoke about
 * this file. The arrangement below is composition ch27.16 exactly: "photography
 * left, one column of content right … with the isotype sitting directly above
 * the title where an eyebrow would otherwise go". Every class is copied from
 * `compositions/screens/sign-in.tsx`'s `AuthShell`, token for token — the two
 * halves, the ambient field, the contained photograph at radius 24, the drop to
 * one column below `md`, the body measure on the content column and the fact
 * that the column is centred on the BLOCK axis only. Nothing here was chosen.
 *
 * WHY IT IS NOT SIMPLY `import { AuthShell }`. Tried first, and it fails to
 * BUILD, not to look right: `AuthShell` imports `AuthPhotograph` from
 * `compositions/templates/sign-in.tsx` at module scope, and that file hands a
 * static image import straight to `Image`'s `src`. Under Vite — the kit's own
 * bundler — such an import is a URL string. Under Next it is a
 * `StaticImageData` object, so `npx tsc --noEmit -p web-portal` stops on
 * `templates/sign-in.tsx(208,7): Type 'StaticImageData' is not assignable to
 * type 'string | Blob'`, whether or not the photograph is ever rendered; and
 * the same file's `srcSet` template, plus the two <img> elements in
 * `controls/brand/brand.tsx`, bind that object straight to an image source and
 * would have written "[object Object]" into it if they had run. `auth-artwork.tsx` beside this file carries the
 * evidence and passes the same artwork through `.src`.
 *
 * SO THIS IS A STAND-IN WITH A DELETION DATE. Reported upstream to
 * Kwapso/kwapso-ui-ux rather than patched here, because `shared/ui/` is pinned
 * and a hand-edit turns the build red. The day the kit reads `.src` (or types
 * its asset imports as URLs), this whole function becomes
 * `<AuthShell>{children}</AuthShell>` and `auth-artwork.tsx` goes with it.
 *
 * THERE IS NO THEME CONTROL HERE ANY MORE, and that is the point rather than a
 * removal. A `ModeToggle` used to sit pinned in the top corner of the one
 * screen a client meets before they are anyone — a three-way choice about a
 * preference, in front of somebody who has not yet said who they are, on a page
 * whose whole job is one field and one button. Appearance now follows the
 * reader's own machine, through the token overrides that already do exactly
 * that: `tokens.css` reads `@media (prefers-color-scheme: dark)` on
 * `:root:not([data-theme="light"])`, which is the state where no attribute has
 * been written — and no attribute is what a person who has never chosen has.
 * Nothing here writes one. A client who HAS chosen inside the app keeps their
 * choice (the boot script in `shared/web/theme-provider.tsx` applies it before
 * first paint, on this screen as on every other), and the place to change it
 * stays where a preference belongs: the header of the signed-in app. */
export function PortalDoor({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="bg-background relative grid min-h-dvh w-full min-w-0 gap-[var(--space-6)] p-[var(--space-6)] md:grid-cols-2 lg:gap-[var(--space-7)] lg:p-[var(--space-7)]"
    >
      {/* Ruling 05 · 06: "The mango ambient field stays, scoped to auth, splash
          and portal home." This is auth. */}
      <AmbientBackground variant="brand" />

      {/* THE PICTURE, ON THE INLINE START — half the door, contained at radius
          24, never full-bleed and never behind the type (ch14, ruling 35).
          `hidden` rather than unmounted below `md` on purpose, and it is the
          phone that benefits: the <img> inside is lazy, and a lazy image with
          no layout box is never fetched, so ch27.16's "the image drops" costs a
          phone nothing to obey.

          THE GROUND UNDER IT IS NOT DECORATION. The box is its final size on
          the first frame and the photograph arrives a moment later, so without
          a tone here the door opens on half a page of nothing — which reads as
          a broken screen rather than a loading one. It is the same quiet ground
          the kit's own `Image` primitive holds a picture's place with. */}
      <div className="bg-muted relative hidden min-w-0 overflow-hidden rounded-[var(--radius)] md:block">
        <AuthPhotograph />
      </div>

      {/* THE OTHER HALF — one column of content, centred on the BLOCK axis and
          on no other. Every line inside it ranges left. */}
      <div className="relative flex min-w-0 flex-col justify-center">
        <div className="flex w-full min-w-0 max-w-[var(--measure-body)] flex-col gap-[var(--space-6)]">
          <AuthLogotype />
          {children}
          <p className="text-muted-foreground text-xs">{brand.motto}</p>
        </div>
      </div>
    </main>
  )
}
