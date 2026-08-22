"use client"

// Comments — a thread of comments (author, time, body) with an add box.
// Hand it items + onAdd; it manages the draft text.

import * as React from "react"

import { cn } from "../../../lib/utils"
import { Avatar, AvatarFallback } from "../../primitives/avatar/avatar"
import { Button } from "../../primitives/button/button"
import { Textarea } from "../../primitives/textarea/textarea"

export interface CommentItem {
  id: string
  author: string
  body: string
  time: string
}

function Comments({
  items,
  onAdd,
  className,
}: {
  items: CommentItem[]
  onAdd?: (body: string) => void
  className?: string
}) {
  const [draft, setDraft] = React.useState("")
  // Newest comments sit at the bottom; keep them in view on load / new add.
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <div
        ref={listRef}
        className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1"
      >
        {items.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar className="size-8">
              <AvatarFallback>{c.author.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{c.author}</span>
                <span className="text-xs text-muted-foreground">{c.time}</span>
              </div>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
        />
        <Button
          className="w-fit"
          disabled={!draft.trim()}
          onClick={() => {
            onAdd?.(draft)
            setDraft("")
          }}
        >
          Comment
        </Button>
      </div>
    </div>
  )
}

export { Comments }
