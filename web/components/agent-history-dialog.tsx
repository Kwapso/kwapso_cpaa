"use client"

// The assistant's history view: the caller's past conversations, tap one to
// reopen it (works across devices — the list is server-side, so a chat started
// on the laptop is here on the phone). Self-contained: lazily loads each open
// so a just-run turn's thread shows at the top.

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@shared/ui/components/dialog/dialog"
import { ScrollArea } from "@shared/ui/components/scroll-area/scroll-area"
import { Clamp } from "@shared/ui/components/clamp/clamp"

import type { AgentThread } from "@shared/types"
import { dataOps } from "@/lib/api"
import { formatActivityWhen } from "@shared/web/format"
import { useT } from "@shared/web/language"

export function AgentHistoryDialog({
  open,
  onOpenChange,
  busy,
  currentThreadId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  currentThreadId?: string
  onPick: (threadId: string) => void
}) {
  const t = useT()
  const [threads, setThreads] = React.useState<AgentThread[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(false)
    dataOps
      .agentThreads()
      .then((r) => alive && setThreads(r.threads))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Your conversations")}</DialogTitle>
          <DialogDescription>{t("Pick up any chat where you left off, on any device.")}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("Loading…")}</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("Couldn't load your conversations. Try again.")}
          </p>
        ) : threads && threads.length > 0 ? (
          <ScrollArea className="max-h-80">
            <ul className="flex flex-col gap-1 pr-3">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false)
                      onPick(thread.id)
                    }}
                    disabled={busy}
                    className="hover:bg-muted flex w-full flex-col items-start gap-1 rounded-[var(--radius)] p-2 text-left disabled:text-ink-disabled"
                  >
                    <Clamp lines={1} collapsible={false} className="text-sm font-medium">
                      {thread.id === currentThreadId
                        ? t("{title} · current", { title: thread.title || t("Conversation") })
                        : thread.title || t("Conversation")}
                    </Clamp>
                    <span className="text-muted-foreground text-xs">
                      {formatActivityWhen(thread.lastMessageAt ?? thread.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("No conversations yet.")}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
