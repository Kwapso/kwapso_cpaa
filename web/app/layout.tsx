import { AmbientBackground } from "@shared/ui/components/ambient-background/ambient-background"
import { Toaster } from "@shared/ui/components/sonner/sonner"
import { ThemeProvider } from "@shared/web/theme-provider"
import { MarkRuntime } from "@shared/web/mark-runtime"
import { TopLoadingBar } from "@shared/web/top-loading-bar"
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
// the Kwapso UI library. Every kwapso screen renders inside this shell.
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
      {/* THE QUIET CHIP IS THE WRONG BEIGE — client, 2026-08-31, pointing at
       * a Contact's "Contact"/"Can sign in" pills and the assistant panel's
       * quota pill, both screenshotted: "there's a color that you keep
       * getting wrong on the pills. use this color #F7F2EB (the main token
       * for beige)." #F7F2EB is already `--surface-panel` in this palette
       * (tokens.css) — not a new value, the client is naming which of the
       * app's own tokens the pill belongs on. `Badge`'s own default fill
       * (`variant="secondary"`, `shared/ui/components/badge/badge.tsx`) is
       * `bg-surface-quiet` — the kit's documented "quiet chip" tone
       * (`shared/ui/docs/TOKENS.md` §2), a full step darker than
       * `--surface-panel` in light (#E2DDD4 vs #F7F2EB) and a different tone
       * again in dark. Every unqualified `<Badge>` and every explicit
       * `variant="secondary"` in both front doors inherits it — sixty-plus
       * call sites, not one wrong prop, which is why patching call sites
       * would never have stopped the client "keeps getting" this. `Badge` is
       * vendored and pinned (R39; a hand-edit fails `web/test/
       * vendored-kit.test.ts`), so the repoint lives here instead, on the ONE
       * element every screen in this app renders inside: a Badge always
       * carries the kit's own `data-slot="badge"`, and only the quiet
       * variant carries the literal `bg-surface-quiet` utility class (no
       * other variant does), so the selector below repoints exactly that
       * pairing and touches no coloured, destructive, warning, inverse or
       * status-dot badge. `web-portal/app/layout.tsx` carries the identical
       * line for the client portal's own plain badges (e.g. "Main contact").
       * Left as an app-side override rather than a kit edit: the upstream
       * design-mothership doc still calls `--surface-quiet` the deliberate
       * "quiet chip" tone, so this is the client's own live correction to
       * that ruling, not a bug fix, and belongs upstream too (flagged
       * separately) so a future kit pull does not need to relearn it.
       *
       * THE HAIRLINE, ADDED THE SAME DAY AND THEN TAKEN BACK OUT, 2026-08-31.
       * `--surface-panel` (#F7F2EB) sits one faint step off `--background`
       * (#FFFEF9) — 8-14 points a side in RGB — which reads as low contrast
       * the moment a plain pill sits directly on the page ground rather than
       * on a card. The first fix reached for `Card`'s own documented
       * `hairline` case (an inset 1px `--border`) and drew it around every
       * repointed pill. The client rejected that outright on the next
       * review, verbatim: "pills no border!" — an inset hairline is still a
       * STROKE the moment it outlines a pill's whole edge, which is exactly
       * what a pill is never allowed to carry (BUILD-A-SCREEN.md §6.1;
       * separation is a fill or a shading shadow, never an outline). So the
       * hairline is gone from this app-wide rule again: every ordinary pill
       * app-wide (list badges, table badges, the assistant's quota pill,
       * Contact's "Contact"/"Can sign in" pills) reads fine at plain
       * #F7F2EB against its own card or list-row ground with no edge at all
       * — the client only ever re-flagged the ONE place that still read as
       * beige-on-beige after this rule landed, the record header's identity
       * row, because THAT band is transparent and shows the ambient field
       * through rather than sitting on a card (`web/components/
       * record-chrome.tsx`'s `IDENTITY_ROW`, C4). That row now solves its
       * own contrast with a different FILL instead of a border — see its own
       * comment for the token and the reasoning; this rule is untouched for
       * every other Badge in the app. */}
      <body className="bg-background min-h-[100svh] antialiased [&_[data-slot=badge].bg-surface-quiet]:bg-surface-panel">
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
          {/* THE TOP-OF-PAGE LOADING BAR (client feedback, 31 Aug 2026, with a
           * screenshot). Mounted once, here, beside the routed screens rather
           * than inside any one of them — it reads the same global "is a
           * useCached read still waiting" signal every screen's own skeleton
           * already comes from (shared/web/top-loading-bar.tsx), so it never
           * needs its own per-screen wiring and can never disagree with the
           * skeleton it draws beside. */}
          <TopLoadingBar />
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
