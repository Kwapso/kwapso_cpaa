import type { MetadataRoute } from "next"

import { brand } from "@shared/brand"

// The PWA manifest — what makes the portal installable to a home screen. Same
// brand, same icons as the agency app: a client installs "kwapso", not "kwapso
// portal". `force-static` so it emits a plain /manifest.webmanifest in the
// static export the portal gateway serves.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
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
