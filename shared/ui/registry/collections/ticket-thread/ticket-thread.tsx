"use client"

// TicketThread — a support-ticket conversation. A header (description, type chip,
// status badge, an optional "raised from <screen>" link, attachments) over
// threaded replies (author, relative time, body, attachments — the AI-drafted
// first reply clearly labelled). A composer with @mention autocomplete + an
// attachment add, and an optional in-thread status dropdown (`showStatusControl`,
// gated by `canResolve`) — turn it off when the host drives status with its own
// control above the thread. The My/All ticket tabs themselves reuse the existing
// Tabs + List. Flat, token-driven, dark-mode.

import * as React from "react"
import { ExternalLink, Paperclip, Send, Sparkles } from "lucide-react"

import { safeHref } from "../../../lib/url"
import { cn } from "../../../lib/utils"
import { Avatar, AvatarFallback } from "../../primitives/avatar/avatar"
import { Badge, type BadgeProps } from "../../primitives/badge/badge"
import { Button } from "../../primitives/button/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../primitives/select/select"
import { Textarea } from "../../primitives/textarea/textarea"

export type TicketStatus = "open" | "in-progress" | "resolved" | "reopened"

export interface TicketAttachment {
  id: string
  name: string
  url?: string
}
export interface TicketMember {
  id: string
  name: string
}
export interface Ticket {
  description: React.ReactNode
  /** A short type chip, e.g. "Bug", "Question". */
  type: string
  status: TicketStatus
  /** A "raised from <screen>" deep link. */
  fromScreen?: { label: string; href?: string }
  attachments?: TicketAttachment[]
}
export interface TicketReply {
  id: string
  author: string
  /** Pre-formatted relative time, e.g. "2h ago". */
  time: string
  body: React.ReactNode
  attachments?: TicketAttachment[]
  /** The AI-drafted first reply is labelled "Drafted by the assistant". */
  aiDrafted?: boolean
}

const statusVariant: Record<
  TicketStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  open: "secondary",
  "in-progress": "warning",
  resolved: "success",
  reopened: "outline",
}
const statusLabel: Record<TicketStatus, string> = {
  open: "Open",
  "in-progress": "In progress",
  resolved: "Resolved",
  reopened: "Reopened",
}
const STATUSES: TicketStatus[] = ["open", "in-progress", "resolved", "reopened"]

function initials(s: string): string {
  return (
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

function Attachments({ items }: { items: TicketAttachment[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => {
        const inner = (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
            <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
            {a.name}
          </span>
        )
        return a.url ? (
          <a
            key={a.id}
            href={safeHref(a.url)}
            target="_blank"
            rel="noreferrer"
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {inner}
          </a>
        ) : (
          <React.Fragment key={a.id}>{inner}</React.Fragment>
        )
      })}
    </div>
  )
}

function TicketThread({
  ticket,
  replies,
  members,
  canResolve,
  showStatusControl = true,
  onReply,
  onStatusChange,
  onMention,
  className,
}: {
  ticket: Ticket
  replies: TicketReply[]
  members: TicketMember[]
  /** Gates resolving the ticket. */
  canResolve: boolean
  /** Show the in-thread status dropdown (default true). Set false when the host
   *  drives status with its own control above the thread — the status Badge
   *  still shows the current status either way. */
  showStatusControl?: boolean
  onReply?: (
    body: string,
    attachments: File[],
    mentions: TicketMember[]
  ) => void
  onStatusChange?: (status: TicketStatus) => void
  /** Fired as each @mention is picked from the autocomplete. */
  onMention?: (member: TicketMember) => void
  className?: string
}) {
  const [draft, setDraft] = React.useState("")
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null)
  const [mentioned, setMentioned] = React.useState<TicketMember[]>([])
  const [files, setFiles] = React.useState<File[]>([])
  const taRef = React.useRef<HTMLTextAreaElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const onDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setDraft(v)
    const caret = e.target.selectionStart ?? v.length
    const m = /(?:^|\s)@(\w*)$/.exec(v.slice(0, caret))
    setMentionQuery(m ? m[1].toLowerCase() : null)
  }

  const pickMention = (member: TicketMember) => {
    const ta = taRef.current
    if (!ta) return
    const caret = ta.selectionStart ?? draft.length
    const before = draft.slice(0, caret)
    const after = draft.slice(caret)
    const m = /(?:^|\s)@(\w*)$/.exec(before)
    if (!m) return
    const at = m.index + (before[m.index] === "@" ? 0 : 1)
    setDraft(before.slice(0, at) + "@" + member.name + " " + after)
    setMentionQuery(null)
    setMentioned((prev) =>
      prev.some((p) => p.id === member.id) ? prev : [...prev, member]
    )
    onMention?.(member)
    requestAnimationFrame(() => ta.focus())
  }

  const send = () => {
    if (!draft.trim()) return
    onReply?.(draft.trim(), files, mentioned)
    setDraft("")
    setFiles([])
    setMentioned([])
    setMentionQuery(null)
  }

  const matches =
    mentionQuery == null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(mentionQuery))
          .slice(0, 6)

  return (
    <div className={cn("flex w-full flex-col gap-5", className)}>
      {/* header */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ticket.type}</Badge>
          <Badge variant={statusVariant[ticket.status]}>
            {statusLabel[ticket.status]}
          </Badge>
          {ticket.fromScreen && (
            <a
              href={safeHref(ticket.fromScreen.href)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              raised from {ticket.fromScreen.label}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          {showStatusControl && (
            <div className="ml-auto">
              <Select
                value={ticket.status}
                onValueChange={(v) => onStatusChange?.(v as TicketStatus)}
              >
                <SelectTrigger
                  aria-label="Ticket status"
                  className="h-8 w-auto gap-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      disabled={s === "resolved" && !canResolve}
                    >
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="text-sm break-words">{ticket.description}</div>
        {ticket.attachments && <Attachments items={ticket.attachments} />}
      </div>

      {/* replies */}
      <ol className="flex flex-col gap-4">
        {replies.map((r) => (
          <li key={r.id} className="flex gap-3">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="text-xs">
                {r.aiDrafted ? (
                  <Sparkles className="size-4 text-primary" aria-hidden />
                ) : (
                  initials(r.author)
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.author}</span>
                {r.aiDrafted && (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="size-3" aria-hidden />
                    Drafted by the assistant
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{r.time}</span>
              </div>
              <div className="text-sm break-words">{r.body}</div>
              {r.attachments && <Attachments items={r.attachments} />}
            </div>
          </li>
        ))}
      </ol>

      {/* composer */}
      <div className="relative flex flex-col gap-2 rounded-xl border bg-card p-3">
        <Textarea
          ref={taRef}
          value={draft}
          onChange={onDraftChange}
          placeholder="Write a reply… use @ to mention"
          rows={3}
          className="resize-none"
          aria-label="Reply"
        />
        {matches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Mention a member"
            className="absolute bottom-16 left-3 z-20 w-56 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
          >
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => pickMention(m)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[0.625rem]">
                      {initials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
                {f.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) =>
              setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <Paperclip className="size-4" aria-hidden /> Attach
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={send}
            disabled={!draft.trim()}
            className="gap-1.5"
          >
            <Send className="size-4" aria-hidden /> Reply
          </Button>
        </div>
      </div>
    </div>
  )
}

export { TicketThread }
