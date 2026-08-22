// Card — the frosted surface almost everything else sits on. It owns the `glass`
// and `hover-lift` vocabulary from styles.css, and the `min-w-0` that stops one
// wide child pinning the whole page open. The full reasoning for that class is
// inline below, because three separate bugs traced back to it.

import * as React from "react"

import { cn } from "../../../lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // `glass` = frosted translucent surface; `hover-lift` = the reactive
        // border-glow + gentle lift on hover. Both live in styles.css so the
        // whole library shares one "alive" vocabulary. Pass `hover-lift-none`
        // to opt a nested/static card out of the lift.
        //
        // `min-w-0` is load-bearing: a Card is almost always a grid/flex item,
        // and such an item defaults to `min-width: auto` — it refuses to shrink
        // below its widest child. One wide child (a chart, a table, a long
        // unbroken string) then pins the Card open and the PAGE scrolls
        // sideways, even though the child itself clips correctly. Fixing it
        // here rather than per-consumer means it can't recur every time
        // something wide lands in a Card. (No effect outside flex/grid: for a
        // plain block, `min-width: auto` already computes to 0.)
        "glass hover-lift min-w-0 rounded-xl text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("leading-none font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
