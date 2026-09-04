/* Dummy data for the parts data-preview-table … form. See ./index.ts for what a sample may
 * and may not do. Keys are the kit's folder names; each `render` draws the real
 * export with made-up content and spreads `p.of("<Export>")` onto every export
 * the properties panel offers options for. */
import { Badge } from "../../../shared/ui/components/badge/badge"
import { Button } from "../../../shared/ui/components/button/button"
import { DataPreviewTable } from "../../../shared/ui/components/data-preview-table/data-preview-table"
import { DataTable, type DataTableColumn } from "../../../shared/ui/components/data-table/data-table"
import { DatePicker } from "../../../shared/ui/components/date-picker/date-picker"
import { DescriptionList } from "../../../shared/ui/components/description-list/description-list"
import { DetailView } from "../../../shared/ui/components/detail-view/detail-view"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/components/dialog/dialog"
import { Donut } from "../../../shared/ui/components/donut/donut"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../shared/ui/components/dropdown-menu/dropdown-menu"
import { Field } from "../../../shared/ui/components/field/field"
import { FileUpload } from "../../../shared/ui/components/file-upload/file-upload"
import {
  CompactFacet,
  FacetLabel,
  FilterBar,
  RangeFacet,
  SearchableFacet,
} from "../../../shared/ui/components/filter-bar/filter-bar"
import { Flowchart, type FlowStep } from "../../../shared/ui/components/flowchart/flowchart"
import { Flowdetail, type FlowStepRecord } from "../../../shared/ui/components/flowdetail/flowdetail"
import { FolderPanel, FolderShape } from "../../../shared/ui/components/folder/folder"
import { Form, FormActions, FormSection } from "../../../shared/ui/components/form/form"
import { Input } from "../../../shared/ui/components/input/input"
import {
  ArrowSquareOut,
  Copy,
  DotsThree,
  PencilSimple,
  Plus,
  Power,
  Prohibit,
} from "../../../shared/ui/foundations/icons"
import type { Samples } from "./index"

const noop = () => {}

/* ---- tickets, for the two tables ---------------------------------------- */
type TicketRow = { id: string; title: string; account: string; assignee: string; status: string; hours: string }

const TICKETS: TicketRow[] = [
  { id: "t-1041", title: "Checkout page times out on Safari", account: "Acme Logistics", assignee: "Maya Okafor", status: "Open", hours: "6.5" },
  { id: "t-1042", title: "Move appointment reminders to SMS", account: "Harbour Dental", assignee: "Tom Lindqvist", status: "In progress", hours: "12.0" },
  { id: "t-1043", title: "Quarterly report export is missing totals", account: "Acme Logistics", assignee: "Priya Raman", status: "Waiting on client", hours: "2.0" },
  { id: "t-1044", title: "New staff onboarding form", account: "Harbour Dental", assignee: "Maya Okafor", status: "Open", hours: "0.5" },
  { id: "t-1045", title: "Rename the Deliveries module", account: "Northwind Foods", assignee: "Tom Lindqvist", status: "Done", hours: "3.5" },
]

const TICKET_COLUMNS: Array<DataTableColumn<TicketRow>> = [
  { key: "title", header: "Ticket", cell: (r) => r.title, sortable: true },
  { key: "account", header: "Account", cell: (r) => r.account, sortable: true },
  { key: "assignee", header: "Assignee", cell: (r) => r.assignee },
  { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "Done" ? "secondary" : "default"}>{r.status}</Badge> },
  { key: "hours", header: "Hours", cell: (r) => r.hours, align: "end", sortable: true },
]

/* ---- a fixed date, so the picker shows a value ---------------------------- */
const MEETING_DATE = new Date("2026-09-14T10:30:00")

/* ---- one process, drawn by flowchart and flowdetail ---------------------- */
const PROCESS_STEPS: FlowStep[] = [
  { type: "node", node: { id: "raise", label: "Ticket raised", role: "Client", kind: "manual", tone: "done" } },
  { type: "node", node: { id: "triage", label: "Triage", role: "Account manager", kind: "ai", tone: "done" } },
  { type: "decision", node: { id: "billable", label: "Billable?", role: "Account manager", kind: "manual", tone: "decision" } },
  {
    type: "branch",
    branches: [
      {
        node: { id: "log", label: "Log hours", role: "Developer", kind: "manual", condition: "Yes" },
        chain: [{ id: "invoice", label: "Add to invoice", role: "Finance", kind: "auto" }],
        continues: true,
      },
      {
        node: { id: "internal", label: "Mark internal", role: "Account manager", kind: "auto", condition: "No" },
        continues: true,
      },
    ],
  },
  { type: "node", node: { id: "close", label: "Close ticket", role: "Developer", kind: "manual" } },
]

