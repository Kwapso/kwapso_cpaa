"use client";

/* ============================================================================
   MultiStepForm — CH27.38, "Multi-step form · For decisions with
   consequences, not for long forms".

   COMPOSED, NOT DRAWN
     · StepperHero  — shape 4, the same rail onboarding and import already use.
                      CH27.38 requires exactly that: "All three multi-step
                      things in the system — onboarding, import, this — use the
                      same left rail and the same button order."
     · FormScreen   — shape 5 at `surface="page"`. It owns the title, the body
                      column, the meta line above the buttons and the Back /
                      Next pair.
     · Choice + Checkbox — the kit's selection control, for a step that picks.
   Not one fill, radius, ring or type step is written in this file.

   DESIGN SOURCE — KWAPSO-SPEC.md CH27, composition 27.38.

     The strapline, verbatim:
       "Planning a sprint, closing a month, moving an account onto a new
        contract. A form becomes a wizard only when a later step depends on an
        earlier one — never to make twelve fields feel shorter."

     "Three steps, or it is a form", verbatim:
       "A wizard is allowed at three steps and no more. If the steps do not
        depend on each other it is one panel with groups of fields (27.2) —
        splitting a flat form into pages only hides its length."

     "The rail carries a summary", verbatim:
       "Completed steps collapse into one line of prose with 'Change' beside
        them, so the decisions already made stay readable while the current one
        is being made."

     "Every step states its arithmetic", verbatim:
       "Three tickets, 26h of the 40h booked. A wizard exists because the steps
        interact, so each step shows the consequence of what has been picked —
        otherwise the split earns nothing."

     "Nothing exists until the last step", verbatim:
       "Said in the rail and under the buttons. The sprint appears on the
        timeline when it is opened, not while it is being planned, so an
        abandoned wizard leaves no ghost record."

     "Back never loses a step", verbatim:
       "Moving back keeps every value; the step rail is clickable for completed
        steps. There is no 'you will lose your progress' dialog inside a wizard
        — only on closing it entirely (ruling 11)."

     "It is a page, like import and onboarding", verbatim:
       "Full content area, rail and header intact, no dim."

     Narrow, verbatim: "Narrow · one step per screen, the summary above the
       buttons".

   THE LAW THIS FILE OBEYS
   · THREE STEPS AND NO MORE. `MAX_WIZARD_STEPS` is 3 and a fourth warns in
     development rather than being drawn. A flat form is `FormScreen` on its
     own; this composition is not the way to shorten one.
   · A LATER STEP MUST DEPEND ON AN EARLIER ONE. `dependsOnEarlierStep` is a
     required prop with no default, so a call site has to answer the chapter's
     question before it can render a wizard; `false` warns in development.
   · NOTHING EXISTS UNTIL THE LAST STEP, SAID TWICE. Once in the rail's summary
     and once in the meta line above the buttons — the chapter's own "Said in
     the rail and under the buttons".
   · THE RUNNING SUMMARY IS PROSE WITH "CHANGE" BESIDE IT. One line, not a
     table of completed values.
   · NO DIM. It is a page. There is no overlay in this file.
   · ONE MANGO — `FormScreen`'s commit. Back is the cancel variant, Change is
     a text button.
   · Every user-facing string is a prop. No px, no hex, no `border`.

   NARROW (380px)
   One step per screen, which is what the composition already is: the rail
   folds rather than restacking (`StatusStepper` owns that), the summary and
   the arithmetic sit in the meta line directly above the buttons — the
   chapter's "the summary above the buttons" — and `Form`'s grid is one column
   below its own breakpoint. Nothing is dropped: the step count, the running
   summary, the arithmetic and both buttons are all drawn at 380.

   RENDERING CONTEXT
   `"use client"`. Step handlers and selection handlers are built here.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import { Checkbox } from "../../controls/checkbox/checkbox";
import { Choice } from "../../controls/choice/choice";
import { Hint, Text } from "../../controls/typography/typography";
import type { StatusStage } from "../../controls/status-stepper/status-stepper";
import { FormScreen } from "./form-screen";
import { MainScreen } from "./main-screen";
import { StepperHero } from "./stepper-hero";
import type { ShapeState, ShapeStateCopy } from "../states/states";

/** CH27.38: "A wizard is allowed at three steps and no more." */
export const MAX_WIZARD_STEPS = 3;

