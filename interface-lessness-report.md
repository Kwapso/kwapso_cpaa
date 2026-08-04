# Interface-lessness meter — brimba
Scope: WHOLE APP · 2026-08-04 · **96/100 (green)** · Every capability still reaches the machine surface through the same gated door; this round's changes preserved parity by construction.

## Scores
| Dimension | Score | Notes |
|---|---|---|
| Parity (same codebase) | 98 | 24 shared tools declared ONCE in `shared/workers/tool-catalog.ts`; each surface projects it. No MCP-only twin of any function. |
| Security equivalence | 97 | Every MCP call forwards the caller's cookie to the same door, which re-runs `requireRight`. This round ADDED a gating-seam suite to tenancy, content and data-ops (previously only mcp had one), so both surfaces are now machine-checked. |
| Coverage | 95 | Two documented intentional exclusions (below). |
| Robustness equivalence | 96 | The paged doors answer through one `pagedJson` seam, so an MCP caller gets the same `total`/`hasMore`/`nextCursor` contract the UI does — no second response shape. |
| Scale equivalence | 97 | R14 now binds both surfaces: `list_help_tickets` exposes + forwards `cursor` (enforced by `filter-parity.test.ts`), so a machine caller pages exactly as the screen does rather than silently seeing only the newest page. |
| Ergonomics | 94 | The catalog is generated from one source; tool descriptions state the paging contract ("never invent a cursor") and the dropdown call ORDER. |

## What changed this round
- **`list_help_tickets` became paged.** R19 caught the drift the moment the door gained `?cursor=` — the tool didn't expose it, and the build went red until it did. That is the parity law working unprompted.
- **All paged doors answer through `pagedJson`**, so the MCP response shape is the UI's shape.
- **Three gating-seam suites added** (tenancy, content, data-ops) — the security-equivalence claim is now enforced on the internal surface too, not only on mcp.

## Intentional exclusions (documented, not counted against the score)
- **Confirm-gated bulk writes** (`set_help_status_by_filter`, `bulk_*`) are agent-only — there is no MCP confirm panel. *(MCP.md, tool-catalog header.)*
- **The four privilege grants confirm on the agent but not on MCP** — the confirming UI belongs to the connecting client; the door, gate and audit row are identical. Newly documented this round in MCP.md and the tool-catalog header, with the recommendation that an MCP client driving an LLM over team data put a human in front of those four.

## Findings
None outstanding. No re-implemented function, no bespoke MCP-only route, no missing gate re-check.

## Ship line
No unresolved security-equivalence or divergence findings — safe to proceed.
