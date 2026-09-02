// The row mapping this dialog hands to the library ActivityFeed had two silent
// bugs: no `initials` (every mark rendered a blank circle) and `timestamp:`
// instead of the feed's actual field, `time:` — a plain object literal assigned
// to a typed const doesn't get TypeScript's excess/wrong-property check, so
// `npx tsc --noEmit -p web` stayed green while every row showed no time-ago
// text. This drives the real dialog rather than reading the mapping function,
// so it proves what the feed actually RECEIVES, not what the source intends.

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AgentUsageDialog } from "@/components/agent-usage-dialog"
import { formatActivityWhen } from "@shared/web/format"

const CREATED_AT = "2026-08-09T10:00:00Z"

vi.mock("@/lib/api", () => ({
  dataOps: {
    agentUsageLog: async () => ({
      rows: [
        {
          id: "row-1",
          createdAt: CREATED_AT,
          actorName: "Sam Rivera",
          credits: 2,
          source: "chat",
          summary: "Answered a question about invoices",
          kind: "action",
        },
      ],
    }),
  },
}))

afterEach(cleanup)

describe("AgentUsageDialog", () => {
  it("gives each row its mark's initials and a rendered time, not a blank circle or nothing", async () => {
    render(<AgentUsageDialog open onOpenChange={() => {}} summary="5 free credits left today" />)

    await waitFor(() => expect(screen.getByText(/Answered a question about invoices/)).toBeTruthy())

    // The mark: two-letter initials split from the actor-name snapshot.
    expect(screen.getByText("SR")).toBeTruthy()
    // The same formatter the row mapping calls — asserted through the SAME
    // function rather than a hardcoded string, so this doesn't drift with the
    // machine's timezone the way the source itself doesn't.
    expect(screen.getByText(formatActivityWhen(CREATED_AT))).toBeTruthy()
  })
})
