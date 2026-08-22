"use client"

// ProgressDashboard — a curator view: a compact members × items completion grid
// with per-item and per-member rollup counts. The grid scrolls horizontally
// INSIDE its own box (never the page); the member column is sticky. The rollup
// math is the pure `completionStats` (lib/progress), unit-tested.

import * as React from "react"
import { Check } from "lucide-react"

import { completionStats, type ProgressEntry } from "../../../lib/progress"
import { cn } from "../../../lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../primitives/table/table"

export interface ProgressMember {
  id: string
  name: string
}
export interface ProgressItem {
  id: string
  label: string
}

function ProgressDashboard({
  members,
  items,
  done,
  className,
}: {
  members: ProgressMember[]
  items: ProgressItem[]
  /** The completions, as a set of `{ memberId, itemId }`. */
  done: ProgressEntry[]
  className?: string
}) {
  const stats = completionStats(members, items, done)

  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-xl border bg-card",
        className
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 min-w-[10rem] bg-card">
              Member
            </TableHead>
            {items.map((it) => (
              <TableHead key={it.id} className="min-w-[5rem] text-center">
                {it.label}
              </TableHead>
            ))}
            <TableHead className="min-w-[4rem] text-center">Done</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="sticky left-0 z-10 bg-card font-medium">
                {m.name}
              </TableCell>
              {items.map((it) => (
                <TableCell key={it.id} className="text-center">
                  {stats.isDone(m.id, it.id) ? (
                    <Check
                      className="mx-auto size-4 text-success"
                      aria-label="Done"
                    />
                  ) : (
                    <span
                      className="text-muted-foreground/40"
                      aria-label="Not done"
                    >
                      –
                    </span>
                  )}
                </TableCell>
              ))}
              <TableCell className="text-center text-sm text-muted-foreground tabular-nums">
                {stats.perMember[m.id]}/{stats.totalItems}
              </TableCell>
            </TableRow>
          ))}
          {/* per-item rollup */}
          <TableRow className="hover:bg-transparent">
            <TableCell className="sticky left-0 z-10 bg-card text-xs font-medium text-muted-foreground">
              Completed
            </TableCell>
            {items.map((it) => (
              <TableCell
                key={it.id}
                className="text-center text-xs text-muted-foreground tabular-nums"
              >
                {stats.perItem[it.id]}/{stats.totalMembers}
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

export { ProgressDashboard }
