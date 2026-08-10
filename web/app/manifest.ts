import type { MetadataRoute } from "next"

import { appManifest } from "@shared/web/pwa"

// The PWA manifest — what makes the app installable to a home screen / dock.
// The body is the ONE both front doors ship (shared/web/pwa.ts): a client
// installing the portal and a colleague installing this app install the same
// product. `force-static` so it emits a plain /manifest.webmanifest in the
// static export the gateway serves.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return appManifest()
}
