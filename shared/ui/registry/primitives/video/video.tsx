"use client"

// Video — a config-driven HTML5 player: controls, mute, autoplay, loop (with an
// optional play-count), download on/off, edge-to-edge full-bleed, object fit, and
// an "auto" aspect that lets the video keep its own native proportions.

import * as React from "react"

import { type VideoConfig } from "../../../lib/config"
import { cn } from "../../../lib/utils"
import { AspectRatio } from "../aspect-ratio/aspect-ratio"

const ratioMap = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 } as const

function Video({
  src,
  poster,
  config,
  className,
}: {
  src: string
  poster?: string
  config: VideoConfig
  className?: string
}) {
  const ref = React.useRef<HTMLVideoElement>(null)
  const plays = React.useRef(0)

  // HTML `loop` only does forever; for a finite count we replay on `ended`.
  const onEnded = () => {
    if (!config.loop || config.loopCount == null) return
    plays.current += 1
    if (plays.current < config.loopCount) void ref.current?.play()
  }

  const video = (
    <video
      ref={ref}
      src={src}
      poster={poster}
      controls={config.controls}
      muted={config.muted}
      autoPlay={config.autoplay}
      loop={config.loop && config.loopCount == null}
      controlsList={config.allowDownload ? undefined : "nodownload"}
      onContextMenu={(e) => !config.allowDownload && e.preventDefault()}
      onEnded={onEnded}
      playsInline
      className={cn(
        config.aspect === "auto" ? "h-auto w-full" : "size-full",
        config.fit === "cover" ? "object-cover" : "object-contain"
      )}
    />
  )

  return (
    <div
      className={cn(
        "w-full bg-black",
        !config.fullBleed && "overflow-hidden rounded-xl border",
        className
      )}
    >
      {config.aspect === "auto" ? (
        video
      ) : (
        <AspectRatio ratio={ratioMap[config.aspect]}>{video}</AspectRatio>
      )}
    </div>
  )
}

export { Video }
