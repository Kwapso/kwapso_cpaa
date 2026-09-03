"use client"

// The agent chat's STATE MACHINE, extracted from agent-panel.tsx so the panel
// stays a render shell. Owns: the transcript, the active thread (+ per-device
// resume via localStorage and cross-device resume via the server's newest
// thread), the SSE stream consumer (text deltas, live step rows, the confirm
// pause, the terminal settle), the broken-stream re-sync (show the SAVED truth,
// never a false failure), staged file attachments (the chat import), and the
// send / confirm-resolve / new-chat / open-thread actions.

import * as React from "react"

import { useT } from "@shared/web/language"

import type { AgentChatMessage } from "@shared/ui/components/agent-chat/agent-chat"

/** One chat row. The kit's message, or a TOOL STEP — the old library's chat
 * drew tool rows itself; the kit's does not, so the row is app data here and
 * the panel renders it as an assistant-side step chip. */
export type AgentChatItem =
  /** An assistant turn also carries WHAT IT READ, when it read anything: the
   * answer seam's own citations and passages (Law R23). The kit's message type
   * carries `sources` — the ruled `collection · record` pills — and the panel
   * maps this onto them, because the ruled shape is two names and the evidence
   * is a knowledge source with a kind, a record path and the passage's words.
   * Mapping in the panel keeps the kind's WORD on the side that can translate
   * it.
   *
   * `createdAt` — the eyebrow the panel draws above each bubble (the owner,
   * 31 Aug 2026: timestamps, "like an eyebrow on top of the bubble", matching
   * `TicketThread`'s own author/time row). A saved turn carries the server's
   * own `AgentMessage.createdAt`; a turn born in THIS session (optimistic send,
   * or the assistant bubble a stream is about to fill) has no server row yet,
   * so it is stamped with the moment it appeared here — close enough for an
   * "eyebrow", and corrected to the server's own value the next time this
   * thread is loaded from storage. */
  | (AgentChatMessage & { evidence?: TurnEvidence; createdAt?: string })
  | { id: string; role: "tool"; actionLabel: string; status: "pending" | "done" | "failed" }
import type { RunStep } from "@shared/ui/components/run-steps/run-steps"
import { toast } from "@shared/ui/components/sonner/sonner"

import type { AgentMessage, AgentQuota, ModelFailure, PendingCall } from "@shared/types"
import { evidenceFromSaved, mergeEvidence, type TurnEvidence } from "@shared/agent-cites"
import { SOURCE_CHIP_KEYS } from "@shared/knowledge-chips"
import { ApiFailure, dataOps, type AgentStreamEvent } from "@/lib/api"
import { fileToCsv, UserFileError } from "@/lib/file-to-csv"
import { clearPendingQuestion, usePendingQuestion } from "@/lib/agent-open"
import { traceFor } from "@/lib/agent-trace"
import { emitTrace } from "@/lib/screen-trace"
import { AgentMarkdown } from "@/components/agent-markdown"
import { reportError } from "@shared/web/log"

let nextId = 0
const newId = () => `m${++nextId}`

/* ────────────────────────────────────────────────────────────────────────
   THE LIVE CHAT STATE, HOISTED TO MODULE LEVEL.

   THE BUG: AgentHost (web/components/agent-host.tsx) renders EITHER the
   docked column OR a floating `Popover`, chosen by `useShellColumns()` (a
   48rem media query) — two structurally different subtrees at the same
   return, so React UNMOUNTS AgentPanel (and this hook with it) the instant a
   window crosses that width, or a tablet rotates through it (many sit
   exactly at 768px in portrait). Every field below used to be a plain
   `React.useState` owned by that one component instance, so crossing the
   width silently destroyed the transcript, the thread, staged attachments
   and a confirm the assistant was mid-way through waiting on — with nobody
   told; the panel just came back empty.

   THE FIX matches the precedent already in this codebase for exactly this
   failure mode — `web/lib/agent-open.ts` (the open flag) and
   `web/lib/agent-dock.tsx` (the dock node) both live outside the React tree
   so a remount can't lose them. `makeCell` below is that same shape
   (a module-level value + a subscriber Set + `useSyncExternalStore`),
   factored once because this hook owns eight such fields where those two
   files each own one — writing it out eight times would be the copy that
   drifts, not the fix.

   NO KEY, ON PURPOSE — matching both files above: the app shows one team's
   assistant at a time (the ACTIVE team), so one shared cell per field is the
   same "one flag, one node" shape they already use, not a Map this hook has
   no reason to keep in sync with anything.

   SIGN-OUT NEEDS NO EXPLICIT CLEARING, for the same reason those two files
   don't have any: leaving the app (the /login boundary) is a genuine,
   full-page reload — "entering or leaving the app is the one real
   navigation" (EDGE-CASES.md §1) — which throws away this whole JS heap,
   this module included. A transcript cannot survive a sign-out because
   nothing module-level here does; the one thing that WOULD leak it is a
   soft, in-SPA route change, and /login sits outside the one client-resolved
   shell that soft-navigation covers. */
