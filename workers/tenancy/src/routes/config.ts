// Config routes — the screen-engine recipe store. Serve a team's per-screen
// overrides (any member: they drive what the member sees; each screen's DATA is
// still permission-checked at its own endpoint), and set one (team-admin).
//
// NOT agent-callable, and not on the MCP either — this comment used to say the
// write was, while it sat on neither catalogue. Authoring a recipe changes what
// every person on the team sees, and the only way to judge one is to look at the
// screen it draws; a machine client has no screen. The decision is recorded where
// the machine surface's other decisions are (TOOLLESS_DOORS in the R19 census).

import { refusePortalCaller } from "../../../../shared/workers/account-scope"
import { fail, json } from "../../../../shared/workers/http"
import { publishChange } from "../../../../shared/workers/realtime"
import { getScreenOverrides, setScreenOverride } from "../lib/screens-config"
import { gatedBody } from "../../../../shared/workers/route"
import { requireText, TEXT_LIMITS } from "../../../../shared/workers/validate"
import { teamContext } from "../context"
import type { Env } from "../env"

export async function getScreens(request: Request, env: Env): Promise<Response> {
  const { cfg, guard } = await teamContext(request, env)
  // "Any member" means any member of the AGENCY. A recipe describes an agency
  // screen — which modules it shows, which columns, which tabs — and the client
  // portal draws none of them (it has its own screens and this door is not on
  // its surface). A client login is an ordinary member, so the refusal has to be
  // here rather than on the other gateway's allow-list.
  await refusePortalCaller(cfg, guard)
  return json({ screens: await getScreenOverrides(cfg, guard) })
}

export async function postScreen(request: Request, env: Env): Promise<Response> {
  const { actor, cfg, guard, body } = await gatedBody<{ module?: string; recipe?: unknown }>(
    request, env, "teams", "edit"
  )
  const module = requireText(body.module, "Module", TEXT_LIMITS.short)
  if (typeof body.recipe === "undefined")
    return fail(400, "invalid_input", "module and recipe are required.")
  const recipeJson =
    typeof body.recipe === "string" ? body.recipe : JSON.stringify(body.recipe)
  await setScreenOverride(cfg, guard, actor, module, recipeJson)
  await publishChange(env, guard.teamId, "screens", module)
  return json({ screens: await getScreenOverrides(cfg, guard) })
}
