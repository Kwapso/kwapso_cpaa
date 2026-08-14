// SplashScreen — the opening frame, mounted by BOTH root layouts.
//
// A server component with no state and no client bundle: it emits three inert
// strings (a stylesheet, the mark, a nine-line script) that Next bakes into the
// exported HTML, so the animation is painted by the browser's parser before the
// React bundle has been asked for. Everything real — the timing, the shape, the
// placeholder you change to swap the animation — lives in shared/web/splash.ts.
//
// On the three dangerouslySetInnerHTML calls: all three arguments are module
// CONSTANTS built from other module constants. Nothing in this file touches a
// request, a row, a search param or anything a person typed, so there is no
// untrusted value to escape — which is a different situation from AgentMarkdown
// (escape-first, because the model's output is untrusted) and worth saying out
// loud, since the two read alike at a glance.

import { splashInner, splashScript, splashStyle } from "./splash"

export function SplashScreen() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: splashStyle() }} />
      {/* aria-hidden + role=presentation: the app's real content is already in
       * the DOM underneath, so a screen reader should read THAT and never
       * announce a decorative overlay. suppressHydrationWarning because the
       * inline script may have set display:none on this node (a tap skip)
       * before React ever gets to it. */}
      <div
        id="ks-splash"
        role="presentation"
        aria-hidden="true"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: splashInner() }}
      />
      <script dangerouslySetInnerHTML={{ __html: splashScript() }} />
    </>
  )
}
