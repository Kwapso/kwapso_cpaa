"use client"

// Container — the layout wrapper that everything else nests inside. It owns the
// BACKGROUND surface (none/card/dark/light/image) and the STACKING (vertical =
// stacked, horizontal = side-by-side columns). This is how you lay components
// out horizontally vs vertically and turn a card background on/off — Glide-style,
// where layout lives on the container, not on each child.

import * as React from "react"

import { type ContainerConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { useIsVisible } from "../visibility/visibility"

// Backgrounds: `card` is the theme's frosted-glass token surface; `dark` and
// `light` are ALWAYS dark/light (absolute, theme-independent — like Glide);
// `none` is transparent; `image` is a cover photo with a readability scrim.
//
// `dark`/`light`/`image` also carry the matching theme-scope class (`dark` /
// `light`) so that nested token-based components (anything using `bg-card`,
// `border`, `text-muted-foreground`, …) re-resolve their OWN surface to the same
// light/dark palette. Without this, a child that paints its own `bg-card` would
// keep the page's theme and render invisible (e.g. dark text on a dark card
// inside a light container).
const bgClass: Record<ContainerConfig["background"], string> = {
  none: "",
  card: "glass rounded-xl border",
  // The scope class (`dark` / `light`) is what re-resolves the palette; the
  // surface itself is then named by MEANING rather than by a colour, so the
  // container paints the same page surface its children resolve against. It
  // used to say `bg-neutral-900 / bg-neutral-50`, which named a colour, drifted
  // from the palette it sat in, and could not follow a re-theme (R32).
  dark: "dark rounded-xl border border-white/10 bg-background text-foreground",
  light:
    "light rounded-xl border border-black/10 bg-background text-foreground",
  image: "dark relative overflow-hidden rounded-xl border bg-cover bg-center",
}
const padClass = { none: "", sm: "p-2", md: "p-4", lg: "p-6" } as const
const gapClass = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
} as const
const colClass: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 lg:grid-cols-6",
}

function Container({
  config,
  className,
  children,
}: {
  config: ContainerConfig
  className?: string
  children: React.ReactNode
}) {
  if (!useIsVisible(config)) return null

  const isImage =
    config.background === "image" && Boolean(config.backgroundImage)

  return (
    <div
      className={cn(
        bgClass[config.background],
        padClass[config.padding],
        className
      )}
      style={
        isImage
          ? { backgroundImage: `url(${config.backgroundImage})` }
          : undefined
      }
    >
      {/* scrim keeps child text readable over an image background */}
      {isImage && <div className="absolute inset-0 bg-black/40" />}
      <div
        className={cn(
          "relative min-w-0",
          config.direction === "horizontal"
            ? cn("grid", colClass[config.columns] ?? colClass[2])
            : "flex flex-col items-start",
          gapClass[config.gap]
        )}
      >
        {children}
      </div>
    </div>
  )
}

export { Container }
