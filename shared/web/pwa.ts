// THE PRODUCT'S IDENTITY, ON EVERY FRONT DOOR — the head metadata, the viewport
// lock, and the install manifest, in one place.
//
// A client installing the portal and a colleague installing the agency app are
// installing the SAME product: same name, same icons, same status-bar tint. That
// is a brand decision, not a coincidence, and it used to be expressed as two
// byte-identical copies — so a rebrand touched two files and half-succeeded the
// first time one was missed. Everything real comes from shared/brand.ts; this
// file is only the shape Next wants it in.

import type { Metadata, MetadataRoute, Viewport } from "next"

import { brand } from "../brand"

/** Head metadata. Icons: a real brand logo (brand.logoUrl) wins when set;
 * otherwise the brand monogram from each app's public/icons/*, which both doors
 * ship under the same names. The PWA install icons live in appManifest below. */
export const appMetadata: Metadata = {
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  // Installed-app titlebar + iOS "Add to Home Screen" identity.
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

/** Lock the viewport: fit the device width and block pinch-zoom, so an installed
 * app feels like a native shell (the design language has no zoomable surfaces). */
export const appViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Tint the browser/status-bar chrome to match the app surface, per mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
}

/** The PWA manifest body — what makes a door installable to a home screen or
 * dock. Each app re-exports it from its own app/manifest.ts with
 * `dynamic = "force-static"`, so the static export emits a plain
 * /manifest.webmanifest for its gateway to serve. */
export function appManifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1112",
    theme_color: "#0e9e86",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
