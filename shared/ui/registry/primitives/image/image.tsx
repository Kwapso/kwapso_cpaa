"use client"

// Image — a config-driven image: shape (square/rounded/circle), object fit, a
// fixed or "auto" aspect ratio, edge-to-edge full-bleed, and tap-to-open. Shows
// a graceful "No image" fallback if the source is missing or fails to load.

import * as React from "react"

import { type ImageConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { AspectRatio } from "../aspect-ratio/aspect-ratio"

const ratioMap = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 } as const
const shapeClass = { square: "", rounded: "rounded-xl", circle: "rounded-full" }

function Image({
  src,
  config,
  className,
}: {
  src: string
  config: ImageConfig
  className?: string
}) {
  const [error, setError] = React.useState(false)
  // a circle is always square; otherwise honor the configured aspect.
  const aspect = config.shape === "circle" ? "1:1" : config.aspect

  const inner =
    error || !src ? (
      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
        No image
      </div>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={config.altText}
        onError={() => setError(true)}
        onClick={() =>
          config.openOnClick && src && window.open(src, "_blank", "noopener")
        }
        className={cn(
          aspect === "auto" ? "h-auto w-full" : "size-full",
          config.fit === "cover" ? "object-cover" : "object-contain",
          config.openOnClick && "cursor-zoom-in"
        )}
      />
    )

  return (
    <div
      className={cn(
        "w-full bg-muted",
        !config.fullBleed &&
          cn("overflow-hidden border", shapeClass[config.shape]),
        className
      )}
    >
      {aspect === "auto" ? (
        inner
      ) : (
        <AspectRatio ratio={ratioMap[aspect]}>{inner}</AspectRatio>
      )}
    </div>
  )
}

export { Image }
