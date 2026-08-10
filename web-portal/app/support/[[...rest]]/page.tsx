// /support           → the list
// /support/<id>      → one request
//
// ONE static shell backs both. Static export cannot prerender unknown ticket
// ids, so this emits a single page (rest: []) and the portal gateway serves that
// same shell for any /support/* depth — which is what makes a ticket link in an
// email open the right request instead of a 404 (the static-export reload trap,
// EDGE-CASES.md). The id is therefore read from `window.location`, not from
// route params: the params belong to the prerendered shell and are always empty.
//
// Same shape as the agency app's /t/* catch-all: a server page that emits the
// shell, and a client component that resolves the real address.

import { SupportRoute } from "@/components/support-route"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function SupportPage() {
  return <SupportRoute />
}
