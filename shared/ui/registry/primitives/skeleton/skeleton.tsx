// Skeleton — a shimmering placeholder shown while content loads. Use the bare
// `default` for a custom shape (size it with className), or a ready-made
// `variant` that composes into a common shape: a block of `text` lines, a
// `card`, a `media` rectangle, or a `list` of avatar+text rows.

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"

const skeletonVariants = cva("animate-pulse rounded-md bg-muted", {
  variants: {
    variant: {
      default: "",
      text: "h-4 w-full",
      card: "h-40 w-full rounded-xl",
      media: "aspect-video w-full rounded-xl",
      list: "", // composed below (avatar + text rows)
    },
  },
  defaultVariants: { variant: "default" },
})

interface SkeletonProps
  extends React.ComponentProps<"div">, VariantProps<typeof skeletonVariants> {
  /** for `text`/`list`: how many lines/rows to render (default 3). */
  lines?: number
}

function Skeleton({ className, variant, lines = 3, ...props }: SkeletonProps) {
  // `text` → a stack of lines, the last one short (like a real paragraph).
  if (variant === "text") {
    return (
      <div className={cn("flex w-full flex-col gap-2", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              skeletonVariants({ variant: "text" }),
              i === lines - 1 && "w-2/3"
            )}
          />
        ))}
      </div>
    )
  }

  // `list` → rows of a round avatar next to two text lines.
  if (variant === "list") {
    return (
      <div className={cn("flex w-full flex-col gap-4", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={cn(skeletonVariants(), "size-10 rounded-full")} />
            <div className="flex flex-1 flex-col gap-2">
              <div className={cn(skeletonVariants(), "h-4 w-3/4")} />
              <div className={cn(skeletonVariants(), "h-4 w-1/2")} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn(skeletonVariants({ variant }), className)} {...props} />
  )
}

export { Skeleton, skeletonVariants }
