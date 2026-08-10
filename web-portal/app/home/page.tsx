"use client"

import { PortalShell } from "@/components/portal-shell"
import { HomeScreen } from "@/components/home-screen"

export default function HomePage() {
  return <PortalShell>{(ready) => <HomeScreen ready={ready} />}</PortalShell>
}
