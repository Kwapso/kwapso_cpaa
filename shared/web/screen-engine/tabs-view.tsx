"use client"

// TabsView — the config-driven tab strip. ENGINE-OWNED, KIT-DRAWN.
//
// The OLD library's TabsView took a `TabsConfig` (tabs as data, with icons,
// counts and visibility rules) and 21 call sites plus the screen engine feed
// it that way. The kit's own TabsView takes an `items` array instead, so this
// file keeps the old CONTRACT and renders it entirely through the kit's
// `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` — behaviour is the
// app's, every pixel is the kit's.
//
// Two deliberate translations, both the kit's rulings rather than ours:
//  · `variant: "pill"` no longer exists (kit tabs are `line` | `folder`; the
//    review ruled pill was a segmented control wearing a tab's name). A config
//    asking for "pill" renders `line`.
//  · Counts and tags are QUIET TEXT, never badges — ch14: "counts are quiet,
//    never badges". The old `badgeVariant` colour is therefore not drawn.
//
// Icons: a TabItem carries a lucide icon NAME as serialisable data. The kit's
// icons export the same names (PascalCase), so the name is resolved against
// the kit's own set; a name the kit lacks renders no icon rather than
// throwing, same contract as the old DynamicIcon fallback.

import * as React from "react"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/controls/tabs/tabs"
import * as KitIcons from "@shared/ui/icons"
import { cn } from "@shared/ui/lib/utils"

import { type BaseConfig, defaultBaseConfig } from "./config"
import { useIsVisible } from "./visibility"

export interface TabItem {
  value: string
  label: string
  /** A STRING is read as an icon name, kebab-case (e.g. "inbox", "file-pen"),
   *  and `""` = no icon — a tab set stays plain, serialisable data. Any other
   *  node is rendered as-is. */
  icon: React.ReactNode
  /** A count or short tag (e.g. "24", "New"). `""` = none. Rendered as quiet
   *  tabular text per the kit's ch14, whatever `badgeVariant` says. */
  badge: string
  /** Kept for config compatibility; the kit rules that counts are quiet text,
   *  so the colour is no longer drawn. */
  badgeVariant: "" | "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface TabsConfig extends BaseConfig {
  tabs: TabItem[]
  /** "line" | "folder" are the kit's; "pill" is accepted and drawn as "line". */
  variant: "pill" | "line" | "folder"
  fullWidth: boolean
}

export const defaultTabsConfig: TabsConfig = {
  ...defaultBaseConfig,
  tabs: [],
  variant: "line",
  fullWidth: false,
}

/** kebab-case name → the kit's PascalCase icon component, or null. */
export function kitIcon(name: string): React.ReactNode {
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())
  const Icon = (KitIcons as Record<string, unknown>)[pascal]
  return typeof Icon === "function" || (typeof Icon === "object" && Icon !== null)
    ? React.createElement(Icon as React.ComponentType<{ size?: number }>, { size: 16 })
    : null
}

export function TabsView({
  config,
  value,
  defaultValue,
  onValueChange,
  renderPanel,
  className,
}: {
  config: TabsConfig
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  renderPanel?: (tab: TabItem) => React.ReactNode
  className?: string
}) {
  // Hook must run before any early return so hook order stays stable.
  const visible = useIsVisible(config)
  if (!visible) return null

  const variant = config.variant === "pill" ? "line" : config.variant
  const fallback = config.tabs[0]?.value

  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? fallback}
      onValueChange={onValueChange}
      variant={variant}
      className={className}
    >
      <TabsList className={cn(config.fullWidth && "flex w-full")}>
        {config.tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className={cn(config.fullWidth && "flex-1")}
          >
            {typeof t.icon === "string" ? (t.icon ? kitIcon(t.icon) : null) : (t.icon ?? null)}
            {t.label}
            {t.badge !== "" && (
              <span className="text-micro tabular-nums text-ink-secondary">{t.badge}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {renderPanel &&
        config.tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {renderPanel(t)}
          </TabsContent>
        ))}
    </Tabs>
  )
}
