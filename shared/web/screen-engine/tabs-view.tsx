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
// Icons: a TabItem carries a lucide icon NAME as serialisable data, resolved
// against the kit's own set first (the drawn art wins where it exists) and the
// full lucide set second — the same fallback CollectionHeading and the nav
// already use, so a tab and the heading beside it can never disagree about
// what a name draws. Before the fallback, "info" and "user" resolved to
// NOTHING here while rendering fine one component up, which is why Overview
// tabs shipped bare while their headings carried art.

import * as React from "react"

import { DynamicIcon, type IconName } from "lucide-react/dynamic"

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
  /**
   * FOLDER, and it is the DEFAULT rather than a per-screen choice.
   *
   * The kit draws the brand's own folder silhouette for a tab strip — chapter
   * 24.3 for tabs and 24.6 for record chrome — so a record's tabs and a
   * collection's tabs are both that shape. This value used to be `line`,
   * written before the folder existed, and sixteen screens then hard-coded
   * `line` on top of it. The result was the folder appearing on three screens
   * and nowhere else, which reads as a design system that does not propagate.
   * It propagated fine; the decision had simply been made sixteen times.
   *
   * THE RULE, so the next strip does not have to guess: a strip that switches
   * between RECORDS or between COLLECTIONS takes the folder and says nothing
   * here. A strip that filters WITHIN one collection is not a folder — it has
   * no card of its own to be attached to — and says `variant: "line"` with a
   * reason beside it. There are two of those, and they are the only two.
   */
  variant: "folder",
  fullWidth: false,
}

/** kebab-case name → the kit's PascalCase icon component where one is drawn,
 * the full lucide set otherwise, and null only for a name neither knows. */
export function kitIcon(name: string): React.ReactNode {
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())
  const Icon = (KitIcons as Record<string, unknown>)[pascal]
  if (typeof Icon === "function" || (typeof Icon === "object" && Icon !== null))
    return React.createElement(Icon as React.ComponentType<{ size?: number }>, { size: 16 })
  return React.createElement(DynamicIcon, { name: name as IconName, size: 16 })
}

/** THE TAB VOCABULARY — one icon per tab identity, wherever it appears.
 *
 * The owner's rule (25 Aug 2026): every folder tab carries an icon, and the
 * same tab means the same icon on every screen — Overview on an account and
 * Overview on a process are one identity wearing one glyph. So the icon is
 * keyed here by the tab's VALUE (stable, untranslated data; the label moves
 * per language) and this table WINS over a call site's own choice, which is
 * what turns "the same everywhere" from a review comment into a property.
 *
 * A value outside the table keeps the call site's icon; a folder tab that
 * would otherwise render bare falls back to the folder glyph, so no strip can
 * ship half-dressed — and the census in web/test/rules.test.ts fails the
 * build when a NEW tab value reaches for that fallback, so the generic glyph
 * is a net under a decision, never the decision. Typed `IconName` so a name
 * lucide cannot draw refuses to compile. */
export const TAB_ICONS: Record<string, IconName> = {
  overview: "info",
  activity: "history",
  // the record kinds, matching CONCEPT_ICON in web/lib/pages.ts word for word
  apps: "app-window",
  companies: "building-2",
  contacts: "contact",
  deliverables: "package",
  impact: "piggy-bank",
  knowledge: "library-big",
  meetings: "calendar-clock",
  sprints: "calendar-range",
  stories: "hammer",
  tickets: "life-buoy",
  time: "timer",
  todos: "inbox",
  versions: "git-branch",
  waves: "layers",
  portal: "key-round",
  rates: "banknote",
  maps: "route",
  // the process record's own strip and its inner view switch
  steps: "list-checks",
  list: "list",
  flow: "workflow",
  compare: "columns-2",
  conversation: "message-square",
  // record-specific sections
  organisation: "network",
  stakeholders: "users-round",
  modules: "blocks",
  permissions: "shield-check",
  source: "file-text",
  files: "paperclip",
  notes: "notebook-pen",
  // the draft review's three lists of proposed records
  roles: "user-cog",
  tools: "wrench",
  // collection filters that appear as strips
  all: "asterisk",
  active: "circle-check",
  inactive: "circle-off",
  archived: "archive",
  week: "calendar-days",
  calendar: "calendar",
  // the agency's own record (the Kwapso screen)
  details: "scroll-text",
  team: "building",
  brand: "palette",
}

/** What a tab actually draws: the vocabulary first, the call site second, and
 * for a folder tab — which is never drawn bare — the folder glyph as the net. */
function tabIcon(t: TabItem, variant: "line" | "folder"): React.ReactNode {
  const named = TAB_ICONS[t.value]
  if (named) return kitIcon(named)
  if (typeof t.icon === "string") {
    if (t.icon) return kitIcon(t.icon)
  } else if (t.icon !== null && t.icon !== undefined) {
    return t.icon
  }
  return variant === "folder" ? kitIcon("folder") : null
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
            {tabIcon(t, variant)}
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
