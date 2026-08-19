// MarkRuntime — the two inert strings the mark needs in every exported page,
// mounted by BOTH root layouts.
//
// A server component with no state and no client bundle: a stylesheet and a
// script, which Next bakes into the exported HTML. The MARK itself is not here —
// it is rendered by `MarkLoader`, wherever the app is actually waiting, and the
// exported .html of every route that waits already carries it. This file only
// makes sure the styling and the animator are on the page before the parser
// reaches it.
//
// IT REPLACED A SPLASH, and that is the whole point of it being this small. The
// component here used to render a fixed full-viewport overlay with a SECOND copy
// of the mark inside it — so every boot ran two animations at once, one of them
// behind an opaque field where nobody could see it. shared/web/splash.ts has the
// measurements. Deleting the overlay left exactly this: the stylesheet, and the
// animator plus the four lines that start it without waiting for React.
//
// On the two dangerouslySetInnerHTML calls: both arguments are module CONSTANTS
// built from other module constants. Nothing in this file touches a request, a
// row, a search param or anything a person typed, so there is no untrusted value
// to escape — which is a different situation from AgentMarkdown (escape-first,
// because the model's output is untrusted) and worth saying out loud, since the
// two read alike at a glance.

import { markScript, splashStyle } from "./splash"

export function MarkRuntime() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: splashStyle() }} />
      <script dangerouslySetInnerHTML={{ __html: markScript() }} />
    </>
  )
}
