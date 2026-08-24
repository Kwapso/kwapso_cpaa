"use client"

// PWA install pop-up. A bottom Sheet (library) that invites the user to add the
// app to their home screen / dock.
//
// Trigger rules (also documented in ARCHITECTURE.md section 6):
//  • Never when already installed (display-mode: standalone / iOS standalone).
//  • Never on a browser that can't install (no native event AND not iOS Safari)
//    — we don't nag where the action is impossible.
//  • Show once on the FIRST visit (any page); afterwards only on the LOGIN page,
//    and at most once every 14 days after a dismissal. Installing or dismissing
//    stamps the cooldown.
//
// Mechanics: Chrome/Edge/Android fire `beforeinstallprompt` → we show a real
// "Install" button that calls the captured event. iOS Safari fires no such
// event, so we show the manual "Share → Add to Home Screen" walkthrough.
// Composed entirely from the library (Sheet + Button) — no one-off UI.

import * as React from "react"
import { usePathname } from "next/navigation"
import { Download, Plus, Share } from "@shared/ui/icons"

import { Button } from "@shared/ui/controls/button/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/controls/sheet/sheet"

import { brand } from "@shared/brand"
import { detectPlatform, isIOSSafari, isStandalone, type PwaPlatform } from "@/lib/pwa"
import { useT } from "@shared/web/language"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "pwa_install_dismissed_at"
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

export function InstallPrompt() {
  const t = useT()
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [platform, setPlatform] = React.useState<PwaPlatform>("desktop")
  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null)
  const [hasNative, setHasNative] = React.useState(false)

  // The trigger decision. Reads live install-state each time so it's correct
  // whether called on mount, on a native event, or on a route change.
  const maybeShow = React.useCallback(() => {
    if (isStandalone()) return
    const installable = deferred.current !== null || isIOSSafari()
    if (!installable) return
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    const neverInteracted = dismissedAt === 0
    const cooledDown = Date.now() - dismissedAt > COOLDOWN_MS
    const onLogin = pathname?.startsWith("/login") ?? false
    if (neverInteracted || (onLogin && cooledDown)) setOpen(true)
  }, [pathname])

  React.useEffect(() => {
    setPlatform(detectPlatform())

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stop Chrome's mini-infobar; we drive our own prompt
      deferred.current = e as BeforeInstallPromptEvent
      setHasNative(true)
      maybeShow()
    }
    const onInstalled = () => {
      deferred.current = null
      setHasNative(false)
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
      setOpen(false)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    // iOS (no event) + the case where the native event already fired.
    maybeShow()

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [maybeShow])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setOpen(false)
  }

  async function install() {
    const e = deferred.current
    if (!e) return
    await e.prompt()
    await e.userChoice
    deferred.current = null
    setHasNative(false)
    dismiss() // stamp cooldown either way; if accepted, appinstalled also fires
  }

  const iosSafari = platform === "ios" && isIOSSafari()

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <SheetContent side="bottom" className="rounded-t-xl">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <SheetHeader className="flex flex-row items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Download className="size-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle>{t("Install")} {brand.name}</SheetTitle>
              <SheetDescription>
                {t("Add it to your home screen for a faster, full-screen, app-like experience.")}
              </SheetDescription>
            </div>
          </SheetHeader>

          {iosSafari ? (
            // iOS Safari: no install event — guide the manual gesture.
            <ol className="text-muted-foreground flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-foreground font-medium">1.</span>
                {t("Tap the Share button")}
                <Share className="text-foreground size-4" aria-label={t("Share")} />
                {t("in the toolbar.")}
              </li>
              <li className="flex items-center gap-2">
                <span className="text-foreground font-medium">2.</span>
                {t("Choose “Add to Home Screen”")}
                <Plus className="text-foreground size-4" aria-hidden />.
              </li>
            </ol>
          ) : null}

          {/* Action rows never clip (UI-CONVENTIONS): flex-wrap so a narrow phone
              REFLOWS, and ml-auto on the first action (not justify-end on the
              parent — that pushes overflow off the LEFT edge where it hides). */}
          <SheetFooter className="flex-row flex-wrap gap-2 [&>*:first-child]:ml-auto">
            <Button variant="ghost" onClick={dismiss}>
              {t("Not now")}
            </Button>
            {hasNative ? (
              <Button onClick={() => void install()} className="gap-1">
                <Download className="size-4" />
                {t("Install")}
              </Button>
            ) : iosSafari ? (
              <Button onClick={dismiss}>{t("Got it")}</Button>
            ) : null}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