/** One step of the wizard. */
export interface WizardStep {
  /** Stable key, and the value a route puts in the URL. */
  id: string;
  /** The rail's name for it: "Which app", "What goes in", "Who and how long". */
  name: string;
  /**
   * The one line of prose a COMPLETED step collapses into, for the rail's
   * running summary. CH27.38: "Completed steps collapse into one line of
   * prose with 'Change' beside them."
   */
  summary?: string;
  /** The step's own heading, over its body. */
  title?: string;
  /** The sentence under the heading. CH27.38 draws "Step 2 of 3 · pick from…". */
  description?: string;
  /**
   * The consequence of what has been picked, in this step's own arithmetic:
   * "3 tickets · estimated 26h of the 40h booked". CH27.38 requires it on
   * EVERY step — "otherwise the split earns nothing".
   */
  arithmetic?: React.ReactNode;
  /** The step's body. Fields, a picker, whatever this step decides. */
  content?: React.ReactNode;
}

/** One pickable thing, for a step whose body is a selection. */
export interface WizardPick {
  /** Stable key. */
  id: string;
  /** The record number. */
  number: string;
  /** What it is called. */
  label: string;
  /** The estimate, already formatted. */
  estimate?: string;
}

/** Every user-facing string this screen owns. */
export interface MultiStepFormLabels {
  /** The rail's accessible name. */
  stepsLabel: string;
  /** The word before the running summary. CH27.38 draws "So far". */
  soFar: string;
  /** Beside each completed step's line of prose. */
  change: string;
  /** The quiet way back. Never loses a step. */
  back: string;
  /** The mango, on every step but the last. */
  next: string;
  /** The mango on the last step — the only press that creates anything. */
  finish: string;
  /**
   * Said in the rail and under the buttons. CH27.38's own sentence,
   * verbatim from the drawing.
   */
  nothingYet: string;
  /** "Step 2 of 3", as words. */
  formatStep: (position: number, total: number) => string;
}

const DEFAULT_LABELS: MultiStepFormLabels = {
  stepsLabel: "Steps in this wizard",
  soFar: "So far",
  change: "Change",
  back: "Back",
  next: "Next",
  finish: "Open the sprint",
  nothingYet:
    "Nothing is created until the last step. The sprint appears on the timeline only once it is opened.",
  formatStep: (position, total) => `Step ${position} of ${total}`,
};

export interface MultiStepFormProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this route renders is one of the two the kit has, and both of
     them carry the same rail: `SHELL.md`, "the shell above is identical on
     both. The rail never changes between them." The rail's CONTENTS are the
     application's navigation, so they arrive as a node; its placement, its
     measure and the one law about it — dropped entirely below the narrow
     breakpoint, because the kit draws no hamburger anywhere — all belong to
     `ScreenShell` and are not this file's to decide. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /**
   * CH27.38's gate, asked as a prop so a call site cannot skip it: "A form
   * becomes a wizard only when a later step depends on an earlier one." There
   * is no default. `false` warns in development and the caller should be using
   * `FormScreen` with sections instead.
   */
  dependsOnEarlierStep: boolean;

  /** Two or three steps. A fourth warns and is not drawn. */
  steps: readonly WizardStep[];
  /** Which step is being made, by id. */
  step: string;
  /** Moving through the rail, or with Back and Next. */
  onStepChange?: (id: string) => void;

  /** Back. Keeps every value (CH27.38). */
  onBack?: () => void;
  /** Next, and on the last step the one press that creates anything. */
  onNext?: () => void;
  /** The commit is in flight. */
  submitting?: boolean;

  /** The screen's own heading, above the rail. */
  eyebrow?: React.ReactNode;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words for the states. */
  copy?: Partial<ShapeStateCopy>;
  /** Merged over the defaults. */
  labels?: Partial<MultiStepFormLabels>;
}

