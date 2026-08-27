// R41 — A FILE SOMEBODY PICKED IS EITHER SENT OR REFUSED, NEVER DROPPED.
//
// R40's sibling, and the boundary between them is the whole point: R40 asks
// whether a STORED file reaches a person. Here nothing is stored, so R40 is
// silent by construction — the bytes never leave the browser, there is no row,
// no object, and nothing to recover from. It is the worse failure of the two and
// the one no existing law could see.
//
// WHAT IT CATCHES, AND WHY IT IS AWKWARD. A create dialog cannot upload while
// the person is typing, because R2 is addressed by the record's id and on a
// create that id does not exist yet. So `StoryFormDialog` holds the picked files
// and hangs them on whatever `onSubmit` HANDS BACK:
//
//     const target = storyId ?? (typeof madeId === "string" ? madeId : null)
//     if (target && pending.length) await attach(target, pending)
//
// Three of the four create call sites did `await createStoryFrom(...)` and threw
// the id away. `target` was null, the `if` was false, and the file was dropped in
// silence — story created, success toast, no error anywhere. `createStoryFrom`
// has returned the id since the day the upload was written; the callers simply
// did not pass it on.
//
// THE SHAPE IS A DISCARDED RESULT, not a missing call, which is harder to census
// than anything R40 does — there is no absent function to look for, only a value
// that goes nowhere. So this is deliberately NARROW rather than elegant: it
// enumerates the dialogs that defer an upload to their submit, finds every call
// site off the disk, and asks of each CREATE site that the id actually comes
// back. An honest small law that can be checked beats a general one that cannot.
//
// DERIVED, so the fifth call site arrives red: the census is every
// `<StoryFormDialog` in the components tree, and whether a site is a CREATE is
// read from the absence of the `storyId` prop — the same fact the dialog itself
// switches on, so the check and the code cannot disagree about which sites are
// at risk.

import { readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { sourceFiles, stripComments } from "@shared/rules/source-scan"

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..")

/** The dialogs that hold a picked file until submit because the record they
 * belong to does not exist yet, each with the maker whose id they need back.
 *
 * DATA, and it is the one hand-written thing here. A dialog earns a line by
 * deferring an upload; everything about whether its call sites are correct is
 * derived below. Rot-checked: a component that stops deferring loses its line. */
const DEFERRED_UPLOAD_FORMS: { component: string; maker: string; why: string }[] = [
  {
    component: "StoryFormDialog",
    maker: "createStoryFrom",
    why: "a story's attachments are addressed by story id, which does not exist until the create door answers — so the picked files wait for the id the submit hands back",
  },
]

/** The JSX attribute's whole expression, brace-balanced. A regex cannot do this:
 * `onSubmit={async (v) => { … { … } … }}` nests, and a lazy match stops at the
 * first `}` — which is inside the body, so a naive scan reads every one of these
 * as empty and passes. */
function propExpression(block: string, prop: string): string | null {
  const at = block.indexOf(`${prop}={`)
  if (at === -1) return null
  let depth = 0
  for (let i = at + prop.length + 1; i < block.length; i++) {
    if (block[i] === "{") depth++
    else if (block[i] === "}") {
      depth--
      if (depth === 0) return block.slice(at + prop.length + 2, i)
    }
  }
  return null
}

/** One JSX element's source, from `<Name` to its balanced close. */
function elementBlocks(src: string, name: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(new RegExp(`<${name}\\b`, "g"))) {
    let depth = 0
    for (let i = m.index as number; i < src.length; i++) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") depth--
      else if (src[i] === ">" && depth === 0) {
        out.push(src.slice(m.index as number, i + 1))
        break
      }
    }
  }
  return out
}

/** Does this `onSubmit` actually hand the maker's id back to the dialog?
 *
 * Two honest shapes, and nothing else:
 *   `(v) => createStoryFrom(...)`                       the concise arrow IS the return
 *   `const id = await createStoryFrom(...); … return id` the value is named and returned
 *
 * A block body that calls the maker and returns nothing is the bug, and it is
 * indistinguishable from correct code at a glance — which is why it shipped
 * three times. */
function handsBackTheId(expr: string, maker: string): boolean {
  if (new RegExp(`=>\\s*${maker}\\(`).test(expr)) return true
  const bound = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*await\\s+${maker}\\(`).exec(expr)
  return bound !== null && new RegExp(`return\\s+${bound[1]}\\b`).test(expr)
}

describe("R41 — a picked file is either sent or refused, never dropped", () => {
  it("picked-files-are-sent: every create call site hands back the id its files hang on", () => {
    const files = sourceFiles(join(WEB, "components"), { extensions: [".tsx"] })
    const offenders: string[] = []
    let creates = 0

    for (const form of DEFERRED_UPLOAD_FORMS) {
      // ROT, first: the dialog must still DEFER, or this line describes code that
      // no longer exists and the law is decoration.
      const dialog = files.find((f) => stripComments(f.source).includes(`export function ${form.component}`))
      expect(dialog, `DEFERRED_UPLOAD_FORMS names ${form.component}, which no longer exists`).toBeDefined()
      const dialogSrc = stripComments(readFileSync((dialog as { path: string }).path, "utf8"))
      expect(
        /const\s+target\s*=\s*storyId\s*\?\?/.test(dialogSrc),
        `${form.component} no longer hangs deferred files on the submit's return — delete its DEFERRED_UPLOAD_FORMS line`
      ).toBe(true)
      expect(form.why.trim(), `${form.component} needs a reason`).not.toBe("")

      for (const f of files) {
        for (const block of elementBlocks(stripComments(f.source), form.component)) {
          // A site that passes `storyId` is an EDIT: the record exists, the files
          // have somewhere to go, and the return value is not load-bearing. Read
          // from the same prop the dialog itself switches on.
          if (/\bstoryId=/.test(block)) continue
          creates++
          const onSubmit = propExpression(block, "onSubmit")
          if (!onSubmit) {
            offenders.push(`${basename(f.path)}: a <${form.component}> create site with no onSubmit`)
            continue
          }
          if (!handsBackTheId(onSubmit, form.maker))
            offenders.push(
              `${basename(f.path)}: <${form.component}> create site awaits ${form.maker} and discards the id — ` +
                `every file picked in that form is dropped, silently`
            )
        }
      }
    }

    // Tripwire: a census that matches nothing reports all-clear in the same words
    // as a passing one, and this one walks JSX, which is exactly the kind of scan
    // that goes quietly blind on a rename.
    expect(creates, "the create-call-site census found nothing — it has gone blind").toBeGreaterThan(2)
    expect(
      offenders,
      `R41 — a file somebody picked is either sent or refused, never dropped:\n  ${offenders.join("\n  ")}`
    ).toEqual([])
  })

  // The two shapes, pinned. Both are invisible in a passing run once every call
  // site is correct, and the negative case is the entire law.
  it("picked-files-are-sent: a discarded result is not a return", () => {
    expect(handsBackTheId(`async (v) => { await createStoryFrom(t, v, x); invalidate(k) }`, "createStoryFrom")).toBe(false)
    expect(handsBackTheId(`async (v) => { const id = await createStoryFrom(t, v, x); invalidate(k); return id }`, "createStoryFrom")).toBe(true)
    expect(handsBackTheId(`(v) => createStoryFrom(teamId, v, t)`, "createStoryFrom")).toBe(true)
    // …and a `return` of something else is not a return of the id.
    expect(handsBackTheId(`async (v) => { const id = await createStoryFrom(t, v, x); return undefined }`, "createStoryFrom")).toBe(false)
  })
})
