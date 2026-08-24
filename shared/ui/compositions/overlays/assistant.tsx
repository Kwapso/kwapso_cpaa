"use client";

/* ============================================================================
   Assistant — launcher, panel, streaming reply, typed result blocks, and the
   confirmation panel that lists proposed actions before any of them run.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 19 ("The floating layer"), 27.10 (chat) and
   27.44 (the approval that owns the window).

     ch19, the whole law of the layer, verbatim:
       "Exactly two things may sit over the work: the assistant and a running
        timer. Neither dims the page, neither traps focus, and neither closes
        because you clicked something else — you can type in a table while the
        assistant is open and stop the clock without leaving the record."

     ch19, again: "No scrim, no blur, no page shift, no focus trap. If a panel
       needs the page disabled it is a dialog, not a floating thing."

     ch19 on what an answer must carry, verbatim: "Every answer names what it
       read, in words, under the answer. It never writes without a press, and
       a refusal is a sentence — never an empty panel."

     ch27.10 on the assistant as a thread, verbatim: "It reads and it
       proposes; every change it could make appears as a chip you press.
       Answers state what they were based on — 'based on 4 records' — because
       an assistant that can't show its footing is a guess with a mango
       avatar."

     ch27.44 on approving before anything runs, verbatim: "Nothing is written
       until Approve is pressed, and the screen says so beside the button."

   THE LAW THIS FILE OBEYS
   · THE ASSISTANT IS NOT MODAL. Settled 2026-08-22: `CopilotOverlay` defaults
     `modal={false}` per kit ruling 31, and this file DOES NOT PASS `modal`.
     No scrim, no focus trap, no page shift. The page stays live.
   · A CONTROL THE ASSISTANT CHANGED GETS NO RING. It gets a dot and a visible
     sentence beneath it, which is `CopilotTouched` (tier 2) and is not
     re-implemented here. Wrap the control at the call site.
   · EVERY ANSWER NAMES ITS BASIS. An assistant message without `basis` warns
     in development. ch19 makes the basis part of the answer, not a nicety.
   · A PROPOSED ACTION IS A PRESS, NEVER AN EFFECT. `AssistantConfirmation`
     lists what WOULD run, in `RunSteps` at `pending`, and states beside the
     button that nothing has been written yet.
   · A RESULT BLOCK IS A COLLECTION, NOT A DRAWING. metric is `StatGrid`,
     progress is `ProgressDashboard`, table is `DataTable`, flow is `RunSteps`.
     Nothing about a chart, a bar or a cell is decided in this file.
   · Focus is one global rule. No ring, no radius, no fill written here.

   WHY THERE ARE TWO SURFACES
   ch27.10: "Client ↔ team threads, internal team chat, the assistant, and
   comments on a record are the same composition with a different header."
   `Assistant` is the floating tenant of ch19's layer; `AssistantThread` is
   the same conversation docked into a panel, which is `AgentChat`. They are
   two placements of one composition, not two designs.

   RENDERING CONTEXT
   `"use client"`. Radix underneath, state in the overlay, handlers built here.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../controls/action-row/action-row";
import { Button } from "../../controls/button/button";
import { Text } from "../../controls/typography/typography";
import {
  AgentChat,
  type AgentChatMessage,
  type AgentChatProps,
} from "../../structures/agent-chat/agent-chat";
import {
  CopilotOverlay,
  type CopilotMessage,
  type CopilotProposal,
} from "../../structures/copilot-overlay/copilot-overlay";
import {
  DataTable,
  type DataTableColumn,
} from "../../structures/data-table/data-table";
import {
  ProgressDashboard,
  type ProgressRow,
} from "../../structures/progress-dashboard/progress-dashboard";
import {
  RunSteps,
  type RunStep,
} from "../../structures/run-steps/run-steps";
import {
  StatGrid,
  type StatItem,
} from "../../structures/stat-grid/stat-grid";
import { cn } from "../../lib/utils";
import { shapeCopy, type ShapeStateCopy } from "../states/states";

/* ============================================================================
   Typed result blocks
   ========================================================================= */

/** One row of a table an assistant returns. Data, never renderers. */
export interface AssistantTableRow {
  /** Stable key. */
  id: string;
  /** Keyed by column. */
  cells: Record<string, React.ReactNode>;
}

/** One column of a table an assistant returns. */
export interface AssistantTableColumn {
  /** Which key in `cells` this column reads. */
  key: string;
  /** The column head. */
  header: React.ReactNode;
  /** Numbers range to the inline end. */
  align?: "start" | "end";
  /** A fixed measure for this column. */
  width?: string;
}

