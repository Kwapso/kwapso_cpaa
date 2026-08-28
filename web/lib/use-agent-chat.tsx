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
   * it. */
  | (AgentChatMessage & { evidence?: TurnEvidence })
  | { id: string; role: "tool"; actionLabel: string; status: "pending" | "done" | "failed" }
import type { RunStep } from "@shared/ui/components/run-steps/run-steps"
import { toast } from "@shared/ui/components/sonner/sonner"

import type { AgentMessage, AgentQuota, ModelFailure, PendingCall } from "@shared/types"
import { evidenceFromSaved, mergeEvidence, type TurnEvidence } from "@shared/agent-cites"
import { ApiFailure, dataOps, type AgentStreamEvent } from "@/lib/api"
import { fileToCsv, UserFileError } from "@/lib/file-to-csv"
import { clearPendingQuestion, usePendingQuestion } from "@/lib/agent-open"
import { traceFor } from "@/lib/agent-trace"
import { emitTrace } from "@/lib/screen-trace"
import { AgentMarkdown } from "@/components/agent-markdown"
import { reportError } from "@shared/web/log"

let nextId = 0
const newId = () => `m${++nextId}`

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
      return { id: m.id, role: m.role, content: <AgentMarkdown text={m.content ?? ""} />, evidence }
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
  const [items, setItems] = React.useState<AgentChatItem[]>([])
  const [threadId, setThreadId] = React.useState<string | undefined>(undefined)
  // CSV files staged for the NEXT message (the chat import): picked or dropped,
  // sent with the message, planned server-side, run via the normal confirm panel.
  const [attached, setAttached] = React.useState<{ name: string; csv: string }[]>([])
  const [busy, setBusy] = React.useState(false)
  const [quota, setQuota] = React.useState<AgentQuota | null>(null)
  // A paused turn awaiting the user's go-ahead — the proposed actions + the text.
  const [pending, setPending] = React.useState<{ calls: PendingCall[]; text: string } | null>(null)
  // WHY THE LAST TURN COULDN'T ANSWER, when the model door was the reason. Held
  // beside the transcript rather than inside it: the bubble is what the assistant
  // SAID, and this is a fact about the app, which is a different thing and gets
  // its own quiet notice. Cleared the moment the next question is asked — a
  // warning about a limit that has since cleared is its own small lie.
  const [failure, setFailure] = React.useState<ModelFailure | null>(null)

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
            if (!alive) return
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

    await run((ev) => {
      switch (ev.t) {
        case "text": {
          replyText += ev.d
          const html = <AgentMarkdown text={replyText} />
          setItems((prev) => prev.map((it) => (it.id === assistantId ? { ...it, content: html } : it)))
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
          setItems((prev) =>
            text
              ? prev.map((it) => (it.id === assistantId ? { ...it, content: <AgentMarkdown text={text} /> } : it))
              : prev.filter((it) => it.id !== assistantId)
          )
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
          const shown = ev.reason ? t("I couldn't answer that one.") : ev.message
          setItems((prev) =>
            prev.map((it) => (it.id === assistantId ? { ...it, content: shown } : it))
          )
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
    const assistantId = newId()
    const files = attached.length ? attached : undefined
    // Same attachment note the server saves, so the optimistic bubble matches history.
    const shown = files ? `${text}\n(Attached: ${files.map((f) => f.name).join(", ")})` : text
    // Optimistic: the user's message appears instantly, and an empty assistant row
    // carries the animated 3-dot indicator (showTyping) until reply text streams.
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", content: shown },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setBusy(true)
    setPending(null)
    setFailure(null)
    setAttached([])
    try {
      await consume((onEvent) => dataOps.agentChatStream({ message: text, threadId, files }, onEvent), assistantId)
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
      { id: assistantId, role: "assistant", content: "" },
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
  const lastAssistant = [...items].reverse().find((it): it is AgentChatMessage => it.role === "assistant")
  const showTyping = busy && !pending && !lastAssistant?.content

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
    confirmSteps,
    quotaLabel,
    usageSummary,
    addAttachments,
    removeAttachment,
    send,
    resolve,
    newChat,
    openThread,
  }
}
