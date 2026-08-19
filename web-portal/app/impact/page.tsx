"use client"

import { PortalShell } from "@/components/portal-shell"
import { ImpactScreen } from "@/components/impact-screen"

export default function ImpactPage() {
  return <PortalShell>{(ready) => <ImpactScreen ready={ready} />}</PortalShell>
}
