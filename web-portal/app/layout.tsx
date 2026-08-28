import { Toaster } from "@shared/ui/components/sonner/sonner"
import { ThemeProvider } from "@shared/web/theme-provider"

import { MarkRuntime } from "@shared/web/mark-runtime"
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
      <body className="bg-background min-h-[100svh] antialiased">
        {/* The client's front door opens on the same frame the agency's does —
         * one product, one ident, one animation. FIRST in the body so the
         * animator is published before the parser reaches the loader further
         * down it. shared/web/splash.ts. */}
        <MarkRuntime />
        <ThemeProvider>
          <ErrorReporter />
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
