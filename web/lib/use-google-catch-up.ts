"use client"

// GOOGLE COMES INTO STEP WHEN YOU OPEN THE APP (CHECKLIST 14.12).
//
// Everything Google is read with ONE PERSON'S OWN TOKEN, so it is the one part
// of the knowledge base the quarter-hour cron cannot sweep — the scheduled
// handler has no caller and builds a guard no connection belongs to
// (lib/knowledge-google.ts's header says why that separation is load-bearing
// security). Until now the consequence was a BUTTON: somebody's Drive and diary
// were as current as the last time they remembered to press it in Settings.
//
// This is that button, pressed for them, once, when the shell mounts.
//
// WHAT IT DELIBERATELY IS NOT:
//   • NOT A CRON. Nothing here reaches the scheduled handler and nothing here
//     acts as anybody. It is the signed-in person's own request, gated by their
//     own rights, carrying their own token — the same door the button opens.
//   • NOT A RATE LIMIT WRITTEN IN THE BROWSER. The five-minute floor lives on
//     the DOOR (`sweepGoogle`), because a client-side interval is a promise the
//     next client makes and there are two front ends plus a machine surface. The
//     once-per-mount guard below is politeness, not the rule.
//   • NOT TWO PASSES. A second call would land inside the door's own floor and
//     be answered from the last sweep's state, so it would cost a round trip and
//     change nothing. One pass on open; the Settings button is still there for
//     somebody pushing a first fill along.
//
// THREE PEOPLE MUST SEE NOTHING HAPPEN AT ALL, and each is checked before the
// request rather than by it:
//   • somebody without `google:read` or `knowledge:create` — no call is made, so
//     there is no 403 in their network tab to explain;
//   • somebody who has connected nothing — the door answers 200 with an empty
//     list of kinds, because there is nothing of theirs to sweep;
//   • somebody on a slow connection — it waits for the browser to be idle, so it
//     is never in front of first paint.
//
// FAILURE IS SILENT TO THE PERSON AND WRITTEN DOWN FOR US (R12's posture on the
// client half): no toast — nobody asked for this and a red box about a
// background job is worse than the job not running — and `reportError`, so "it
// has been failing since Tuesday" is answerable. The SERVER half records itself
// on the kind's own row, which is what the sync screen reads.

import * as React from "react"

import { content } from "@/lib/api"
import { reportError } from "@shared/web/log"
import type { Can } from "@/lib/perms"

/** How long after mount the catch-up fires when the browser has no idle moment
 * to offer. Long enough to be behind first paint and everything the shell asks
 * for on entry; short enough that the answer is there before somebody has
 * finished reading the screen and asked the assistant a question. */
const FALLBACK_DELAY_MS = 4000

export function useGoogleCatchUp(teamId: string | null, can: Can): void {
  // ONE PER MOUNTED SHELL, and a ref rather than state because nothing renders
  // from it: re-running on every permissions refresh would turn a page that sits
  // open all day into a poller.
  const fired = React.useRef(false)
  // The rights are read through the ref too. `can` is rebuilt on every render of
  // the hook's host, so depending on it directly would re-run this effect
  // constantly — and the guard above would make every one of those a no-op,
  // which is a lie the next reader has to work out.
  const mayCatchUp = can("google", "read") && can("knowledge", "create")

  React.useEffect(() => {
    if (!teamId || !mayCatchUp || fired.current) return
    fired.current = true

    let cancelled = false
    const run = () => {
      if (cancelled) return
      // `onlyIfStale` — the flag that turns the door's five-minute floor on for
      // THIS caller. It is the automatic one, so it is the one that must be
      // polite; the Settings button sends nothing and always asks Google.
      void content.syncGoogleKnowledge(true).catch((e: unknown) => {
        // Never a toast. The person did not ask for this, and the material they
        // came for is on the screen either way.
        reportError("google-catch-up", e, { teamId })
      })
    }

    // Behind first paint, by the browser's own definition of "not busy" where it
    // has one. `requestIdleCallback` is absent on Safari, hence the timer beside
    // it rather than instead of it.
    const idle = typeof window !== "undefined" && "requestIdleCallback" in window
    const handle = idle
      ? (window as unknown as { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number })
          .requestIdleCallback(run, { timeout: FALLBACK_DELAY_MS })
      : (setTimeout(run, FALLBACK_DELAY_MS) as unknown as number)

    return () => {
      cancelled = true
      if (idle)
        (window as unknown as { cancelIdleCallback: (h: number) => void }).cancelIdleCallback(handle)
      else clearTimeout(handle)
    }
  }, [teamId, mayCatchUp])
}