function makeCell<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  function set(next: T | ((prev: T) => T)): void {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next
    if (Object.is(resolved, value)) return
    value = resolved
    for (const fn of subs) fn()
  }
  function useValue(): T {
    return React.useSyncExternalStore(
      (cb) => {
        subs.add(cb)
        return () => subs.delete(cb)
      },
      () => value,
      () => initial
    )
  }
  return { set, useValue }
}

const itemsCell = makeCell<AgentChatItem[]>([])
const threadIdCell = makeCell<string | undefined>(undefined)
const attachedCell = makeCell<{ name: string; csv: string }[]>([])
const sourcesCell = makeCell<string[]>([...SOURCE_CHIP_KEYS])
const busyCell = makeCell(false)
const quotaCell = makeCell<AgentQuota | null>(null)
const pendingCell = makeCell<{ calls: PendingCall[]; text: string } | null>(null)
const failureCell = makeCell<ModelFailure | null>(null)
/** A TURN HAS BEGUN. Module-level rather than a per-instance ref, for the same
 * reason as the cells above: an in-flight resume that started BEFORE a
 * remount must still see the flag it set AFTER the remount, or the exact
 * stale-resume race `handed-in-question.test.tsx` locks reopens the moment
 * this hook's own component gets torn down and rebuilt mid-turn. */
let started = false

// We remember the last thread per team so reopening the panel resumes it (instead of
// minting a fresh thread each time). localStorage is per-device and best-effort —
// every access is guarded so a locked-down browser never breaks the panel.
const lastThreadKey = (teamId: string) => `kwapso:agent:lastThread:${teamId}`
const readLastThread = (teamId: string): string | null => {
  try {
    return localStorage.getItem(lastThreadKey(teamId))
  } catch {
    return null
  }
}
const writeLastThread = (teamId: string, id: string) => {
  try {
    localStorage.setItem(lastThreadKey(teamId), id)
  } catch {
    /* ignore — resume is a nicety, not a requirement */
  }
}
const clearLastThread = (teamId: string) => {
  try {
    localStorage.removeItem(lastThreadKey(teamId))
  } catch {
    /* ignore */
  }
}

/** Map a saved thread's messages back onto chat rows: user/assistant become bubbles
 * (markdown-rendered like a live reply), tool rows become the compact status line
 * with the outcome the server RECORDED (done/failed + the failed step's reason).
 * Rows saved before outcomes were recorded fall back to the fenced content's own
 * verdict ("FAILED: …" vs "OK. …") — never a false green.
 *
 * EMPTY assistant turns are DROPPED. A multi-step turn saves one assistant message per
 * model call, and a call that only ran tools carries no text — those would render as
 * empty grey bubbles ("blank pills") between the step rows on resume. The tool rows
 * already show what happened, so an empty assistant bubble is pure noise. (We keep them
 * server-side — the model replay needs them — just don't paint them.) */
