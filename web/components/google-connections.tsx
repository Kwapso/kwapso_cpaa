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

import { Badge } from "@shared/ui/registry/primitives/badge/badge"
import { Button } from "@shared/ui/registry/primitives/button/button"
import { Skeleton } from "@shared/ui/registry/primitives/skeleton/skeleton"
import { toast } from "@shared/ui/registry/primitives/sonner/sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/ui/registry/primitives/alert-dialog/alert-dialog"
import { Ban, Plus, Power } from "lucide-react"

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
import { GoogleSyncButton } from "@/components/google-sync"
import { useT } from "@shared/web/language"

/** The word a person reads for each service, and the sentence saying what
 * connecting it actually lets kwapso see. The second half matters more than the
 * first: "Gmail" tells somebody nothing about what they are agreeing to.
 *
 * THIS SENTENCE IS A PROMISE AND IT HAS TO STAY TRUE. Gmail's read "Only mail to
 * or from someone on one of your accounts" for as long as the known-contact
 * fence was the only one. It stopped being true the day the transcript hunt
 * added a SECOND fence (`googleNoticeQuery`, workers/content/src/lib/google-api.ts)
 * over four Google robot senders — narrow, hard-coded in the server, unreachable
 * from any request, and used by exactly one caller, but outside the sentence all
 * the same. The widening was invisible precisely BECAUSE the first fence works:
 * Google's own no-reply addresses are nobody's contact, so nothing about the old
 * rule hinted that a notice could ever be read.
 *
 * A privacy sentence that is 99% true is worse than a longer one that is true,
 * because the person reading it has no way to find the 1%. If a third fence is
 * ever added, this sentence changes in the same commit. */
const SERVICE_COPY: Record<GoogleService, { label: string; scope: string }> = {
  drive: { label: "Drive", scope: "Only the folders you share below, nothing else in your Drive." },
  gmail: {
    label: "Gmail",
    scope:
      "Mail to or from someone on one of your accounts, plus Google's own notices about shared documents and recordings.",
  },
  // READ ONLY, and the sentence says so because the grant now does. It read
  // "so meetings and sprints can be read and added" for six weeks after the
  // last calendar write was deleted — a promise about what kwapso may do, left
  // describing a capability that no longer existed, on the one screen where
  // somebody decides whether to hand over their diary.
  calendar: {
    label: "Calendar",
    scope: "Your own calendar, read only. kwapso never adds, changes or cancels anything in it.",
  },
  chat: { label: "Google Chat", scope: "Only the spaces you share below, nothing else in Chat." },
}

