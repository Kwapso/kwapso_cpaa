// Top-level Marketing page — its own clean URL (/marketing, /marketing/<id>), resolving the
// active team from context like /home. Backed by the SAME deep-link host as /t/*
// (one client-resolved shell); the gateway serves this shell for any /marketing/*
// depth (workers/gateway run_worker_first + the /marketing/ rewrite).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function MarketingPage() {
  return <DeepLinkScreen />
}
