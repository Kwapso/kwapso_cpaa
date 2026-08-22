// ActionRow — a tappable list row: a leading icon, a title (and optional
// subtitle), and a trailing value or chevron. The building block of Settings
// screens and menus.

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "../../../lib/utils"

export interface ActionRowProps {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-hand content (a value, badge, switch…). Omit + pass onClick to get a chevron. */
  trailing?: React.ReactNode
  onClick?: () => void
  className?: string
}

function ActionRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  className,
}: ActionRowProps) {
  const interactive = Boolean(onClick)

  const inner = (
    <>
      {icon != null && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle != null && (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {trailing != null ? (
        <div className="shrink-0 text-sm text-muted-foreground">{trailing}</div>
      ) : interactive ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  )

  const classes = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
    interactive && "hover:bg-accent",
    className
  )

  return interactive ? (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  ) : (
    <div className={classes}>{inner}</div>
  )
}

export { ActionRow }
