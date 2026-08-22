"use client"

// Stakeholders on a ticket — the people kept in the loop: the raiser, your team's
// admins, anyone @mentioned, plus people manually added. ADD-ONLY by design — you
// can pull a teammate in, but no one is ever removed (and there's no assignee).
// Gated by help:read (seeing a ticket lets you involve a teammate). Library primitives.

import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/registry/primitives/avatar/avatar"
import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import { UserPlus } from "lucide-react"

import type { HelpStakeholder } from "@shared/types"
import type { PickablePerson } from "@/lib/members"
import { ApiFailure } from "@/lib/api"
import { letterMark } from "@/lib/identity"
import { useT } from "@shared/web/language"
import { AddButton } from "@/components/deep-link/screen-bits"
import { RecordPicker } from "@/components/record-picker"

const ORIGIN_LABEL: Record<HelpStakeholder["origin"], string> = {
  raiser: "Raiser",
  admin: "Admin",
  mentioned: "Mentioned",
  added: "Added",
}

export function HelpStakeholders({
  stakeholders,
  members,
  canAdd,
  onAdd,
}: {
  stakeholders: HelpStakeholder[]
  /** Our own staff only — the caller narrows through the one people seam, so a
   * client contact can never be offered here (web/lib/members.ts). */
  members: PickablePerson[]
  canAdd: boolean
  onAdd: (userId: string) => Promise<void>
}) {
  const t = useT()
  const [picked, setPicked] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const existing = new Set(stakeholders.map((s) => s.userId))
  const addable = members.filter((m) => !existing.has(m.id))

  async function add() {
    if (!picked) return
    setBusy(true)
    try {
      await onAdd(picked)
      setPicked("")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't add them to the ticket."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("Everyone kept in the loop on this ticket, the person who raised it, your admins, and anyone mentioned.")}</p>

      {stakeholders.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("Just the person who raised it and your admins so far.")}</p>
      ) : (
        <ul className="divide-border divide-y rounded-xl border">
          {stakeholders.map((s) => (
            <li
              key={s.userId}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Avatar className="size-8">
                {s.imageUrl && <AvatarImage src={s.imageUrl} alt="" />}
                <AvatarFallback>{letterMark(s.name || s.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name || s.email}</p>
                <p className="text-muted-foreground truncate text-xs">{s.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {ORIGIN_LABEL[s.origin]}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {canAdd && addable.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <RecordPicker
            value={picked}
            onChange={setPicked}
            options={addable.map((m) => ({ value: m.id, label: m.name, picture: m.photo, shape: "round" as const }))}
            placeholder={t("Pick someone to keep in the loop")}
            searchPlaceholder={t("Search members…")}
            emptyText={t("Nobody here matched.")}
            disabled={busy}
            className="w-full sm:w-64"
          />
          <AddButton label={t("Add stakeholder")} onClick={() => void add()} icon={<UserPlus className="size-4" />} />
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {t("You can add members, but no one is ever removed.")}
      </p>
    </div>
  )
}
