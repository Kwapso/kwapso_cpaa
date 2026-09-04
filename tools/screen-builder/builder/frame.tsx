import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { Theme } from "./types"

/* THE PREVIEW IS AN IFRAME, ON PURPOSE.
 *
 * The kit's responsive rules are Tailwind breakpoints — `sm:`/`md:`/`lg:` —
 * and those answer to the VIEWPORT, not to a container. A phone preview drawn
 * in a 390px box inside a desktop page would still be laid out as a desktop,
 * which is the wrong answer dressed as the right one. An iframe is its own
 * viewport, so a 390px frame IS a phone to every breakpoint the kit wrote.
 *
 * The frame is `about:blank` written by this document, so it is same-origin:
 * React renders straight into it through a portal, and the kit's compiled CSS
 * (fonts inlined) is copied in once. The one thing this costs: a Radix
 * overlay (a Select's list, a Popover) portals to the OUTER document's body,
 * so a dropdown opened inside the preview lands at the wrong offset. The
 * preview is for layout at two widths; the drop-downs work in the app. */

export const DEVICE_WIDTHS = { desktop: 1280, phone: 390 } as const

export type DropIntent = { kind: "add"; part: string; index: number } | { kind: "move"; id: string; index: number }

export function PreviewFrame({
  width,
  scale,
  theme,
  css,
  children,
  onDrop,
}: {
  width: number
  scale: number
  theme: Theme | null
  css: string
  children: ReactNode
  onDrop: (intent: DropIntent) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState(600)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useLayoutEffect(() => {
    const doc = ref.current?.contentDocument
    if (!doc) return
    doc.open()
    doc.write(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;min-height:100%}</style></head><body class="bg-background text-foreground"><div id="root"></div></body></html>`,
    )
    doc.close()
    setRoot(doc.getElementById("root"))

    const dragover = (e: DragEvent) => {
      if (!e.dataTransfer?.types.some((t) => t === "text/kit-part" || t === "text/kit-move")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes("text/kit-move") ? "move" : "copy"
    }
    const drop = (e: DragEvent) => {
      const part = e.dataTransfer?.getData("text/kit-part")
      const move = e.dataTransfer?.getData("text/kit-move")
      if (!part && !move) return
      e.preventDefault()
      const slots = [...doc.querySelectorAll<HTMLElement>("[data-slot-id]")]
      let index = slots.length
      for (let i = 0; i < slots.length; i++) {
        const r = slots[i].getBoundingClientRect()
        if (e.clientY < r.top + r.height / 2) {
          index = i
          break
        }
      }
      onDropRef.current(part ? { kind: "add", part, index } : { kind: "move", id: move!, index })
    }
    doc.addEventListener("dragover", dragover)
    doc.addEventListener("drop", drop)

    const grow = () => setHeight(Math.max(320, doc.documentElement.scrollHeight))
    const ro = new ResizeObserver(grow)
    ro.observe(doc.documentElement)
    ro.observe(doc.body)
    return () => {
      ro.disconnect()
      doc.removeEventListener("dragover", dragover)
      doc.removeEventListener("drop", drop)
    }
  }, [css])

  useEffect(() => {
    const html = root?.ownerDocument.documentElement
    if (!html) return
    // null = "system": no attribute, and tokens.css's own media query decides.
    if (theme) html.setAttribute("data-theme", theme)
    else html.removeAttribute("data-theme")
  }, [root, theme])

  return (
    <div style={{ width: width * scale, height: height * scale }} className="relative shrink-0">
      <iframe
        ref={ref}
        title={`preview at ${width}px`}
        style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="absolute top-0 left-0 border-0 bg-background"
      />
      {root && createPortal(children, root)}
    </div>
  )
}
