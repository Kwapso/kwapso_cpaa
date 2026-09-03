"use client"

// ONE REQUEST — what you asked, where it stands, and the conversation.
//
// TWO THINGS THIS SCREEN DELIBERATELY DOES NOT HAVE, both worth stating because
// both look like omissions until you know why:
//
// 1. NO ACTIVITY TAB. Every record detail in the base carries Overview +
//    Activity (R2). A record's history is a list of sentences like "Alaap moved
//    this to in progress" — it NAMES the staff moving the work, which the portal
//    never does (SCOPE ch.06). The activity door isn't on the portal gateway's
//    surface either, so this isn't a hidden button; it is a door that was never
//    opened. Recorded as a reasoned exemption in shared/rules/registry.ts
//    (PORTAL_ACTIVITY_EXEMPT) and held true by the portal's rules test — an
//    exemption nobody checks is just a skip with better manners.
//
// 2. NO STATUS CONTROL — WITH EXACTLY ONE EXCEPTION, and the exception is the
//    reason this paragraph is worth reading. Moving a ticket along its lifecycle
//    is gated on help:edit, which is the agency's job: the client sees where it
//    stands (CHECKLIST 5.2 — the status is a label, never a button). The one
//    move a client makes is the FIRST one: an extra, a request or a piece of
//    feedback waits in `awaiting_validation` until the company paying for it says
//    it wants it (CHECKLIST 5.13). That is the "yes, go ahead" band below, and it
//    is the only lifecycle control on this surface. It is narrow at the DOOR
//    rather than by this screen being careful: the account fence rides the
//    UPDATE, and R17's predicate means the only transition it can make is
//    awaiting_validation → new. It cannot reopen, resolve, or move a started
//    request, whatever this component sends it.
//
// THE ONE PIECE OF REAL LOGIC: who wrote a reply. A thread now has three kinds
// of author, not two — since the owner ruled that a contact sees their COMPANY's
// questions (11 Aug 2026), the people on a thread are this person, their
// COLLEAGUES, and the agency.
//
// The server decides which is which, because only the server knows: it sends a
// name for everyone on the client's side of the fence and NO name for anyone on
// ours (lib/help listReplies). So the rule here is simply "you, or the name we
// were given, or us" — and the staff-anonymity rule (SCOPE ch.06) is kept by the
// wire rather than by this component choosing not to draw something it was sent.
// Which matters: the old version printed the agency's name for every author who
// wasn't you, and would have introduced a client's own colleague as "kwapso".
//
// THE THREAD IS THE KIT'S, AND THIS PARAGRAPH USED TO SAY IT COULD NOT BE.
//
// The old note here explained that the conversation was hand-assembled because
// "no component in the library can express [WhatsApp-style sides] on a NAMED
// thread" — TicketThread had no per-reply side, and Chat had sides but no
// author. Both were true of the OLD library. The kit ships
// `structures/portal-conversation`, whose `ThreadMessage` carries `side`,
// `author`, `authorMeta`, `time` and `attachments`, and which is drawn for
// exactly this screen: "the client's thread on a record". The note outlived the
// thing it described by one design system, which is how a hand-rolled copy
// becomes permanent.
//
// So the bubbles, their sides, the 62% measure, the author headings, the
// loading/empty/error registers and the internal-note PROHIBITION (ch27.10 —
// a message marked internal is dropped before the thread sees it, which is a
// safety property this screen should never have been carrying itself) are the
// kit's now.
//
// TWO PARTS ARE STILL COMPOSED HERE, both deliberately:
//   • THE COMPOSER. The kit's is a single-line pill (`<input type="text">`),
//     which is right for a chat and wrong for a client describing what went
//     wrong with their work. `composer={false}`, and the paragraph field below
//     stays — built from the kit's own Card, Textarea and Button, so it is the
//     kit's vocabulary either way.
//   • THE APPROVAL BAND. `PortalApprovalBand` is exported on its own and is
//     used, so the band is the kit's DRAWING — but it stays where this screen
//     puts it (under the description, see the note there) rather than where the
//     shape would put it (above the composer, at the bottom). A person is asked
//     to approve a request after they have read it back, not before.

