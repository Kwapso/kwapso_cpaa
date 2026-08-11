// Top-level Tickets page — its own clean URL (/tickets, /tickets/<id>), resolving
// the active team from context like /home. Backed by the SAME deep-link host as
// /t/* (one client-resolved shell); the gateway serves this shell for any
// /tickets/* depth.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function TicketsPage() {
  return <DeepLinkScreen />
}
