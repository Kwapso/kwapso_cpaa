"use client"

import { PortalShell } from "@/components/portal-shell"
import { CompanyScreen } from "@/components/company-screen"

export default function CompanyPage() {
  return <PortalShell>{(ready) => <CompanyScreen ready={ready} />}</PortalShell>
}
