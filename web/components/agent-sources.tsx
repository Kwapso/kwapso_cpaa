"use client"

// WHAT THE ASSISTANT READ, under the answer it wrote — Law R23 on the screen.
//
// Two halves, and they are deliberately different things:
//
//   THE PILLS are the design kit's, exactly as RULING D7-2 draws them: numbered,
//   `collection · record`, in the order the retrieval handed back, with the
//   number derived from that order so a mark in the prose and the pill under it
//   cannot disagree. This file does not draw them and must not — it MAPS the
//   knowledge base's own citation onto the ruled two names and hands them to
//   `AgentChat`. `collection` is what KIND of material it is, in the same words
//   the knowledge base's own list uses; `record` is its title.
//
//   THE PASSAGES are ours, and they are the half the kit does not draw. This is
//   the thing NotebookLM is admired for and it is the reason anybody trusts an
//   answer: you can open the exact words it was written from. The one-shot ask
//   box showed them under every answer and losing them to gain a conversation
//   would have been a bad trade, so they are a disclosure under the pills —
//   closed by default, because a conversation of six answers each carrying four
//   passages is a wall of text rather than a chat.
//
// ── TWO GAPS IN THE KIT, LOGGED RATHER THAN WORKED AROUND QUIETLY ────────────
//
// 1 · A SOURCE PILL CANNOT OPEN THE SOURCE'S OWN SCREEN, and it must not be
//     made to. `AgentChatSource` offers `href` and nothing else, and the kit
//     renders it as a bare `<a>` — so an in-app path there is R37's exact bug in
//     a kit component: the browser throws the whole shell away, every module
//     re-runs and the running conversation goes with it. This app hit that class
//     three times and the build was green every time. So the pill's `href`
//     carries ONLY an external address (a document in somebody's Drive), and the
//     way to the source's own screen is the link inside the disclosure, which is
//     an `InAppLink` and soft-navigates. If you are here to "fix" the pill by
//     putting `/t/…` in `href`: that is the bug. The kit needs an `onOpen`
//     beside `href` — logged for Aurora as a defect, not a request.
//
// 2 · A TURN HAS NOWHERE TO PUT ITS EVIDENCE, so this rides inside the turn's
//     own `content`, under the answer. The two slots that look right are not:
//     `footnote` is a sentence, and `actions` is ruling 33's "the one press …
//     nothing is written until a person presses" — a read-only disclosure is
//     not that, and borrowing it quietly would blur the one slot whose whole
//     meaning is that something is about to be written.
//
//     AND `actions` DOES NOT FIT, MEASURED. Its row is a shrink-to-fit flex
//     item in an `items-start` column, so a child holding a paragraph resolves
//     to its MAX-CONTENT width: 509px inside a 324px bubble, with a horizontal
//     scrollbar across the whole conversation (in the browser, 27 Aug 2026).
//     `w-full`/`min-w-0` on this component cannot fix that — they resolve
//     against the row, which is already too wide. Inside `content` the block
//     context is the bubble's own and the passage wraps where it should.
//     The QUESTION for the kit stands: a turn that cites its sources needs a
//     place for the evidence behind them, and it does not have one.

import * as React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@shared/ui/components/collapsible/collapsible"
import type { AgentChatSource } from "@shared/ui/components/agent-chat/agent-chat"
import {
  ChevronDown,
  ExternalLink,
  SquareArrowOutUpRight,
} from "@shared/ui/foundations/icons"

import type { KnowledgeCitation, KnowledgePassage } from "@shared/types"
import type { TurnEvidence } from "@shared/agent-cites"
import { Icon, type IconName } from "@shared/web/screen-engine/icon"
import { safeHref } from "@shared/web/rich-text"
import { useT } from "@shared/web/language"
import { KNOWLEDGE_KIND, KNOWLEDGE_KIND_ICON } from "@/components/deep-link/shape"
import { AgentMarkdown } from "@/components/agent-markdown"
import { InAppLink } from "@/components/in-app-link"

/**
 * ONE TURN'S CITATIONS, IN THE KIT'S RULED SHAPE.
 *
 * `collection · record`, both required — the ruling closes exactly the invention
 * of a pill carrying one of them. So a source with no title would render an
 * empty half, and the fallback is its kind rather than a blank: a source always
 * has a kind, because the sweep wrote it.
 *
 * NO `confidence`. The kit carries one and draws it as a quiet suffix, and the
 * only number available here is the passage's RETRIEVAL SCORE — how close the
 * words were, not how sure the assistant is of the sentence it wrote. Putting
 * one under the other's name would be a number that reads as an answer's
 * confidence and is not.
 */
export function citationPills(
  evidence: TurnEvidence,
  t: (english: string) => string
): AgentChatSource[] {
  return evidence.citations.map((c) => ({
    id: c.sourceId,
    collection: t(KNOWLEDGE_KIND[c.kind] ?? c.kind),
    record: c.title || t(KNOWLEDGE_KIND[c.kind] ?? c.kind),
    // External only, and only through the seam: a source URL arrives from Google
    // or from somebody typing. See gap 1 above for why there is no in-app href.
    href: safeHref(c.url) ?? undefined,
  }))
}