/**
 * A wizard, at three steps.
 *
 * TEN STATES
 *  1. default        — rail with its running summary, the step's body, the
 *                      arithmetic and the never-yet line, then Back and Next.
 *  2. hover          — the rail's completed stages, the controls'. Not here.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — `submitting` freezes the commit; the rail's later steps
 *                      are `later`, which is a fill and an ink, not an opacity.
 *  6. loading        — `state="loading"`: the rail stays and the body unfills,
 *                      so the reader keeps their place in the sequence.
 *  7. empty          — does not apply. A wizard with no steps is not a wizard.
 *  8. error          — `state="error"`: the body carries the failure; the rail
 *                      stays, because the steps already taken are still true.
 *  9. selected       — the current step on the rail, and the picked rows in a
 *                      selection step.
 * 10. read-only      — does not apply. This is the one screen in the batch
 *                      that holds fields.
 *
 * THREE BREAKPOINTS
 *  · 380 — one step per screen. The rail folds; the summary and the arithmetic
 *    sit immediately above the buttons; both buttons stay.
 *  · tablet / desktop — the same, with `Form`'s two-column grid available to a
 *    step that asks for it.
 *
 * RTL — LTR only by client ruling.
 */
function MultiStepForm({
  rail,
  railLabel,
  className,
  dependsOnEarlierStep,
  steps,
  step,
  onStepChange,
  onBack,
  onNext,
  submitting = false,
  eyebrow,
  state = "ready",
  copy,
  labels,
  ...props
}: MultiStepFormProps) {
  const words: MultiStepFormLabels = { ...DEFAULT_LABELS, ...labels };

  if (process.env.NODE_ENV !== "production") {
    if (steps.length > MAX_WIZARD_STEPS) {
      console.warn(
        `MultiStepForm: ${steps.length} steps. CH27.38 allows three and no more — "splitting a flat form into pages only hides its length". Use FormScreen with sections.`,
      );
    }
    if (!dependsOnEarlierStep) {
      console.warn(
        'MultiStepForm: dependsOnEarlierStep is false. CH27.38 — "A form becomes a wizard only when a later step depends on an earlier one." Use FormScreen with sections.',
      );
    }
  }

  const index = Math.max(
    0,
    steps.findIndex((item) => item.id === step),
  );
  const current = steps[index];
  const last = index === steps.length - 1;

  const stages: StatusStage[] = steps.map((item, position) => ({
    id: item.id,
    label: item.name,
    state: position < index ? "done" : position === index ? "current" : "later",
  }));

  /* CH27.38: the rail carries the summary — one line of prose per completed
     step, with Change beside it. Not a table of values. */
  const done = steps.slice(0, index).filter((item) => item.summary !== undefined);
  const summary =
    done.length === 0 ? undefined : (
      <span data-slot="wizard-summary" className="flex min-w-0 flex-col gap-1">
        <Hint as="span">{words.soFar}</Hint>
        {done.map((item, position) => (
          <span key={item.id} className="flex flex-wrap items-baseline gap-2">
            <Text as="span" size="sm" tone="secondary">
              {item.summary}
            </Text>
            <Button
              variant="text"
              onClick={onStepChange === undefined ? undefined : () => onStepChange(item.id)}
              aria-label={`${words.change} — ${item.name}`}
            >
              {words.change}
            </Button>
            {position < done.length - 1 ? null : null}
          </span>
        ))}
        {/* Said in the rail. The second saying is under the buttons. */}
        <Hint as="span">{words.nothingYet}</Hint>
      </span>
    );

  return (
    /* A MAIN SCREEN, on the chapter's own words. CH27.38: "Full content area,
       RAIL AND HEADER INTACT, no dim" — which is `ScreenShell`, so this screen
       is owed the four levels and had none of them. It is the same case as
       27.30's import and NOT the same case as 27.14's onboarding, which takes
       the whole WINDOW; `onboarding.tsx` sets out all three quotations.

       Of the two models it is a main screen on every one of `SHELL.md`'s
       three differences: an eyebrow, no identity chip row and no record
       number, and NO FOOTER. There is no page heading and 27.38 draws none —
       the step's own title is the heading, and it stays in the form where the
       chapter puts it — so the header band carries the eyebrow alone.

       `panel={false}`: full content area, and no collection to put in a
       panel. The step rail and the form stand on the off-beige body pane. */
    <MainScreen
      data-slot="screen-multi-step-form"
      data-step={current?.id}
      className={className}
      rail={rail}
      railLabel={railLabel}
      eyebrow={eyebrow}
      panel={false}
      state={state}
      body={
      /* THE RAIL IS ON THE LEFT, WHICH IS 27.38 IN WORDS: "All three
         multi-step things in the system — onboarding, import, this — use the
         same left rail and the same button order." This was a Fragment, so
         the rail stacked ABOVE the form and every wizard in the kit drew its
         steps on the wrong side. L-F7 / L-F17.

         The grid is the artifact's own, copied off 27.38's markup and
         identical in 27.14 and 27.30:
             grid-template-columns: repeat(auto-fit, minmax(min(280px,100%), 1fr))
             gap: 24px; align-items: start
         Two items in an auto-fit track list collapse the empty tracks, so it
         resolves to an even split at every width — which is what the chapter
         draws, the rail column carrying the summary card beside the steps.

         It is switched on at 45rem rather than left to the grid's own wrap,
         so it changes at the SAME width `StepperHero` lies its rail down at.
         Left to itself the grid would go two-column at ~584px while the rail
         stayed horizontal until 720, and the strip would be squeezed into
         half a screen for those 136px. */
      <div className="grid items-start gap-[var(--space-6)] min-[45rem]:grid-cols-[repeat(auto-fit,minmax(min(17.5rem,100%),1fr))]">
      {/* The rail names all three from the start — the same rail onboarding
          and import use, per CH27.38. `door="delivery"` is the numbered rail,
          and it now carries the chapter's vertical drawing; the shape's
          stage-count check is documented in onboarding.tsx. */}
      <StepperHero
        stages={stages}
        current={index}
        door="delivery"
        label={words.stepsLabel}
        meta={summary}
        onStageSelect={
          onStepChange === undefined
            ? undefined
            : (position) => {
                /* CH27.38: "the step rail is clickable for completed steps."
                   A later step is not reachable from the rail. */
                if (position >= index) return;
                const next = steps[position];
                if (next !== undefined) onStepChange(next.id);
              }
        }
        /* VERBATIM, NO TERNARY — see system/onboarding.tsx. T3B-6. */
        state={state}
      />

      <FormScreen
        surface="page"
        density="comfortable"
        title={current?.title}
        description={
          current === undefined
            ? undefined
            : [words.formatStep(index + 1, steps.length), current.description]
                .filter(Boolean)
                .join(" · ")
        }
        submitLabel={last ? words.finish : words.next}
        cancelLabel={words.back}
        onCancel={index === 0 ? undefined : (onBack ?? (() => onStepChange?.(steps[index - 1].id)))}
        submitting={submitting}
        onSubmit={
          onNext === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                onNext();
              }
        }
        /* Every step states its arithmetic, and the never-yet line is said the
           second time here — CH27.38's "Said in the rail and under the
           buttons". */
        meta={
          <span className="flex min-w-0 flex-col gap-1">
            {current?.arithmetic === undefined ? null : (
              <Text as="span" size="sm" tone="secondary">
                {current.arithmetic}
              </Text>
            )}
            <Hint as="span">{words.nothingYet}</Hint>
          </span>
        }
        state={state}
        copy={copy}
      >
        {current?.content}
      </FormScreen>
      </div>
      }
      {...props}
    />
  );
}