import * as React from "react"
import Link from "next/link"

import { Badge } from "@shared/ui/components/badge/badge"
import { Button } from "@shared/ui/components/button/button"
import { Card } from "@shared/ui/components/card/card"
import { Skeleton } from "@shared/ui/components/skeleton/skeleton"
import { Textarea } from "@shared/ui/components/textarea/textarea"
import { toast } from "@shared/ui/components/sonner/sonner"
import {
  PortalApprovalBand,
  PortalConversation,
  type PortalMessage,
} from "@shared/ui/components/portal-conversation/portal-conversation"
import { ArrowLeft, PaperPlaneTilt } from "@shared/ui/foundations/icons"

import { brand } from "@shared/brand"
import type { HelpMessage } from "@shared/types"
import { useFollowNewest } from "@shared/web/follow-newest"
import { formatRelative } from "@shared/web/format"
import { reportError } from "@shared/web/log"
import { invalidate, primeCache, useCached } from "@shared/web/store"
import { ApiFailure, support } from "@/lib/api"
import { cacheKeys } from "@/lib/live-resources"
import { useTickets } from "@/lib/tickets"
import { STATUS_WORDS } from "@/components/ticket-row"
import { TicketAttachments } from "@/components/ticket-attachments"
import { ErrorPanel } from "@/components/error-panel"
import type { PortalReady } from "@/components/portal-shell"
import { useLanguage } from "@shared/web/language"
import { RichText } from "@shared/web/rich-text-view"

/** WHICH SIDE A MESSAGE SITS ON — and why it is this way round.
 *
 * The owner asked to "show a clear distinction between chats sent by the current
 * active user and chats sent by another user… similar to WhatsApp". He typed
 * "ours on the left, theirs on the right" — but WhatsApp, the app he NAMED, puts
 * YOUR OWN messages on the RIGHT. This builds the convention he named rather
 * than the direction he typed. That is a decision, not a slip: to flip it, swap
 * these two values and change nothing else.
 *
 * It is also deliberately BINARY, and that is a security property, not tidiness.
 * The only question it asks is "did I write this". It must never key on the
 * author id for anything more — no per-author grouping, no per-author colour, no
 * collapsing consecutive messages by author — because two replies typed by two
 * different staff members have to be indistinguishable. The moment the unnamed
 * side splits into groups, it stops being "the agency" and starts being a
 * fingerprint you can count people with (SCOPE ch.06).
 *
 * The wire already holds that line: to a client login a reply from our side of
 * the fence arrives with authorId AND authorName null (shared/types HelpMessage
 * says why). So `null === me` is false and every agency reply lands on the same
 * side by the same route — this function must never become the second place that
 * decision is made. */
export const OWN_SIDE = "mine"
export const OTHER_SIDE = "theirs"
export function sideFor(authorId: string | null, meId: string): "mine" | "theirs" {
  return authorId === meId ? OWN_SIDE : OTHER_SIDE
}

