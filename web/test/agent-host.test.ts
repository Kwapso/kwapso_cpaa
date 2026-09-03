// The AI co-pilot must be mounted ONCE at the root layout, not inside the per-route
// AppShell — otherwise every navigation (including the assistant's own screen-trace)
// remounts the shell and tears the panel + its live run down (the reported bug: the
// panel closed on navigation and the step pills collapsed mid-run). These source-scans
// lock the panel above the routed screens so it survives navigation.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = join(HERE, "..")
const read = (p: string) => readFileSync(join(WEB, p), "utf8")

describe("the AI co-pilot survives navigation (mounted at the root, not per-route)", () => {
  it("the root layout mounts the persistent AgentHost", () => {
    const layout = read("app/layout.tsx")
    expect(layout, "root layout must render <AgentHost /> above the routed screens").toContain("<AgentHost")
    expect(layout).toContain('from "@/components/agent-host"')
  })

  it("AppShell no longer owns the panel (it would remount per route)", () => {
    const shell = read("components/app-shell.tsx")
    expect(shell, "AppShell must NOT mount AgentPanel — it lives at the root now").not.toContain("<AgentPanel")
    expect(shell, "AppShell must NOT own the screen-trace engine — it moved to the stable root host").not.toContain("useScreenTraceEngine")
  })

  it("AgentHost holds the panel + the trace engine, gated by agent:create + a team", () => {
    const host = read("components/agent-host.tsx")
    expect(host).toContain("<AgentPanel")
    expect(host).toContain("useScreenTraceEngine")
    // Only a signed-in person with a team + the agent right gets the co-pilot.
    expect(host).toContain("active.ctx")
    expect(host).toContain('can("agent", "create")')
  })

  it("the open state is a module-level store (survives remounts), not per-shell useState", () => {
    const store = read("lib/agent-open.ts")
    expect(store).toContain("useSyncExternalStore")
    expect(store).toContain("export function setAgentOpen")
  })

  it("the open state is remembered PER PERSON, the way the rail's collapse is", () => {
    // Crossing into the /t shell is a hard reload (static export). Without the mirror the
    // panel vanished on that reload (the "panel reset" bug). It must persist + restore.
    //
    // `localStorage`, not `sessionStorage`, since the assistant became a COLUMN
    // (2026-09-03): the kit says both flat columns' collapse "persists per user", and a
    // column that is gone the next morning while the rail's collapse is still remembered
    // is a broken mirror. The key is shaped like the rail's own (`ss-sidebar-collapsed`,
    // app-shell.tsx) so the two furniture preferences sit together.
    const store = read("lib/agent-open.ts")
    expect(store, "must mirror open state to localStorage").toContain("localStorage")
    // The word still appears in the comment that records the change; what must be gone
    // is the same-tab CALL.
    expect(store, "must not read or write same-tab sessionStorage").not.toMatch(/sessionStorage\./)
    expect(store, "must READ the persisted state at load").toMatch(/getItem\(/)
    expect(store, "the key sits beside the rail's own").toContain('"ss-assistant-open"')
  })

  it("the docked column is a PORTAL out of the root host, not a panel in the shell", () => {
    // The whole reason the panel is mounted at the root is that it drives navigation.
    // Docking it into ScreenShell's `aside` must not move it into the routed shell — the
    // DOM moves, the React tree does not.
    const panel = read("components/agent-panel.tsx")
    expect(panel, "the column is reached through a portal").toContain("createPortal")
    expect(panel, "into the shell's published dock node").toContain("useAgentDock")
    const shell = read("components/app-shell.tsx")
    expect(shell, "the shell passes an empty slot, never the panel").toContain("<AgentDockSlot />")
    expect(shell, "and the slot is the kit's own third column").toMatch(/aside=\{/)
  })

  it("one flag drives both presentations, and the shell is CONTROLLED by it", () => {
    // The kit holds the aside's open state itself unless it is given one. It must be
    // given one: otherwise the column's state could not be persisted, and the phone's
    // floating panel and the desktop column would be two answers to one question.
    const shell = read("components/app-shell.tsx")
    expect(shell).toContain("asideOpen={assistantOpen}")
    expect(shell).toContain("onAsideOpenChange={setAgentOpen}")
    expect(shell, "the flag is the panel's own store").toContain('from "@/lib/agent-open"')
  })

  it("the mango launcher is not drawn where the shell's edge handle already opens it", () => {
    // ONE MANGO. The handle is the column's own affordance; a second mango control on a
    // screen that already has its own create button is exactly what SHELL.md forbids.
    // The launcher branch must be UNREACHED when docked, not merely CSS-hidden — an
    // invisible trigger holding an open Popover beside a docked column is two assistants.
    const host = read("components/agent-host.tsx")
    expect(host, "the width decides, once, against the kit's own breakpoint").toContain("useShellColumns")
    expect(host, "docked returns before the launcher is built").toMatch(
      /if \(docked\) return <AgentPanel[^\n]*docked \/>/
    )
  })

  it("the session cache is reactive, so the root-mounted launcher appears without a reload", () => {
    // AgentHost mounts BEFORE login; its useActiveTeam instance must pick up the session
    // the moment another instance logs in / creates a team — else the launcher only shows
    // after a manual reload. A pub-sub over the shared cache is what makes that reactive.
    const hook = read("lib/use-active-team.ts")
    expect(hook, "cache writes must notify subscribers").toContain("setSessionCache")
    expect(hook, "instances must subscribe to cache changes").toMatch(/sessionSubs\.(add|delete)/)
  })

  it("the screen-trace never hard-reloads across the /t boundary (no router.push)", () => {
    // The off-host router.push into a deep /t path was a hard reload that killed the
    // running assistant. Off-host now narrates; only the soft HOST_EVENT drives a move.
    const engine = read("lib/screen-trace.tsx")
    // No actual router.push CALL (comments may still name it as the old behavior).
    expect(/router\.push\(/.test(engine), "the trace engine must not router.push (that reload killed the agent)").toBe(false)
    expect(engine, "soft drive is via the host event only").toContain("HOST_EVENT")
  })
})
