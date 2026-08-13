// Top-level Meetings page — its own clean URL (/meetings, /meetings/<id>),
// resolving the active team from context like /home. Backed by the SAME
// deep-link host as /t/* (one client-resolved shell); the gateway serves this
// shell for any /meetings/* depth (workers/gateway run_worker_first + the
// /meetings/ rewrite).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function MeetingsPage() {
  return <DeepLinkScreen />
}
