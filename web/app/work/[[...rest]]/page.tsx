// Top-level Work page — its own clean URL (/work, /work/<storyId>), resolving the
// active team from context like /home. Backed by the SAME deep-link host as /t/*
// (one client-resolved shell); the gateway serves this shell for any /work/*
// depth (workers/gateway run_worker_first + the /work/ rewrite).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export const dynamic = "force-static"

export function generateStaticParams() {
  return [{ rest: [] as string[] }]
}

export default function WorkPage() {
  return <DeepLinkScreen />
}