const toChatItems = (messages: AgentMessage[]): AgentChatItem[] => {
  // WHAT THE LAST RETRIEVAL FOUND, carried forward to the assistant turn that
  // was written from it. A saved thread stores the retrieval as the tool row's
  // own text (evidenceFromSaved), and the answer is the message AFTER it — so a
  // conversation reopened tomorrow draws the same sources it drew live, and the
  // marks in its prose still have pills to point at. Nothing was added to the
  // database for this: the audit trail R23 already wanted IS the record.
  let pending: TurnEvidence | undefined
  return messages
    .filter((m) => !(m.role === "assistant" && !(m.content ?? "").trim()))
    .map((m): AgentChatItem => {
      if (m.role === "tool") {
        const found = evidenceFromSaved(m.toolCalls?.[0]?.tool, m.content)
        if (found) pending = mergeEvidence(pending, found)
        return {
          id: m.id,
          role: "tool",
          actionLabel: m.toolCalls?.[0]?.summary ?? m.toolCalls?.[0]?.tool ?? "Action",
          status: m.toolCalls?.[0]?.status ?? (m.content?.startsWith("FAILED") ? "failed" : "done"),
        }
      }
      const evidence = m.role === "assistant" ? pending : undefined
      // Spent: the next question's answer stands on its own retrieval, which is
      // the same sentence the model is told (CITE_RULE).
      pending = undefined
      return {
        id: m.id,
        role: m.role,
        content: <AgentMarkdown text={m.content ?? ""} />,
        evidence,
        createdAt: m.createdAt,
      }
    })
}

/** The paused turn's proposed actions, as the panel's step rows: the one-line
 * summary AND — under it — the payload the door will receive (server-built, see
 * shared/workers/confirm-payload.ts). The detail lines are what makes the panel a
 * CONFIRM rather than a permission slip: approving "Set access rights for the Sub
 * Admin role" without seeing which rights is approving something you can't read.
 * Exported (and pure) so the render test can prove the payload really paints. */