/** Which services are shared through NAMED folders or spaces. */
const NAMED: GoogleService[] = ["drive", "chat"]

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
      .catch((err) => toast.error(err instanceof ApiFailure ? err.message : t("Couldn't finish that connection.")))
  }, [key, t])

  const connections = q.data?.connections.filter((c) => c.active) ?? []
  const sources = q.data?.sources.filter((s) => s.active) ?? []
  const liveFor = (service: GoogleService) => connections.find((c) => c.service === service) ?? null

  async function refresh() {
    primeCache(key, await content.googleConnections())
  }

  async function disconnect() {
    if (!disconnecting || busy) return
    setBusy(true)
    try {
      const r = await content.googleDisconnect(disconnecting)
      primeCache(key, { connections: r.connections, sources: r.sources, ready: q.data?.ready ?? true })
      toast.success(
        r.revokedAtGoogle
          ? t("Disconnected.")
          : t("Disconnected here. Remove kwapso in your Google account too.")
      )
      setDisconnecting(null)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : t("Couldn't disconnect that."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="animate-rise flex flex-col gap-4">
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t("Google")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("Connect your own Google account. kwapso never uses anyone else's, the assistant working for you sees exactly what you can see, and nothing more.")}
      </p>

      {/* ONE BUTTON, ALL FOUR, AND IT IS THE LEAD ACTION FOR A REASON.
        *
        * Connecting the services one at a time did not work — not "was tedious",
        * did not work. Google keeps ONE approval per person per app, so each
        * consent replaced the last: connecting Gmail silently killed the Drive
        * connection made ten minutes before, and only the service connected most
        * recently could answer anything. Four green rows, one working token, no
        * message anywhere.
        *
        * So this asks once, for everything, and writes all four. The per-service
        * buttons below still exist for somebody who genuinely wants Drive alone,
        * but they are no longer the path anybody is led down. Reported by the
        * owner as "this whole mechanism of scoping also should be optional, with
        * one button to just sync everything instead of selecting one thing" —
        * which turned out to describe the fix as well as the feature. */}
      {q.data?.ready && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <Button
            onClick={() => {
              window.location.href = "/api/content/google/start?service=all"
            }}
            className="gap-1"
          >
            <Plus className="size-3.5" aria-hidden /> {t("Connect everything")}
          </Button>
          <span className="text-muted-foreground min-w-0 flex-1 text-xs">
            {t("Drive, Gmail, Calendar and Chat in one approval. Google keeps one approval per app, so connecting them one at a time switches the others off.")}
          </span>
        </div>
      )}

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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{t(SERVICE_COPY[service].label)}</span>
                  {live ? (
                    <Badge variant="secondary" className="text-badge">
                      {live.googleEmail}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground text-badge">
                      {t("Not connected")}
                    </Badge>
                  )}
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {live
                      ? live.lastUsedAt
                        ? t("Last used {when}", { when: formatActivityWhen(live.lastUsedAt) })
                        : t("Never used yet")
                      : t(SERVICE_COPY[service].scope)}
                  </span>
                  <div className="flex items-center gap-2">
                    {live && NAMED.includes(service) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSharing(service as "drive" | "chat")}
                        className="gap-1"
                        title={service === "drive" ? t("Share a folder") : t("Share a space")}
                      >
                        <Plus className="size-3.5" aria-hidden />
                        <span className="hidden sm:inline">{t("Share a")} {service === "drive" ? t("folder") : t("space")}</span>
                      </Button>
                    )}
                    {live ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDisconnecting(service)}
                        className="text-destructive gap-1"
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
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          window.location.href = `/api/content/google/start?service=${encodeURIComponent(service)}`
                        }}
                        className="gap-1"
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

                {/* A GRANT WIDER THAN THE ASK, said out loud.
                  *
                  * The silent failure this exists for: a scope is narrowed in
                  * our code, somebody connects again, and Google hands back the
                  * old wider approval because a grant is an additive set per
                  * OAuth client. Nothing breaks, nothing logs, and the app
                  * looks fixed while the power is still held. `extraScopes` is
                  * the server's own subtraction of what came back minus what we
                  * asked for, so this line appears exactly when that has
                  * happened and never otherwise.
                  *
                  * The scope names themselves are deliberately NOT printed:
                  * `https://www.googleapis.com/auth/calendar.events` tells a
                  * manager nothing and looks like an error. What they need is
                  * the fact and the fix, and the Disconnect button is on the
                  * row above this line. */}
                {live && live.extraScopes.length > 0 && (
                  <p className="text-warning text-xs">
                    {t("Google still allows kwapso more than it asks for here. Disconnecting and connecting again is the only thing that clears it.")}
                  </p>
                )}

                {/* AND THE SAME ROW SAYS WHEN IT IS SHORT, which is the failure
                  * that had already happened. `gmail.modify` was added to the
                  * Gmail request after the first connections were made, so
                  * filing a message under a label refused a person whose grant
                  * nobody had touched — and the only place that fact was
                  * written down was a line in a test plan. Two facts, two
                  * sentences, one fix: they are different things to be told
                  * ("kwapso can do more than it says" and "kwapso cannot do
                  * what it says"), and blurring them into one line would lose
                  * the only half a person can act on differently. */}
                {live && live.missingScopes.length > 0 && (
                  <p className="text-warning text-xs">
                    {t("This connection is missing a permission kwapso now needs. Disconnect it and connect it again.")}
                  </p>
                )}

                {live && NAMED.includes(service) && (
                  <div className="flex flex-col gap-1 pl-1">
                    {named.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("Nothing shared yet — {scope}", {
                          scope: t(SERVICE_COPY[service].scope),
                        })}
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
                          {/* A FOLDER OR ONE FILE. Shown because the two are
                           * different promises: a folder keeps taking in
                           * whatever somebody puts there afterwards, and a file
                           * is only ever itself. Six months later that is the
                           * difference between "why can it see this?" and "of
                           * course it can". */}
                          {s.kind === "file" && (
                            <Badge variant="secondary" className="text-badge">
                              {t("One file")}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-badge">
                            {s.shelf === "team" ? t("The team can read it") : t("Just you")}
                          </Badge>
                          {/* AND WHOSE MATERIAL IT IS. The second decision made
                           * at the moment of sharing, shown on the row for the
                           * same reason the first one is: six months later,
                           * "which client does the assistant think this is
                           * about?" is a question somebody has to be able to
                           * answer by looking. */}
                          <Badge variant="secondary" className="text-badge">
                            {s.accountName ? `Filed under ${s.accountName}` : t("Ours")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-6 gap-1 px-1.5 text-badge"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true)
                              try {
                                const r = await content.googleSetSourceActive(s.id, false)
                                primeCache(key, { ...(q.data as object), sources: r.sources } as typeof q.data)
                                toast.success(t("Stopped sharing that."))
                              } catch (err) {
                                toast.error(
                                  err instanceof ApiFailure ? err.message : t("Couldn't stop sharing that.")
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
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("Let the assistant read what you have shared")}</span>
            {/* THE SAME CONTROL THAT IS NOW ON EVERY GOOGLE SCREEN. It used to be
             * written out here and only here, which is exactly why nowhere else
             * had one — see components/google-sync.tsx. Both halves, because
             * this is the card where a person comes to sort Google out. */}
            <GoogleSyncButton teamId={teamId} scope="both" />
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
          teamId={teamId}
          accountOptions={(accountsQ.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
          onSubmit={async (values) => {
            const r = await content.googleAddSources({
              service: sharing,
              items: values.items,
              shelf: values.shelf,
              accountId: values.accountId,
            })
            await refresh()
            // The COUNT is in the sentence because a multi-select can quietly do
            // less than a person meant: something already shared is answered
            // with the row it already has rather than a second one, so "four
            // picked, two shared" is a real and unalarming outcome that they
            // should be able to see.
            toast.success(
              `${r.shared === 1 ? "Shared" : `${r.shared} shared`}, ${
                values.shelf === "team" ? "the team can read " : "only you can read "
              }${r.shared === 1 ? "it" : "them"}.`
            )
          }}
        />
      )}

      <AlertDialog open={disconnecting !== null} onOpenChange={(o) => !o && setDisconnecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {/* NOT "{service}?" ANY MORE. It always was every service — Google
                * keeps one approval per app — and the door now says so rather
                * than deactivating one row and leaving three claiming to work. */}
              {t("Disconnect your Google account?")}
            </AlertDialogTitle>
            {/* ONE description holding two sentences, and the second is not an
              * afterthought.
              *
              * THE SURPRISE, SAID BEFORE IT HAPPENS: the four services are four
              * consent screens and four rows here, but ONE app at Google — one
              * OAuth client holding one grant — so asking Google to drop this
              * connection can end the other three at the same time. Nothing in
              * this app can prevent that (it is Google's model, and it is also
              * exactly what makes a narrowed scope actually narrow), so the
              * honest thing is to say it at the moment somebody decides rather
              * than let them find three broken connections afterwards and think
              * something went wrong.
              *
              * ONE `AlertDialogDescription`, not two, and that is a correctness
              * point rather than a layout one: the primitive is Radix's, which
              * gives its description the dialog's own `aria-describedby` id, so a
              * second one renders a duplicate id and a screen reader is told two
              * different things are the description. The paragraph gets a second
              * line inside it instead. */}
            <AlertDialogDescription>
              {t("kwapso stops reading and writing there straight away, and anything you shared through it stops being shared. We'll ask Google to drop the connection too.")}
              <span className="mt-2 block">
                {t("Your Google connections are all one app at Google, so the others may need connecting again afterwards. The card will say which.")}
              </span>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1"
            >
              <Power className="size-3.5" aria-hidden /> {t("Disconnect")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
