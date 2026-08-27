"use client"

// ASK THE KNOWLEDGE BASE — the way in, on the knowledge page and on a record's
// own knowledge tab. A question box, and the assistant opens with the question
// already asked.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY THIS IS NOT A FORM WITH AN ANSWER UNDER IT ANY MORE.
//
// It was, and the reasoning for that was written down and was wrong in one
// specific way. The old panel argued for staying one-shot — "one request, one
// reply, nothing changed, no thread" — because a chat turn is expensive,
// stateful and can act, and a question is none of those. Every word of that is
// true and it answered the wrong question.
//
// THE OWNER, on what it cost him: an answer that came back too general and no
// way to say "no, I meant the dispatch window" — "I end up much more confused
// than clear." A question you cannot follow up is not a cheap conversation; it
// is a conversation that fails on turn one and makes you start again from
// nothing. So the one-shot form is gone, and its argument went with it rather
// than being left here as a comment defending the opposite of what the app now
// does.
//
// WHAT IT GAINS, and it is the whole reason the assistant is the right home:
// the answer now carries MARKS at the claims (RULING D7-2 — a numbered
// superscript where the sentence is made, and the source it came from
// underneath), the passages are one press away under every turn, and the next
// question is a follow-up rather than a fresh start.
//
// WHAT IT COSTS, said before it is spent. The old box could look for free —
// retrieval spends one embedding — and only charged when it wrote the answer
// out. The assistant charges for the turn. That is a real subtraction and it is
// the owner's decision, made with the number in front of him; the sentence
// under the box says it plainly rather than letting somebody discover it in the
// credit count.
//
// AND FOR A ROLE THAT CANNOT USE THE ASSISTANT AT ALL, this screen is now a
// refusal, so the refusal has to be a good one. Two different rights were in
// play here: reading the knowledge base is `knowledge:read` and asking a
// question is now `agent:create` — the right the chat door itself gates on
// (workers/data-ops/src/routes/agent.ts) — so somebody can hold the first and
// not the second. They keep the knowledge base — the list, every source, every record
// behind it — and lose only the ability to ASK. The sentence says exactly that,
// and who can change it, because "you don't have permission" on a screen with a
// question box on it reads as the product being broken.

import * as React from "react"

import { Button } from "@shared/ui/components/button/button"
import { Input } from "@shared/ui/components/input/input"
import { Search } from "@shared/ui/foundations/icons"

import { useT } from "@shared/web/language"
import { askAssistant } from "@/lib/agent-open"
import { usePermissions } from "@/lib/perms"
import { useActiveTeam } from "@/lib/use-active-team"

export function AskTheAssistant({
  context,
}: {
  /** THE RECORD'S OWN DETAILS, fed into the question automatically (CHECKLIST
   * 8.9 and 12.1 — Aurora asked for the base "in context"). It is prepended to
   * what the person types and it is SHOWN to them, because a question that was
   * quietly changed on the way to the assistant is an answer nobody can account
   * for. Absent on the knowledge page, which is about nothing in particular.
   *
   * IT ALSO NAMES THE COMPARTMENT, which is the one thing that changed here.
   * The old box passed the account's id straight to the door; the assistant
   * asks the same door itself and does not know that id, so the client is named
   * IN THE QUESTION and the door resolves the compartment from its own words —
   * the two-pass match it has always used for a question typed on the knowledge
   * page, where every word of an account's name must appear before it will file
   * a question under that client. R23's `reason` still says which compartment
   * it chose, in a sentence a person can disagree with. */
  context?: string
}) {
  const [question, setQuestion] = React.useState("")
  const t = useT()
  // MAY THIS PERSON USE THE ASSISTANT? Read from the same cached permissions the
  // launcher is gated on, so there is no extra fetch. The server decides again
  // at the door; this decides which SENTENCE is true for the person reading it.
  const teamId = useActiveTeam().ctx?.team?.id ?? null
  const { can } = usePermissions(teamId)
  const mayAsk = can("agent", "create")

  function ask(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    // In context, the record's own details lead the question — so "when is it
    // due?" asked on an app's page is "About the app Dispatch, built for Bergman
    // GmbH: when is it due?" by the time it reaches the assistant.
    askAssistant(context ? `About ${context}: ${q}` : q)
    setQuestion("")
  }

  if (!mayAsk)
    return (
      <div className="bg-card flex flex-col gap-2 rounded-[var(--radius)] border p-4">
        <p className="text-sm font-medium">{t("Asking a question needs the assistant")}</p>
        <p className="text-muted-foreground text-sm">
          {t(
            "Your role can read the knowledge base — every source is here, and so is the record behind it — but asking it a question goes through the assistant, which your role can't use. A team admin can turn that on for your role."
          )}
        </p>
      </div>
    )

  return (
    <div className="bg-card flex flex-col gap-4 rounded-[var(--radius)] border p-4">
      <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            context
              ? t("Ask about this record, e.g. what did we agree the last time?")
              : t("Ask the knowledge base, e.g. what did we agree about Bergman's dispatch window?")
          }
          aria-label={t("Ask the knowledge base")}
        />
        <Button type="submit" disabled={!question.trim()} className="shrink-0 gap-1">
          <Search className="size-4" aria-hidden />
          {t("Ask")}
        </Button>
      </form>
      {/* THE COST, SAID BEFORE IT IS SPENT — a line under the box rather than a
          tooltip, because the whole point is that nobody should have to go
          looking for it. And what you get for it, because the answer arriving in
          a panel somewhere else is a surprise unless the box says so. */}
      <p className="text-muted-foreground text-xs">
        {t(
          "The assistant opens with your question, answers from the knowledge base, and marks each claim with the source it came from — press a mark's source to read the passage itself. Each question uses one of the team's assistant credits."
        )}
      </p>
      {/* SAID OUT LOUD, because the question that gets asked is not the question
          that was typed. A person has to be able to see what was added. */}
      {context && (
        <p className="text-muted-foreground text-xs">
          {t("Your question is asked about")} {context}.
        </p>
      )}
    </div>
  )
}
