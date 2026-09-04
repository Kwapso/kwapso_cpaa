/* Dummy data for the parts notes … run-steps. See ./index.ts for what a sample may
 * and may not do. Keys are the kit's folder names; each `render` draws the real
 * export with made-up content and spreads `p.of("<Export>")` onto every export
 * the properties panel offers options for. */
import { Avatar, AvatarFallback } from "../../../shared/ui/components/avatar/avatar"
import { Button } from "../../../shared/ui/components/button/button"
import { Label } from "../../../shared/ui/components/label/label"
import { Notes } from "../../../shared/ui/components/notes/notes"
import { Notifications } from "../../../shared/ui/components/notifications/notifications"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../../shared/ui/components/pagination/pagination"
import { PermissionMatrix } from "../../../shared/ui/components/permission-matrix/permission-matrix"
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/components/popover/popover"
import {
  PortalApprovalBand,
  PortalConversation,
} from "../../../shared/ui/components/portal-conversation/portal-conversation"
import { Progress } from "../../../shared/ui/components/progress/progress"
import { ProgressDashboard } from "../../../shared/ui/components/progress-dashboard/progress-dashboard"
import { ProgressToggle } from "../../../shared/ui/components/progress-toggle/progress-toggle"
import { PulseBand } from "../../../shared/ui/components/pulse-band/pulse-band"
import { Queue } from "../../../shared/ui/components/queue/queue"
import { Radar } from "../../../shared/ui/components/radar/radar"
import { RadioGroup, RadioGroupItem } from "../../../shared/ui/components/radio-group/radio-group"
import { Rating } from "../../../shared/ui/components/rating/rating"
import { RecordDetail } from "../../../shared/ui/components/record-detail/record-detail"
import { Rings } from "../../../shared/ui/components/rings/rings"
import { RunSteps } from "../../../shared/ui/components/run-steps/run-steps"
import { Check, PencilSimple, Power, Prohibit } from "../../../shared/ui/foundations/icons"
import type { Samples } from "./index"

const noop = () => {}

