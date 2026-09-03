"use client"

// The app-wide AI co-pilot, mounted ONCE at the root layout so it rides ABOVE every
// screen and SURVIVES navigation. The assistant's screen-trace moves the page beneath
// it, and switching screens never tears the panel (or its live chat + step pills) down
// — the bug this fixes was mounting the panel inside the per-route AppShell, so every
// navigation (including the agent's own trace) closed it and dropped the run.
//
// It owns the panel, the phone's floating launcher, and the screen-trace engine. It
// reads the ACTIVE team (the module-cached session — safe to read from anywhere) and
// renders nothing until you're signed in with a team, so login / onboarding have no
// co-pilot.
//
// ── IT PICKS THE PRESENTATION, AND IT IS THE ONLY PLACE THAT ASKS ─────────────
//
// Since 2026-09-03 the assistant is a permanent COLUMN on the shared ground —
// `ScreenShell`'s `aside`, mirroring the rail across the card — and the shell
// drops that column below `md`, because a phone cannot spend 380px on it and the
// kit draws no drawer to hide it in. So both presentations exist and the WIDTH
// chooses, once, here: `useShellColumns()` is the same 48rem the kit's own docks
// are gated on, so JS and CSS can never disagree about which one is showing.
//
//   wide   → docked. The panel portals itself into the shell's column
//            (web/lib/agent-dock.tsx) and the shell's own 3px EDGE HANDLE is
//            what opens and closes it. No launcher is drawn at all.
//   narrow → floating. The launcher and the anchored `Popover` below, unchanged.
//
// THE LAUNCHER IS GONE ON WIDE SCREENS ON PURPOSE, AND IT IS THE ONE-MANGO RULE.
// It is a mango `size="icon"` button pinned over the card; the shell's handle now
// opens the same thing from the window's edge. Keeping both would be two controls
// for one decision AND a second mango control on every screen that already has
// its own — `SHELL.md`'s "only one mango in the pair", which the kit's own header
// spends four reasons on. The handle wins because it is the column's own
// affordance: it stands where the column will travel.
//
// ONE FLAG BEHIND BOTH. `useAgentOpen()` is the single "is the assistant showing"
// decision (web/lib/agent-open.ts, persisted per person like the rail's collapse),
// fed to the shell as `asideOpen` in app-shell.tsx and to the `Popover` here. A
// person who leaves it open on a laptop and turns the window narrow gets the
// floating panel already open, which is the honest reading of one flag.

import { Button } from "@shared/ui/components/button/button"
import { Popover, PopoverTrigger } from "@shared/ui/components/popover/popover"
import { Sparkle } from "@shared/ui/foundations/icons"

import { AgentPanel } from "@/components/agent-panel"
import { useActiveTeam } from "@/lib/use-active-team"
import { usePermissions } from "@/lib/perms"
import { useAgentOpen, setAgentOpen } from "@/lib/agent-open"
import { useScreenTraceEngine } from "@/lib/screen-trace"
import { useShellColumns } from "@/lib/use-is-phone"
import { useT } from "@shared/web/language"

export function AgentHost() {
  const t = useT()
  const active = useActiveTeam()
  const teamId = active.ctx?.team?.id ?? null
  const { can } = usePermissions(teamId)
  const open = useAgentOpen()
  const docked = useShellColumns()
  // The assistant's steps drive the REAL screen from wherever the host lives — stable
  // here (root), so a multi-step run keeps tracing even as the screen changes. Runs
  // before the early returns (hooks are unconditional); it no-ops with a null team.
  useScreenTraceEngine(teamId)

  // No team context yet (signed out, or on login / onboarding) → no co-pilot.
  if (!active.ctx) return null
  // Gated by agent:create, exactly as the old in-shell launcher was; the server
  // re-checks every action AS the signed-in user regardless.
  if (!can("agent", "create")) return null

  // DOCKED — no launcher, no `Popover`, no overlay of any kind. The panel is
  // still mounted HERE, at the root, and draws itself into the shell's column
  // through a portal; when the column is shut there is no column, so it draws
  // nothing and keeps its thread. "Closed assistant show nothing. It's literally
  // only the bar" (client, verbatim) is the shell's own behaviour, unassisted.
  if (docked) return <AgentPanel teamId={teamId} open={open} docked />

  return (
    // ITEM 2/3 (owner, 31 Aug 2026): "more like a bubble coming out of its
    // button, instead of a slide-in" + "the button... must not disappear,
    // stay in its position and I can also use it to close the assistant."
    // `Popover` anchors the panel to THIS button, so the launcher never moves
    // and is never covered — the panel is a small anchored card next to it,
    // not a full-height overlay drawn on top of it (agent-panel.tsx has the
    // full reasoning for choosing `Popover` over the kit's own
    // `overlays/assistant.tsx`). `PopoverTrigger asChild` gives Radix the
    // click: a controlled `Popover` toggles its own `open` on every trigger
    // press, which is what fixes the old bug outright — `setAgentOpen(true)`
    // here always FORCED it open and a second press did nothing, so there was
    // no way to close the panel from its own launcher. No hand-rolled
    // `!open` needed; Radix already does the toggle correctly once it owns
    // the trigger's click.
    //
    // NARROW ONLY, since the shell's edge handle took the wide case (see the
    // header). The button is not CSS-hidden — this branch is not rendered at
    // all — so there is never an invisible launcher holding an open `Popover`
    // beside a docked column.
    <Popover open={open} onOpenChange={setAgentOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          // The label stays the launcher's own name rather than switching to
          // "Close the assistant" on open — `aria-expanded` (Radix's own,
          // added by `PopoverTrigger`) already tells a screen reader the
          // toggle state, and a second English sentence here would need its
          // own catalogue entry across every language (R28) for a state a
          // screen reader already announces.
          aria-label={t("Open the assistant")}
          // The copilot launcher, drawn the way the kit's own `copilot-overlay`
          // draws it: `size="icon"` at the standing control height, the primary
          // fill and its hover token, `shadow-lg`. Only the PLACING is ours — the
          // kit pins its launcher at the viewport corner, and ours has to clear
          // the phone's bottom nav bar. `motion-hover-lift` stays because
          // motion.css §13 names the copilot launcher, by that word, as one of the
          // three things allowed to gain elevation on hover.
          className="motion-hover-lift fixed right-4 bottom-20 z-30 shadow-lg"
        >
          <Sparkle />
        </Button>
      </PopoverTrigger>
      <AgentPanel teamId={teamId} open={open} docked={false} />
    </Popover>
  )
}