/**
 * The four shapes an answer can take. An assistant that wants a fifth is
 * asking for a new collection, not a new drawing here.
 */
export type AssistantResultBlock =
  | {
      kind: "metric";
      id?: string;
      /** Figures. A tile with `visible: false` renders nothing (ch24.6). */
      items: readonly StatItem[];
      label?: string;
    }
  | {
      kind: "progress";
      id?: string;
      rows: readonly ProgressRow[];
      title?: React.ReactNode;
      label?: string;
    }
  | {
      kind: "table";
      id?: string;
      columns: readonly AssistantTableColumn[];
      rows: readonly AssistantTableRow[];
      label?: string;
      caption?: React.ReactNode;
    }
  | {
      kind: "flow";
      id?: string;
      steps: readonly RunStep[];
      label?: string;
      /** Draw the numbered rail down the side. */
      rail?: boolean;
    };

export interface AssistantResultProps {
  /** Which block to draw. */
  block: AssistantResultBlock;
}

/**
 * One typed result block.
 *
 * TEN STATES — every one belongs to the collection underneath. This component
 * chooses which collection and hands it its data; it draws nothing itself, so
 * loading, empty, error, hover, selection and the rest are all owned below
 * and are not re-decided or re-skinned here.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — owned by the collection underneath. A result
 *  block sits inside a panel that is already the narrow measure, which is why
 *  the table one is the only block that can scroll sideways, inside itself.
 *
 * RTL — LTR only by client ruling.
 */
function AssistantResult({ block }: AssistantResultProps) {
  if (block.kind === "metric") {
    return (
      <StatGrid data-slot="assistant-result" items={block.items} label={block.label} />
    );
  }

  if (block.kind === "progress") {
    return (
      <ProgressDashboard
        data-slot="assistant-result"
        rows={block.rows}
        title={block.title}
        label={block.label}
      />
    );
  }

  if (block.kind === "flow") {
    return (
      <RunSteps
        data-slot="assistant-result"
        steps={block.steps}
        rail={block.rail}
        label={block.label}
      />
    );
  }

  const columns: Array<DataTableColumn<AssistantTableRow>> = block.columns.map(
    (column) => ({
      key: column.key,
      header: column.header,
      align: column.align,
      width: column.width,
      cell: (row) => row.cells[column.key],
    }),
  );

  return (
    <DataTable<AssistantTableRow>
      data-slot="assistant-result"
      columns={columns}
      rows={block.rows as AssistantTableRow[]}
      getRowId={(row) => row.id}
      label={block.label}
      caption={block.caption}
      hidePagination
    />
  );
}

AssistantResult.displayName = "AssistantResult";

/* ============================================================================
   The confirmation panel
   ========================================================================= */

export interface AssistantConfirmationProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** What the panel is proposing to do. */
  title?: React.ReactNode;
  /**
   * The actions, in the order they would run. Drawn at `pending` — none of
   * them has happened. A step already refused takes `state: "skipped"`.
   */
  steps: readonly RunStep[];
  /** ch27.44: the screen says beside the button that nothing is written yet. */
  note?: React.ReactNode;
  /** Run them. */
  onApprove?: () => void;
  /** The commit's label. */
  approveLabel?: React.ReactNode;
  /** Walk away. Never mango — retreating is not a primary action. */
  onCancel?: () => void;
  /** The retreat's label. */
  cancelLabel?: React.ReactNode;
  /** The actions are running. */
  running?: boolean;
  /** Nothing may be pressed. */
  disabled?: boolean;
  /** Accessible name for the list. */
  label?: string;
}

/**
 * The panel that lists proposed actions before any of them run.
 *
 * TEN STATES
 *  1. default        — the list at `pending`, the note, the two buttons.
 *  2. hover          — owned by `Button`.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` reaches both buttons, each drawing its own
 *                      fill and ink. Never an opacity.
 *  6. loading        — `running`: Approve keeps its fill and grows a spinner,
 *                      and the steps move to `running` / `done` as the caller
 *                      updates them. `RunSteps` draws that, not this file.
 *  7. empty          — no steps: the panel renders `null`. A confirmation with
 *                      nothing to confirm is not a quieter panel, it is none.
 *  8. error          — a step that failed is `state: "failed"` in `RunSteps`.
 *                      There is no separate error skin for the panel.
 *  9. selected       — does not apply. Approval is all-or-nothing here; a
 *                      per-action choice is a different composition (27.44's
 *                      per-field confidence).
 * 10. read-only      — no `onApprove`: the panel states the plan and commits
 *                      nothing.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. A single column of steps and one
 *  action row, both of which wrap on their own.
 *
 * RTL — LTR only by client ruling.
 */