export function TicketScreen({ ready, ticketId }: { ready: PortalReady; ticketId: string }) {
  const { t, lang } = useLanguage()
  // The list is usually already warm (they tapped a row to get here), so read the
  // ticket out of it; fall back to the by-id door on a cold deep link from email.
  const { tickets } = useTickets()
  const fromList = (tickets ?? []).find((t) => t.id === ticketId)
  const oneQ = useCached(fromList ? null : cacheKeys.ticket(ticketId), () =>
    support.ticket(ticketId)
  )
  const ticket = fromList ?? oneQ.data ?? null

  const threadQ = useCached<HelpMessage[]>(cacheKeys.thread(ticketId), () =>
    support.thread(ticketId).then((r) => {
      primeCache(cacheKeys.threadTotal(ticketId), r.total)
      return r.replies
    })
  )

  const me = ready.user.id
  // ONE decision per message, taken here and never re-taken. The alignment and
  // the bubble surface both hang off `side`, so they cannot disagree — and the
  // author id does not survive this map, so nothing downstream can accidentally
  // key on it (see sideFor's note on fingerprints).
  const messages: (PortalMessage & { own: boolean })[] = (threadQ.data ?? []).map((m) => {
    const side = sideFor(m.authorId, me)
    return {
      id: m.id,
      side,
      own: side === OWN_SIDE,
      // Your own side says only the time: the side IS the attribution, which is
      // the whole point of having one.
      author: side === OWN_SIDE ? undefined : (m.authorName ?? brand.name),
      time: formatRelative(m.createdAt, t, lang),
      // A reply is typed, so its line breaks are the person's. The kit's bubble
      // wraps and breaks a long word; preserving a paragraph is the call site's.
      body: <span className="whitespace-pre-wrap">{m.body}</span>,
    }
  })

  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  // Land on the newest reply, and follow the one you just sent. Every hook here
  // sits ABOVE the `if (!ticket)` return below, deliberately — a hook under an
  // early return changes the hook count the first day that return fires.
  const newest = messages[messages.length - 1] ?? null
  useFollowNewest(newest?.id ?? null, newest?.own ?? false)

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const r = await support.reply(ticketId, body)
      primeCache(cacheKeys.thread(ticketId), r.replies)
      primeCache(cacheKeys.threadTotal(ticketId), r.total)
      setDraft("")
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.message : t("Couldn't send that. Try again."))
    } finally {
      setSending(false)
    }
  }

  /** YES, GO AHEAD (CHECKLIST 5.13). The door answers with the ticket page, but
   * the list in this browser may already hold pages two and three, so the honest
   * move is to drop what changed and let the screen re-read rather than to
   * overwrite an appended list with a page one. Both keys, plus the by-id key a
   * cold deep link is reading from — this screen takes its ticket from whichever
   * of the two is warm, so refreshing only one leaves the band on screen half
   * the time. */
  async function confirmIt() {
    if (confirming) return
    setConfirming(true)
    try {
      await support.validate(ticketId)
      invalidate(cacheKeys.tickets)
      invalidate(cacheKeys.ticketsTotal)
      invalidate(cacheKeys.ticket(ticketId))
      toast.success(t("Thank you. We'll get started."))
    } catch (e) {
      reportError("portal-ticket.validate", e)
      toast.error(e instanceof ApiFailure ? e.message : t("Couldn't send that. Try again."))
    } finally {
      setConfirming(false)
    }
  }

  const back = (
    <Link
      href="/tickets"
      className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1 text-sm"
    >
      <ArrowLeft className="size-3.5" />
      {t("All tickets")}
    </Link>
  )

  if (!ticket) {
    // NOT FOUND AND FAILED TO LOAD ARE DIFFERENT SENTENCES. `ticket` collapses
    // to null both when the by-id read genuinely resolved with nothing (outside
    // the fence a real id and a made-up one are the same sentence — the door
    // answers null either way, and so do we) AND when the read never resolved
    // at all — a dropped connection, a 500. This used to print "We can't find
    // that ticket." for both, which tells a client on a flaky connection that
    // their real ticket is gone. Only reachable when `fromList` is absent, so
    // `oneQ` is the read that ran.
    const failed = !!oneQ.error && oneQ.data === undefined
    return (
      <div className="flex flex-col gap-6">
        {back}
        {oneQ.loading || threadQ.loading ? (
          <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
        ) : failed ? (
          <ErrorPanel
            title={t("We couldn't load that ticket.")}
            description={t("Check your connection and try again.")}
            onRetry={oneQ.refresh}
          />
        ) : (
          // REGRESSION FIX, 2026-09-01: was `border border-dashed` — see
          // impact-screen.tsx's own note on this box for the full reasoning.
          <p className="text-muted-foreground rounded-[var(--radius)] bg-surface-panel p-8 text-center">
            {t("We can't find that ticket.")}
          </p>
        )}
      </div>
    )
  }

  const status = STATUS_WORDS[ticket.status]

  return (
    <div className="flex flex-col gap-6">
      {back}

      {/* What you asked, and where it stands — in the portal's own words. One
       * badge, not two: the library's header showed its own English status
       * ("Open", "In progress") beside this one, so the same fact appeared twice
       * and half of it was the agency's vocabulary rather than the client's. */}
      <Card className="flex flex-col gap-4 p-4">
        <Badge variant={status.variant} className="w-fit">
          {t(status.label)}
        </Badge>
        <RichText html={ticket.description} className="break-words" />
      </Card>

      {/* THE ONE THING A CLIENT DOES TO A TICKET'S STATE (CHECKLIST 5.13).
       *
       * It sits UNDER the description rather than above it, which is the one
       * arrangement decision here: UI-RULEBOOK C8 puts a warning band directly
       * under the header, and on this screen the description IS the header —
       * asking somebody to approve a request before they have read it back is
       * the wrong order to put two sentences in.
       *
       * Amber because nothing moves until they act, and it disappears the moment
       * they have: the door answers, the list is re-read, the status is no longer
       * `awaiting_validation`, and there is nothing left to press. That is why
       * this is a band and not a permanent control — a client never gets a second
       * lifecycle button, on this screen or any other. */}
      {ticket.status === "awaiting_validation" ? (
        <PortalApprovalBand
          title={t(
            "We've written this up the way we understood it. Say the word and we'll get started."
          )}
          note={t("Nothing starts until you say yes.")}
          approveLabel={t("Yes, go ahead")}
          submitting={confirming}
          onApprove={() => void confirmIt()}
        />
      ) : null}

      {/* SHOW US WHAT YOU MEAN (CHECKLIST 5.10) — above the conversation, because
       * the files are part of the request rather than part of the exchange about
       * it. The thread below scrolls itself to the newest reply on arrival, so
       * nothing here costs the person their place. */}
      <TicketAttachments ticketId={ticketId} />

      {/* THE KIT'S THREAD. `composer={false}` and `audience={null}` because both
          are composed below — see the note at the top of this file for why the
          paragraph field stays. `state` is the thread's own, not the screen's:
          the ticket is already on screen above, so a thread still arriving is a
          thread-shaped wait and not a page-shaped one. */}
      <PortalConversation
        messages={messages}
        composer={false}
        audience={null}
        // NEVER SWALLOW (ERROR-HANDLING.md): this used to read
        // `data === undefined ? "loading" : …`, so a thread whose fetch FAILED
        // looked identical to one still in flight — spinning forever, and the
        // errorTitle/errorDescription below were dead copy no branch could
        // ever select. `error` is checked first now, the same order every
        // other read in this file uses.
        state={
          threadQ.error && threadQ.data === undefined
            ? "error"
            : threadQ.data === undefined
              ? "loading"
              : messages.length === 0
                ? "empty"
                : "ready"
        }
        label={t("Conversation")}
        loadingLabel={t("Loading…")}
        copy={{
          emptyTitle: t("No replies yet"),
          emptyDescription: t("Write below and we'll see it."),
          errorTitle: t("We can't show this right now"),
          errorDescription: t("Try again in a moment."),
        }}
      />

      {/* No @mentions from this surface: a client has no business naming which
       * staff member picks their request up — so no mention hint in the
       * placeholder either, which the library's composer showed while the portal
       * passed it an empty member list and the "@" did nothing. */}
      <Card className="flex flex-col gap-2 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Write a reply…")}
          rows={3}
          className="resize-none"
          aria-label={t("Reply")}
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2">
          {/* WHO READS THIS, said on the composer — the kit's ch27.10 rule for
           * the portal, in the agency's own name rather than a hardcoded one. */}
          <span className="text-muted-foreground text-xs">
            {t("{name} will see this", { name: brand.name })}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
          >
            <PaperPlaneTilt className="size-3.5" />
            {sending ? t("Sending…") : t("Reply")}
          </Button>
        </div>
      </Card>
    </div>
  )
}
