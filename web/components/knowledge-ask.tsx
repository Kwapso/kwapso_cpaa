"use client"

// ASK THE KNOWLEDGE BASE, ON THE KNOWLEDGE PAGE — a question box, the passages
// that answer it, and the sources they came from as links you can open.
//
// ════════════════════════════════════════════════════════════════════════════
// IT SPENDS NO ASSISTANT ALLOWANCE, AND IT SAYS SO ON THE SCREEN.
//
// This was the design decision, and it went the way it did because the door was
// already built and already free. `GET /api/content/knowledge/ask` is a READ:
// it spends ONE embedding of the question and no model writes a word (MCP.md's
// cost table puts it with the reads, beside the exports; `agent_chat` and
// `agent_confirm` are the only tools there that draw a whole turn). So the panel
// shows the RETRIEVED passages and their citations rather than composing prose,
// and it costs the team nothing.
//
// The alternative — pipe the answer through the assistant so it reads as a
// paragraph — is perfectly defensible and was rejected for two reasons. It would
// build a SECOND answering path, which R23 exists to prevent (`knowledgeAnswer`
// is the one seam, and a door that assembles half a contract ships half a
// contract). And it would put a spending screen where a searching screen
// belongs: a person types six questions in a row here, and a quota that drains
// from something that looks free is the exact surprise this product is built not
// to have. So the panel says which it is, in a line under the box, and points at
// the assistant for the other thing.
//
// WHY IT IS NOT `use-agent-chat`. That is the streaming co-pilot's whole state
// machine — a transcript, per-device thread resume, a broken-stream re-sync, a
// confirm pause, staged file attachments, quota accounting. Every one of those
// exists because a turn is expensive, stateful and can act. This is a question
// and its evidence: one request, one answer, nothing changed, no thread. There
// is no transcript here to write a second one of. What IS reused is the piece
// that actually applies — `AgentMarkdown`, so a passage reads the same way a
// reply does, which matters more now that half the passages in the base were
// converted FROM documents and arrive as markdown.
//
// R23 IS THE CONTRACT, ON THE SCREEN. `found` false renders the seam's own
// `message` word for word and nothing else — no invented sentence, no "try
// rephrasing", no list of near-misses. And `reason` is always shown, because a
// question answered out of the wrong client's compartment is invisible
// otherwise.

import * as React from "react"

import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import { FileText, Search } from "lucide-react"

import type { KnowledgeAnswer } from "@shared/types"
import { useT } from "@shared/web/language"
import { AgentMarkdown } from "@/components/agent-markdown"
import { ApiFailure, content } from "@/lib/api"

export function KnowledgeAsk({
  onOpenSource,
  accountId,
  context,
}: {
  onOpenSource: (sourceId: string) => void
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

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      // In context, the record's own details lead the question — so "when is it
      // due?" asked on an app's page is "About the app Dispatch, built for
      // Bergman GmbH: when is it due?" by the time it reaches retrieval.
      setAnswer(await content.askKnowledge(context ? `About ${context}: ${q}` : q, accountId))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't ask the knowledge base.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <form onSubmit={(e) => void ask(e)} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            context
              ? t("Ask about this record — e.g. what did we agree the last time?")
              : t("Ask the knowledge base — e.g. what did we agree about Bergman's dispatch window?")
          }
          disabled={busy}
          aria-label={t("Ask the knowledge base")}
        />
        <Button type="submit" disabled={busy || !question.trim()} className="shrink-0 gap-1.5">
          {busy ? <Spinner /> : <Search className="size-4" />}
          {busy ? "Looking…" : "Ask"}
        </Button>
      </form>
      {/* THE COST, SAID BEFORE IT IS SPENT — see the header. It is a line under
          the box rather than a tooltip because the whole point is that nobody
          should have to go looking for it. */}
      <p className="text-muted-foreground text-xs">
        {t("This looks through what the assistant can read and shows you the passages and their sources. It doesn't use the team's assistant allowance — open the assistant if you want the answer written out.")}
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
              <div className="flex flex-col gap-4">
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
                          — that record says &ldquo;{c.liveStatus}{t("” right now")}
                        </span>
                      )}
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
