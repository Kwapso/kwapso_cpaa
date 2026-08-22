"use client"

// Breadcrumbs — the data-driven, COLLAPSING trail for the screen engine's
// deep-link spine. Hand it an array of crumbs; on small screens a long trail
// collapses to first · …(dropdown) · last-two so it never grows wide enough to
// scroll the page. Composed from the existing breadcrumb primitives + a dropdown
// menu; the collapse math is the pure `collapseCrumbs` (lib/recipe), unit-tested.

import * as React from "react"
import { MoreHorizontal } from "lucide-react"

import { collapseCrumbs } from "../../../lib/recipe"
import { safeHref } from "../../../lib/url"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../breadcrumb/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu/dropdown-menu"

export interface BreadcrumbDatum {
  label: string
  /** Omit on the current (last) crumb; present crumbs are links. */
  href?: string
}

function CrumbLink({
  item,
  isLast,
  onNavigate,
}: {
  item: BreadcrumbDatum
  isLast: boolean
  onNavigate?: (href: string) => void
}) {
  if (isLast || !item.href) {
    return <BreadcrumbPage>{item.label}</BreadcrumbPage>
  }
  return (
    <BreadcrumbLink
      href={safeHref(item.href)}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault()
          onNavigate(item.href as string)
        }
      }}
    >
      {item.label}
    </BreadcrumbLink>
  )
}

/** A flat trail with separators (used as-is, or as the desktop view). */
function Trail({
  items,
  onNavigate,
  className,
}: {
  items: BreadcrumbDatum[]
  onNavigate?: (href: string) => void
  className?: string
}) {
  return (
    <BreadcrumbList className={className}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <React.Fragment key={i}>
            <BreadcrumbItem>
              <CrumbLink item={item} isLast={isLast} onNavigate={onNavigate} />
            </BreadcrumbItem>
            {!isLast && <BreadcrumbSeparator />}
          </React.Fragment>
        )
      })}
    </BreadcrumbList>
  )
}

function Breadcrumbs({
  items,
  collapseAfter = 3,
  onNavigate,
  className,
}: {
  items: BreadcrumbDatum[]
  /** Collapse the middle when there are more than this many crumbs. */
  collapseAfter?: number
  /** When set, links call this instead of navigating (host owns the router). */
  onNavigate?: (href: string) => void
  className?: string
}) {
  if (items.length === 0) return null

  const c = collapseCrumbs(items, collapseAfter)
  if (!c.collapsed) {
    return (
      <Breadcrumb className={className}>
        <Trail items={items} onNavigate={onNavigate} />
      </Breadcrumb>
    )
  }

  // Long trail: full on md+ (wraps), collapsed first · …(menu) · last-two below.
  return (
    <Breadcrumb className={className}>
      <Trail items={items} onNavigate={onNavigate} className="hidden md:flex" />
      <BreadcrumbList className="flex md:hidden">
        <BreadcrumbItem>
          <CrumbLink item={c.lead[0]} isLast={false} onNavigate={onNavigate} />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Show hidden steps"
              className="flex size-7 items-center justify-center rounded-xl transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {c.middle.map((m, i) => (
                <DropdownMenuItem key={i} asChild>
                  <a
                    href={safeHref(m.href)}
                    onClick={(e) => {
                      if (onNavigate && m.href) {
                        e.preventDefault()
                        onNavigate(m.href)
                      }
                    }}
                  >
                    {m.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {c.tail.map((item, i) => {
          const isLast = i === c.tail.length - 1
          return (
            <React.Fragment key={i}>
              <BreadcrumbItem>
                <CrumbLink
                  item={item}
                  isLast={isLast}
                  onNavigate={onNavigate}
                />
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export { Breadcrumbs }
