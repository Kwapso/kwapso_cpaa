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
  // Tint the browser/status-bar chrome to match the app SURFACE, per mode — so
  // the chrome above the page is the same paper the page is printed on. These
  // are the palette's two page tones written out, because the browser reads this
  // from a meta tag before any stylesheet exists and cannot resolve a token.
  // They were #f5f5f5 and #141414: neutral greys, from no palette at all, and
  // the kit is explicit that a dark surface here is warm unlit paper rather than
  // grey, because a neutral grey reads as a different product.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFEF9" },
    { media: "(prefers-color-scheme: dark)", color: "#141310" },
  ],
}

/** The PWA manifest body — what makes a door installable to a home screen or
 * dock. Each app re-exports it from its own app/manifest.ts with
 * `dynamic = "force-static"`, so the static export emits a plain
 * /manifest.webmanifest for its gateway to serve.
 *
 * IT TAKES THE DOOR, because ruling 09 makes the theme colour TWO values rather
 * than one. It follows the app ICON, not the brand: the client portal is a mango
 * tile with a charcoal isotype, the agency app is a charcoal tile with a mango
 * isotype. So the two doors are deliberately opposite here, and a shared
 * constant could only have been right for one of them.
 *
 * It was `#0e9e86` for both — an off-palette teal inherited from the base this
 * product was forked from, belonging to neither door. */
export function appManifest(door: "agency" | "portal"): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The splash the OS paints while the app starts: the page tone in dark,
    // which is what an installed app opens into.
    background_color: "#141310",
    theme_color: brand.manifestTheme[door],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
