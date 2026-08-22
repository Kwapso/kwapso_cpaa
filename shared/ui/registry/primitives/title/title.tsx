// Title — a page/section hero header (Glide's "Title" block). One component,
// four variants: simple, image (banner above), profile (avatar beside), and
// cover (text over a full-bleed image).

import * as React from "react"

import { cn } from "../../../lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "../avatar/avatar"

export type TitleVariant = "simple" | "image" | "profile" | "cover"

export interface TitleProps {
  variant?: TitleVariant
  title: string
  subtitle?: string
  /** Image/avatar source for the image, profile, and cover variants. */
  image?: string
  className?: string
}

function Title({
  variant = "simple",
  title,
  subtitle,
  image,
  className,
}: TitleProps) {
  if (variant === "cover") {
    return (
      <div
        className={cn("relative overflow-hidden rounded-2xl border", className)}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-44 w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
        <div className="absolute bottom-0 flex flex-col gap-1 p-5 text-white">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-white/80">{subtitle}</p>}
        </div>
      </div>
    )
  }
  if (variant === "profile") {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        <Avatar className="size-14">
          {image && <AvatarImage src={image} alt={title} />}
          <AvatarFallback>{title.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    )
  }
  if (variant === "image") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-32 w-full rounded-xl object-cover"
          />
        )}
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export { Title }
