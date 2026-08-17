"use client"

// GOOGLE CONNECTIONS (Settings) — your own account, four services, one at a time.
//
// It sits beside Access tokens for a reason: both are things a PERSON connects
// to their own account rather than things a team owns, and both hand something
// the power to act as you. The sentence at the top says the part people most
// need to hear — kwapso never uses anybody else's account, and the assistant
// acting for you sees exactly what you see.
//
// WHAT THIS CARD DELIBERATELY DOES NOT DO: browse your Drive, show your inbox,
// or read your calendar. Those doors exist and the assistant uses them; a screen
// that re-implemented Gmail beside Gmail would be the wrong kind of ambitious.
// This card is about the CONNECTION — is it on, whose account is it, what have
// you shared through it, and who can read that.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kwapso/ui/registry/primitives/alert-dialog/alert-dialog"
import { Ban, Plus, Power, RefreshCw } from "lucide-react"

import {
  GOOGLE_SERVICES,
  type Account,
  type GoogleConnection,
  type GoogleService,
  type GoogleSource,
} from "@shared/types"
import { ApiFailure, content, tenancy } from "@/lib/api"
import { formatActivityWhen } from "@shared/web/format"
import { googleKey } from "@/lib/live-resources"
import { usePermissions } from "@/lib/perms"
import { primeCache, useCached } from "@shared/web/store"
import { GoogleSourceDialog } from "@/components/google-source-dialog"
import { useT } from "@shared/web/language"

/** The word a person reads for each service, and the sentence saying what
 * connecting it actually lets kwapso see. The second half matters more than the
 * first: "Gmail" tells somebody nothing about what they are agreeing to. */
const SERVICE_COPY: Record<GoogleService, { label: string; scope: string }> = {
  drive: { label: "Drive", scope: "Only the folders you share below — nothing else in your Drive." },
  gmail: { label: "Gmail", scope: "Only mail to or from someone on one of your accounts." },
  calendar: { label: "Calendar", scope: "Your own calendar, so meetings and sprints can be read and added." },
  chat: { label: "Google Chat", scope: "Only the spaces you share below — nothing else in Chat." },
}

/** Which services are shared through NAMED folders or spaces. */
const NAMED: GoogleService[] = ["drive", "chat"]

/** How many bounded ticks one press of "bring it in" will run. Each one files up
 * to INGEST_SOURCES_PER_TICK sources, so this is a first pass over a few hundred
 * items — and a ceiling, because a loop that keeps going until an external system
 * says stop is a loop whose length somebody else decides. What is left is picked
 * up by the next press, from the cursor. */
const MAX_SYNC_PASSES = 12

