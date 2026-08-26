"use client"

// AgentPanel — the app-wide AI co-pilot, mounted as a right-side sheet from the
// deep-link host (which owns go() + runAction() + the cache), so the agent can
// drive real screens. Built on the library AgentChat.
//
// This file is the RENDER SHELL only. The whole state machine — the transcript,
// streaming consumption (text deltas / live step rows / the confirm pause /
// terminal settle), per-device + cross-device thread resume, the broken-stream
// re-sync, staged file attachments (the chat import) and the send / confirm /
// new-chat / open-thread actions — lives in web/lib/use-agent-chat.tsx. The
// usage + history dialogs are self-contained components beside this one.
//
// The credit count (free daily + what an admin added) shows in the header. Using the agent needs
// agent:create; the server re-gates every action AS the signed-in user.

import * as React from "react"
import { Check, History, Paperclip, Plus, X } from "@shared/ui/icons"

import { Button } from "@shared/ui/controls/button/button"
import { Badge } from "@shared/ui/controls/badge/badge"
import { Spinner } from "@shared/ui/controls/spinner/spinner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@shared/ui/controls/sheet/sheet"
import { AgentChat } from "@shared/ui/structures/agent-chat/agent-chat"
import { RunSteps } from "@shared/ui/structures/run-steps/run-steps"

import { AgentHistoryDialog } from "@/components/agent-history-dialog"
import { AgentUsageDialog } from "@/components/agent-usage-dialog"
import { useAgentChat } from "@/lib/use-agent-chat"
import { usePermissions } from "@/lib/perms"
import { useT } from "@shared/web/language"

