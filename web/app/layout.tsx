import { Inter } from "next/font/google"

import { AmbientBackground } from "@kwapso/ui/registry/primitives/ambient-background/ambient-background"
import { Toaster } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ThemeProvider } from "@kwapso/ui/registry/tokens/theme-provider"
import { BrandTheme } from "@shared/web/brand-theme"
import { appMetadata, appViewport } from "@shared/web/pwa"
import { SplashScreen } from "@shared/web/splash-screen"
import { AgentHost } from "@/components/agent-host"
import { ErrorBoundary } from "@/components/error-boundary"
import { ErrorReporter } from "@/components/error-reporter"
import { InstallPrompt } from "@/components/install-prompt"
import { VersionWatch } from "@/components/version-watch"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-[100svh] antialiased">
        {/* FIRST IN THE BODY, and that is the point: the parser paints it before
         * it has read the rest of the document, let alone fetched the bundle. It
         * clears itself after ~3.7s (or on a tap) — shared/web/splash.ts. */}
        <SplashScreen />
        <BrandTheme />
        {/* defaultTheme="system" = follow the device's day/night setting; a
         * ModeToggle (in the app bar + on the auth screens) lets people
         * override it, and next-themes remembers their choice. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AmbientBackground />
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