const PROCESS_RECORDS: FlowStepRecord[] = [
  { id: "raise", label: "Ticket raised", actor: "Client contact", role: "Client", description: "A contact at the account writes the ticket in the portal.", tool: "Client portal", time: "5 min", cost: "—" },
  { id: "triage", label: "Triage", actor: "Assistant", role: "Account manager", description: "The assistant proposes a priority and an assignee; a person confirms.", tool: "Kwapso", time: "2 min", cost: "€4" },
  { id: "billable", label: "Billable?", actor: "Maya Okafor", role: "Account manager", description: "Is the work inside the retainer, or extra?", tool: "Kwapso", time: "1 min", cost: "€2" },
  { id: "log", label: "Log hours", actor: "Tom Lindqvist", role: "Developer", description: "Hours are logged against the ticket as the work happens.", tool: "Work log", time: "Ongoing", cost: "€95/h" },
  { id: "invoice", label: "Add to invoice", actor: "System", role: "Finance", description: "Logged hours land on the account's next invoice.", tool: "Invoicing", time: "Instant", cost: "—" },
  { id: "internal", label: "Mark internal", actor: "System", role: "Account manager", description: "The ticket is tagged as retainer work and nothing is charged.", tool: "Kwapso", time: "Instant", cost: "—" },
  { id: "close", label: "Close ticket", actor: "Tom Lindqvist", role: "Developer", description: "The developer closes the ticket and the client is told.", tool: "Kwapso", time: "2 min", cost: "€3" },
]

