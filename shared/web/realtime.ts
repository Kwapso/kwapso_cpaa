"use client"

// The live channel client. A browser opens up to TWO sockets to the realtime
// switchboard, each calling `onEvent` for every "X changed" ping:
//   • the active TEAM's channel  (useRealtime(teamId)) — team data
//   • your OWN user channel       (useUserRealtime(userId)) — identity data +
//     a forced sign-out, open even before you join a team
// Reconnects with backoff; closes on unmount or when the id changes. The cookie
// rides the handshake, so the server gates it the same way the API does. Pass a
// null id to stay disconnected. `onReconnect` fires after a DROPPED link is
// re-established (not the first connect) so the host can resync what it missed.

import * as React from "react"

export type RealtimeEvent = { resource: string; id?: string; op?: string }

/** Open one live socket to `path` (e.g. "team=<id>" / "user=<id>"), reconnecting
 * with backoff. `onReconnect` is called only on a RE-connect after a drop. */
function useLiveChannel(
  query: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): void {
  const handlerRef = React.useRef(onEvent)
  handlerRef.current = onEvent
  const reconnectRef = React.useRef(onReconnect)
  reconnectRef.current = onReconnect

  React.useEffect(() => {
    if (!query || typeof window === "undefined") return

    let socket: WebSocket | null = null
    let retry = 0
    let everConnected = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime?${query}`

    const connect = () => {
      if (closed) return
      socket = new WebSocket(url)
      socket.onopen = () => {
        // A successful OPEN after a prior connection = we just recovered a
        // dropped link → let the host resync the rows it's showing.
        if (everConnected) reconnectRef.current?.()
        everConnected = true
        retry = 0
      }
      socket.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data as string) as RealtimeEvent)
        } catch {
          // ignore a malformed frame
        }
      }
      socket.onclose = () => {
        if (closed) return
        // Backoff: 1s, 2s, 4s … capped at 15s, until we reconnect.
        const delay = Math.min(15000, 1000 * 2 ** retry)
        retry++
        timer = setTimeout(connect, delay)
      }
      socket.onerror = () => socket?.close()
    }
    connect()

    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      socket?.close()
    }
  }, [query])
}

/** Subscribe to the ACTIVE team's channel (team-scoped data).
 *
 * `fenceId` is WHERE THE CALLER IS STANDING, and it is part of the socket's
 * identity rather than a piece of data sent over it. The server resolves the
 * listener's account fence ONCE, at the handshake, and serializes it onto the
 * socket (workers/realtime — the stamp survives hibernation so no ping costs a
 * database read). A stamp taken once is only correct while the fence is the same
 * fence: when a client login switches company, `teamId` does not move, so the
 * socket was never re-opened and kept filtering the NEW company's pings against
 * the OLD company's account set. The portal went quietly deaf — the worst failure
 * shape there is, because nothing is broken on screen, the data is simply stale.
 *
 * So the fence rides the URL, and a fence that moves is a different socket: the
 * effect below keys on the whole query string, so changing it closes the old
 * connection and opens one that gets re-stamped from the caller's session.
 *
 * IT IS A CACHE KEY, NEVER A CLAIM. The realtime worker does not read this
 * parameter and must never start: the fence it stamps comes from the caller's own
 * session, so a client who edits the value in the URL re-opens a socket and is
 * handed exactly the same fence back. */
export function useRealtime(
  teamId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void,
  fenceId?: string | null
): void {
  useLiveChannel(teamChannelQuery(teamId, fenceId), onEvent, onReconnect)
}

/** The team channel's URL query: which team, plus where the caller is standing
 * when that is a thing about them. Pulled out of the hook so the rule it encodes
 * — a fence that MOVES is a different socket — can be asserted directly instead
 * of inferred from a rendered component. */
export function teamChannelQuery(teamId: string | null, fenceId?: string | null): string | null {
  if (!teamId) return null
  return `team=${encodeURIComponent(teamId)}${fenceId ? `&fence=${encodeURIComponent(fenceId)}` : ""}`
}

/** Subscribe to YOUR OWN identity channel (account events + sign-out), open for
 * every signed-in user, including teamless ones. */
export function useUserRealtime(
  userId: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void
): void {
  useLiveChannel(userId ? `user=${encodeURIComponent(userId)}` : null, onEvent, onReconnect)
}