/**
 * THE EVIDENCE, one press away.
 *
 * Grouped by SOURCE and numbered to match the pills above, so "what is 2?" is
 * answered by looking at the row headed 2 — the same number the mark in the
 * prose carries. A source's passages sit under it in the order retrieval ranked
 * them, and the links go two places on purpose: the SOURCE's own screen (what
 * was indexed, and why the assistant can read it) and the RECORD behind it (the
 * ticket, the map or the meeting itself, which is what somebody who disagrees
 * with an answer actually wants).
 */
export function TurnSources({ evidence, teamId }: { evidence: TurnEvidence; teamId: string }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const byIndex = evidence.citations.map((c, i) => ({
    citation: c,
    number: i + 1,
    passages: evidence.passages.filter((p) => p.sourceId === c.sourceId),
  }))

  return (
    /* `[contain:inline-size]` IS LOAD-BEARING, and it is the only thing that
       works — measured, not reasoned. A passage is a paragraph of somebody's
       meeting notes, so its MAX-CONTENT is that paragraph on one line; the
       bubble is a shrink-to-fit box, so it took 545px inside a 522px panel and
       gave the whole conversation a horizontal scrollbar. `w-full`,
       `max-w-full`, `min-w-0` and `width:min-content` were each tried in the
       browser and each left it at 545 — a percentage is not a definite width
       to an intrinsic-sizing pass, which is the same trap the kit's own source
       chips wrote up from the other end. Inline-size containment says the one
       true thing: this box's width comes from what holds it, never from what
       is in it. Its HEIGHT still comes from its content, which is what
       Radix measures for the open/close animation. */
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2 min-w-0 [contain:inline-size]">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground text-xs">
        {/* The mark ROTATES rather than swapping glyph — the kit's own
            disclosure behaviour, motion.css §9. */}
        <ChevronDown className="motion-disclosure-marker size-3.5" aria-hidden />
        {t("What I read")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          {byIndex.map(({ citation, number, passages }) => (
            <div key={citation.sourceId} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-start gap-2 text-sm">
                <span className="bg-muted text-muted-foreground mt-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius)] text-xs tabular-nums">
                  {number}
                </span>
                <span className="min-w-0">
                  {/* THE SOURCE'S OWN FACE (R35): a citation IS a record
                      appearing, and "where did that come from?" is the whole
                      question being asked here. Same glyph vocabulary as the
                      knowledge base's own list. */}
                  <Icon
                    name={(KNOWLEDGE_KIND_ICON[citation.kind] ?? "file") as IconName}
                    aria-hidden
                    className="me-1 inline size-3.5 align-[-0.2em]"
                  />
                  <InAppLink
                    href={`/t/${teamId}/knowledge/${citation.sourceId}`}
                    className="hover:text-primary underline underline-offset-2"
                  >
                    {citation.title}
                  </InAppLink>
                  <span className="text-muted-foreground text-xs">
                    {" · "}
                    {t(KNOWLEDGE_KIND[citation.kind] ?? citation.kind)}
                  </span>
                  {/* WHAT THE LIVE ROW SAYS RIGHT NOW. The passage is what was
                      indexed; this is what is true today, and the two
                      disagreeing is exactly the thing a reader must be told
                      rather than protected from. */}
                  {citation.liveStatus && (
                    <span className="text-muted-foreground text-xs">
                      {" · "}
                      {t("that record says “{status}” right now", { status: citation.liveStatus })}
                    </span>
                  )}
                  <OpenTheRecord from={citation} teamId={teamId} />
                </span>
              </div>
              {passages.map((p) => (
                // The passage as the assistant saw it, through the ONE renderer
                // a reply uses — most of these arrive as markdown now that
                // documents are converted into the base.
                <div key={p.seq} className="text-muted-foreground min-w-0 ps-7 text-sm break-words">
                  <AgentMarkdown text={p.text} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** THE LINK TO THE RECORD BEHIND A SOURCE — a ticket, a map, a meeting, or the
 * document in somebody's Drive.
 *
 * TWO KINDS OF DESTINATION AND EXACTLY ONE IS OFFERED. `recordPath` is a row this
 * app owns, opened in place through the soft-navigation bus; `url` is somewhere
 * else entirely, opened in a new tab and only after `safeHref` has agreed it is
 * a web address — a source URL arrives from Google, or from a person typing, and
 * a `javascript:` in an href is a rendered link nobody inspected.
 *
 * Nothing at all when a source has neither, which is the honest state of a note
 * somebody typed: it IS the record, and the title above already opens it. */
function OpenTheRecord({
  from,
  teamId,
}: {
  from: Pick<KnowledgeCitation | KnowledgePassage, "recordPath" | "url">
  teamId: string
}) {
  const t = useT()
  // Through the seam FIRST, and unconditionally: a URL is checked because of
  // where it came from, never because of which branch happens to render it.
  const external = safeHref(from.url)
  if (from.recordPath)
    return (
      <InAppLink
        href={`/t/${teamId}/${from.recordPath}`}
        className="text-primary flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
      >
        <SquareArrowOutUpRight className="size-3 shrink-0" aria-hidden />
        {t("Open the record")}
      </InAppLink>
    )
  if (!external) return null
  return (
    <a
      href={external}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      {t("Open the original")}
    </a>
  )
}