export const samples: Samples = {
  "data-preview-table": {
    render: (p) => (
      <DataPreviewTable
        label="Accounts to import"
        caption="accounts.csv · 5 of 42 rows"
        columns={[
          { key: "name", header: "Account name", source: "Company" },
          { key: "contact", header: "Main contact", source: "Contact person" },
          { key: "email", header: "Email", source: "E-mail address", unsure: true },
          { key: "plan", header: "Retainer", source: "Plan", align: "end" },
        ]}
        rows={[
          { id: "r1", origin: "row 2", outcome: "added", values: { name: "Acme Logistics", contact: "Sarah Whitfield", email: "sarah@acmelogistics.example", plan: "40 h" } },
          { id: "r2", origin: "row 3", outcome: "changed", values: { name: "Harbour Dental", contact: "Dr. Ines Marlow", email: "ines@harbourdental.example", plan: "20 h" } },
          { id: "r3", origin: "row 4", outcome: "invalid", values: { name: "Northwind Foods", contact: "Jonas Berg", email: "jonas.berg", plan: "10 h" }, issues: { email: "Not an email address" } },
          { id: "r4", origin: "row 5", outcome: "unchanged", values: { name: "Brightside Studio", contact: "Lena Fischer", email: "lena@brightside.example", plan: "10 h" } },
          { id: "r5", origin: "row 6", outcome: "skipped", values: { name: "Acme Logistics", contact: "Sarah Whitfield", email: "sarah@acmelogistics.example", plan: "40 h" }, issue: "Duplicate of row 2" },
        ]}
        onIncludedChange={noop}
        {...p.of("DataPreviewTable")}
      />
    ),
  },
  "data-table": {
    render: (p) => (
      <DataTable<TicketRow>
        label="Open tickets"
        caption="Tickets across every account, newest first"
        columns={TICKET_COLUMNS}
        rows={TICKETS}
        getRowId={(r) => r.id}
        defaultSortKey="title"
        page={1}
        pageCount={3}
        onPageChange={noop}
        onSelectionChange={noop}
        onRowSelect={noop}
        {...p.of("DataTable")}
      />
    ),
  },
  "date-picker": {
    render: (p) => (
      <DatePicker
        defaultValue={MEETING_DATE}
        locale="en-GB"
        weekStartsOn={1}
        placeholder="Pick a date"
        onValueChange={noop}
        {...p.of("DatePicker")}
      />
    ),
    note: "The month panel opens over the page when the field is pressed.",
  },
  "description-list": {
    render: (p) => (
      <DescriptionList
        items={[
          { id: "account", label: "Account", value: "Acme Logistics" },
          { id: "contact", label: "Main contact", value: "Sarah Whitfield" },
          { id: "manager", label: "Account manager", value: "Maya Okafor" },
          { id: "retainer", label: "Retainer", value: "40 hours a month" },
          { id: "since", label: "Client since", value: "March 2025" },
          { id: "notes", label: "Notes", value: "Prefers a call on Tuesdays. Invoices go to finance, not to Sarah.", full: true },
        ]}
        {...p.of("DescriptionList")}
      />
    ),
  },
  "detail-view": {
    render: (p) => (
      <DetailView
        initials="AL"
        title="Acme Logistics"
        subtitle="Logistics · Rotterdam"
        meta="Client since March 2025 · 14 open tickets"
        badges={<Badge>Active</Badge>}
        actions={
          <Button variant="secondary">
            <PencilSimple size={14} />
            Edit
          </Button>
        }
        items={[
          { id: "contact", label: "Main contact", value: "Sarah Whitfield" },
          { id: "manager", label: "Account manager", value: "Maya Okafor" },
          { id: "retainer", label: "Retainer", value: "40 hours a month" },
          { id: "used", label: "Used this month", value: "26.5 hours" },
        ]}
        sections={[
          {
            id: "people",
            title: "People",
            description: "Who is on this account, on both sides.",
            items: [
              { id: "client", label: "Client side", value: "Sarah Whitfield, Daniel Kroes" },
              { id: "ours", label: "Our side", value: "Maya Okafor, Tom Lindqvist" },
            ],
          },
          {
            id: "recent",
            title: "Recent work",
            content: "Checkout page fix shipped on Tuesday. Quarterly report export is waiting on the client.",
          },
          {
            id: "next",
            title: "Next meeting",
            content: "14 Sep 2026, 10:30 · Monthly review",
            aside: true,
          },
        ]}
        footer="Last changed by Maya Okafor, yesterday"
        {...p.of("DetailView")}
      />
    ),
  },
  dialog: {
    render: (p) => (
      <Dialog>
        <DialogTrigger asChild>
          <Button>
            <Power size={14} />
            Deactivate account
          </Button>
        </DialogTrigger>
        <DialogContent {...p.of("DialogContent")}>
          <DialogHeader>
            <DialogTitle>Deactivate Acme Logistics?</DialogTitle>
            <DialogDescription>
              The account, its contacts and its 14 open tickets stay on record but are hidden from every list. You can reactivate it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="cancel">Keep it</Button>
            </DialogClose>
            <Button variant="destructive">
              <Power size={14} />
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    note: "Opens over the page: the dialog portals to the outer document, so it is drawn on press rather than inline.",
  },
  donut: {
    render: (p) => (
      <Donut
        label="Share of hours"
        summary="312 hours this month: Build 131, Support 94, Meetings 56, Design 31."
        centerLabel="312h"
        data={[
          { id: "build", label: "Build", value: 131 },
          { id: "support", label: "Support", value: 94 },
          { id: "meetings", label: "Meetings", value: 56 },
          { id: "design", label: "Design", value: 31 },
        ]}
        {...p.of("Donut")}
      />
    ),
  },
  "dropdown-menu": {
    render: (p) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">
            <DotsThree size={14} />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Ticket 1041</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem icon={<PencilSimple />} {...p.of("DropdownMenuItem")}>
              Edit
              <DropdownMenuShortcut>E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Copy />} {...p.of("DropdownMenuItem")}>
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem icon={<ArrowSquareOut />} {...p.of("DropdownMenuItem")}>
              Open in portal
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked onCheckedChange={noop}>
            Watching
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assign to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Maya Okafor</DropdownMenuItem>
              <DropdownMenuItem>Tom Lindqvist</DropdownMenuItem>
              <DropdownMenuItem>Priya Raman</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger icon={<Prohibit />}>
            Close ticket
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    note: "Opens over the page: the menu portals to the outer document, so it is drawn on press rather than inline.",
  },
  field: {
    render: (p) => (
      <Field label="Account name" help="Shown on every invoice and in the client portal." {...p.of("Field")}>
        <Input defaultValue="Acme Logistics" />
      </Field>
    ),
  },
  "file-upload": {
    render: (p) => (
      <FileUpload
        prompt="Drop files here, or"
        browseLabel="choose a file"
        hint="PDF, PNG or CSV, up to 10 MB each"
        accept=".pdf,.png,.csv"
        files={[
          { id: "f1", name: "Acme-brief-September.pdf", size: 482_304, status: "done" },
          { id: "f2", name: "checkout-screenshot.png", size: 1_204_224, status: "uploading", progress: 62 },
          { id: "f3", name: "hours-export.csv", size: 18_432, status: "error", error: "The connection dropped" },
        ]}
        onFilesSelected={noop}
        onRemove={noop}
        onRetry={noop}
        {...p.of("FileUpload")}
      />
    ),
  },
  "filter-bar": {
    render: (p) => (
      <FilterBar
        label="Narrow the tickets"
        filters={[
          { id: "status", label: "Status: Open" },
          { id: "account", label: "Account: Acme Logistics" },
          { id: "assignee", label: "Assignee: Maya Okafor" },
        ]}
        onRemove={noop}
        onClear={noop}
        onAddFilter={noop}
        {...p.of("FilterBar")}
      >
        <FacetLabel>Narrow by</FacetLabel>
        <RangeFacet
          label="Hours logged"
          min={0}
          max={40}
          step={0.5}
          unit="h"
          defaultValue={{ min: 2, max: 16 }}
          onValueChange={noop}
          {...p.of("RangeFacet")}
        />
        <SearchableFacet
          label="Account"
          options={[
            { value: "acme", label: "Acme Logistics", count: 14 },
            { value: "harbour", label: "Harbour Dental", count: 6 },
            { value: "northwind", label: "Northwind Foods", count: 3 },
            { value: "brightside", label: "Brightside Studio", count: 1 },
          ]}
          defaultValue={["acme"]}
          onValueChange={noop}
          {...p.of("SearchableFacet")}
        />
        <CompactFacet
          label="Status"
          options={[
            { value: "open", label: "Open", count: 11 },
            { value: "progress", label: "In progress", count: 7 },
            { value: "waiting", label: "Waiting on client", count: 4 },
            { value: "done", label: "Done", count: 120 },
          ]}
          defaultValue="open"
          onValueChange={noop}
          {...p.of("CompactFacet")}
        />
      </FilterBar>
    ),
  },
  flowchart: {
    render: (p) => (
      <Flowchart
        label="Ticket to invoice"
        steps={PROCESS_STEPS}
        selectedId="billable"
        onSelect={noop}
        {...p.of("Flowchart")}
      />
    ),
  },
  flowdetail: {
    render: (p) => (
      <Flowdetail
        label="Ticket to invoice"
        steps={PROCESS_STEPS}
        records={PROCESS_RECORDS}
        defaultSelectedId="triage"
        onSelectStep={noop}
        {...p.of("Flowdetail")}
      />
    ),
  },
  folder: {
    render: (p) => (
      <>
        <FolderPanel header="Acme Logistics" {...p.of("FolderPanel")}>
          <DescriptionList
            items={[
              { id: "contact", label: "Main contact", value: "Sarah Whitfield" },
              { id: "manager", label: "Account manager", value: "Maya Okafor" },
              { id: "retainer", label: "Retainer", value: "40 hours a month" },
            ]}
          />
        </FolderPanel>
        <div style={{ width: "20rem", height: "10rem" }}>
          <FolderShape {...p.of("FolderShape")} />
        </div>
      </>
    ),
    note: "FolderShape fills whatever box it is given (size-full) and measures it, so it sits in a plain sized div; FolderPanel sizes itself.",
  },
  form: {
    render: (p) => (
      <Form
        title="New account"
        description="The client's details as they should appear on invoices and in the portal."
        onSubmit={(e) => e.preventDefault()}
        hideActions
        {...p.of("Form")}
      >
        <FormSection title="Account" description="Who the client is." {...p.of("FormSection")}>
          <Field label="Account name" required>
            <Input defaultValue="Acme Logistics" />
          </Field>
          <Field label="Industry">
            <Input defaultValue="Logistics" />
          </Field>
        </FormSection>
        <FormSection title="Main contact" description="The person we write to first." {...p.of("FormSection")}>
          <Field label="Name">
            <Input defaultValue="Sarah Whitfield" />
          </Field>
          <Field label="Email" help="Invoices and portal invitations go here.">
            <Input type="email" defaultValue="sarah@acmelogistics.example" />
          </Field>
        </FormSection>
        <FormActions meta="Last saved 14:05" {...p.of("FormActions")}>
          <Button type="button" variant="cancel">
            Cancel
          </Button>
          <Button type="submit">
            <Plus size={14} />
            Create account
          </Button>
        </FormActions>
      </Form>
    ),
    note: "Form's built-in save bar is hidden so a standalone FormActions can carry its own options; switching hideActions off shows both.",
  },
}

