// Top-level Knowledge base page — its own clean URL (/knowledge, /knowledge/<id>),
// resolving the active team from context like /home. Backed by the SAME deep-link
// host as /t/* (one client-resolved shell); the gateway serves this shell for any
// /knowledge/* depth (workers/gateway run_worker_first + the /knowledge/ rewrite).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function KnowledgePage() {
  return <DeepLinkScreen />
}
