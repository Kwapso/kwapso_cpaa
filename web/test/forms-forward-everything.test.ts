// A HANDLER THAT REBUILDS A FORM'S PAYLOAD WILL EVENTUALLY DROP A FIELD.
//
// THE OWNER, 26 Aug 2026: "there are some fields in many screens that don't get
// saved in the edit screen. One example… the ticket modules are not getting
// saved."
//
// The ticket form offered a Module picker; the door was ready to write it; and
// the ticket detail's own submit handler rebuilt the payload field by field and
// left `moduleId` out. Nothing errored, the toast said "Ticket updated", and the
// value came back unchanged. The SAME edit saved correctly from the tickets
// list, because that screen forwards its argument whole.
//
// TypeScript cannot see this: a handler taking FEWER properties is assignable to
// one that supplies more, so narrowing the parameter HIDES the omission rather
// than reporting it. That is what makes it worth a check of its own.
//
// The rule: a form-dialog submit handler forwards what it was given — a spread,
// or the argument itself — rather than transcribing it.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")

/** The form dialogs whose payload is a RECORD's fields — the ones where a
 * dropped key is silent data loss rather than a missing option. */
const FORMS = ["HelpFormDialog", "StoryFormDialog", "AccountFormDialog", "StepFormDialog"]

describe("a form's payload is forwarded, never transcribed", () => {
  /** The calls that carry a whole record's fields to a door. A payload built by
   * hand for one of these is where a field goes missing. */
  const DOORS = /\b(updateHelp|createHelp|updateStory|createStory|saveAccount|addStep|updateStep)\(\{/g

  /** PAYLOADS THAT ARE BUILT BY HAND ON PURPOSE, each with the reason.
   *
   * These four name every field their form declares TODAY — they are the shape
   * the bug came out of, not the bug. Each also TRANSFORMS on the way through
   * (`values.sprintId || undefined`, a null for a cleared picker), so a blind
   * spread would change what reaches the door rather than tidy it.
   *
   * The list is rot-checked below: an entry whose payload starts spreading, or
   * whose call disappears, turns the build red. It can only shrink. */
  const BY_HAND: Record<string, string> = {
    "process-detail.tsx → addStep":
      "the step form answers three shape questions (a split, an arm, a loop) that become four different fields, and the mapping is the point of the handler",
    "process-detail.tsx → updateStep":
      "the same mapping in reverse, plus `position`, which is DERIVED from the shape rather than sent by the form",
    "stories-screen.tsx → createStory":
      "empty string means 'not chosen' on this form and `undefined` means 'leave it' at the door — the conversion is deliberate and cannot be spread",
    "story-detail.tsx → updateStory":
      "the same conversion on the edit half",
  }

  it("no submit payload names the form's fields one at a time without spreading", () => {
    const offenders: string[] = []
    const stillByHand = new Set<string>()
    let payloads = 0
    for (const f of sourceFiles(join(WEB, "components"), { extensions: [".tsx"] })) {
      const src = stripComments(f.source)
      for (const m of [...src.matchAll(DOORS)]) {
        // THE ARGUMENT ITSELF, by balanced braces — not a fixed window around
        // it. A window was the second attempt and it kept finding an unrelated
        // spread a few lines away, so the check passed its own sabotage three
        // times before this comment was written.
        let i = m.index + m[0].length - 1
        let depth = 0
        let end = i
        for (; end < src.length; end++) {
          if (src[end] === "{") depth++
          else if (src[end] === "}") {
            depth--
            if (depth === 0) break
          }
        }
        const payload = src.slice(i, end + 1)
        payloads++
        const named = (payload.match(/\b\w+:\s*\w+\.\w+/g) ?? []).length
        const spreads = /\.\.\.\s*\w+/.test(payload)
        const where = `${f.rel.split("/").pop()} → ${m[1]}`
        if (named >= 3 && !spreads) {
          if (where in BY_HAND) stillByHand.add(where)
          else offenders.push(where)
        }
      }
    }
    expect(
      offenders,
      `these build a door's payload field by field, so anything the form gains is ` +
        `silently dropped here — spread the argument instead: ${offenders.join(", ")}`
    ).toEqual([])
    // THE RATCHET: an exemption for a payload that now spreads, or that no longer
    // exists, is a record of an argument nobody is having. The list only shrinks.
    const stale = Object.keys(BY_HAND).filter((k) => !stillByHand.has(k))
    expect(
      stale,
      `these are exempted and no longer need to be — delete the lines: ${stale.join(", ")}`
    ).toEqual([])
    // Tripwire: a census that matched no payload passes exactly like a clean one.
    expect(payloads, "the payload census found nothing — it has gone blind").toBeGreaterThan(2)
  })
})