function AssistantConfirmation({
  className,
  title,
  steps,
  note,
  onApprove,
  approveLabel = "Approve",
  onCancel,
  cancelLabel = "Cancel",
  running = false,
  disabled = false,
  label,
  ...props
}: AssistantConfirmationProps) {
  if (steps.length === 0) return null;

  return (
    <div
      data-slot="assistant-confirmation"
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    >
      {title === undefined ? null : (
        <Text as="p" size="sm">
          {title}
        </Text>
      )}

      <RunSteps steps={steps} label={label} disabled={disabled} />

      {/* Context ranged left, the retreat immediately left of the primary,
          the primary furthest right — ch27 law 2 and this repo's own footer
          ruling. The note IS the reason, not a tooltip on the button. */}
      <ActionRow align="end">
        {note === undefined ? null : (
          <Text as="span" size="sm" tone="tertiary" className="me-auto">
            {note}
          </Text>
        )}
        {onCancel === undefined ? null : (
          <Button
            type="button"
            variant="cancel"
            disabled={disabled || running}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        )}
        {onApprove === undefined ? null : (
          <Button type="button" loading={running} disabled={disabled} onClick={onApprove}>
            {approveLabel}
          </Button>
        )}
      </ActionRow>
    </div>
  );
}

AssistantConfirmation.displayName = "AssistantConfirmation";

/* ============================================================================
   The floating tenant
   ========================================================================= */

export interface AssistantMessage extends Omit<CopilotMessage, "body"> {
  /** What was said, in words. */
  body?: React.ReactNode;
  /** Typed blocks drawn under the words. */
  results?: readonly AssistantResultBlock[];
  /** The confirmation panel, when this answer proposes to write something. */
  confirmation?: React.ReactNode;
}

export interface AssistantProps {
  /** The conversation. */
  messages?: readonly AssistantMessage[];
  /** The panel is open. */
  open?: boolean;
  /** Uncontrolled first state. */
  defaultOpen?: boolean;
  /** Opened or closed. */
  onOpenChange?: (open: boolean) => void;
  /** Which corner the panel comes from. */
  side?: "left" | "right";
  /** The panel's title. */
  title?: React.ReactNode;
  /** A line under the title. */
  description?: React.ReactNode;
  /** The ✕'s accessible name. */
  closeLabel?: string;

  /** Draw the collapsed launcher. ch19: the assistant collapses to a mango well. */
  showLauncher?: boolean;
  /** The launcher's accessible name. */
  launcherLabel?: string;
  /** The launcher's mark. */
  launcherIcon?: React.ReactNode;
  /** Fixed to the corner, or placed in the flow. */
  launcherPosition?: "fixed" | "static";
  /** A count on the launcher. */
  launcherBadge?: React.ReactNode;

  /** Press a proposed change. ch27.10: "it never writes without a press". */
  onProposalSelect?: (proposal: CopilotProposal, message: CopilotMessage) => void;
  /** The line under the composer. */
  footnote?: React.ReactNode;

  /** The composer's value. */
  value?: string;
  /** Uncontrolled value. */
  defaultValue?: string;
  /** Value changed. */
  onValueChange?: (value: string) => void;
  /** Ask. */
  onAsk?: (value: string) => void;
  /** Placeholder. */
  composerPlaceholder?: string;
  /** The send control's accessible name. */
  sendLabel?: string;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;

  /** The answer is on its way. */
  thinking?: boolean;
  /** What that says. */
  thinkingLabel?: string;
  /** A refusal or a failure. ch19: a refusal is a sentence, never an empty panel. */
  error?: React.ReactNode | boolean;
  /** Per-locale words for the empty and error panels. */
  copy?: Partial<ShapeStateCopy>;
}

/**
 * The assistant as a tenant of ch19's floating layer.
 *
 * TEN STATES
 *  1. default        — collapsed launcher, or the open panel over live work.
 *  2. hover          — owned by the launcher and the composer's controls.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and by the proposal chips.
 *  5. disabled       — `disabled` reaches the composer; every control draws
 *                      its own fill and ink.
 *  6. loading        — `thinking`: the panel says so in words. There is no
 *                      spinner over the page, because the page is not blocked.
 *  7. empty          — no messages: the panel invites a question. Never a
 *                      blank panel — ch19 forbids one.
 *  8. error          — `error`: a sentence in the panel. A refusal takes the
 *                      same shape, which is why `CopilotMessage.refusal` and
 *                      this prop are drawn the same way below.
 *  9. selected       — does not apply.
 * 10. read-only      — `disabled` with no `onAsk`: the transcript is readable
 *                      and nothing can be sent.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — owned by `CopilotOverlay`. ch19: "Collapsed is
 *  the default on a phone, where the stack sits above the bottom bar and never
 *  over a control."
 *
 * RTL — LTR only by client ruling. `side` is the overlay's own prop.
 */
