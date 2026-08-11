"use client"

// The URL seam for the one shell. The whole post-auth app resolves inside a single
// component that never unmounts, so the URL — not a route change — is the state:
// this module READS it on the client, keeps it in step with Back/Forward, and
// CHANGES it with the History API so nothing ever reloads (EDGE-CASES §1).

import * as React from "react"
import { usePathname, type useRouter } from "next/navigation"

import { buildScreenQuery, type ScreenQuery } from "@kwapso/ui/lib/recipe"

import { parseRoute, TOP_LEVEL_MODULES, type Route } from "@/components/deep-link/route"

/** The framework router, as the host hands it over. */
type HostRouter = ReturnType<typeof useRouter>

/** A path this host owns, so it can be reached with the History API (no reload):
 * the whole /t/* tree, plus the top-level module pages (/learning, /tickets). */
export function isInAppPath(p: string): boolean {
  return p.startsWith("/t") || TOP_LEVEL_MODULES.some((m) => p === `/${m}` || p.startsWith(`/${m}/`))
}

/** Read the path + query on the CLIENT — a static export can't prerender ids.
 * Re-reads on path changes and on Back/Forward (popstate); query-only changes are
 * reflected synchronously by go() (a push that doesn't change the pathname won't
 * re-fire the effect). This avoids useSearchParams, which complicates static export. */
export function useUrlRoute(): { route: Route | null; setRoute: (route: Route) => void } {
  const pathname = usePathname()
  const [route, setRoute] = React.useState<Route | null>(null)
  React.useEffect(() => {
    const read = () => setRoute(parseRoute(window.location.pathname, window.location.search))
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [pathname])
  return { route, setRoute }
}

/** Moving around the app: go (push), replace, and close an open panel.
 *
 * The ENTIRE /t/* tree is one static shell (the host never unmounts), so moving
 * WITHIN it must NOT use the framework router: in a static export the router has no
 * data file for an arbitrary /t/<…> path and falls back to a full-page reload (re-runs
 * the session check, refetches everything, wipes the in-memory cache). Instead we
 * change the URL with the History API — Next observes pushState, the route segment
 * never changes, nothing reloads, and the cache stays warm — then swap the screen from
 * `route` state. Leaving /t (Home/Settings) is a real route change, so use the router. */
export function useHostNav({
  router,
  setRoute,
  currentPath,
}: {
  router: HostRouter
  setRoute: (route: Route) => void
  /** the clean URL of the screen behind any open ?panel / ?confirm */
  currentPath: string
}): {
  go: (path: string, q?: ScreenQuery) => void
  replace: (path: string) => void
  closePanel: () => void
} {
  // True once we've navigated in-app (a go() push). Lets close be history-aware:
  // an in-app panel closes by popping that push (Back also closes it); a panel
  // reached by a fresh deep link has no entry to pop, so it closes by replacing
  // to the clean URL instead of router.back() (which would leave the app).
  const navigatedRef = React.useRef(false)

  const go = React.useCallback(
    (path: string, q?: ScreenQuery) => {
      navigatedRef.current = true
      const search = q ? buildScreenQuery(q) : ""
      const url = path + search
      if (isInAppPath(path)) {
        window.history.pushState(null, "", url)
        setRoute(parseRoute(path, search))
      } else {
        router.push(url)
      }
    },
    [router, setRoute]
  )

  const replace = React.useCallback(
    (path: string) => {
      if (isInAppPath(path)) {
        window.history.replaceState(null, "", path)
        setRoute(parseRoute(path, ""))
      } else {
        router.replace(path)
      }
    },
    [router, setRoute]
  )

  // Close an open ?panel / ?confirm. In-app: pop the push (Back closes too).
  // Deep-linked (no in-app history): replace to the clean path so the panel
  // closes in place and the URL is cleaned, rather than leaving the app.
  const closePanel = () => {
    if (navigatedRef.current) router.back()
    else replace(currentPath)
  }

  return { go, replace, closePanel }
}
