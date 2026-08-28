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
import { Check, History, Paperclip, Plus, X } from "@shared/ui/foundations/icons"

import { Button } from "@shared/ui/components/button/button"
import { Badge } from "@shared/ui/components/badge/badge"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@shared/ui/components/sheet/sheet"
import { AgentChat } from "@shared/ui/components/agent-chat/agent-chat"
import { CollectionRegister } from "@shared/ui/components/collection-frame/collection-frame"
import { RunSteps } from "@shared/ui/components/run-steps/run-steps"

import { AgentHistoryDialog } from "@/components/agent-history-dialog"
import { AssistantLimitNotice } from "@/components/assistant-limit-notice"
import { citationPills, TurnSources } from "@/components/agent-sources"
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
        {/* NO className. The kit's own SheetHeader already reserves the room:
         * `pe-[var(--space-9)]` for the drawer's absolute close ✕, and
         * `shadow-[var(--hairline-under)]` for the rule under it.
         *
         * WHAT WAS HERE, AND WHY IT WAS THE BUG. `className="border-b p-4 pe-12"`
         * OVERRODE all three: `p-4` replaced the kit's inset, `border-b` drew a
         * second rule as a CSS border (BUILD-A-SCREEN §6.1 — separation is a fill
         * or an inset shadow, never a stroke), and `pe-12` replaced a 4rem reserve
         * with a 3rem one. The ✕ sits at `--space-6` and is `--control-height-dense`
         * wide, so it occupies 3.5rem from the end — more than the 3rem reserved,
         * which is the overlap the owner tapped. The old comment here also cited
         * `top-4 right-4`, which is the OLD library's position, not this kit's.
         *
         * A hand-computed reservation against another component's absolute
         * position is the defect. The number was never the fix. */}
        <SheetHeader>
          <SheetTitle>{t("Assistant")}</SheetTitle>
          <SheetDescription>{t("Ask me anything, or tell me what to change. I'll only do what you can do.")}</SheetDescription>
          {/* The allowance reads as its own line rather than as a chip squeezed
           * beside the title: SheetHeader is a COLUMN, so a child gets a row of
           * its own. At 375 the sentence is 213px wide and there is no width in
           * which it, the title and two controls share one line. */}
          {canUse && chat.quotaLabel && (
            <div>
              <button
                type="button"
                onClick={() => setUsageOpen(true)}
                className="rounded-pill"
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
            </div>
          )}
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
            {/* WHY IT COULDN'T ANSWER, when the model door was the reason.
                PINNED UNDER THE HEADER, above the conversation — the first
                placement put it under the composer, which on screen reads as a
                note stranded below the input rather than as a status the panel
                is reporting (seen in the browser, 27 Aug 2026; the composer
                belongs to AgentChat, so "above the composer" and "at the bottom
                of the panel" are the same place). It is a fact about the APP,
                not something the assistant said, so it stays outside the
                conversation entirely. Clears the moment the next question is
                asked. */}
            {chat.failure && <AssistantLimitNotice failure={chat.failure} />}

            <div className="min-h-0 flex-1">
              {/* Fill the sheet and shed the component's own card chrome (it ships
               * as a standalone fixed-height card) so it reads as one panel, not a
               * card-in-a-card with a double border. The 3-dot indicator shows only
               * in the gap before the first streamed event. */}
              <AgentChat
                className="h-full rounded-none border-0 bg-transparent"
                /* THE CHAT'S OWN HEAD CARRIES THE CHAT'S OWN CONTROLS. The kit
                   names this slot for exactly these — "Controls at the inline
                   end of the head — a collapse, a menu, a new-thread". They used
                   to sit in the drawer's header, pushed to the same corner the
                   Sheet's absolute ✕ occupies, and at 375 that put New chat at
                   x=386 on a 375-wide screen: entirely off the phone. In here
                   they are laid out IN FLOW by `ms-auto`, so they cannot collide
                   with an absolutely-positioned sibling at any width.
                   No `heading` — the drawer's SheetTitle already says Assistant,
                   and the kit's mark is not a second name. */
                header
                headerActions={
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
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
                        onClick={chat.newChat}
                        disabled={chat.busy}
                        title={t("New chat")}
                        aria-label={t("New chat")}
                      >
                        <Plus className="size-5" aria-hidden />
                      </Button>
                    )}
                  </>
                }
                // The kit's chat knows user and assistant; a TOOL STEP renders
                // as a quiet assistant-side chip carrying the step's outcome.
                messages={chat.items.map((it) => {
                  if (it.role === "tool")
                    return {
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
                  // WHAT THIS TURN READ (Law R23), in the kit's ruled shape.
                  // `evidence` is app data — a knowledge citation with a kind, a
                  // record path and the passage's own words — and the kit's
                  // `sources` is two names and a link. The mapping is the whole
                  // job of agent-sources.tsx; the numbering is the kit's, derived
                  // from this array's order, so a mark in the prose and the pill
                  // under it cannot disagree.
                  const { evidence, ...message } = it
                  if (!evidence || !teamId) return message
                  return {
                    ...message,
                    sources: citationPills(evidence, t),
                    // The passages, one press away, INSIDE the turn's own body —
                    // see agent-sources.tsx for why it is here rather than in
                    // the `actions` slot.
                    content: (
                      <>
                        {message.content}
                        <TurnSources evidence={evidence} teamId={teamId} />
                      </>
                    ),
                  }
                })}
                streaming={chat.showTyping}
                disabled={chat.busy || chat.quota?.blocked || !!chat.pending}
                // THE EMPTY PANEL, THROUGH THE KIT'S OWN REGISTER RATHER THAN A
                // HAND-BUILT BOX.
                //
                // THE OWNER, 26 Aug 2026: "the interface of the chat is still
                // quite wonky and weird, not only when the chat is new but even
                // in an existing chat."
                //
                // The examples were a bare `flex max-w-64 flex-col` — vertically
                // centred by the kit's empty register, horizontally NOT, so two
                // ragged left-aligned lines hung in the middle of an otherwise
                // empty panel with no eyebrow, no measure and no relationship to
                // anything above or below them. It is the one screen state a new
                // person always sees, and it was the one part of this panel the
                // design system had never drawn.
                //
                // `CollectionRegister` is what the kit puts in an empty region
                // everywhere else in the app — eyebrow, centred body, the 40ch
                // measure — so the assistant's blank state now looks like every
                // other blank state instead of like a mistake. Email-free on
                // purpose: an inline address auto-detects on phones and breaks
                // the centred line mid-quote.
                emptyState={
                  <CollectionRegister
                    tone="quiet"
                    eyebrow={t("Try asking")}
                    body={t("“Invite a member as a Viewer”, or “what changed this week?”")}
                  />
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
            {/* …and it reads as the composer's own toolbar rather than a second
                bar under it: no rule between the two, tight to the field it
                belongs to. The border used to cut the panel across just above
                the paperclip, so the input and its own attach control looked
                like two unrelated strips (same report). */}
            <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
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
