"use client"

// "Manage choices" — a small link shown beneath a dropdown that jumps to
// Settings → Choices (formerly "Dropdown values"), where you add or edit
// options. Shown ONLY to people who can create or edit dropdown values; a
// read-only member can't act on it, so it stays hidden for them. Your form draft
// survives the navigation (CACHING.md §11), so you can add an option and return to a
// still-filled form.
//
// REPOINTED 2026-09-01, the day Choices moved off the team area's own tab
// strip and into Settings: the old `/t/<teamId>/dropdowns` address still
// resolves (nothing there broke), but this link is exactly the kind of
// "duplicate, orphaned entry point" the move was meant to close, so it now
// opens the one door Settings itself offers — `?tab=choices`, the same
// `initialTab` mechanism the Kwapso screen's own `?tab=` already uses.

import { Settings2 } from "@shared/ui/foundations/icons"

import { usePermissions } from "@/lib/perms"
import { InAppLink } from "@/components/in-app-link"
import { useT } from "@shared/web/language"

export function ManageDropdownsLink({ teamId }: { teamId: string | null }) {
  const t = useT()
  const { can } = usePermissions(teamId)
  const allowed = !!teamId && (can("selectable_data", "create") || can("selectable_data", "edit"))
  if (!allowed) return null
  return (
    <InAppLink
      href="/settings?tab=choices"
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
    >
      <Settings2 className="size-3" aria-hidden />
      {t("Manage choices")}
    </InAppLink>
  )
}
