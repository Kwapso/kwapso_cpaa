# Interface-lessness — Brimba
Scope: whole-app (MCP ↔ internal API/UI) · 2026-08-04 · Overall **96/100 (Grade A)**

Both surfaces draw on the SAME gated code by construction: 24 CRUD endpoints are declared once in `shared/workers/tool-catalog.ts` and PROJECTED to each surface (`toAgentTool` / `toMcpTool`) → the same worker doors. No MCP-only twins. This round added the `?id=` filter to the SHARED descriptor (both surfaces gained it, R19) and gave the mcp worker its own gating-seam suite.

## Scores
| Dimension | Score | Status |
|---|---|---|
| Parity (same codebase) | 98 | green |
| Security equivalence | 97 | green |
| Coverage | 94 | green |
| Robustness equivalence | 96 | green |
| Scale equivalence | 95 | green |
| Ergonomics (ease) | 96 | green |

## Findings
No divergences, no security-equivalence gaps, no unbounded-read gaps. Clean to ship.

### Intentional exclusions (documented — not counted against the score)
- `bulk_set_help_status`, `bulk_set_learning_active`, `set_help_status_by_filter` — confirm-gated mass MUTATIONS; a headless MCP client has no confirm panel, so it composes the single-record writes (each gated + audited identically). Documented in MCP.md + the tool-catalog header. `[intentional exclusion]`
- `whoami`, `agent_chat`, `agent_confirm`, the import-batch tools — MCP-surface-only tools with no UI equivalent to diverge from.

## Ship line
No unresolved security-equivalence or divergence findings — proceed.
