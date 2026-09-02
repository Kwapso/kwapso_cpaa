"use client"

// WHY THE ASSISTANT COULDN'T ANSWER, said gently and said TRUE.
//
// ════════════════════════════════════════════════════════════════════════════
// THE OWNER, 27 Aug 2026: "ensure that … we can figure out a way to gently show
// the user that this is the problem and we've run out of limits… Just a gentle,
// well-done warning."
//
// What he was reacting to: every way a model turn can die arrived as one
// sentence — "The assistant had trouble just now and couldn't reply. Please try
// again in a moment." That sentence is true of a key that has been switched
// off, a rate limit that will clear in ninety seconds, an account with no
// balance left, and a provider having a bad five minutes. Three of those a
// person can act on. One of them will never fix itself however many times they
// try again, and the app was telling them to try again.
//
// So the WORKER classifies (shared/workers/model-failure.ts) and this says the
// words. The split is not tidiness: a worker cannot call `t(...)`, so any
// English a worker writes is English a German reader gets. The reason travels
// as a code; the sentence is written here, in the catalogue, in the reader's own
// language (R28 + R33).
//
// ── THE WORDS ───────────────────────────────────────────────────────────────
// Written for a manager, not an operator: no status codes, no provider names,
// no "API". Each one says WHAT happened, whether waiting will help, and who can
// do something about it — in that order, because the second question is the one
// a person actually has ("do I sit here and retry?").
//
// THE ONE THAT NEEDED THE MOST CARE is `provider_out_of_credit`, because this
// app has its OWN thing called a credit (glossary: "Credit — one request to the
// assistant. Your team gets a batch free each day"). A sentence saying "out of
// credit" would send a manager to the usage screen to look at a number that is
// fine. So it says, in as many words, that this is not the team's credits.
//
// ── THE DRAWING ─────────────────────────────────────────────────────────────
// The kit's `Alert`, `variant="warning"` — a neutral panel with a mango dot,
// which is the kit's own law ("the state lives in the dot; the panel stays
// neutral — accents never become a background"). WARNING FOR ALL SIX, including
// the ones somebody must act on: a poppy dot reads as "something has broken",
// and nothing here is broken — the app is working correctly and reporting a
// limit. Gentle was the instruction, and the calmest honest mark is the right
// one. First call site of `Alert` in the app.

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@shared/ui/components/alert/alert"
import type { ModelFailure } from "@shared/types"
import { useT } from "@shared/web/language"

export function AssistantLimitNotice({ failure }: { failure: ModelFailure }) {
  const t = useT()

  // One heading and one sentence per reason, chosen in a switch rather than a
  // table so every string sits inside `t(...)` at the position a person reads it
  // (R33: a copy table would have to be registered as read-through-t elsewhere,
  // and six sentences do not earn that indirection).
  const said = (): { title: string; body: string } => {
    switch (failure) {
      case "unconfigured":
        return {
          title: t("The assistant isn't switched on here"),
          body: t(
            "Nothing is wrong with your team — this copy of the app hasn't been connected to the assistant yet. Whoever set it up can finish that, and everything else here keeps working in the meantime."
          ),
        }
      case "refused":
        return {
          title: t("The assistant has been turned off"),
          body: t(
            "Its connection was refused, so trying again won't help. Someone who looks after the account behind the assistant will need to switch it back on."
          ),
        }
      case "rate_limited":
        return {
          title: t("The assistant is being asked a lot at once"),
          body: t(
            "It has paused for a moment to catch up. Give it a minute and ask again — nothing you did caused this and nothing was lost."
          ),
        }
      case "provider_out_of_credit":
        return {
          title: t("The assistant's own account has run out"),
          body: t(
            "This isn't your team's assistant credits — those are untouched. The account the assistant itself runs on needs topping up before it can answer again."
          ),
        }
      case "overloaded":
        return {
          title: t("The assistant is very busy"),
          body: t("This usually clears in a minute or two. Ask again shortly and it should go through."),
        }
      default:
        return {
          title: t("The assistant couldn't be reached"),
          body: t("Something got in the way just now. Try again in a moment, and tell an admin if it keeps happening."),
        }
    }
  }

  const { title, body } = said()
  return (
    // `role="status"` rather than an alert role: this is a quiet report about
    // the app, not something interrupting what somebody is doing.
    //
    // No horizontal margin of its own any more (1 Sep 2026) — its one
    // caller, agent-panel.tsx, now supplies the panel's own standard
    // horizontal inset (`px-6 lg:px-[var(--space-7)]`, `CardContent`'s
    // pattern) on `.agent-chat-host`, so this notice sits flush with
    // everything else inside it rather than doubling the gutter.
    <Alert variant="warning" role="status" severityLabel={t("Notice")} className="mb-2">
      <div className="flex min-w-0 flex-col gap-1">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{body}</AlertDescription>
      </div>
    </Alert>
  )
}
