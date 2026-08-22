"use client"

// Tabs — two ways to use it:
//   1. Compositional (shadcn-style): <Tabs><TabsList><TabsTrigger>…  Each
//      TabsTrigger can take a leading `icon`, a trailing `badge` (count/tag),
//      and a `variant` ("pill" | "line").
//   2. Config-driven (Glide-style "Tabs Container"): <TabsView config={...} />
//      where the tabs are defined by a JSON array — label + icon name + badge —
//      so an app (or the live ⚙) can edit them as data.

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { Badge, type BadgeProps } from "../badge/badge"
import { useIsVisible } from "../visibility/visibility"

/* --------------------------- compositional API --------------------------- */

const Tabs = TabsPrimitive.Root

// `max-w-full` + `overflow-x-auto` + `no-scrollbar` = the bar scrolls WITHIN its
// container instead of overflowing it when there are many (or wide) tabs.
const tabsListVariants = cva(
  "no-scrollbar inline-flex h-9 max-w-full items-center overflow-x-auto text-muted-foreground",
  {
    variants: {
      variant: {
        // pill = Glide's "Button" style (a frosted segmented control)
        pill: "gap-1 rounded-lg bg-muted p-1",
        // line = Glide's "Line" style (an underline rail)
        line: "gap-4 border-b",
      },
    },
    defaultVariants: { variant: "pill" },
  }
)

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

// The trailing count/tag pill: a compact rounded chip that stays inside the
// h-9 tab; `min-w-5` keeps single digits circular.
const tabBadgeClass =
  "min-w-5 justify-center rounded-full px-1.5 py-0 text-xs leading-5"

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center gap-1.5 px-3 py-1 text-sm font-medium whitespace-nowrap transition-all hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        pill: "rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        line: "-mb-px h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground",
      },
    },
    defaultVariants: { variant: "pill" },
  }
)

function TabsTrigger({
  className,
  children,
  icon,
  badge,
  badgeVariant,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof tabsTriggerVariants> & {
    /** Optional leading icon (any node). TabsView fills this from a lucide name. */
    icon?: React.ReactNode
    /** Optional trailing pill — a count or short tag, like Glide's tab counts
     *  when a tab leads to a collection. `undefined`/`null` hides it. */
    badge?: React.ReactNode
    /** Badge style. Omit for a neutral count chip that reads on the active AND
     *  inactive tab in light and dark; set "destructive"/"success"/… to colour-code. */
    badgeVariant?: BadgeProps["variant"]
  }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    >
      {icon}
      {children}
      {badge != null && (
        <Badge
          variant={badgeVariant}
          className={cn(
            tabBadgeClass,
            // Default (no variant): a neutral foreground-tinted chip that
            // contrasts on the muted (inactive) AND background (active) surfaces.
            !badgeVariant &&
              "border-transparent bg-foreground/10 text-foreground"
          )}
        >
          {badge}
        </Badge>
      )}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      {...props}
    />
  )
}

/* ----------------------------- config-driven ----------------------------- */

/** One tab, defined as data (Glide's "Tabs Container" item). */
export interface TabItem {
  value: string
  label: string
  /** A STRING is read as a lucide icon name, kebab-case (e.g. "inbox",
   *  "file-pen"), and `""` = no icon — so a tab set stays plain, serialisable
   *  data. Any other node is rendered as-is, for a tab that needs a mark lucide
   *  doesn't have (a product logo, a type glyph, a coloured dot). */
  icon: React.ReactNode
  /** A count or short tag (e.g. "24", "New"). `""` = no badge. */
  badge: string
  /** `""` = neutral count chip; otherwise a Badge variant for a colour-coded tag. */
  badgeVariant: "" | NonNullable<BadgeProps["variant"]>
}

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface TabsConfig extends BaseConfig {
  /** The tabs, as data. Add/remove/reorder = a config change, no code change. */
  tabs: TabItem[]
  /** Glide-style: "pill" (Button) or "line" (Line/underline). */
  variant: "pill" | "line"
  /** Stretch the bar so the tabs share the full width equally. */
  fullWidth: boolean
}

export const defaultTabsConfig: TabsConfig = {
  ...defaultBaseConfig,
  tabs: [],
  variant: "pill",
  fullWidth: false,
}

/**
 * Config-driven Tabs: the bar is defined by `config.tabs` (a data array), with
 * per-tab icons + badge counts/tags, the pill/line style, and optional
 * full-width. Pass `renderPanel` to render the content under each tab.
 */
function TabsView({
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
  /** Optional: render the panel shown under each tab. */
  renderPanel?: (tab: TabItem) => React.ReactNode
  className?: string
}) {
  // Hook must run before any early return so hook order stays stable.
  const visible = useIsVisible(config)
  if (!visible) return null

  const fallback = config.tabs[0]?.value

  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? fallback}
      onValueChange={onValueChange}
      className={className}
    >
      <TabsList
        variant={config.variant}
        className={cn(config.fullWidth && "flex w-full")}
      >
        {config.tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            variant={config.variant}
            className={cn(config.fullWidth && "flex-1")}
            icon={
              typeof t.icon === "string" ? (
                t.icon ? (
                  <DynamicIcon
                    name={t.icon as IconName}
                    fallback={() => null}
                  />
                ) : undefined
              ) : (
                (t.icon ?? undefined)
              )
            }
            badge={t.badge !== "" ? t.badge : undefined}
            badgeVariant={t.badgeVariant !== "" ? t.badgeVariant : undefined}
          >
            {t.label}
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

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsView }
