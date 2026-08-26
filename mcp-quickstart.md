# Connect to Kwapso over MCP, quickstart

Hand this one file to a developer. It's the short version of [MCP.md](MCP.md).

A machine (an AI agent, a script, an automation) can do the same things you can do in
Kwapso, over the **Model Context Protocol (MCP)**. It acts **as you, in one team,
capped by your role**. Never more. There's no separate "API key with god powers."

---

## 1 · Get in

1. **Sign in** to the app (email + a 6-digit code, no passwords):
   - Production: `https://agency.kwapso.app`
   - Staging: `https://agency-staging.kwapso.app`
   (If you're not on the team yet, ask the owner to invite you.)
2. **Settings → Access tokens → New token.** Name it, then **copy the secret now**,
   it's shown once and looks like `kwapso_mcp_…`. Treat it like a password.

## 2 · The endpoint

`POST https://agency.kwapso.app/mcp`. JSON-RPC 2.0, authenticated with
`Authorization: Bearer <your token>`. (Staging: same path on the staging host.)

## 3 · Connect

**Any HTTP MCP client** (agent framework, custom client): point it at that URL with the
`Authorization: Bearer …` header.

**Claude Desktop** (or any stdio-only client). Add this to its MCP config:

```json
{
  "mcpServers": {
    "kwapso": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://agency.kwapso.app/mcp",
        "--header", "Authorization: Bearer kwapso_mcp_YOUR_TOKEN"
      ]
    }
  }
}
```

**Any AI (Claude / Gemini / GPT)**. Paste this prompt (the app's "Copy setup prompt for
any AI" button gives you this with your host + token already filled in):

```
Connect to my Kwapso workspace over MCP (Model Context Protocol).

Endpoint: https://agency.kwapso.app/mcp
Auth header: Authorization: Bearer kwapso_mcp_YOUR_TOKEN
Protocol: MCP over HTTP — JSON-RPC 2.0 (initialize, tools/list, tools/call)

Then call tools/list to see what I can do. You act as me, in one team, capped by my
role — reads, exports and imports are free; only the assistant tools (agent_chat,
agent_confirm, plan_import), and ask_knowledge when you set compose, use the team's
AI quota.
```

**Test with curl:**

```bash
curl -s https://agency.kwapso.app/mcp \
  -H "Authorization: Bearer kwapso_mcp_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 4 · What it costs

Reads, CSV exports, and import **writes** are free, just endpoint calls. Only the
assistant tools use the **team's AI quota** — `agent_chat`, `agent_confirm`, the
`plan_import` step (the one part of a multi-file import that thinks: it asks the
assistant to plan the batch, so it spends a unit; confirming and writing the rows
is free) — and `ask_knowledge` when you set `compose`, which asks the app to write
the answer for you. All of it only if your role has the AI-agent right. A role
without it can't spend any AI budget, reads/exports still work, and
`ask_knowledge` without `compose` stays free.

## 5 · Good to know

- **Revoke any time** from the same screen, it stops the next call instantly.
- **One team only.** The token is pinned to the team you made it in.
- **Your live role is the cap.** Change the role and the token's power changes with it,
  you never touch the token.

Full detail (tool list, security posture, cost table): [MCP.md](MCP.md).
