// WebEmbed — drops an external page/URL into a framed, responsive iframe
// (a YouTube video, a map, a form, etc.).

import * as React from "react"

import { safeHref } from "../../../lib/url"
import { cn } from "../../../lib/utils"
import { AspectRatio } from "../aspect-ratio/aspect-ratio"

export interface WebEmbedProps {
  src: string
  title?: string
  /** Width / height ratio (e.g. 16/9). */
  ratio?: number
  /** The iframe sandbox. The default lets normal embeds (video, maps, forms)
   *  work but omits `allow-top-navigation`, so a hostile page can't redirect the
   *  whole tab. Pass your own to tighten or loosen it. */
  sandbox?: string
  className?: string
}

function WebEmbed({
  src,
  title = "Embedded content",
  ratio = 16 / 9,
  sandbox = "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation",
  className,
}: WebEmbedProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <AspectRatio ratio={ratio}>
        <iframe
          // Guard the scheme so a `javascript:`/`data:` src can't run in our
          // origin; sandbox the frame so the embedded page stays contained.
          src={safeHref(src)}
          title={title}
          loading="lazy"
          sandbox={sandbox}
          className="size-full"
          referrerPolicy="no-referrer"
        />
      </AspectRatio>
    </div>
  )
}

export { WebEmbed }
