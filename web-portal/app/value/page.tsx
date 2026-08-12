"use client"

import { PortalShell } from "@/components/portal-shell"
import { ValueScreen } from "@/components/value-screen"

export default function ValuePage() {
  return <PortalShell>{(ready) => <ValueScreen ready={ready} />}</PortalShell>
}
