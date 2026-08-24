// WAVES — the agency app's doors onto what a client bought.
//
// A file of its own beside the other four, for the reason the barrel next door
// gives: both gateway suites derive the app's whole attack surface from this
// DIRECTORY, so a door added in a new file beside them is covered the day it
// lands. These all answer at `/api/tenancy/…`, which is the tenancy worker and
// nothing else.
//
// EVERY ONE OF THEM REFUSES A CLIENT LOGIN at the worker (a wave is made of
// sprints, and a sprint row is the agency's own delivery record), so none of
// these paths may ever appear on the portal gateway's allow-list.

import { api } from "@shared/web/api"
import type { Wave, WaveOverlap, WaveSprint } from "@shared/waves"

/* ------------------------------ the cache keys -----------------------------
 *
 * Beside the doors they cache, so the key and the fetch cannot drift — and so
 * the live registry (`web/lib/live-resources.ts`, R15) can import them as data
 * without the cycle it would create by living in a component. Same shape as
 * every other collection key: `<resource>:<teamId>`, which is also the resource
 * name the tenancy worker publishes, so a ping names the key it should drop. */

/** The team's waves — bounded (R14), read whole, narrowed per client on screen. */
export function wavesKey(teamId: string): string {
  return `waves:${teamId}`
}

/** ONE wave, with its sprints and their clashes. Its own key rather than a row
 * out of the list, because the record screen needs three things the list does
 * not carry — and because a wave's dates move when a SPRINT moves, which is a
 * ping the list row alone could not answer. */
export function waveOneKey(id: string): string {
  return `wave:one:${id}`
}

export const waves = {
  /** Every wave the caller may see, or one client's. Bounded (R14), with the
   * door's exact COUNT(*) beside the rows (R16). */
  list: (accountId?: string) =>
    api<{ waves: Wave[]; total: number }>(
      `/api/tenancy/waves${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`
    ),

  /** One wave, the sprints in it, and any clash between their dates — three
   * answers in one round trip because they are one screen. */
  one: (id: string) =>
    api<{ wave: Wave; sprints: WaveSprint[]; overlaps: WaveOverlap[] }>(
      `/api/tenancy/waves/one?id=${encodeURIComponent(id)}`
    ),

  create: (input: { accountId: string; name: string; goal?: string }) =>
    api<{ id: string }>("/api/tenancy/waves", { method: "POST", body: JSON.stringify(input) }),

  /** The DATES are deliberately not here: they are the sprints' answer, never a
   * field somebody types over. */
  update: (input: { id: string; name: string; goal?: string }) =>
    api<{ ok: true }>("/api/tenancy/waves/update", { method: "POST", body: JSON.stringify(input) }),

  setActive: (id: string, active: boolean) =>
    api<{ ok: true; moved: boolean }>("/api/tenancy/waves/active", {
      method: "POST",
      body: JSON.stringify({ id, active }),
    }),

  /** Put a sprint in a wave, or take it out (`waveId: null`). The response
   * carries any resulting overlap — a WARNING, never a refusal, so the write has
   * already landed by the time the screen reads it. */
  setSprint: (input: { sprintId: string; waveId: string | null }) =>
    api<{ ok: true; moved: boolean; overlaps: WaveOverlap[] }>("/api/tenancy/waves/sprint", {
      method: "POST",
      body: JSON.stringify(input),
    }),
}
