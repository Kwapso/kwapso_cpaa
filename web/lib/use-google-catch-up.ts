"use client"

// GOOGLE COMES INTO STEP WHEN YOU OPEN THE APP — AND WHEN YOU OPEN A SCREEN THAT
// SHOWS GOOGLE MATERIAL (CHECKLIST 14.12, and the owner's follow-up).
//
// Everything Google is read with ONE PERSON'S OWN TOKEN, so it is the one part
// of the knowledge base the quarter-hour cron cannot sweep — the scheduled
// handler has no caller and builds a guard no connection belongs to
// (lib/knowledge-google.ts's header says why that separation is load-bearing
// security). Until 14.12 the consequence was a BUTTON: somebody's Drive and
// calendar were as current as the last time they remembered to press it in
// Settings.
//
// 14.12 made it fire once, when the shell mounts. This is the gap the owner
// found next, and it is narrower than it sounds: "a way to sync more often to
// make it feel instantaneous". Once per app open means somebody who opened
// kwapso at nine and walks to Meetings at eleven is reading a two-hour-old
// answer on a screen that looks live.
//
// SO THE HOOK IS NOW CALLED FROM THE SCREENS TOO, and the shape that makes that
// safe is the one thing worth reading carefully:
//
//   THE THROTTLE IS THE DOOR'S, NOT THIS FILE'S. `sweepGoogle` holds a
//   five-minute floor and `onlyIfStale` is what turns it on for a caller. So an
//   extra mount costs one cheap round trip that answers out of the last sweep's
//   state — never an extra call to Google. That is why per-screen freshness did
//   not need a second sweep path, a second throttle, or a number in the browser
//   deciding how often Google may be asked.
//
//   THE STAMP BELOW IS POLITENESS, NOT THE RULE. It is module-level rather than
//   per-component so that opening four Google screens in a minute is one
//   request rather than four; it is set to the FLOOR the door already keeps, so
//   there is exactly one number and it lives on the server. If it drifted or was
//   deleted, nothing would break — the door would simply answer "already did
//   that" a few more times.
//
// WHAT IT DELIBERATELY IS NOT:
//   • NOT A CRON. Nothing here reaches the scheduled handler and nothing here
//     acts as anybody. It is the signed-in person's own request, gated by their
//     own rights, carrying their own token — the same door the button opens.
//   • NOT AN INTERVAL. A screen that polls is a promise the next client has to
//     keep, and there are two front ends plus a machine surface. Freshness is
//     tied to a person ARRIVING somewhere, which is the moment they are about to
//     read something.
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

/** THE SAME FIVE MINUTES `GOOGLE_SWEEP_FLOOR_MS` keeps on the door, written here
 * so that N mounts inside one window are one request instead of N. It is not the
 * rule (see the header) — deleting it would cost round trips, not correctness —
 * which is why it is allowed to be a second copy of a number at all. */
const POLITE_WINDOW_MS = 5 * 60 * 1000

/** When this browser last asked. Module-level on purpose: a per-component ref
 * would reset on every navigation, which is exactly the moment we are trying not
 * to fire on twice. */
let lastAsked = 0

/**
 * Bring this person's Google material into step, quietly, on arrival.
 *
 * Called by the app shell (once per app open) AND by every screen that shows
 * Google-derived material, which is what makes walking to Meetings at eleven
 * different from reading a nine o'clock answer. Calling it from a dozen places
 * is the intended use: the door's floor and the stamp above are what make that
 * cheap.
 */
export function useGoogleCatchUp(teamId: string | null, can: Can): void {
  // The rights are read into a plain boolean. `can` is rebuilt on every render
  // of the hook's host, so depending on it directly would re-run this effect
  // constantly — and the stamp would make every one of those a no-op, which is a
  // lie the next reader has to work out.
  const mayCatchUp = can("google", "read") && can("knowledge", "create")

  React.useEffect(() => {
    if (!teamId || !mayCatchUp) return
    if (Date.now() - lastAsked < POLITE_WINDOW_MS) return
    lastAsked = Date.now()

    let cancelled = false
    const run = () => {
      if (cancelled) return
      // `onlyIfStale` — the flag that turns the door's five-minute floor on for
      // THIS caller. It is the automatic one, so it is the one that must be
      // polite; the sync BUTTON sends nothing and always asks Google.
      void content.syncGoogleKnowledge(true).catch((e: unknown) => {
        // A failed attempt must not hold the window shut. Somebody who reloads
        // after a dropped connection is asking again on purpose.
        lastAsked = 0
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

/** A DELIBERATE PRESS REOPENS THE WINDOW. The sync button asks Google whatever
 * the floor says (that is what makes it a button rather than a suggestion), so
 * the automatic caller should not then sit out five minutes on the strength of a
 * request it did not make. Exported for the one component that presses. */
export function markGoogleSyncedNow(): void {
  lastAsked = Date.now()
}
