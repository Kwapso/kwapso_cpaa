"use client"

import { PortalShell } from "@/components/portal-shell"
import { DeliverablesScreen } from "@/components/deliverables-screen"

export default function DeliverablesPage() {
  return <PortalShell>{() => <DeliverablesScreen />}</PortalShell>
}
