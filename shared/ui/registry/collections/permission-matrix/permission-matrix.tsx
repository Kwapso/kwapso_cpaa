"use client"

// PermissionMatrix — the access-rights grid for editing what a role can do
// (Glide-style role permissions). It is GENERAL: the app passes its own list of
// modules via `config.modules`, so the same control works for any app.
//
// Rows are the app's modules. Columns are the four fixed rights:
//   Read · Create · Edit · Delete
// Each cell is an on/off toggle. The component is config-driven and data-bound,
// so it lives in the collections layer and is built entirely from primitives.
//
// The pure logic (applyToggle, cellState, the types) lives in ./logic so it can
// be unit tested without React; we re-export it here so apps import everything
// from one place.

import * as React from "react"
import { Lock } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Badge } from "../../primitives/badge/badge"
import { Switch } from "../../primitives/switch/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../primitives/table/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../primitives/tooltip/tooltip"
import { useIsVisible } from "../../primitives/visibility/visibility"
import {
  applyToggle,
  cellState,
  RIGHTS,
  type PermissionMatrixConfig,
  type PermissionMatrixValue,
  type Right,
} from "./logic"

// Re-export the pure logic + types so consumers import from the component.
export {
  applyToggle,
  cellState,
  rightsFor,
  emptyRights,
  defaultPermissionMatrixConfig,
  type PermissionMatrixConfig,
  type PermissionMatrixValue,
  type RightSet,
  type Right,
  type CellState,
} from "./logic"

/* ------------------------------ component ------------------------------ */

export interface PermissionMatrixProps {
  config: PermissionMatrixConfig
  value: PermissionMatrixValue
  onChange: (next: PermissionMatrixValue) => void
  className?: string
}

const READ_REQUIRED_HINT = "Read is required to create, edit, or delete"

function PermissionMatrix({
  config,
  value,
  onChange,
  className,
}: PermissionMatrixProps) {
  // useIsVisible must run before any early return so hook order stays stable.
  const visible = useIsVisible(config)

  // Only edit mode ever calls onChange; read/locked are fully inert.
  function handleToggle(moduleKey: string, right: Right, on: boolean) {
    if (config.mode !== "edit") return
    if (cellState(config, value, moduleKey, right).disabled) return
    onChange(applyToggle(value, moduleKey, right, on, config.autoFlipRead))
  }

  if (!visible) return null

  const locked = config.mode === "locked"
  // Flat ("none") drops the card surface; the sticky module column then fills
  // with bg-background (not bg-card) so it stays opaque over scrolled cells.
  const stickyFill = config.surface === "card" ? "bg-card" : "bg-background"

  return (
    // Self-provide the tooltip context so the matrix is a true drop-in — apps
    // never need a TooltipProvider at their root just to render this grid.
    <TooltipProvider>
      <div
        className={cn(
          "animate-rise w-full overflow-hidden",
          config.surface === "card" && "rounded-xl border bg-card",
          className
        )}
      >
        {/* The Table primitive already provides horizontal overflow; the module
          column is sticky so the four rights scroll under it on narrow screens. */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn("sticky left-0 z-10 min-w-[8rem]", stickyFill)}
              >
                <span className="inline-flex items-center gap-2">
                  Module
                  {locked && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" aria-hidden />
                      Locked
                    </Badge>
                  )}
                </span>
              </TableHead>
              {RIGHTS.map((r) => (
                <TableHead
                  key={r.key}
                  className="w-[4.75rem] min-w-[4.75rem] text-center"
                >
                  {r.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {config.modules.map((m) => (
              <TableRow key={m.key}>
                <TableCell
                  className={cn("sticky left-0 z-10 font-medium", stickyFill)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {locked && (
                      <Lock
                        className="size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    {m.label}
                  </span>
                </TableCell>

                {RIGHTS.map((r) => {
                  const st = cellState(config, value, m.key, r.key)
                  // In view-only modes the switch is truly disabled. A Read cell
                  // that's locked-on (edit mode) stays focusable via aria-disabled
                  // so screen readers reach it and hear the tooltip.
                  const ariaLabel = st.lockedOn
                    ? `${r.label} — ${m.label} (locked on; Read is required for write access)`
                    : `${r.label} — ${m.label}`

                  const control = (
                    <Switch
                      checked={st.checked}
                      disabled={config.mode !== "edit"}
                      aria-disabled={st.disabled || undefined}
                      aria-label={ariaLabel}
                      onCheckedChange={(on) => handleToggle(m.key, r.key, on)}
                    />
                  )

                  return (
                    <TableCell key={r.key} className="text-center">
                      {st.lockedOn ? (
                        // The Tooltip trigger is the wrapping span (not the Switch):
                        // Radix would otherwise overwrite the Switch's own
                        // data-state, breaking its on/off styling. The Switch keeps
                        // its descriptive aria-label so the lock reaches SR users.
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-center gap-1.5">
                              {control}
                              <Lock
                                className="size-3 text-muted-foreground"
                                aria-hidden
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{READ_REQUIRED_HINT}</TooltipContent>
                        </Tooltip>
                      ) : (
                        control
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}

            {config.modules.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={RIGHTS.length + 1}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No modules configured.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}

export { PermissionMatrix }
