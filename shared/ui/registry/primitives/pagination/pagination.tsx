// Pagination — the "1 2 3 … Next" control for stepping through pages of
// results. Built from links/buttons so it works with any router.
//
// It stays on a single, centered line at any size: the nav is a CSS
// *container*, and the Previous/Next text labels collapse to icon-only when
// the container itself is narrow (`@[24rem]`) — so it adapts to the box it's
// dropped into, not the screen width. No wrapping, no overflow.

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "../../../lib/utils"
import { buttonVariants } from "../button/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      className={cn("@container mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex items-center justify-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li {...props} />
}

/** A single page link. `isActive` marks the current page. */
function PaginationLink({
  className,
  isActive,
  ...props
}: React.ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size: "icon",
        }),
        "cursor-pointer",
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      aria-label="Go to previous page"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "cursor-pointer gap-1 @[24rem]:w-auto @[24rem]:px-3",
        className
      )}
      {...props}
    >
      <ChevronLeft />
      <span className="hidden @[24rem]:inline">Previous</span>
    </a>
  )
}

function PaginationNext({ className, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      aria-label="Go to next page"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "cursor-pointer gap-1 @[24rem]:w-auto @[24rem]:px-3",
        className
      )}
      {...props}
    >
      <span className="hidden @[24rem]:inline">Next</span>
      <ChevronRight />
    </a>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
