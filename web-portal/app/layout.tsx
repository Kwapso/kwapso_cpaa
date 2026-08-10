import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { Toaster } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ThemeProvider } from "@kwapso/ui/registry/tokens/theme-provider"
import { brand } from "@shared/brand"

import { BrandTheme } from "@web/components/brand-theme"

import { ErrorBoundary } from "@/components/error-boundary"
import { ErrorReporter } from "@/components/error-reporter"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

// The portal's identity is the AGENCY's brand — a client is visiting kwapso, not
// a product called "portal". Name, description and icons all come from the ONE
// brand file, so re-skinning the base re-skins both front doors together.
export const metadata: Metadata = {
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  icons: brand.logoUrl
    ? { icon: brand.logoUrl, apple: brand.logoUrl }
    : {
        icon: [
          { url: "/icons/icon.svg", type: "image/svg+xml" },
          { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
      },
}

// Fit the device width and block pinch-zoom, so an installed portal feels like a
// native shell. (The base type size is already a step up — see globals.css — so
// nobody needs to pinch to read it.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
}

// Root layout. Deliberately THINNER than the agency app's: no ambient field, no
// assistant host, no install prompt, no version watcher. Every one of those is a
// thing to notice, and the portal's whole job is to have nothing to notice.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-background min-h-[100svh] antialiased">
        <BrandTheme />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ErrorReporter />
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
