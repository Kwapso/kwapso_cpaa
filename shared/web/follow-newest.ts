"use client"

// FOLLOW THE NEWEST MESSAGE — the one behaviour that makes a thread read like a
// conversation instead of a list, shared by both front doors' ticket screens.
//
// Replies append at the bottom, which is right, but until now the view didn't
// move: you opened a request with a dozen replies and landed on the oldest one,
// then sent a reply and watched nothing happen (owner, staging portal, Aug
// 2026). Every chat app these clients already use lands on the newest message
// and follows what they send.
//
// It lives in shared/web/ rather than in either app because the agency thread
// and the client thread are the same conversation seen from two sides — the day
// one of them changed how it follows, the other would have been a bug report.

import * as React from "react"

/** How close to the end still counts as "reading the newest" — a couple of lines
 * of slack, so a stray pixel of overscroll isn't read as "gone browsing". */
export const FOLLOW_SLACK = 80

/** Should the view jump to the newest message, or is the reader busy?
 *
 * Yes when the thread has just opened: a chat always lands at the end, and on a
 * request with fifty replies the one that matters is the last. Yes when the
 * newest message is one THEY just sent — they acted, so following is what they
 * expect, and it is the one case that must win even from the top of a long
 * thread. Yes when they were already at the end anyway.
 *
 * No otherwise, and that clause is the whole reason this is a function rather
 * than an unconditional scroll: someone who has deliberately scrolled up to
 * re-read what they asked for must not be yanked to the bottom because a reply
 * landed live. (Both library thread components — Chat and Comments — set
 * scrollTop = scrollHeight on every change, which is exactly that yank.) */
export function shouldFollow(o: { first: boolean; mine: boolean; nearBottom: boolean }): boolean {
  return o.first || o.mine || o.nearBottom
}

/** Is the reader already at the end of the page? */
function atPageBottom(): boolean {
  const doc = document.documentElement
  return doc.scrollHeight - window.scrollY - window.innerHeight <= FOLLOW_SLACK
}

/** Scroll the PAGE, not an inner box. Both shells lay out with `min-h-[100svh]`
 * and let the document scroll, so the thread IS the page — a nested scroller
 * would trap a thumb on a phone and leave the portal's sticky bottom nav
 * floating over the last reply. Scrolling the document to its end puts that nav
 * back in its natural place under the composer, where a chat app has it. */
function scrollToNewest(smooth: boolean) {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  })
}

/** Keep the newest message in view. Pass the last message's id (null while the
 * thread is still loading) and whether the signed-in person wrote it.
 *
 * Keyed on the ID, not on the array: a thread's rows are rebuilt on every render
 * and re-scrolling on each one would fight the reader constantly. It also makes
 * a THREAD_HARD_CAP-sized thread free — 500 replies cost one string comparison,
 * not a re-measure.
 *
 * Call it ABOVE any early return. It is a hook, and a hook under a `return null`
 * changes the hook count the first day that return fires. */
export function useFollowNewest(newestId: string | null, newestIsMine: boolean): void {
  const seen = React.useRef<string | null>(null)
  React.useEffect(() => {
    // The id, not the deps, is what decides. `newestIsMine` is derived from a
    // prop that can arrive late (help-detail resolves it from myUserId), so the
    // flag can flip under a message id that never changed — a re-decision about
    // an old message, which must not move the page a second time.
    if (!newestId || seen.current === newestId) return
    const first = seen.current === null
    seen.current = newestId
    if (!shouldFollow({ first, mine: newestIsMine, nearBottom: atPageBottom() })) return
    // The first landing is instant — nobody wants to watch a page fly past on
    // open. A reply arriving afterwards glides, so you can see it arrive.
    scrollToNewest(!first)
  }, [newestId, newestIsMine])
}
