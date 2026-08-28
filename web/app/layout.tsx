import { AmbientBackground } from "@shared/ui/components/ambient-background/ambient-background"
import { Toaster } from "@shared/ui/components/sonner/sonner"
import { ThemeProvider } from "@shared/web/theme-provider"
import { MarkRuntime } from "@shared/web/mark-runtime"
import { appMetadata, appViewport } from "@shared/web/pwa"
import { AgentHost } from "@/components/agent-host"
import { ErrorBoundary } from "@/components/error-boundary"
import { ErrorReporter } from "@/components/error-reporter"
import { InstallPrompt } from "@/components/install-prompt"
import { VersionWatch } from "@/components/version-watch"
import "./globals.css"

// Name, description, icons and the viewport lock come from the ONE place both
// front doors read (shared/web/pwa.ts → shared/brand.ts). The PWA install icons
// live in app/manifest.ts, which reads the same file.
export const metadata = appMetadata
export const viewport = appViewport

// Root layout: theme, ambient background, and toasts all come straight from
// the Swift Struck UI library. Every kwapso screen renders inside this shell.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // NO FONT VARIABLE HERE. The typeface is the kit's (Saans, declared as
    // --font-sans by foundations/tokens/tokens.css and picked up by <html>
    // through --default-font-family). This element used to carry a
    // next/font/google Inter class as well, publishing --font-inter — a
    // variable no stylesheet in either front door ever read, so the browser
    // was fetching and holding a whole second typeface that nothing drew.
    <html lang="en" suppressHydrationWarning>
      {/* THE PAGE HAS A GROUND. It did not — this element was
       * `min-h-[100svh] antialiased` and nothing else, and I walked the whole
       * chain in the running app on 2026-08-28: <section> → four <div>s →
       * <main> → two <div>s → <body>, every one `rgba(0,0,0,0)`, with <html>
       * transparent too and no rule in the 209KB compiled stylesheet painting
       * either. So the agency app's page ground was the BROWSER CANVAS: pure
       * white under `color-scheme: light` rather than `--background` #FFFEF9,
       * and whatever the host paints in any embedded view.
       *
       * That is not only a wrong tone, it is what hid a second fault. The kit's
       * surface model is two papers on an off-beige ground, and `--surface-panel`
       * is the tone that is VISIBLE on that ground. On white it is visible too —
       * by accident — which is why a `--surface-panel` card standing on a
       * `--surface-panel` card (screen-renderer's CardGrid, 50 of the knowledge
       * base's 51 cards) looked survivable here and would not have on the ground
       * the kit assumes. The two are one change and land together.
       *
       * The client portal has always done this (web-portal/app/layout.tsx). This
       * is the agency door catching up, one class, same token. */}
      <body className="bg-background min-h-[100svh] antialiased">
        {/* The mark's stylesheet and its animator, FIRST in the body: the
         * animator has to be published before the parser reaches the loader
         * further down, so the mark is already turning when the bundle is still
         * being fetched. There is no overlay here any more and nothing to clear
         * — the loader is the page's own content. shared/web/splash.ts. */}
        <MarkRuntime />
        {/* The kit's theme mechanism: system by default (no attribute on
         * <html>), an explicit choice writes `data-theme` — the ModeToggle
         * (app bar + auth screens) owns it, localStorage remembers it, and
         * the provider's only job is the pre-paint boot script. */}
        <ThemeProvider>
          {/* THE MANGO FIELD, FROM THE KIT. `variant="brand"` is mango
           * softened to a wash with `color-mix` — ruling 26's one permitted use
           * of mango as a fill — and `anchor="fixed"` pins it to the viewport
           * for a whole-page wash rather than to the nearest positioned
           * ancestor. Both are the kit's own names; neither was passed before,
           * so this component has been drawing `variant="default"`, the
           * near-invisible neutral tint, while 115 lines of app CSS tried to
           * draw the real field through a class that is not on this element.
           * globals.css says the rest. */}
          <AmbientBackground variant="brand" anchor="fixed" />
          <ErrorReporter />
          <VersionWatch />
          {/* CONTAINMENT (ERROR-HANDLING.md C1). A thrown RENDER error is not caught
           * by the window.onerror reporter above — that fires for events, not React's
           * render phase — so without this the tree blanks. The boundary wraps the
           * routed screens AND the co-pilot host, which is what the doc has always
           * said; the import sat here unrendered until a lint step noticed. */}
          <ErrorBoundary>
            {children}
            {/* The AI co-pilot rides ABOVE the routed screens (not inside any per-route
             * AppShell), so navigation — including the assistant's own screen-trace —
             * moves the page beneath it without ever closing the panel or dropping the
             * live run. Renders nothing until you're signed in with a team. */}
            <AgentHost />
          </ErrorBoundary>
          <InstallPrompt />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