export const samples: Samples = {
  notes: {
    render: (p) => (
      <Notes
        items={[
          {
            id: "note-1",
            author: "Maya Okafor",
            timestamp: "Tue 14:12",
            body: "Spoke to Priya at Acme Logistics. They want the depot report before the board meeting on the 18th.",
          },
          {
            id: "note-2",
            author: "Tom Lindqvist",
            timestamp: "Tue 16:40",
            body: "Staging build is up. Two of the three fixes are in; the label-printer one needs their IT to open a port.",
            highlight: true,
          },
          {
            id: "note-3",
            author: "Sara Benali",
            timestamp: "Wed 09:05",
            body: "Reminder: Harbour Dental's contract renews on 1 October. Draft the renewal note by Friday.",
          },
        ]}
        {...p.of("Notes")}
      />
    ),
  },
  notifications: {
    render: (p) => (
      <Notifications
        items={[
          {
            id: "n-1",
            group: "Today",
            time: "10:09",
            dateTime: "2026-09-04T10:09:00Z",
            initials: "PR",
            actor: "Priya Raman",
            sentence: "Priya Raman replied on TKT-4182 — “no rush on the re-run”",
            meta: "Client thread",
            unread: true,
          },
          {
            id: "n-2",
            group: "Today",
            time: "09:40",
            dateTime: "2026-09-04T09:40:00Z",
            initials: "MO",
            actor: "Maya Okafor",
            sentence: "Maya Okafor assigned TKT-4176 to you",
            meta: "Assigned",
            unread: true,
          },
          {
            id: "n-3",
            group: "Today",
            time: "08:12",
            dateTime: "2026-09-04T08:12:00Z",
            initials: "k",
            actor: "The system",
            shape: "square",
            sentence: "The system moved TKT-4171 to Blocked — waiting on Harbour Dental",
            meta: "Blocked",
            unread: true,
          },
          {
            id: "n-4",
            group: "Yesterday",
            time: "17:20",
            dateTime: "2026-09-03T17:20:00Z",
            initials: "TL",
            actor: "Tom Lindqvist",
            sentence: "Tom Lindqvist mentioned you in sprint 34",
            unread: true,
          },
          {
            id: "n-5",
            group: "Yesterday",
            time: "14:02",
            dateTime: "2026-09-03T14:02:00Z",
            initials: "SB",
            actor: "Sara Benali",
            sentence: "Sara Benali closed TKT-4160",
          },
        ]}
        onOpen={noop}
        onMarkAllRead={noop}
        onOpenAll={noop}
        {...p.of("Notifications")}
      />
    ),
  },
  pagination: {
    render: (p) => (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive {...p.of("PaginationLink")}>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">12</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  },
  "permission-matrix": {
    render: (p) => (
      <PermissionMatrix
        modules={[
          {
            id: "tickets",
            label: "Tickets",
            description: "What a client raises and what we answer",
            held: {
              admin: ["see", "create", "edit", "delete"],
              member: ["see", "create", "edit"],
              client: ["see", "create"],
            },
          },
          {
            id: "tasks",
            label: "Tasks",
            description: "The work behind a ticket",
            held: {
              admin: ["see", "create", "edit", "delete"],
              member: ["see", "create", "edit"],
            },
          },
          {
            id: "stories",
            label: "Stories",
            description: "Sprint-sized pieces of work",
            held: {
              admin: ["see", "create", "edit", "delete"],
              member: ["see", "edit"],
              client: ["see"],
            },
          },
          {
            id: "accounts",
            label: "Accounts",
            description: "Clients and the people at them",
            held: {
              admin: ["see", "create", "edit", "delete"],
              member: ["see"],
            },
            locked: ["client"],
          },
          {
            id: "rates",
            label: "Rate cards",
            description: "What an hour costs and what it is charged at",
            held: { admin: ["see", "edit"] },
            locked: true,
          },
        ]}
        roles={[
          { id: "admin", label: "Admin" },
          { id: "member", label: "Member" },
          { id: "client", label: "Client" },
        ]}
        onChange={noop}
        footnote="A Client role is what a portal login holds; it never reaches the agency's own material."
        {...p.of("PermissionMatrix")}
      />
    ),
  },
  popover: {
    render: () => (
      <Popover open modal={false}>
        <PopoverTrigger asChild>
          <Button variant="secondary">
            <Power />
            Deactivate account
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          Harbour Dental will lose portal access and its three open tickets stay where they are. You can
          reactivate it later.
          <Button variant="destructive">Deactivate</Button>
          <Button variant="cancel">Keep</Button>
        </PopoverContent>
      </Popover>
    ),
    note: "Rendered open (`open` + `modal={false}`); the panel is anchored to its trigger and floats over the page.",
  },
  "portal-conversation": {
    render: (p) => (
      <>
        <PortalApprovalBand
          title="Sprint 34 deliverables, ready for your review"
          onApprove={noop}
          onComment={noop}
          {...p.of("PortalApprovalBand")}
        />
        <PortalConversation
          messages={[
            {
              id: "m-1",
              side: "theirs",
              author: "Maya Okafor",
              authorMeta: "kwapso",
              initials: "MO",
              body: "Hi Priya — the depot report is on staging. Could you check the totals on page two before we send it to your board?",
              time: "Tue 14:12",
              daySeparator: "Tuesday 2 September",
            },
            {
              id: "m-2",
              side: "mine",
              author: "Priya Raman",
              authorMeta: "Acme Logistics",
              initials: "PR",
              body: "Looks right to me. One thing: the Leeds depot should say 14 vehicles, not 12.",
              time: "Tue 15:03",
              attachments: [{ id: "a-1", name: "leeds-fleet-list.xlsx", size: "42 KB", href: "#" }],
            },
            {
              id: "m-3",
              side: "theirs",
              author: "Maya Okafor",
              authorMeta: "kwapso",
              initials: "MO",
              body: "Fixed. Re-run finishes in about ten minutes and I'll post the final here.",
              time: "Tue 15:20",
              receipt: "Seen",
            },
          ]}
          approvalTitle="Sprint 34 deliverables, ready for your review"
          onApprove={noop}
          onComment={noop}
          onSend={noop}
          {...p.of("PortalConversation")}
        />
      </>
    ),
  },
  progress: {
    render: (p) => <Progress value={62} label="Sprint 34" {...p.of("Progress")} />,
  },
  "progress-dashboard": {
    render: (p) => (
      <ProgressDashboard
        title="Sprint 34 · Acme Logistics"
        rows={[
          { id: "stories", label: "Stories done", kind: "bar", value: 9, max: 14, display: "9 of 14" },
          { id: "hours", label: "Hours logged", kind: "bar", value: 71, max: 100, display: "71 h", tone: "info" },
          { id: "review", label: "Client review", kind: "segments", segments: 5, filled: 3, display: "3 / 5" },
          { id: "tickets", label: "Tickets closed", kind: "bar", value: 100, max: 100, display: "All 6", tone: "success" },
          { id: "deploy", label: "Deploying to staging", kind: "sweep", display: "Running" },
        ]}
        {...p.of("ProgressDashboard")}
      />
    ),
  },
  "progress-toggle": {
    render: (p) => (
      <ProgressToggle defaultValue={3} max={5} label="Handover steps" onValueChange={noop} {...p.of("ProgressToggle")} />
    ),
  },
  "pulse-band": {
    render: (p) => (
      <PulseBand
        title="Work logged · Acme Logistics"
        range="3 Aug – 30 Aug 2026"
        weeks={[
          { id: "w31", label: "W31", days: [2, 3, 1, 4, 2, 0, 0] },
          { id: "w32", label: "W32", days: [1, 2, 2, 3, 4, 1, 0] },
          { id: "w33", label: "W33", days: [3, 4, 4, 2, 1, 0, 0] },
          { id: "w34", label: "W34", days: [2, 2, 3, 3, 2, 0, 1] },
        ]}
        {...p.of("PulseBand")}
      />
    ),
  },
  queue: {
    render: (p) => (
      <Queue
        position={3}
        total={12}
        eyebrow="TKT-4182 · raised 2 days ago by Priya Raman"
        title="Label printer at the Leeds depot drops every third job"
        body="Since Monday the Zebra printer on bay 4 skips a label roughly every third print. The drivers are re-printing by hand and the morning run is leaving late."
        decisions={
          <>
            <Button>
              <Check />
              Take it
            </Button>
            <Button variant="secondary">
              <PencilSimple />
              Ask for more
            </Button>
            <Button variant="destructive">
              <Prohibit />
              Decline
            </Button>
          </>
        }
        onSkip={noop}
        upcoming={[
          { id: "q-4", label: "TKT-4185 · Appointment reminders going out twice — Harbour Dental" },
          { id: "q-5", label: "TKT-4186 · Export to the accountant misses the August invoices — Acme Logistics" },
          { id: "q-6", label: "TKT-4188 · New driver cannot sign in on the tablet — Acme Logistics" },
        ]}
        {...p.of("Queue")}
      />
    ),
  },
  radar: {
    render: (p) => (
      <Radar
        data={[
          { axis: "Front end", maya: 5, tom: 3 },
          { axis: "Workers", maya: 3, tom: 5 },
          { axis: "Data", maya: 2, tom: 4 },
          { axis: "Design", maya: 4, tom: 2 },
          { axis: "Client care", maya: 5, tom: 3 },
          { axis: "Testing", maya: 3, tom: 4 },
        ]}
        series={[
          { key: "maya", label: "Maya Okafor", fillOpacity: 0.2 },
          { key: "tom", label: "Tom Lindqvist", fillOpacity: 0.2 },
        ]}
        summary="Maya covers front end and client care; Tom covers workers and data. Both are mid-range on testing."
        {...p.of("Radar")}
      />
    ),
  },
  "radio-group": {
    render: () => (
      <RadioGroup defaultValue="bug" aria-label="Kind of ticket">
        <Label>
          <RadioGroupItem value="bug" />
          Something is broken
        </Label>
        <Label>
          <RadioGroupItem value="change" />
          Something should change
        </Label>
        <Label>
          <RadioGroupItem value="question" />
          A question
        </Label>
      </RadioGroup>
    ),
  },
  rating: {
    render: (p) => (
      <Rating defaultValue={4} label="How did the handover go?" onValueChange={noop} {...p.of("Rating")} />
    ),
  },
  "record-detail": {
    render: (p) => (
      <RecordDetail
        eyebrow="Ticket"
        title="Label printer at the Leeds depot drops every third job"
        meta="TKT-4182 · Acme Logistics"
        mark={
          <Avatar>
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
        }
        actions={
          <>
            <Button variant="secondary">
              <PencilSimple />
              Edit
            </Button>
            <Button>
              <Check />
              Resolve
            </Button>
          </>
        }
        stages={[
          { id: "new", label: "New", state: "done" },
          { id: "triage", label: "Triaged", state: "done" },
          { id: "work", label: "In progress", state: "current" },
          { id: "review", label: "Client review", state: "later" },
          { id: "closed", label: "Closed", state: "later" },
        ]}
        currentStage={2}
        onStageSelect={noop}
        tabs={[
          {
            value: "overview",
            label: "Overview",
            content:
              "Since Monday the Zebra printer on bay 4 skips a label roughly every third print. Tom has reproduced it on staging; the fix needs Acme's IT to open a port on the depot firewall.",
          },
          { value: "tasks", label: "Tasks", count: 3, content: "Three tasks, two done." },
          { value: "activity", label: "Activity", count: 7, content: "Seven entries this week." },
        ]}
        defaultTab="overview"
        onTabChange={noop}
        audit={[
          { id: "raised", label: "Raised", children: "2 Sep 2026 · Priya Raman" },
          { id: "owner", label: "Owner", children: "Tom Lindqvist" },
          { id: "changed", label: "Last change", children: "4 Sep 2026 · Maya Okafor" },
        ]}
        activity={[
          {
            id: "act-1",
            time: "10:09",
            dateTime: "2026-09-04T10:09:00Z",
            initials: "PR",
            actor: "Priya Raman",
            description: "Priya Raman replied — “no rush on the re-run”",
            meta: "Client thread",
          },
          {
            id: "act-2",
            time: "09:40",
            dateTime: "2026-09-04T09:40:00Z",
            initials: "MO",
            actor: "Maya Okafor",
            description: "Maya Okafor assigned this to Tom Lindqvist",
          },
          {
            id: "act-3",
            time: "Tue 16:40",
            dateTime: "2026-09-02T16:40:00Z",
            initials: "k",
            actor: "The system",
            shape: "square",
            description: "Moved to In progress",
            variant: "quiet",
          },
        ]}
        onAddNote={noop}
        {...p.of("RecordDetail")}
      />
    ),
  },
  rings: {
    render: (p) => <Rings percent={62} value="62%" label="Sprint 34 done" {...p.of("Rings")} />,
  },
  "run-steps": {
    render: (p) => (
      <RunSteps
        steps={[
          { id: "read", label: "Read the file", description: "acme-drivers.csv · 214 rows", state: "done", meta: "1 s" },
          { id: "map", label: "Match the columns", description: "9 of 9 columns matched", state: "done", meta: "3 s" },
          { id: "accounts", label: "Resolve accounts", description: "Every row points at Acme Logistics", state: "done", meta: "2 s" },
          { id: "write", label: "Write the rows", description: "Through the gated import door", state: "running", meta: "126 of 214" },
          { id: "publish", label: "Publish the change", description: "Every screen showing drivers updates", state: "pending" },
        ]}
        onStepSelect={noop}
        {...p.of("RunSteps")}
      />
    ),
  },
}
