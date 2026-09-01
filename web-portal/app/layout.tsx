import { Toaster } from "@shared/ui/components/sonner/sonner"
import { ThemeProvider } from "@shared/web/theme-provider"

import { MarkRuntime } from "@shared/web/mark-runtime"
import { TopLoadingBar } from "@shared/web/top-loading-bar"
import { appMetadata, appViewport } from "@shared/web/pwa"

import { ErrorBoundary } from "@/components/error-boundary"
import { ErrorReporter } from "@/components/error-reporter"
import "./globals.css"

// The portal's identity is the AGENCY's brand — a client is visiting kwapso, not
// a product called "portal". Name, description, icons and the viewport lock come
// from the ONE place both front doors read (shared/web/pwa.ts), so re-skinning
// the base re-skins both doors together or not at all.
export const metadata = appMetadata
export const viewport = appViewport

// Root layout. Deliberately THINNER than the agency app's: no ambient field, no
// assistant host, no install prompt, no version watcher. Every one of those is a
// thing to notice, and the portal's whole job is to have nothing to notice.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // No font variable here — the same deletion as the agency door's layout,
    // and for the same reason: --font-inter was published and never read.
    <html lang="en" suppressHydrationWarning>
      {/* THE QUIET CHIP IS THE WRONG BEIGE — the identical override as
       * `web/app/layout.tsx`, same reasoning, same client correction
       * (2026-08-31, #F7F2EB / `--surface-panel`): `Badge`'s vendored
       * default fill (`variant="secondary"`) is `bg-surface-quiet`, and the
       * portal's own plain pills (company-screen.tsx's "Main contact",
       * impact-screen.tsx) inherit it exactly like the agency door's do. One
       * line here repoints every one of them without touching the vendored
       * `Badge` or any call site; see the agency layout's comment for the
       * full reasoning, including why this stays an app-side override for
       * now rather than a kit edit. The hairline that briefly followed it
       * does NOT — the client rejected an edge on a pill outright on
       * re-review, verbatim "pills no border!" (see the agency layout's
       * comment for the full back-and-forth). The portal has no record
       * header identity row of the agency door's shape, so this rule needs
       * no further special-casing the way `web/components/record-chrome.tsx`
       * does. */}
      <body className="bg-background min-h-[100svh] antialiased [&_[data-slot=badge].bg-surface-quiet]:bg-surface-panel">
        {/* The client's front door opens on the same frame the agency's does —
         * one product, one ident, one animation. FIRST in the body so the
         * animator is published before the parser reaches the loader further
         * down it. shared/web/splash.ts. */}
        <MarkRuntime />
        <ThemeProvider>
          <ErrorReporter />
          {/* THE SAME TOP-OF-PAGE LOADING BAR THE AGENCY DOOR GETS (client
           * feedback, 31 Aug 2026). Not more "noise" this shell rules out
           * above — it reads the identical `useCached` "still waiting"
           * signal the portal's own screen skeletons already draw from
           * (shared/web/top-loading-bar.tsx), so it is the same wait the
           * client is already looking at, just visible a beat earlier and
           * above the fold too. */}
          <TopLoadingBar />
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
