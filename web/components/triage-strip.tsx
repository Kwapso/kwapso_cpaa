"use client"

// THE TRIAGE STRIP — one line above the ticket list: whose week it is, and how
// many requests nobody has read yet (.plans/BUILD-1 §6).
//
// It sits ABOVE the list rather than in a screen of its own because it is not a
// screen's worth of information — it is the sentence a person needs before they
// look at the list, and a page they have to go and open is a page nobody opens.
//
// INTERNAL ONLY. The client portal has no such strip and never will: "a request
// of yours has been sitting untouched for four days" is the service-level promise
// §6 says this feature is explicitly not making. The door it reads refuses a
// client login, so this is defended at the door and not by the component.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { AlarmClock, UserCheck } from "lucide-react"

import { RecordPicker } from "@/components/record-picker"
import { ApiFailure, content as contentApi, tenancy } from "@/lib/api"
import { triageKey } from "@/lib/live-resources"
import type { TeamMember } from "@shared/types"
import { invalidate, useCached } from "@shared/web/store"
import { assignableMembers } from "@/lib/people"

type Triage = Awaited<ReturnType<typeof contentApi.triage>>

export function TriageStrip({ teamId, canSetDuty }: { teamId: string; canSetDuty: boolean }) {
  const triageQ = useCached<Triage>(triageKey(teamId), () => contentApi.triage())
  const membersQ = useCached<TeamMember[]>(`members:${teamId}`, () =>
    tenancy.members().then((r) => r.members)
  )
  // Triage duty is OURS to be on — the one seam decides who can hold it
  // (lib/people), so a client login never appears in this list.
  const onDutyCandidates = assignableMembers(membersQ.data)
  const [picking, setPicking] = React.useState(false)

  const t = triageQ.data
  if (!t) return null

  async function assign(userId: string) {
    try {
      await contentApi.setTriageDuty(userId)
      invalidate(triageKey(teamId))
      setPicking(false)
      toast.success("Triage duty set for this week.")
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't set that.")
    }
  }

  // Nothing waiting AND somebody named is the quiet, ordinary state — one short
  // line, no colour, no call to action.
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5">
        <UserCheck className="size-3.5 shrink-0" />
        {t.onDuty?.userName ? (
          <>
            <strong>{t.onDuty.userName}</strong> is on triage this week
          </>
        ) : (
          <span className="text-muted-foreground">Nobody is on triage this week</span>
        )}
        {t.total > 0 && (
          <span className="text-destructive ml-2 flex items-center gap-1">
            <AlarmClock className="size-3.5" />
            {t.total} waiting to be read
            {t.waiting[0] ? `, the oldest ${t.waiting[0].days} days` : ""}
          </span>
        )}
      </span>
      {canSetDuty &&
        (picking ? (
          <RecordPicker
            ariaLabel="Who is on triage duty"
            value=""
            onChange={assign}
            options={onDutyCandidates.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="Pick who's on duty"
            searchPlaceholder="Search people…"
            emptyText="Nobody here matched."
            className="w-56"
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            {t.onDuty ? "Change" : "Put somebody on duty"}
          </Button>
        ))}
    </div>
  )
}