MultiStepForm.displayName = "MultiStepForm";

/* ----------------------------------------------------------------------------
   WizardPickList — the body CH27.38 actually draws on step 2: pick from the
   app's open tickets. Exported beside the wizard because it is the chapter's
   own step content, not a new part: it is `Choice` + `Checkbox`, the kit's
   selection control, in a column.
   ------------------------------------------------------------------------- */
export interface WizardPickListProps {
  /** What can be picked. */
  items: readonly WizardPick[];
  /** Which are picked, by id. */
  selected: readonly string[];
  /** One was ticked or unticked. */
  onToggle?: (id: string, picked: boolean) => void;
}

function WizardPickList({ items, selected, onToggle }: WizardPickListProps) {
  const picked = new Set(selected);

  return (
    <div data-slot="wizard-picks" className="flex min-w-0 flex-col gap-2">
      {items.map((item) => (
        <Choice
          key={item.id}
          label={item.label}
          description={[item.number, item.estimate].filter(Boolean).join(" · ")}
        >
          <Checkbox
            checked={picked.has(item.id)}
            onCheckedChange={
              onToggle === undefined
                ? undefined
                : (checked) => onToggle(item.id, checked === true)
            }
          />
        </Choice>
      ))}
    </div>
  );
}

WizardPickList.displayName = "WizardPickList";

export { MultiStepForm, WizardPickList };
