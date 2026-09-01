// Top-level Contacts page — its own clean URL (/contacts), resolving the active
// team from context like /home and /accounts. Backed by the SAME deep-link host
// as /t/* and /accounts (one client-resolved shell); the gateway serves this
// shell for any /contacts/* depth (workers/gateway run_worker_first + the
// /contacts/ rewrite). A contact's own record still opens at /accounts/<id> —
// see the note on `contactsListRecipe` in web/lib/screens.ts for why there is no
// second detail route here.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function ContactsPage() {
  return <DeepLinkScreen />
}
