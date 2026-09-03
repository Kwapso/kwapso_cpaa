"use client"

// WHERE THE ASSISTANT DRAWS WHEN IT IS A COLUMN — one empty box in the shell's
// `aside`, published to the root-mounted panel, which portals itself into it.
//
// THE PROBLEM THIS SOLVES, AND WHY IT IS NOT "JUST RENDER THE PANEL IN THE
// ASIDE". `ScreenShell`'s third column belongs to `AppShell`, which is BELOW the
// routed screens; the panel is mounted ONCE at the root (agent-host.tsx) and has
// to stay there, because the assistant DRIVES navigation — a multi-step run
// moves the screen underneath itself (web/lib/screen-trace.tsx). A panel that
// lived inside the shell would be torn down by its own trace, which is the
// reported bug agent-host.tsx was created to fix ("the panel closed on
// navigation and the step pills collapsed mid-run") and which web/test/
// agent-host.test.ts still locks.
//
// So the TREE and the DOM part company on purpose: the panel stays a child of
// the root host (its React state, its live stream and its thread survive every
// navigation), and `createPortal` puts its ELEMENTS inside the shell's column.
// React events still bubble through the React tree, so nothing else changes.
//
// ONE SLOT, NEVER TWO. The store holds a single node because the app draws a
// single `ScreenShell` (web/components/app-shell.tsx, the one call site). A
// second mount would overwrite the first, and the unmount check below makes
// that self-correcting rather than silent: only the node that is still
// published clears it.

import * as React from "react"

let dock: HTMLElement | null = null
const subscribers = new Set<() => void>()

function publish(node: HTMLElement | null): void {
  if (dock === node) return
  dock = node
  for (const fn of subscribers) fn()
}

/**
 * THE BOX ITSELF, handed to `ScreenShell` as its `aside`. It draws nothing and
 * measures nothing: the kit's column already owns the width (`ASIDE_WIDTH`),
 * the padding and the scroller, and this only has to fill it so the portalled
 * panel has a full-height box to be `h-full` against.
 *
 * `h-full` IS THE FIX, NOT DECORATION — the comment above stated the intent
 * for a while before the class actually carried it. Its own parent
 * (`screen-shell-aside-body`, kit) is a `min-h-0 flex-1` flex child, so it
 * DOES have a determinate height; without `h-full` here this box's own
 * height was `auto` (a percentage against a determinate parent still needs
 * an explicit `height`/`h-full` on the CHILD, or the child just shrinks to
 * its content). That auto height then defeated every `h-full` the portalled
 * panel and `AgentChat` declare further down (a percentage against an
 * `auto`-height ancestor resolves to `auto` too), so the whole conversation
 * rendered at its full, unclipped content height — the kit's own
 * `screen-shell-aside` still capped and scrolled THAT as one long blob (it
 * never grew past the window), but `AgentChat`'s own turns-only scroller
 * (header and composer pinned, only the messages move) never activated,
 * because it never received a bounded box to scroll within. Reproduced and
 * confirmed in the kit's `verify/shell-chat/` harness by nesting the exact
 * `AgentDockSlot -> PanelFrame -> AgentChat` shape: without `h-full` the
 * panel's own box measured ~7400px tall; with it, ~726px, matching the
 * card's own height to the pixel, with the turns region alone scrolling.
 *
 * A CALLBACK REF RATHER THAN AN EFFECT, so the node is published in the same
 * commit that creates it — an effect would publish one paint later and the
 * panel would flash in at the wrong moment. React 19 calls the returned cleanup
 * on unmount, which is where the column's own disappearance (the shut aside is
 * not rendered at all) is reported.
 */
export function AgentDockSlot() {
  return (
    <div
      data-slot="agent-dock"
      className="flex h-full min-h-0 w-full flex-1 flex-col"
      ref={(node) => {
        publish(node)
        return () => {
          if (dock === node) publish(null)
        }
      }}
    />
  )
}

/** The live dock node, or null when the aside is shut, dropped (narrow) or the
 * screen is one that draws no shell at all (login, onboarding). The panel
 * renders nothing in that last case rather than inventing a home for itself. */
export function useAgentDock(): HTMLElement | null {
  return React.useSyncExternalStore(
    (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    () => dock,
    () => null
  )
}
