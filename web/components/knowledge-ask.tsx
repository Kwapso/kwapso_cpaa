"use client"

// ASK THE KNOWLEDGE BASE, ON THE KNOWLEDGE PAGE — a question box, the answer
// written out, the passages it was written from, and the sources they came from
// as links you can open.
//
// ════════════════════════════════════════════════════════════════════════════
// IT NOW WRITES THE ANSWER, AND IT SAYS WHAT THAT COSTS.
//
// The first version of this panel did not, and the reasoning was sound at the
// time: `GET /api/content/knowledge/ask` was a free READ, so the panel showed the
// retrieved passages, said so on screen, and pointed at the assistant for anyone
// who wanted it in words. What that missed is what the owner actually saw — he
// asked a question, got a list of extracts, and read it as the app declining to
// answer him. "I should have gotten a clear answer."
//
// So the door now writes it, one cheap model call, and the panel asks for that
// every time. The two objections the old design raised were both real and both
// answered rather than ignored:
//
//   • A SECOND ANSWERING PATH (R23). There isn't one. `knowledgeAnswer` is still
//     the one seam, the prose is an INPUT to it, and it rides the same `found`
//     the citations do — so a written answer cannot exist without the sources it
//     was written from. Nothing is assembled beside the seam.
//   • A SPENDING SCREEN WHERE A SEARCHING SCREEN BELONGS. Still true, which is
//     why the cost is a line under the box rather than a tooltip, why it is
//     stated BEFORE the first question rather than after the bill, and why the
//     sentence changes for somebody whose role has no assistant — they spend
//     nothing, so they are not told they do. A sentence about cost that is wrong
//     is the same class of fault as a privacy line that is wrong.
//
// WHY IT IS NOT `use-agent-chat`. That is the streaming co-pilot's whole state
// machine — a transcript, per-device thread resume, a broken-stream re-sync, a
// confirm pause, staged file attachments, quota accounting. Every one of those
// exists because a turn is expensive, stateful and can ACT. This is a question
// and its answer: one request, one reply, nothing changed, no thread. What IS
// reused is the piece that applies — `AgentMarkdown`, which is the ONE renderer
// for both surfaces, so the visual blocks the assistant can draw in chat are the
// same blocks that appear here, from the same catalogue, with no second renderer
// to keep in step.
//
// R23 IS THE CONTRACT, ON THE SCREEN. `found` false renders a plain sentence and
// nothing else — no invented answer, no "try rephrasing", no list of near-misses.
// `reason` is always shown, because a question answered out of the wrong client's
// compartment is invisible otherwise. And the passages stay UNDER the answer,
// with their links, because the owner's other sentence was that he wants to go
// and check the sources: an answer you cannot audit is a worse answer.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { ExternalLink, FileText, Search, SquareArrowOutUpRight } from "lucide-react"

import type { KnowledgeAnswer, KnowledgeCitation, KnowledgePassage } from "@shared/types"
import { useT } from "@shared/web/language"
import { safeHref } from "@shared/web/rich-text"
import { AgentMarkdown } from "@/components/agent-markdown"
import { ApiFailure, content } from "@/lib/api"
import { usePermissions } from "@/lib/perms"
import { useActiveTeam } from "@/lib/use-active-team"

