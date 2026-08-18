"use client"

// The Invitations inbox — where the invite email's "Join" button lands. A content
// component rendered inside the one deep-link shell (the shell provides AppShell chrome).

import { InvitationsPanel } from "@/components/invitations"
import type { ActiveTeam } from "@/lib/use-active-team"
import { useT } from "@shared/web/language"

export function InvitationsScreen({ active }: { active: ActiveTeam }) {
  const t = useT()
  return (
    <div className="flex w-full flex-col gap-6">
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {t("Invites waiting for you")}
      </h2>
      <InvitationsPanel active={active} />
    </div>
  )
}
