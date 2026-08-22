"use client"

// Record detail — the scaffold for a "record detail screen": a header (avatar +
// title/subtitle + an actions slot) above a content area you compose (e.g. a
// TabsView of a DescriptionList + ActivityFeed). Flat by default. This is the
// frame so "a record detail screen" is one library component, not hand-built.

import * as React from "react"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../primitives/avatar/avatar"
import { useIsVisible } from "../../primitives/visibility/visibility"

/* ------------------------------- config ------------------------------- */

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface RecordDetailConfig extends BaseConfig {
  /** "none" = flat (default, no card); "card" = wrap in a bordered surface. */
  surface: "card" | "none"
}

export const defaultRecordDetailConfig: RecordDetailConfig = {
  ...defaultBaseConfig,
  surface: "none",
}

/* ------------------------------ component ------------------------------ */

function RecordDetail({
  title,
  subtitle,
  avatarSrc,
  avatarFallback,
  avatarShape = "circle",
  actions,
  config,
  children,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Optional record image; falls back to `avatarFallback` (e.g. initials).
   *  Pass NEITHER and the header draws no avatar at all — a record with no
   *  picture concept shouldn't open with two letters of its title in a disc. */
  avatarSrc?: string
  avatarFallback?: React.ReactNode
  /** How the image is cropped. Default "circle" (a person). Use "square" for a
   *  company logo or wordmark — a circular crop makes those unreadable. */
  avatarShape?: "circle" | "square"
  /** Right-aligned slot for buttons (edit, delete, share…). */
  actions?: React.ReactNode
  config: RecordDetailConfig
  /** The body — typically a TabsView composing the detail blocks. */
  children?: React.ReactNode
  className?: string
}) {
  if (!useIsVisible(config)) return null

  const hasAvatar = Boolean(avatarSrc || avatarFallback)

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-5",
        config.surface === "card" && "rounded-xl border bg-card p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {hasAvatar && (
            <Avatar
              className={cn(
                "size-12",
                avatarShape === "square" && "rounded-lg"
              )}
            >
              {avatarSrc && <AvatarImage src={avatarSrc} />}
              <AvatarFallback
                className={cn(avatarShape === "square" && "rounded-lg")}
              >
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {subtitle != null && (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions != null && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  )
}

export { RecordDetail }