export function KnowledgeAsk({
  onOpenSource,
  onOpenRecord,
  accountId,
  context,
}: {
  onOpenSource: (sourceId: string) => void
  /** OPEN THE RECORD ITSELF, one hop past the source. The owner's own sentence:
   * "the ability to go and check out the links to the sources or to those
   * particular records as well." The seam hands back a path relative to the team
   * (`tickets/<id>`) and the caller prefixes it, because only the caller knows
   * which team's screens it is standing in. */
  onOpenRecord: (path: string) => void
  /** WHICH CLIENT'S COMPARTMENT to search, when the screen already knows (R23:
   * `reason` says which one it chose, and naming it here is what stops a
   * question about one client being answered out of another's material). Null on
   * the knowledge page itself, where the question's own words decide. */
  accountId?: string | null
  /** THE RECORD'S OWN DETAILS, fed into the question automatically (CHECKLIST
   * 8.9 and 12.1 — Aurora asked for the base "in context"). It is prepended to
   * what the person types and it is SHOWN to them, because a question that was
   * quietly changed on the way to the server is an answer nobody can account
   * for. Absent on the knowledge page, which is about nothing in particular. */
  context?: string
}) {
  const [question, setQuestion] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // The question the ANSWER is about, kept separately from the box — otherwise
  // editing the box would silently re-label an answer that is still about the
  // old question.
  const [answer, setAnswer] = React.useState<KnowledgeAnswer | null>(null)
  const t = useT()
  // MAY THIS PERSON SPEND THE TEAM'S ASSISTANT ALLOWANCE? The same right the
  // co-pilot's launcher is gated on, read from the same cached permissions, so
  // there is no extra fetch. The server decides again at the door; this decides
  // which SENTENCE about cost is true for the person reading it.
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const { can } = usePermissions(teamId)
  const mayWrite = can("agent", "create")

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      // In context, the record's own details lead the question — so "when is it
      // due?" asked on an app's page is "About the app Dispatch, built for
      // Bergman GmbH: when is it due?" by the time it reaches retrieval.
      setAnswer(await content.askKnowledge(context ? `About ${context}: ${q}` : q, accountId, mayWrite))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't ask the knowledge base.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <form onSubmit={(e) => void ask(e)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            context
              ? t("Ask about this record, e.g. what did we agree the last time?")
              : t("Ask the knowledge base, e.g. what did we agree about Bergman's dispatch window?")
          }
          disabled={busy}
          aria-label={t("Ask the knowledge base")}
        />
        <Button type="submit" disabled={busy || !question.trim()} className="shrink-0 gap-1.5">
          {busy ? <Spinner /> : <Search className="size-4" />}
          {busy ? "Looking…" : "Ask"}
        </Button>
      </form>
      {/* THE COST, SAID BEFORE IT IS SPENT. A line under the box rather than a
          tooltip because the whole point is that nobody should have to go looking
          for it — and two sentences rather than one, because the cost is only
          true for somebody whose role can use the assistant at all. */}
      <p className="text-muted-foreground text-xs">
        {mayWrite
          ? t("This reads what the assistant can read and writes you the answer, with the passages and their sources underneath. Looking is free; writing the answer uses one of the team's assistant requests.")
          : t("This looks through what the assistant can read and shows you the passages and their sources. It doesn't use the team's assistant allowance.")}
      </p>
      {/* SAID OUT LOUD, because the question that gets asked is not the question
          that was typed. A person has to be able to see what was added. */}
      {context && (
        <p className="text-muted-foreground text-xs">
          {t("Your question is asked about")} {context}.
        </p>
      )}

      {answer && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <p className="text-sm font-medium">{answer.question}</p>
          {/* WHERE IT LOOKED, AND WHY. Always shown, found or not: a question
              answered out of the wrong client's material is invisible without
              this sentence, and it is the one a person can disagree with. */}
          <p className="text-muted-foreground text-xs">{answer.reason}</p>

          {!answer.found ? (
            // R23's decision, unchanged: `found` is false, so nothing is shown
            // that could be mistaken for an answer and nothing is guessed.
            //
            // But the seam's `message` is written for the ASSISTANT — "Say so
            // plainly, do not answer from memory" is an instruction to a model,
            // and it has been rendered to a person on this screen since the
            // screen was built. Nobody noticed while it was English and everyone
            // would notice in German. So the seam keeps its sentence for the
            // model, and the human reading this gets a human one, in their own
            // language. The FACT both report is identical and comes from the
            // same `found`.
            <p className="text-sm">{t("The knowledge base has nothing on this.")}</p>
          ) : (
            <>
              {/* THE ANSWER, written out of the passages below and nothing else.
                  Through the same markdown seam a reply uses, which is what makes
                  the visual blocks work here: one catalogue, one renderer, both
                  surfaces. */}
              {answer.answer ? (
                <div className="text-sm">
                  <AgentMarkdown text={answer.answer} />
                </div>
              ) : (
                mayWrite && (
                  // NOT SILENCE. Nothing was written — the model was unreachable,
                  // or the team's assistant requests are spent for today — and
                  // nothing was charged either. The material is still the answer,
                  // which is exactly what this panel used to be, so it says so
                  // rather than looking like it forgot.
                  <p className="text-muted-foreground text-sm">
                    {t("I couldn't write this one out just now, so here's what I found.")}
                  </p>
                )
              )}

              <div className="flex flex-col gap-4 border-t pt-3">
                {/* The evidence, kept UNDER the answer rather than replaced by it:
                    the answer is only trustworthy because you can read what it was
                    written from. */}
                <p className="text-xs font-medium">{t("What I read")}</p>
                {answer.passages.map((p) => (
                  <div key={`${p.sourceId}:${p.seq}`} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenSource(p.sourceId)}
                      // The app's CLICKABLE-ROW convention (account-detail-panels):
                      // ordinary foreground at rest, the accent on hover. Not
                      // `text-primary` at rest, which is the treatment the
                      // "open the original" links use: the brand accent is
                      // oklch lightness 0.87, and a source TITLE set in it on a
                      // near-white card is about 1.3:1 against its background —
                      // legible enough for one small link at the end of a
                      // screen, not for the heading of every passage in an
                      // answer. Seen on the screen rather than reasoned about.
                      className="hover:text-primary flex w-fit items-center gap-1.5 text-left text-sm font-medium underline-offset-2 hover:underline"
                    >
                      <FileText className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">{p.title}</span>
                    </button>
                    {/* The passage as the assistant sees it. Rendered through the
                        same markdown seam a reply uses — most of these arrive as
                        markdown now that documents are converted into the base. */}
                    <div className="text-muted-foreground text-sm">
                      <AgentMarkdown text={p.text} />
                    </div>
                    {/* AND THE RECORD IT CAME OUT OF. The title above opens the
                        SOURCE — what was indexed, and why. This opens the ticket,
                        the map or the meeting itself, which is what somebody
                        checking an answer actually wants to read. */}
                    <OpenTheRecord from={p} onOpenRecord={onOpenRecord} />
                  </div>
                ))}
              </div>

              {/* THE SOURCES, under the answer, as links that open the record.
                  One hop: a knowledge source's own screen is where its words,
                  its filing and — for a mirrored one — the "open where this came
                  from" link to the ticket or article all already live. Sending
                  somebody straight to the origin row instead would skip the
                  screen that says WHY the assistant knows this. */}
              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-xs font-medium">{t("Where this came from")}</p>
                <ul className="flex flex-col gap-1">
                  {answer.citations.map((c) => (
                    <li key={c.sourceId} className="text-sm">
                      <button
                        type="button"
                        onClick={() => onOpenSource(c.sourceId)}
                        className="hover:text-primary text-left underline underline-offset-2"
                      >
                        {c.title}
                      </button>
                      {/* WHAT THE LIVE ROW SAYS RIGHT NOW, when it says
                          anything. The passage is what was indexed; this is what
                          is true today, and the two disagreeing is exactly the
                          thing a reader must be told rather than protected from. */}
                      {c.liveStatus && (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                         , that record says &ldquo;{c.liveStatus}{t("” right now")}
                        </span>
                      )}
                      <OpenTheRecord from={c} onOpenRecord={onOpenRecord} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** THE LINK TO THE RECORD BEHIND A PASSAGE — a ticket, a map, a meeting, or the
 * document in somebody's Drive.
 *
 * TWO KINDS OF DESTINATION AND EXACTLY ONE IS OFFERED. `recordPath` is a row this
 * app owns, opened in place; `url` is somewhere else entirely, opened in a new
 * tab and only after `safeHref` has agreed it is a web address (the same
 * boundary the knowledge screen's own "open where this came from" link goes
 * through — a source URL arrives from Google, or from a person typing, and a
 * `javascript:` in an href is a rendered link nobody inspected).
 *
 * Nothing at all when a source has neither, which is the honest state of a note
 * somebody typed: it IS the record, and the title above already opens it. */
function OpenTheRecord({
  from,
  onOpenRecord,
}: {
  from: Pick<KnowledgePassage | KnowledgeCitation, "recordPath" | "url">
  onOpenRecord: (path: string) => void
}) {
  const t = useT()
  // Through the seam FIRST, and unconditionally: a URL is checked because of
  // where it came from, never because of which branch happens to render it.
  const external = safeHref(from.url)
  if (from.recordPath)
    return (
      <button
        type="button"
        onClick={() => onOpenRecord(from.recordPath as string)}
        className="text-primary flex w-fit items-center gap-1 text-xs underline-offset-2 hover:underline"
      >
        <SquareArrowOutUpRight className="size-3 shrink-0" aria-hidden />
        {t("Open the record")}
      </button>
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