export function AgentPanel({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const attachInputRef = React.useRef<HTMLInputElement>(null)
  const { can } = usePermissions(teamId)
  const canUse = can("agent", "create")

  const chat = useAgentChat(teamId, open, canUse)
  const [usageOpen, setUsageOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Hand focus to the composer once the sheet has animated in — Radix focuses the
  // PANEL by default, so keystrokes hit it (and paint a focus ring around the whole
  // slide-in) instead of the message box. Best-effort: if the textarea isn't there
  // (no rights), nothing happens.
  React.useEffect(() => {
    if (!open || !canUse) return
    const t = setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(".agent-chat-host textarea")?.focus()
    }, 120)
    return () => clearTimeout(t)
  }, [open, canUse])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* : the Radix panel itself takes focus on open — without this,
       * pressing Enter/arrows draws the browser's focus ring around the WHOLE
       * slide-in (the owner's "weird outline"). Harmless but ugly; the effect
       * above moves focus into the composer instead. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {/* pe-12 reserves room on the right for the Sheet's own absolute close ✕
         * (top-4 right-4) — without it the ✕ sits on top of the New chat button and
         * swallows its taps (the bug the owner hit). */}
        <SheetHeader className="border-b p-4 pe-12">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t("Assistant")}</SheetTitle>
            {canUse && (
              <div className="flex items-center gap-1">
                {chat.quotaLabel && (
                  <button
                    type="button"
                    onClick={() => setUsageOpen(true)}
                    className="rounded-full"
                    title={t("See where your assistant credits went")}
                  >
                    <Badge
                      variant={
                        chat.quota?.blocked
                          ? "destructive"
                          : // NEARLY OUT wears the warning colour — a colour, not a
                            // sentence, so R28 owes nothing. The threshold is the
                            // last handful, not a fraction: 3 is "you will feel this
                            // today", whatever the team's allowance is.
                            chat.quota && !chat.quota.unlimited && chat.quota.remaining <= 3
                            ? "warning"
                            : "secondary"
                      }
                      className="cursor-pointer text-badge"
                    >
                      {chat.quotaLabel}
                    </Badge>
                  </button>
                )}
                {/* History: past conversations (resume any, incl. one started on
                 * another device). size-10 ≈ a real thumb target (the size-8 pair
                 * was too small to hit on a phone); bordered so they read as
                 * buttons, not decorations. */}
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-10"
                  onClick={() => setHistoryOpen(true)}
                  disabled={chat.busy}
                  title={t("Past conversations")}
                  aria-label={t("Past conversations")}
                >
                  <History className="size-5" aria-hidden />
                </Button>
                {chat.items.length > 0 && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-10"
                    onClick={chat.newChat}
                    disabled={chat.busy}
                    title={t("New chat")}
                    aria-label={t("New chat")}
                  >
                    <Plus className="size-5" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
          <SheetDescription>{t("Ask me anything, or tell me what to change. I'll only do what you can do.")}</SheetDescription>
        </SheetHeader>

        {!canUse ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
            {t("The assistant isn't available for your role here.")}
          </div>
        ) : (
          // agent-chat-host scopes the composer autofocus selector. Dropping files
          // anywhere on the panel stages them for the chat import, same as the
          // composer's own paperclip (library 0.4.0 attach slot).
          <div
            className="agent-chat-host flex min-h-0 flex-1 flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void chat.addAttachments(e.dataTransfer.files)
            }}
          >
            <div className="min-h-0 flex-1">
              {/* Fill the sheet and shed the component's own card chrome (it ships
               * as a standalone fixed-height card) so it reads as one panel, not a
               * card-in-a-card with a double border. The 3-dot indicator shows only
               * in the gap before the first streamed event. */}
              <AgentChat
                className="h-full rounded-none border-0 bg-transparent"
                // The kit's chat knows user and assistant; a TOOL STEP renders
                // as a quiet assistant-side chip carrying the step's outcome.
                messages={chat.items.map((it) =>
                  it.role === "tool"
                    ? {
                        id: it.id,
                        role: "assistant" as const,
                        content: (
                          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                            {it.status === "pending" ? (
                              <Spinner size="sm" />
                            ) : it.status === "failed" ? (
                              <X className="text-destructive size-3.5" aria-hidden />
                            ) : (
                              <Check className="text-success size-3.5" aria-hidden />
                            )}
                            {it.actionLabel}
                          </span>
                        ),
                      }
                    : it
                )}
                streaming={chat.showTyping}
                disabled={chat.busy || chat.quota?.blocked || !!chat.pending}
                // Stacked, email-free example prompts: an inline address gets auto-
                // detected (underlined) on phones and breaks the centred line mid-quote.
                emptyState={
                  <div className="flex max-w-64 flex-col gap-1">
                    <span>{t("Try “invite a member as a Viewer”")}</span>
                    <span>{t("or “what changed this week?”")}</span>
                  </div>
                }
                onSend={(t) => void chat.send(t)}
              />
            </div>

            {/* THE CHAT IMPORT. The old library's composer carried its own
                paperclip; the kit's composer does not (yet — logged for
                Aurora), so the strip lives beside it: files go to the import
                batch engine with the next message, and the run passes through
                the normal confirm panel. Drag-and-drop onto the panel still
                works above. */}
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
              <input
                ref={attachInputRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,text/csv"
                multiple
                className="hidden"
                onChange={(e) => {
                  void chat.addAttachments(e.currentTarget.files)
                  e.currentTarget.value = ""
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("Attach a file to import")}
                onClick={() => attachInputRef.current?.click()}
                disabled={chat.busy || !!chat.pending}
              >
                <Paperclip className="size-4" aria-hidden />
              </Button>
              {chat.attached.map((f, i) => (
                <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1">
                  {f.name}
                  <button
                    type="button"
                    aria-label={t("Remove attachment")}
                    onClick={() => chat.removeAttachment(i)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              ))}
            </div>

            {/* A paused turn: the proposed actions + approve / decline. */}
            {chat.pending && (
              <div className="flex flex-col gap-4 border-t p-4">
                <p className="text-sm font-medium">{t("I'd like to make these changes:")}</p>
                {/* Each step now carries the PAYLOAD under its label (a role's
                 * whole access sheet is a dozen lines), so the list scrolls on
                 * its own and the two buttons stay where a thumb expects them —
                 * a confirm you have to hunt for is nearly as bad as one you
                 * can't read. */}
                <div className="max-h-[40vh] min-h-0 overflow-y-auto">
                  <RunSteps steps={chat.confirmSteps} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void chat.resolve(false)}
                    disabled={chat.busy}
                  >
                    {t("Not now")}
                  </Button>
                  <Button size="sm" onClick={() => void chat.resolve(true)} disabled={chat.busy}>
                    {t("Go ahead")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>

      <AgentUsageDialog open={usageOpen} onOpenChange={setUsageOpen} summary={chat.usageSummary} />
      <AgentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        busy={chat.busy}
        currentThreadId={chat.threadId}
        onPick={(id) => void chat.openThread(id)}
      />
    </Sheet>
  )
}