export function confirmStepsFrom(calls: PendingCall[]): RunStep[] {
  return calls.map((c) => ({
    label: c.summary,
    state: "pending" as const,
    description: c.details?.length ? (
      <span data-details className="flex flex-col gap-1">
        {c.details.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </span>
    ) : undefined,
  }))
}

export function useAgentChat(teamId: string | null, open: boolean, canUse: boolean) {
  const t = useT()
  // Every field below reads/writes the module-level cells above, NOT a local
  // `React.useState` — see the block comment there for why: it is what lets
  // the transcript, the thread, staged attachments and a pending confirm
  // survive AgentHost swapping this hook's own component out from under it
  // when the docked/floating breakpoint crosses.
  const items = itemsCell.useValue()
  const setItems = itemsCell.set
  const threadId = threadIdCell.useValue()
  const setThreadId = threadIdCell.set
  // CSV files staged for the NEXT message (the chat import): picked or dropped,
  // sent with the message, planned server-side, run via the normal confirm panel.
  const attached = attachedCell.useValue()
  const setAttached = attachedCell.set
  // WHICH DOORS THIS CONVERSATION READS FROM — the source chips.
  //
  // ALL ON is the state a person who has never touched them is in, and the wire
  // carries the TICKED set rather than the unticked one, so "all on" and "never
  // touched" are the same message. Held for the whole conversation rather than
  // per message: a person narrows to find out where an answer came from, and a
  // scope that reset after one question would answer the next one from
  // everywhere again without saying so.
  const sources = sourcesCell.useValue()
  const setSources = sourcesCell.set
  const toggleSource = React.useCallback((key: string) => {
    setSources((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      // NEVER EMPTY. An empty list reads as "all of them" everywhere behind this
      // (see `kindsForChips`), so unticking the last chip would silently WIDEN
      // the search — the opposite of what the person just pressed. The last one
      // on stays on, and the control simply does not move.
      return next.length ? next : prev
    })
    // `setSources` is `sourcesCell.set` — a fixed module-level function, stable
    // across every render exactly like `useState`'s own setter, so listing it
    // here cannot make this callback identity change.
  }, [setSources])
  const busy = busyCell.useValue()
  const setBusy = busyCell.set
  const quota = quotaCell.useValue()
  const setQuota = quotaCell.set
  // A paused turn awaiting the user's go-ahead — the proposed actions + the text.
  const pending = pendingCell.useValue()
  const setPending = pendingCell.set
  // WHY THE LAST TURN COULDN'T ANSWER, when the model door was the reason. Held
  // beside the transcript rather than inside it: the bubble is what the assistant
  // SAID, and this is a fact about the app, which is a different thing and gets
  // its own quiet notice. Cleared the moment the next question is asked — a
  // warning about a limit that has since cleared is its own small lie.
  const failure = failureCell.useValue()
  const setFailure = failureCell.set

  // A QUESTION HANDED IN FROM A SCREEN (web/lib/agent-open.ts): the knowledge
  // base's ask box, and the same box on an account's or an app's knowledge tab.
  // It waits for the panel to be open, for the person to be allowed to use the
  // assistant, and for any turn already running to finish — then it is sent as
  // an ordinary message and forgotten. Cleared BEFORE the send, so a re-render
  // mid-request cannot ask it twice and spend the credit twice.
  const handedIn = usePendingQuestion()
  React.useEffect(() => {
    if (!handedIn || !open || !canUse || busy) return
    clearPendingQuestion()
    void send(handedIn)
    // `send` is remade every render and closes over the state it needs; listing
    // it would re-fire this on every keystroke in the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedIn, open, canUse, busy])


  // On open: pull the quota (cheap; not cached — it changes per turn) and, if this is
  // a fresh panel (no messages yet), RESUME the right conversation. Resume order:
  //   1. the thread this DEVICE last used (localStorage) — instant, offline-friendly;
  //   2. else the caller's NEWEST thread on the SERVER — this is what makes a chat you
  //      started on the laptop show up when you open the phone (cross-device resume).
  // A brand-new user with no threads just starts empty. Best-effort throughout — a
  // failed load must never keep the panel from opening.
  React.useEffect(() => {
    if (!open || !canUse) return
    let alive = true
    dataOps
      .agentUsage()
      .then((r) => alive && setQuota(r.quota))
      // Swallowed on purpose: the quota badge is decoration on the way in. If the
      // count doesn't arrive, `quota` stays null and the badge simply doesn't
      // render — the panel still opens and the conversation still works. Failing
      // loudly here would block the panel over a number nobody asked for.
      .catch(() => {})

    if (teamId && items.length === 0) {
      const stored = readLastThread(teamId)
      const pickThreadId = async (): Promise<string | undefined> => {
        if (stored) return stored
        // No local memory on this device — fall back to the server's newest thread.
        const r = await dataOps.agentThreads().catch(() => null)
        return r?.threads[0]?.id
      }
      void pickThreadId().then((id) => {
        if (!alive || !id) return
        dataOps
          .agentThread(id)
          .then((r) => {
            // THE PRECONDITION IS RE-READ HERE, not only where this started.
            //
            // THE BUG, reported live on 2026-08-28: the owner asked a question
            // from the knowledge base's ask box, watched the tool row tick
            // green, and then got NOTHING — no answer, no error, two credits
            // spent, and the answer sitting in the database all along.
            //
            // Opening the panel and sending are one action on that path, so
            // this resume and the turn start together. The resume began when
            // `items` really was empty, its fetch took a few hundred
            // milliseconds, and `setItems(toChatItems(...))` then REPLACED the
            // whole array — including the empty assistant bubble the stream was
            // writing into. Every later delta mapped over an id that was no
            // longer there and went nowhere. The step rows survived because
            // `step_start` appends when it cannot find the bubble; the answer
            // had no such fallback (it does now, below).
            //
            // A stale async write has to re-ask its own question at the moment
            // it lands. `alive` covered unmounting and nothing else.
            if (!alive || started) return
            setItems(toChatItems(r.messages))
            setThreadId(id)
            // Remember it on THIS device so the next open resumes instantly.
            if (teamId) writeLastThread(teamId, id)
          })
          .catch(() => {
            // The thread is gone or unreadable — forget the local pointer, start clean.
            if (alive && stored) clearLastThread(teamId)
          })
      })
    }
    return () => {
      alive = false
    }
    // items.length is read as an open-time snapshot, not a trigger — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canUse, teamId])

  /** Consume one agent stream (chat or confirm-continuation) into the live UI.
   * `assistantId` is the empty assistant bubble already appended for this turn —
   * text deltas fill it, steps insert tool rows before it, and the terminal event
   * settles the turn. Shared by send() and resolve() so behaviour is identical
   * across the confirm boundary. */
  async function consume(
    run: (onEvent: (ev: AgentStreamEvent) => void) => Promise<void>,
    assistantId: string
  ) {
    // The assistant reply text accrues here so we don't chase stale state on each
    // rapid delta; step rows are keyed by tool so step_end can flip the right one.
    let replyText = ""
    const stepIdByTool = new Map<string, string>()

    /** WRITE THE ASSISTANT'S WORDS, wherever its bubble has got to.
     *
     * The turn's bubble is created optimistically at send time and everything
     * the model says is addressed to that id — so anything that removes it
     * mid-stream silently swallows the answer. That is not hypothetical: it
     * happened, in front of the owner, and cost him two credits and an answer
     * he never saw (the resume race above).
     *
     * The race is fixed at its cause. This is the SECOND lock, and it is the one
     * that holds for a cause nobody has thought of yet: if the bubble is gone,
     * the words are APPENDED rather than dropped. A reply in a slightly odd
     * place is recoverable; a reply that was never shown is not. `step_start`
     * has always done exactly this, which is precisely why the tool rows
     * survived the bug and the answer did not. */
    const writeAssistant = (content: React.ReactNode) =>
      setItems((prev) =>
        prev.some((it) => it.id === assistantId)
          ? prev.map((it) => (it.id === assistantId ? { ...it, content } : it))
          : [
              ...prev,
              { id: assistantId, role: "assistant" as const, content, createdAt: new Date().toISOString() },
            ]
      )

    await run((ev) => {
      switch (ev.t) {
        case "text": {
          replyText += ev.d
          writeAssistant(<AgentMarkdown text={replyText} />)
          break
        }
        case "step_start": {
          const stepId = newId()
          stepIdByTool.set(ev.tool, stepId)
          // Insert the pending tool row BEFORE the assistant bubble (steps run, then
          // the reply lands under them).
          setItems((prev) => {
            const idx = prev.findIndex((it) => it.id === assistantId)
            const row: AgentChatItem = { id: stepId, role: "tool", actionLabel: ev.summary, status: "pending" }
            if (idx < 0) return [...prev, row]
            return [...prev.slice(0, idx), row, ...prev.slice(idx)]
          })
          // Real-screen trace: the ENGINE (AppShell) moves the screen — soft go()
          // inside /t, a client router.push from anywhere else. step_start now
          // carries the call's record ids, so a detail-target tool lands on the
          // RECORD; with no ids it falls back to the list (strip the dangling /).
          if (teamId) {
            const target = traceFor(ev.tool, ev.ids ?? {}, teamId)
            if (target)
              emitTrace({ teamId, target: { ...target, path: target.path.replace(/\/$/, "") } })
          }
          break
        }
        case "step_end": {
          const stepId = stepIdByTool.get(ev.tool)
          // A failed step shows WHY on the row itself (the door's short reason, e.g.
          // which permission was missing) — same combined label the server persists.
          const label = ev.ok || !ev.error ? ev.summary : `${ev.summary}, ${ev.error}`
          setItems((prev) =>
            prev.map((it) =>
              it.id === stepId
                ? { ...it, actionLabel: label, status: ev.ok ? "done" : "failed" }
                : it
            )
          )
          break
        }
        case "sources": {
          // R23, arriving mid-turn: what the retrieval found, hung on the turn
          // that is being written from it. Merged rather than replaced — a turn
          // may ask twice, and the citation's POSITION is the number the mark in
          // the prose points at, so an existing source keeps the place it had.
          setItems((prev) =>
            prev.map((it) =>
              it.id === assistantId && it.role === "assistant"
                ? { ...it, evidence: mergeEvidence(it.evidence, { citations: ev.citations, passages: ev.passages }) }
                : it
            )
          )
          break
        }
        case "confirm": {
          // Terminal: a destructive act needs a yes/no. Adopt the thread id the event
          // carries — on a FIRST-turn confirm this is the ONLY place the client learns
          // it (a paused turn never reaches `final`), and resolve() needs it or the
          // approve/decline buttons no-op. Remember it on this device too.
          setThreadId(ev.threadId)
          if (teamId) writeLastThread(teamId, ev.threadId)
          // Drop the empty bubble (the confirm panel carries the lead-in) unless the
          // model sent lead-in text.
          setItems((prev) =>
            ev.text
              ? prev.map((it) =>
                  it.id === assistantId ? { ...it, content: <AgentMarkdown text={ev.text as string} /> } : it
                )
              : prev.filter((it) => it.id !== assistantId)
          )
          setPending({ calls: ev.calls, text: ev.text ?? "" })
          break
        }
        case "final": {
          const out = ev.outcome
          // The loop turns a model failure into a settled turn rather than a
          // 500, so `done` is true and this is the ONLY thing that says the
          // answer never happened.
          if (out.done && out.failure) setFailure(out.failure)
          setThreadId(out.threadId)
          // Remember this thread so reopening the panel resumes it (best-effort).
          if (teamId && out.threadId) writeLastThread(teamId, out.threadId)
          setQuota(out.quota)
          const finalText = out.done ? out.reply : (out.assistantText ?? replyText)
          // The server streams EVERYTHING the assistant says as text events, so the
          // accumulated text wins — a lead-in ("I can't create teams, but…") is never
          // overwritten by a later wrap-up note. `final`'s reply is the fallback for
          // a turn that streamed nothing; drop a bubble that stayed empty.
          const text = replyText || finalText
          if (text) writeAssistant(<AgentMarkdown text={text} />)
          else setItems((prev) => prev.filter((it) => it.id !== assistantId))
          break
        }
        case "error": {
          // A model failure that never reached the loop's own catch — a worker
          // with no key is the ordinary one, because `selectModel` throws before
          // the loop exists to catch it.
          //
          // AND ITS MESSAGE NEVER REACHES THE BUBBLE. `ev.message` on this path
          // is written for the error store — "model_error: Claude returned 403.
          // {…}" — and putting it in the conversation is the same fault this
          // whole change is about, one layer down: a person is handed a status
          // code instead of a sentence. Seen on screen before it was fixed. So a
          // CLASSIFIED failure gets the same short line the server saves for its
          // own settled turns, translated here where `t` exists, and the notice
          // beside the composer does the explaining. An UNclassified one keeps
          // the server's message, because then it really is all we know.
          if (ev.reason) setFailure(ev.reason)
          writeAssistant(ev.reason ? t("I couldn't answer that one.") : ev.message)
          break
        }
      }
    })
  }

  /** The stream broke mid-turn (phones drop long-held connections when the screen
   * locks or the network blips) — but the SERVER almost always FINISHED the turn
   * and saved every step + the reply. Re-load the saved thread and show the truth
   * instead of a scary "something went wrong" that makes completed work look
   * failed (the owner hit exactly this on 5G). Returns false if even the re-sync
   * fails, so the caller can fall back to the plain message. */
  async function resyncAfterDrop(): Promise<boolean> {
    try {
      // The turn may have CREATED the thread server-side before we ever got its id.
      const id = threadId ?? (await dataOps.agentThreads()).threads[0]?.id
      if (!id) return false
      const r = await dataOps.agentThread(id)
      setItems(toChatItems(r.messages))
      setThreadId(id)
      setPending(null)
      if (teamId) writeLastThread(teamId, id)
      dataOps
        .agentUsage()
        .then((u) => setQuota(u.quota))
        // Swallowed on purpose: the re-sync has ALREADY succeeded by here — the
        // messages are restored and the thread is pinned. This last refresh only
        // freshens the quota badge. Letting it reject would drop us into the outer
        // catch and return false, showing the "something went wrong" message this
        // whole function exists to avoid. The badge just keeps its old number.
        .catch(() => {})
      return true
    } catch {
      return false
    }
  }

  async function addAttachments(list: FileList | null) {
    if (!list || !list.length || busy) return
    const next = [...attached]
    for (const file of Array.from(list)) {
      if (next.length >= 8) {
        toast.error(t("Attach up to 8 files at a time."))
        break
      }
      try {
        const csv = await fileToCsv(file)
        if (csv.length > 5_000_000) {
          toast.error(`"${file.name}" is too large (up to about 5 MB).`)
          continue
        }
        next.push({ name: file.name, csv })
      } catch (err) {
        toast.error(err instanceof UserFileError ? err.message : `Couldn't read "${file.name}".`)
      }
    }
    setAttached(next)
  }

  function removeAttachment(index: number) {
    setAttached((prev) => prev.filter((_, j) => j !== index))
  }

  async function send(text: string) {
    if (busy) return
    // Before anything is appended: from here on, a resume that was already in
    // flight must leave this panel alone.
    started = true
    const assistantId = newId()
    const files = attached.length ? attached : undefined
    // Same attachment note the server saves, so the optimistic bubble matches history.
    const shown = files ? `${text}\n(Attached: ${files.map((f) => f.name).join(", ")})` : text
    // Optimistic: the user's message appears instantly, and an empty assistant row
    // carries the animated 3-dot indicator (showTyping) until reply text streams.
    const now = new Date().toISOString()
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: shown, createdAt: now },
      { id: assistantId, role: "assistant", content: "", createdAt: now },
    ])
    setBusy(true)
    setPending(null)
    setFailure(null)
    setAttached([])
    try {
      // The ticked set rides every turn. Sent only when it is a real narrowing:
      // all-on is the same request the panel made before the chips existed.
      const narrowed = sources.length < SOURCE_CHIP_KEYS.length ? sources : undefined
      await consume(
        (onEvent) =>
          dataOps.agentChatStream({ message: text, threadId, files, sources: narrowed }, onEvent),
        assistantId
      )
    } catch (err) {
      // The person sees the failure in the bubble; the error store must see it
      // too — a chat drop was the one user-facing crash that left no row
      // anywhere (round-one error_log review: the agent UI swallowed
      // everything it caught).
      reportError("agent-chat/send", err)
      if (!(await resyncAfterDrop())) {
        const msg = err instanceof ApiFailure ? err.message : "The connection dropped. Reopen the chat to see what happened."
        setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
      }
    } finally {
      setBusy(false)
    }
  }

  async function resolve(approve: boolean) {
    if (!pending || !threadId || busy) return
    const calls = pending.calls
    const assistantId = newId()
    setBusy(true)
    setPending(null)
    // On decline, reflect each proposed action as a skipped (failed) row, then wrap
    // up. On approve we DON'T pre-render the rows — the streamed step_* events do it
    // live (with the real ok/failed outcome), so the rows match what actually ran.
    setItems((prev) => [
      ...prev,
      ...(approve
        ? []
        : calls.map(
            (c): AgentChatItem => ({ id: newId(), role: "tool", actionLabel: c.summary, status: "failed" })
          )),
      { id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ])
    try {
      await consume(
        (onEvent) =>
          dataOps.agentConfirmStream({ threadId, approve, calls: approve ? calls : [] }, onEvent),
        assistantId
      )
    } catch (err) {
      reportError("agent-chat/resolve", err) // send's twin — same reason
      if (!(await resyncAfterDrop())) {
        const msg =
          err instanceof ApiFailure ? err.message : "The connection dropped. Reopen the chat to see what happened."
        setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: msg } : it)))
      }
    } finally {
      setBusy(false)
    }
  }

  // Start a fresh conversation: clear the transcript + the paused turn, forget the
  // thread (so the next turn mints a new one), and drop the remembered thread so a
  // later reopen doesn't resume this one.
  function newChat() {
    if (busy) return
    // A deliberate reset is allowed to clear the flag — the person asked for an
    // empty panel, so a resume landing afterwards has nothing to trample.
    started = false
    setItems([])
    setThreadId(undefined)
    setPending(null)
    setFailure(null)
    if (teamId) clearLastThread(teamId)
  }

  // Reopen a past conversation (from the history view): load its messages, make it
  // the active thread, and remember it on this device. Best-effort — a failed load
  // just leaves the current chat as-is.
  async function openThread(id: string) {
    if (busy) return
    try {
      const r = await dataOps.agentThread(id)
      setItems(toChatItems(r.messages))
      setThreadId(id)
      setPending(null)
      if (teamId) writeLastThread(teamId, id)
    } catch {
      /* leave the current conversation in place */
    }
  }

  // Animated 3-dot indicator: live while a turn runs and the trailing assistant
  // bubble still has no text — so it fills the gap before the first event, every
  // step_end→step_start gap, and the wait for the first reply delta, then vanishes
  // the moment reply text streams (or a confirm/final drops the empty bubble).
  //
  // THIS WAS COMPUTED AND NEVER DRAWN. `showTyping` fed `AgentChat`'s
  // `streaming` prop, which does exactly one thing with it — a blinking caret
  // AFTER the last assistant turn's own content — and there was no assistant
  // turn to put it after: the panel's placeholder bubble carries `content: ""`,
  // so the caret rendered alone in an otherwise-empty box. That is what the
  // library actually has a state for (`thinking` — "three breathing dots as
  // their own turn"), and it was never wired up. `showTyping` now feeds
  // `thinking` instead (agent-panel.tsx), and the placeholder bubble is kept
  // OUT of the rendered turn list while it carries no text — see the filter
  // there — so the dots are the only thing standing in for "nothing arrived
  // yet", and the caret is free to mean what it always meant: a turn IS being
  // written into, and it only turns on once real text has (`streamingReply`).
  const lastAssistant = [...items].reverse().find((it): it is AgentChatMessage => it.role === "assistant")
  const showTyping = busy && !pending && !lastAssistant?.content
  // The blinking caret's own condition — the mirror of `showTyping` above.
  // Kept separate rather than reusing `busy` directly: while `pending` (a
  // paused confirm) there is no live text turn to blink a caret onto, and
  // while a tool step is running mid-turn the trailing item in the RAW list
  // can be that step's row rather than the reply bubble — `lastAssistant`
  // already skips role:"tool" rows, so this only goes true once the actual
  // reply bubble is the one holding text.
  const streamingReply = busy && !pending && !!lastAssistant?.content

  // The proposed actions as RunSteps (pending until the user decides).
  const confirmSteps: RunStep[] = pending ? confirmStepsFrom(pending.calls) : []

  // An UNCAPPED environment counts but never refuses, so the countdown would be
  // both wrong and alarming ("0 left today" on a door that keeps opening). It
  // reports what was used instead — the number that is still true.
  //
  // ONE NUMBER, ONE WORD (R6, shared/glossary.ts `assistantCredit`). This badge
  // used to read `${remaining} left today · ${creditBalance} credits`, and
  // `remaining` is ALREADY free-left plus the balance — so 25 free and 5 added
  // rendered as "30 left today · 5 credits" and a reader added it to 35. It also
  // said "today" about a balance that does not reset. The badge now answers the
  // only question it is asked — how many can I spend right now — and the split
  // lives one click away in the usage view, which is that view's whole job.
  const quotaLabel = quota
    ? quota.unlimited
      ? `No daily limit here · ${quota.freeUsedToday} used today`
      : quota.blocked
        ? "You're out of assistant credits"
        : `${quota.remaining} credits left`
    : ""

  // The usage view's header line, and the ONE screen that splits the two pots
  // the badge above adds together: what is free today, and what an admin added.
  const usageSummary = quota
    ? quota.unlimited
      ? `${quota.freeUsedToday} used today · no daily limit in this environment · ${quota.creditBalance} added by an admin`
      : `${quota.freeRemaining} of ${quota.freeDaily} free credits left today · ${quota.creditBalance} added by an admin`
    : ""

  return {
    items,
    threadId,
    attached,
    busy,
    quota,
    pending,
    failure,
    showTyping,
    streamingReply,
    confirmSteps,
    quotaLabel,
    usageSummary,
    addAttachments,
    removeAttachment,
    sources,
    toggleSource,
    send,
    resolve,
    newChat,
    openThread,
  }
}
