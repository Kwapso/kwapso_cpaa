"use client"

// /kwapso resolves INSIDE the one deep-link shell (client-resolved from the URL),
// so moving between the Kwapso page and any team screen is soft History-API nav
// with no reload. The content is KwapsoScreen (deep-link-screen.tsx dispatches
// to it). Single level on purpose: the brand library keeps its own records at
// /brand/<id>, so nothing here ever grows a sub-path the gateway would have to
// be told about.

import { DeepLinkScreen } from "@/components/deep-link-screen"

export default function KwapsoPage() {
  return <DeepLinkScreen />
}
