"use client"

// Personal access tokens (Settings) — the human side of the MCP front desk.
// Create a token (pinned to your CURRENT team; the secret is shown ONCE — copy
// it then), see when each was last used, and revoke any. Machines send the
// token as `Authorization: Bearer …` to the /mcp endpoint and act AS you, in
// that team only, capped by your live role.

import * as React from "react"

import { Badge } from "@kwapso/ui/registry/primitives/badge/badge"
import { Button } from "@kwapso/ui/registry/primitives/button/button"
import { Input } from "@kwapso/ui/registry/primitives/input/input"
import { Field } from "@kwapso/ui/registry/primitives/field/field"
import { defaultFieldConfig } from "@kwapso/ui/lib/config"
import { Skeleton } from "@kwapso/ui/registry/primitives/skeleton/skeleton"
import { Spinner } from "@kwapso/ui/registry/primitives/spinner/spinner"
import { toast } from "@kwapso/ui/registry/primitives/sonner/sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@kwapso/ui/registry/primitives/dialog/dialog"
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
import { Ban, ClipboardCopy, Copy, Plus } from "lucide-react"

import type { McpTokenSummary } from "@shared/types"
import { MCP_TOKEN_TTL_DAYS } from "@shared/workers/limits"
import { FormShell, fieldSpacing } from "@shared/web/form-shell"
import { ApiFailure, mcp } from "@/lib/api"
import { formatActivityWhen, formatDate } from "@shared/web/format"
import { useCached, primeCache } from "@shared/web/store"

/** Past its deadline (or missing one — the server treats that as expired too).
 * A token that has run out is not "active": it stops working the same way a
 * revoked one does, so the screen must not keep calling it live. */
function hasExpired(t: McpTokenSummary): boolean {
  return !t.expiresAt || t.expiresAt <= new Date().toISOString()
}

// A ready-to-paste connect prompt for ANY AI (Claude, Gemini, GPT, …) — endpoint,
// the Bearer header, and a Claude-Desktop-style stdio config. Built from the LIVE
// app host so it's correct for staging or production without a hardcoded URL. When
// we hold the real secret (right after create) we embed it; otherwise we leave the
// `kwapso_mcp_YOUR_TOKEN` placeholder for the developer to swap in.
function connectPrompt(token: string): string {
  const origin = typeof window === "undefined" ? "https://kwapso.<workers-subdomain>.workers.dev" : window.location.origin
  const endpoint = `${origin}/mcp`
  return `Connect to my kwapso workspace over MCP (Model Context Protocol).

Endpoint: ${endpoint}
Auth header: Authorization: Bearer ${token}
Protocol: MCP over HTTP — JSON-RPC 2.0 (initialize, tools/list, tools/call)

If your tool runs MCP servers locally over stdio (e.g. Claude Desktop), add this to its config:
{
  "mcpServers": {
    "kwapso": {
      "command": "npx",
      "args": ["mcp-remote", "${endpoint}", "--header", "Authorization: Bearer ${token}"]
    }
  }
}

Then call tools/list to see what I can do. You act as me, in one team, capped by my role —
reads, exports and imports are free; only the assistant tools (agent_chat, agent_confirm,
plan_import) use the team's AI quota.`
}

function copyInstructions(token: string) {
  void navigator.clipboard?.writeText(connectPrompt(token)).then(
    () => toast.success("Setup instructions copied — paste into any AI."),
    () => toast.error("Couldn't copy — try again.")
  )
}

