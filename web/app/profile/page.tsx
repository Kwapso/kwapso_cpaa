"use client"

// /profile resolves INSIDE the one deep-link shell (client-resolved from the URL) — so
// moving between your own page and any team screen is soft History-API nav, no reload.
// The content is ProfileScreen (deep-link-screen.tsx dispatches to it).

import { DeepLinkScreen } from "@/components/deep-link-screen"

export default function ProfilePage() {
  return <DeepLinkScreen />
}