export function GoogleConnectionsSection({ teamId }: { teamId: string | null }) {
  const t = useT()
  const key = googleKey(teamId ?? "none")
  const q = useCached<{ connections: GoogleConnection[]; sources: GoogleSource[]; ready: boolean }>(
    key,
    () => content.googleConnections()
  )
  // The clients a folder or a space can be filed under. Read on the same key the
  // accounts screen uses, so opening Settings after the accounts list costs
  // nothing — and only when there is a team to read them for.
  const accountsQ = useCached<Account[]>(teamId ? `accounts:${teamId}` : null, () =>
    tenancy.accounts().then((r) => r.accounts)
  )
  const [busy, setBusy] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState<GoogleService | null>(null)
  const [sharing, setSharing] = React.useState<"drive" | "chat" | null>(null)
  const { can } = usePermissions(teamId)

  // THE OTHER HALF OF THE ROUND-TRIP. Google sends the browser back to the
  // callback, which parks the authorization code in an HttpOnly cookie and
  // redirects here with `?google=connected`. Nothing readable by this code ever
  // carries the credential — this effect just tells the server the handshake is
  // ready to be finished, and the server reads the cookie the browser cannot.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get("google")
    if (!outcome) return
    // The query is cleared FIRST, so a refresh can never re-run a spent
    // handshake and show a confusing second failure.
    window.history.replaceState({}, "", window.location.pathname)
    if (outcome !== "connected") {
      toast.error(t("That Google connection didn't finish. Try again."))
      return
    }
    void content
      .googleConnect()
      .then((r) => {
        primeCache(key, { ...r, ready: true })
        toast.success(t("Connected."))
      })
      .catch((err) => toast.error(err instanceof ApiFailure ? err.message : "Couldn't finish that connection."))
  }, [key, t])

  const connections = q.data?.connections.filter((c) => c.active) ?? []
  const sources = q.data?.sources.filter((s) => s.active) ?? []
  const liveFor = (service: GoogleService) => connections.find((c) => c.service === service) ?? null

  async function refresh() {
    primeCache(key, await content.googleConnections())
  }

  /** BRING MY GOOGLE MATERIAL INTO THE KNOWLEDGE BASE.
   *
   * The one sweep in the product that CANNOT run itself, and therefore the one
   * that has to have a button. Everything it reads comes through this person's
   * own token, so it has to run as them — and a cron has no caller to be. So the
   * control lives here, on the card that owns the connection, rather than on the
   * knowledge base's own screen where it would look like the fifteen-minute
   * sweep and quietly be a different thing.
   *
   * It loops until the sweep says it has caught up, because a tick is bounded
   * (25 sources) and a first run over a full folder is more than one tick.
   * Bounded here too: a runaway loop against somebody's Drive is a worse failure
   * than an incomplete first pass, and the next press carries on from the cursor.
   */
  async function syncGoogle() {
    if (syncing) return
    setSyncing(true)
    let indexed = 0
    try {
      for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
        const r = await content.syncGoogleKnowledge()
        indexed += r.results.reduce((n, k) => n + k.indexed, 0)
        // A KIND THAT FAILED CARRIES ITS OWN SENTENCE (R12 records it on the
        // row; the door hands it back per kind), and that sentence is the one
        // worth showing — "connect it again in Settings" is actionable where a
        // generic "couldn't read your Google material" is not. Found by pressing
        // the button against a dead token and reading what came back.
        const failed = r.results.find((k) => k.error)
        if (failed?.error) {
          toast.error(failed.error)
          return
        }
        if (r.caughtUp) break
      }
      toast.success(
        indexed > 0
          ? `Brought in ${indexed} ${indexed === 1 ? "thing" : "things"} the assistant can now answer from.`
          : "Everything of yours is already up to date."
      )
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't read your Google material just now.")
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    if (!disconnecting || busy) return
    setBusy(true)
    try {
      const r = await content.googleDisconnect(disconnecting)
      primeCache(key, { connections: r.connections, sources: r.sources, ready: q.data?.ready ?? true })
      toast.success(
        r.revokedAtGoogle
          ? "Disconnected."
          : "Disconnected here — remove kwapso in your Google account too."
      )
      setDisconnecting(null)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't disconnect that.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="animate-rise flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Google")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("Connect your own Google account, one service at a time. kwapso never uses anyone else's — the assistant working for you sees exactly what you can see, and nothing more.")}
      </p>

      {q.error ? (
        <p className="text-destructive text-sm">{t("Couldn't load your Google connections.")}</p>
      ) : q.data === undefined ? (
        <Skeleton variant="list" lines={4} />
      ) : !q.data.ready ? (
        <p className="text-muted-foreground text-sm">
          {t("Google connections aren't set up on this environment yet.")}
        </p>
      ) : (
        <div className="flex flex-col rounded-xl border">
          {GOOGLE_SERVICES.map((service) => {
            const live = liveFor(service)
            const named = sources.filter((s) => s.service === service)
            return (
              <div key={service} className="flex flex-col gap-2 border-b p-3 last:border-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{SERVICE_COPY[service].label}</span>
                  {live ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {live.googleEmail}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                      {t("Not connected")}
                    </Badge>
                  )}
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {live
                      ? live.lastUsedAt
                        ? `Last used ${formatActivityWhen(live.lastUsedAt)}`
                        : "Never used yet"
                      : SERVICE_COPY[service].scope}
                  </span>
                  <div className="flex items-center gap-2">
                    {live && NAMED.includes(service) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSharing(service as "drive" | "chat")}
                        className="gap-1.5"
                        title={service === "drive" ? "Share a folder" : "Share a space"}
                      >
                        <Plus className="size-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("Share a")} {service === "drive" ? "folder" : "space"}</span>
                      </Button>
                    )}
                    {live ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDisconnecting(service)}
                        className="text-destructive gap-1.5"
                        title={t("Disconnect")}
                      >
                        <Power className="size-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("Disconnect")}</span>
                      </Button>
                    ) : (
                      /* A plain navigation, not a fetch: this door answers with a
                       * 302 to Google's own consent screen, and a page has to GO
                       * there rather than read it. */
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.location.href = `/api/content/google/start?service=${encodeURIComponent(service)}`
                        }}
                        className="gap-1.5"
                      >
                        <Plus className="size-3.5" aria-hidden /> {t("Connect")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* A grant somebody removed in their Google account is silent by
                 * nature — the app just starts finding nothing. This is the line
                 * that turns it into something a person can act on. */}
                {live?.lastError && (
                  <p className="text-destructive text-xs">
                    {t("Google refused the last request. Disconnect and connect again.")}
                  </p>
                )}

                {live && NAMED.includes(service) && (
                  <div className="flex flex-col gap-1 pl-1">
                    {named.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("Nothing shared yet —")} {SERVICE_COPY[service].scope}
                      </p>
                    ) : (
                      named.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-medium">{s.name}</span>
                          {/* THE SHELF, ON EVERY ROW. Deciding it once at the
                           * moment of sharing is not enough on its own: somebody
                           * has to be able to look, six months later, and see
                           * which of their folders the team can read.
                           *
                           * ONE badge style for both, deliberately. The words do
                           * the work — "The team can read it" is unmistakable
                           * where a colour is a convention somebody has to have
                           * learnt, and this card is written for a reader who
                           * should never have to decode it (UI-CONVENTIONS: the
                           * voice). */}
                          <Badge variant="outline" className="text-[10px]">
                            {s.shelf === "team" ? "The team can read it" : "Just you"}
                          </Badge>
                          {/* AND WHOSE MATERIAL IT IS. The second decision made
                           * at the moment of sharing, shown on the row for the
                           * same reason the first one is: six months later,
                           * "which client does the assistant think this is
                           * about?" is a question somebody has to be able to
                           * answer by looking. */}
                          <Badge variant="outline" className="text-[10px]">
                            {s.accountName ? `Filed under ${s.accountName}` : "Ours"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-6 gap-1 px-1.5 text-[11px]"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true)
                              try {
                                const r = await content.googleSetSourceActive(s.id, false)
                                primeCache(key, { ...(q.data as object), sources: r.sources } as typeof q.data)
                                toast.success(t("Stopped sharing that."))
                              } catch (err) {
                                toast.error(
                                  err instanceof ApiFailure ? err.message : "Couldn't stop sharing that."
                                )
                              } finally {
                                setBusy(false)
                              }
                            }}
                          >
                            <Ban className="size-3" aria-hidden /> {t("Stop sharing")}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* THE ONE SWEEP THAT CANNOT RUN ITSELF. Offered only when there is a live
       * connection to read through and the caller may add to the knowledge base
       * — the door demands both rights anyway, and a button that always refuses
       * is worse than no button.
       *
       * `ready` is in the condition for a reason found by looking at the screen:
       * without it, an environment whose OAuth app is not configured showed
       * "Google connections aren't set up here" and a button offering to read
       * through one, three lines apart. It is not merely untidy — reading needs a
       * LIVE access token, and refreshing an expired one needs the OAuth app, so
       * on a not-ready environment the button works until the first token expires
       * and then fails with a message about something the person cannot fix. */}
      {q.data?.ready && connections.length > 0 && can("knowledge", "create") && can("google", "read") && (
        <div className="flex flex-col gap-1.5 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("Let the assistant read what you have shared")}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={syncing || busy}
              onClick={syncGoogle}
              className="gap-1.5"
            >
              {syncing ? <Spinner /> : <RefreshCw className="size-3.5" aria-hidden />}
              {syncing ? "Reading…" : "Bring it in"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {t("Reads through YOUR connection only, so it has to be you who asks. Anything you shared with just yourself stays answerable to you alone.")}
          </p>
        </div>
      )}

      {sharing && (
        <GoogleSourceDialog
          open
          onOpenChange={(o) => !o && setSharing(null)}
          service={sharing}
          draftKey={`google-source:${sharing}`}
          accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
          onSubmit={async (values) => {
            await content.googleAddSource({ service: sharing, ...values })
            await refresh()
            toast.success(
              values.shelf === "team" ? "Shared — the team can read it." : "Shared — only you can read it."
            )
          }}
        />
      )}

      <AlertDialog open={disconnecting !== null} onOpenChange={(o) => !o && setDisconnecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Disconnect")} {disconnecting ? SERVICE_COPY[disconnecting].label : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("kwapso stops reading and writing there straight away, and anything you shared through it stops being shared. We'll ask Google to drop the connection too.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("Keep it")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void disconnect()
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              <Power className="size-3.5" aria-hidden /> {t("Disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