export function AccessTokensSection({ teamName }: { teamName: string | null }) {
  const tokensQ = useCached<McpTokenSummary[]>("mcp-tokens", () =>
    mcp.tokens().then((r) => r.tokens)
  )
  const tokens = tokensQ.data ?? []

  const [createOpen, setCreateOpen] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // The show-once secret, displayed right after a create (until dismissed).
  const [secret, setSecret] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState<McpTokenSummary | null>(null)

  async function create() {
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      const r = await mcp.createToken(label.trim())
      setSecret(r.secret)
      setLabel("")
      primeCache("mcp-tokens", await mcp.tokens().then((x) => x.tokens))
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't create the token.")
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!revoking || busy) return
    setBusy(true)
    try {
      await mcp.revokeToken(revoking.id)
      primeCache("mcp-tokens", await mcp.tokens().then((x) => x.tokens))
      toast.success("Token revoked.")
      setRevoking(null)
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.message : "Couldn't revoke the token.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="animate-rise flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Access tokens
        </h2>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-3.5" aria-hidden /> New token
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Let an outside tool (an AI agent, a script, an automation) work in your team as you —
        capped by your role, in the team the token was made for.
      </p>

      {tokensQ.error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load your tokens.</p>
      ) : tokensQ.data === undefined ? (
        <Skeleton variant="list" lines={2} />
      ) : tokens.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tokens yet.</p>
      ) : (
        <div className="flex flex-col rounded-xl border">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b p-3 text-sm last:border-0"
            >
              <span className="font-medium">{t.label}</span>
              {t.revokedAt ? (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  Revoked
                </Badge>
              ) : hasExpired(t) ? (
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  Expired
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Active
                </Badge>
              )}
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                Created {formatActivityWhen(t.createdAt)}
                {t.lastUsedAt ? ` · last used ${formatActivityWhen(t.lastUsedAt)}` : " · never used"}
                {t.revokedAt
                  ? ""
                  : hasExpired(t)
                    ? ` · expired ${formatDate(t.expiresAt)}`
                    : ` · works until ${formatDate(t.expiresAt)}`}
              </span>
              {!t.revokedAt && (
                <div className="flex items-center gap-2">
                  {/* Copy the connect prompt for any AI. The secret can't be re-read,
                   * so this carries the `kwapso_mcp_YOUR_TOKEN` placeholder to swap.
                   * Label collapses to icon-only below sm (narrow-screen rule).
                   * Nothing to set up with an expired token — make a new one. */}
                  {!hasExpired(t) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInstructions("kwapso_mcp_YOUR_TOKEN")}
                      className="gap-1.5"
                      title="Copy setup instructions for any AI"
                    >
                      <ClipboardCopy className="size-3.5" aria-hidden />
                      <span className="hidden sm:inline">Instructions</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevoking(t)}
                    className="text-destructive hover:text-destructive gap-1.5"
                  >
                    <Ban className="size-3.5" aria-hidden />
                    <span className="hidden sm:inline">Revoke</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create — FormShell (Law R4). After creating, the same dialog shows the
       * secret ONCE with a copy button; it is never retrievable again. */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (busy) return
          setCreateOpen(o)
          if (!o) setSecret(null)
        }}
      >
        <DialogContent>
          {secret ? (
            <div className="flex flex-col gap-4">
              <DialogTitle>Copy your token now</DialogTitle>
              <DialogDescription>
                This is the only time it&apos;s shown. Anyone holding it can act as you in{" "}
                {teamName ?? "this team"} — treat it like a password. It works for{" "}
                {MCP_TOKEN_TTL_DAYS} days, then you make a new one.
              </DialogDescription>
              <div className="bg-muted/60 flex items-center gap-2 rounded-lg border p-3">
                <code className="min-w-0 flex-1 break-all text-xs">{secret}</code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    void navigator.clipboard?.writeText(secret).then(
                      () => toast.success("Copied."),
                      () => toast.error("Couldn't copy — select it by hand.")
                    )
                  }}
                >
                  <Copy className="size-3.5" aria-hidden /> Copy
                </Button>
              </div>
              {/* One-tap: the whole connect prompt WITH this token embedded, ready to
               * paste into Claude, Gemini, GPT — the fastest way to hand it off. */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 self-start"
                onClick={() => copyInstructions(secret)}
              >
                <ClipboardCopy className="size-3.5" aria-hidden /> Copy setup prompt for any AI
              </Button>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => {
                    setSecret(null)
                    setCreateOpen(false)
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <FormShell
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
              title={<DialogTitle>New access token</DialogTitle>}
              subtitle={
                <DialogDescription>
                  Pinned to {teamName ?? "your current team"}. It can do exactly what you can do
                  there — nothing more — and it stops working after {MCP_TOKEN_TTL_DAYS} days.
                </DialogDescription>
              }
              footer={
                <Button type="submit" disabled={busy || !label.trim()}>
                  {busy ? <Spinner /> : null}
                  {busy ? "Creating…" : "Create token"}
                </Button>
              }
            >
              <Field
                config={{ ...defaultFieldConfig, label: "Name", required: true }}
                htmlFor="token-label"
                className={fieldSpacing}
              >
                <Input
                  id="token-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="CI importer"
                  disabled={busy}
                  autoFocus
                />
              </Field>
            </FormShell>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke — destructive, so confirm. */}
      <AlertDialog open={!!revoking} onOpenChange={(o) => !busy && !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this token stops working immediately. This can&apos;t be undone — you
              can always create a new token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void revoke()
              }}
              disabled={busy}
            >
              {busy ? <Spinner /> : null}
              {busy ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