function Assistant({
  messages,
  open,
  defaultOpen,
  onOpenChange,
  side,
  title,
  description,
  closeLabel,
  showLauncher,
  launcherLabel,
  launcherIcon,
  launcherPosition,
  launcherBadge,
  onProposalSelect,
  footnote,
  value,
  defaultValue,
  onValueChange,
  onAsk,
  composerPlaceholder,
  sendLabel,
  disabled,
  thinking,
  thinkingLabel,
  error,
  copy,
}: AssistantProps) {
  const words = shapeCopy("assistant", copy);

  const composed: CopilotMessage[] = (messages ?? []).map((message) => {
    if (
      process.env.NODE_ENV !== "production" &&
      message.from === "assistant" &&
      message.basis === undefined &&
      message.refusal === undefined
    ) {
      // ch19 — "Every answer names what it read, in words, under the answer."
      console.warn(`Assistant: answer "${message.id}" carries no basis.`);
    }

    const extras =
      (message.results !== undefined && message.results.length > 0) ||
      message.confirmation !== undefined;

    return {
      ...message,
      body: extras ? (
        <span className="flex min-w-0 flex-col gap-3">
          {message.body}
          {(message.results ?? []).map((block, index) => (
            <AssistantResult key={block.id ?? `${message.id}-${index}`} block={block} />
          ))}
          {message.confirmation}
        </span>
      ) : (
        message.body
      ),
    };
  });

  return (
    /* NO `modal` PROP. Ruled 2026-08-22 and restated in this file's header:
       the overlay already defaults to non-modal per kit ruling 31, and
       passing the prop at all invites somebody to pass `true`. */
    <CopilotOverlay
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      side={side}
      title={title}
      description={description}
      closeLabel={closeLabel}
      showLauncher={showLauncher}
      launcherLabel={launcherLabel}
      launcherIcon={launcherIcon}
      launcherPosition={launcherPosition}
      launcherBadge={launcherBadge}
      messages={composed}
      onProposalSelect={onProposalSelect}
      footnote={footnote}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      onAsk={onAsk}
      composerPlaceholder={composerPlaceholder}
      sendLabel={sendLabel}
      disabled={disabled}
      thinking={thinking}
      thinkingLabel={thinkingLabel}
      error={error}
      emptyLabel={words.emptyTitle}
      errorLabel={words.errorTitle}
    />
  );
}

Assistant.displayName = "Assistant";

/* ============================================================================
   The docked thread
   ========================================================================= */

export interface AssistantThreadMessage extends Omit<AgentChatMessage, "content"> {
  /** What was said. */
  content?: React.ReactNode;
  /** Typed blocks drawn under the words. */
  results?: readonly AssistantResultBlock[];
  /** The confirmation panel. */
  confirmation?: React.ReactNode;
}

export interface AssistantThreadProps
  extends Omit<AgentChatProps, "messages"> {
  /** The conversation. */
  messages?: readonly AssistantThreadMessage[];
}

/**
 * The same conversation, docked into a panel instead of floating (ch27.10:
 * one composition, a different header). Streaming lives here: `chunks` and
 * `streaming` are `AgentChat`'s own, and the stop control comes with them.
 *
 * TEN STATES — all ten are `AgentChat`'s, and this wrapper adds none. It maps
 * result blocks into message bodies and forwards every other prop untouched,
 * so nothing about hover, focus, disabled, loading, empty, error, selection or
 * read-only is decided a second time here.
 *
 * THREE BREAKPOINTS — owned by `AgentChat`.
 *
 * RTL — LTR only by client ruling.
 */
function AssistantThread({ messages, ...props }: AssistantThreadProps) {
  const composed: AgentChatMessage[] = (messages ?? []).map((message) => {
    const extras =
      (message.results !== undefined && message.results.length > 0) ||
      message.confirmation !== undefined;

    return {
      ...message,
      content: extras ? (
        <span className="flex min-w-0 flex-col gap-3">
          {message.content}
          {(message.results ?? []).map((block, index) => (
            <AssistantResult key={block.id ?? `${message.id}-${index}`} block={block} />
          ))}
          {message.confirmation}
        </span>
      ) : (
        message.content
      ),
    };
  });

  return <AgentChat messages={composed} {...props} />;
}

AssistantThread.displayName = "AssistantThread";

export { Assistant, AssistantConfirmation, AssistantResult, AssistantThread };
