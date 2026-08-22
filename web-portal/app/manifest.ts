import type { MetadataRoute } from "next"

import { appManifest } from "@shared/web/pwa"

// The PWA manifest — what makes the portal installable to a home screen. The
// body is the ONE both front doors ship (shared/web/pwa.ts): a client installs
// "kwapso", not "kwapso portal". `force-static` so it emits a plain
// /manifest.webmanifest in the static export the portal gateway serves.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return appManifest("portal")
}
