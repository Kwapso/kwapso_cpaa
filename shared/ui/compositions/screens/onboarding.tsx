"use client";

/* ============================================================================
   OnboardingRoute — what a member meets the first time they open the system
   door, after an invite. Three steps, then the app. Never a tour.

   ASSEMBLED FROM TWO SHAPES, NOT DESIGNED
     · StepperHero — the step rail that names all three from the start (shape 4)
     · FormScreen  — the step's fields and the one footer (shape 5)
   Nothing else. The rail is a sibling of the form, not a second spine: it is
   the same page, and ch27 law 1 only forbids a screen splitting itself into
   two panes with their own navigation.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.14 (onboarding).

     ch27.14 on the surface, verbatim: "Onboarding takes the whole window with
       the kwapso mark at the top — it is not a dialog over a dimmed app,
       because there is nothing behind it worth looking at yet. It appears
       once, after an invite is accepted, and never again."

     ch27.14 on the three steps, verbatim: "Who you are (name, photo,
       timezone), how it should look (theme, spine, scale), what you work on
       (the accounts or apps you own). Three is the ceiling. The step rail
       names all three from the start, so nobody is walked blind."

     ch27.14 on what it must never be, verbatim: "The system never points at
       its own interface. No spotlight, no coach marks, no 'next tip'."

     ch27.14 on the footer, verbatim: "Back and Next stay at the bottom in the
       same order as everywhere else: retreat left, commit right."

     ch27.14 on the last screen, verbatim: "It says what is waiting — tickets
       assigned, apps openable, people on the account — and ends with one
       mango Start that lands on the member's first real screen. Never a
       dashboard of zeroes."

   THE LAW THIS FILE OBEYS
   · THREE STEPS, AND THE COUNT IS STATED. The rail is drawn from the first
     frame with all three named. A step may be skipped; none is hidden.
   · EVERY VALUE HAS A DEFAULT AND NOTHING IS MARKED INCOMPLETE. ch27.14 says
     so in those words, so no step passes `missing` and no field is required.
   · ONE MANGO, AND IT MOVES FORWARD. `FormScreen`'s commit is the only filled
     control on the page; Skip is the cancel variant beside it.
   · NO TOUR FURNITURE. No spotlight, no bubble, no progress percentage. The
     rail is the whole orientation.
   · THE STEPS' CONTENT IS THE APPLICATION'S. This file ships the three the
     kit names and the fields it names inside them, and every string is a prop.

   WHAT NO SHAPE OFFERED — logged as SYS1-2 and SYS1-3 in GAPS-SYSTEM1.md
     · `StepperHero` couples the drawing to the door, and its three doors
       expect seven, three and four stages. ch27.14's rail is a THREE-step
       numbered rail; `door="delivery"` draws the numbered rail but expects
       four, so the shape warns in development. The drawing was kept and the
       warning logged, because `door="portal"` would draw stage pills and put
       the client vocabulary on a system screen, which ruling 04 forbids.
     · The appearance step's "visual option cards" have no primitive. `Choice`
       rows carry the same choice in words. Logged rather than invented.


   IT IS ON NEITHER OF THE TWO SCREEN MODELS, AND THAT IS THE CHAPTER'S CALL
   `SHELL.md` has exactly two screens and one test between them: "a main
   screen is in the navbar; a detail screen has breadcrumbs." This screen is in neither
   place, and 27.14 says why in its own words: "Onboarding takes the whole
   window with the kwapso mark at the top — it is not a dialog over a dimmed
   app, because there is nothing behind it worth looking at yet." A WHOLE-
   WINDOW REPLACEMENT is the one family `SHELL.md` keeps outside the two: it
   draws no rail, because the rail is the application's navigation and the
   member has not reached the application yet, and there is no parent
   collection for it to keep lit.

   IT IS NOT THE SAME CASE AS 27.30 AND 27.38, though all three are wizards
   and 27.38 groups them by their RAIL AND BUTTON ORDER, which is
   `StepperHero` and not the shell. The two chapters say opposite things:
   "the whole CONTENT AREA with the rail and header intact" (27.30, 27.38) is
   `ScreenShell`, and both of those screens are now on `MainScreen`; "the
   whole WINDOW with a mark at the top" (27.14) is the auth family's shell,
   which is what this file draws. `screens/onboarding.tsx` sets out all three
   quotations at length.

   So this screen keeps its own shell and is NOT migrated onto `MainScreen` or
   `DetailScreen`. Recorded here rather than left silent, because the next
   reader sweeping for the four levels will otherwise "fix" it.

   RENDERING CONTEXT
   `"use client"`. Both shapes it composes are client components.
   ========================================================================= */

import * as React from "react";

import { Checkbox } from "../../controls/checkbox/checkbox";
import { Choice } from "../../controls/choice/choice";
import { Field } from "../../controls/field/field";
import { Input } from "../../controls/input/input";
import { RadioGroup, RadioGroupItem } from "../../controls/radio-group/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../controls/select/select";
import { Text } from "../../controls/typography/typography";
import type { StatusStage } from "../../controls/status-stepper/status-stepper";
import { FormScreen, StepperHero, type FormScreenSection } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/** One of the accounts a new member can claim on the third step. */
export interface OnboardingAccount {
  /** Stable key. */
  id: string;
  /** What the account is called. */
  label: string;
  /** What kwapso runs for them, in a few words. */
  description?: string;
}

/** The three steps, addressed by name rather than by index. */
export type OnboardingStepId = "identity" | "appearance" | "work";

export interface OnboardingRouteProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit"> {
  /** Which step is open. */
  step?: OnboardingStepId;
  /** Move to a step from the rail. */
  onStepSelect?: (step: OnboardingStepId) => void;
  /** The rail's three names. */
  stepLabels?: Record<OnboardingStepId, string>;
  /** Accessible name for the rail. */
  stepsLabel?: string;
  /**
   * "Step 2 of 3", the eyebrow over the heading. 27.14 requires the count to
   * be stated, and below 45rem — where the artifact draws no rail on any
   * wizard — this is the only orientation a reader has. A prop, because the
   * joining word is translated.
   */
  formatStep?: (position: number, total: number) => string;

  /** The page heading for each step. */
  titles?: Record<OnboardingStepId, string>;
  /** The one line under each heading. */
  descriptions?: Partial<Record<OnboardingStepId, string>>;

  /** Who is signing in, named at the top the way the kit names them. */
  signedInAs?: string;
  /** How that line reads. */
  formatSignedInAs?: (email: string) => React.ReactNode;

  /** The name field's value. */
  name?: string;
  /** Name changed. */
  onNameChange?: (value: string) => void;
  /** The timezone field's value. */
  timezone?: string;
  /** Timezone changed. */
  onTimezoneChange?: (value: string) => void;
  /** The timezones offered. */
  timezones?: readonly { value: string; label: string }[];

  /** Which theme is picked. */
  theme?: string;
  /** Theme changed. */
  onThemeChange?: (value: string) => void;
  /** Which root scale is picked. */
  scale?: string;
  /** Scale changed. */
  onScaleChange?: (value: string) => void;

  /** The accounts offered on the third step. */
  accounts?: readonly OnboardingAccount[];
  /** Which of them the member owns. */
  ownedAccounts?: readonly string[];
  /** An account was claimed or dropped. */
  onAccountToggle?: (id: string, owned: boolean) => void;

  /** Move forward. */
  onNext?: () => void;
  /** Its label on the first two steps. */
  nextLabel?: React.ReactNode;
  /** Its label on the last step — ch27.14's one mango Start. */
  startLabel?: React.ReactNode;
  /** Pass this step by. */
  onSkip?: () => void;
  /** Its label. */
  skipLabel?: React.ReactNode;
  /** The commit is running. */
  submitting?: boolean;

  /** Loading or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
}

const STEP_ORDER: readonly OnboardingStepId[] = ["identity", "appearance", "work"];

const STEP_LABELS: Record<OnboardingStepId, string> = {
  identity: "Who you are",
  appearance: "How it looks",
  work: "What you work on",
};

const TITLES: Record<OnboardingStepId, string> = {
  identity: "Tell us who you are",
  appearance: "Set it up the way you read",
  work: "Pick up your accounts",
};

const DESCRIPTIONS: Partial<Record<OnboardingStepId, string>> = {
  identity: "Only what the app cannot work out on its own.",
  appearance: "Every one of these has a default and can be changed later in Settings.",
  work: "Claim the accounts you own. Anything you miss can be handed to you later.",
};

/* Obviously-fictional system content. */
const TIMEZONES: readonly { value: string; label: string }[] = [
  { value: "europe-berlin", label: "Berlin" },
  { value: "europe-lisbon", label: "Lisbon" },
  { value: "europe-helsinki", label: "Helsinki" },
  { value: "america-toronto", label: "Toronto" },
];

const ACCOUNTS: readonly OnboardingAccount[] = [
  { id: "fernbank", label: "Fernbank Sports", description: "Court booking and membership" },
  { id: "tidewell", label: "Tidewell Group", description: "Retainer reporting" },
  { id: "brightsilo", label: "Brightsilo", description: "Stock and warehouse" },
  { id: "havenlark", label: "Havenlark", description: "Invoicing and client portal" },
];

const THEMES: readonly { value: string; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Paper ground, charcoal ink." },
  { value: "dark", label: "Dark", description: "The same tokens, unlit." },
  { value: "system", label: "Match my system", description: "Follows the device setting." },
];

const SCALES: readonly { value: string; label: string; description: string }[] = [
  { value: "compact", label: "Compact", description: "Everything a step smaller." },
  { value: "default", label: "Default", description: "What most people read at." },
  { value: "large", label: "Large", description: "Everything a step bigger." },
];

function defaultFormatSignedInAs(email: string): React.ReactNode {
  return `Signed in as ${email}`;
}

/**
 * The three-step onboarding page.
 *
 * TEN STATES — every one belongs to a shape.
 *  1. default        — the rail, the step's fields, Skip and Next.
 *  2. hover          — owned by the fields, the rail's stages and the buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and by the rail's stage control.
 *  5. disabled       — `submitting` freezes the form through `Form`'s single
 *                      fieldset. Never an opacity.
 *  6. loading        — `state="loading"`: the rail stays, the body unfills.
 *  7. empty          — does not apply. Every step has fields, and a step with
 *                      nothing to answer would not be one of the three.
 *  8. error          — `state="error"`: the block failure inside the form.
 *  9. selected       — the current step in the rail, and the picked option in
 *                      each radio group.
 * 10. read-only      — does not apply to onboarding.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — the form is one column below the form
 *  breakpoint and two above it, which `Form`'s own grid owns. The rail folds
 *  its tail rather than restacking, which `StatusStepper` owns.
 *
 * RTL — LTR only by client ruling.
 */
function OnboardingRoute({
  step = "identity",
  onStepSelect,
  stepLabels = STEP_LABELS,
  stepsLabel = "Onboarding steps",
  formatStep = (position, total) => `Step ${position} of ${total}`,
  titles = TITLES,
  descriptions = DESCRIPTIONS,
  signedInAs = "you@studio.example",
  formatSignedInAs = defaultFormatSignedInAs,
  name,
  onNameChange,
  timezone,
  onTimezoneChange,
  timezones = TIMEZONES,
  theme,
  onThemeChange,
  scale,
  onScaleChange,
  accounts = ACCOUNTS,
  ownedAccounts,
  onAccountToggle,
  onNext,
  nextLabel = "Next",
  startLabel = "Start",
  onSkip,
  skipLabel = "Skip",
  submitting = false,
  state = "ready",
  copy,
  ...props
}: OnboardingRouteProps) {
  const index = STEP_ORDER.indexOf(step);
  const last = index === STEP_ORDER.length - 1;

  const stages: readonly StatusStage[] = STEP_ORDER.map((id) => ({
    id,
    label: stepLabels[id],
  }));

  const owned = new Set(ownedAccounts ?? []);

  const identityFields = (
    <React.Fragment>
      <Field label="Your name" help="How you appear on a ticket and in the log.">
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="name"
            value={name}
            onChange={
              onNameChange === undefined
                ? undefined
                : (event) => {
                    onNameChange(event.currentTarget.value);
                  }
            }
          />
        )}
      </Field>
      <Field label="Timezone" help="Used for due dates and for the sprint boundary.">
        {(control) => (
          <Select value={timezone} onValueChange={onTimezoneChange}>
            <SelectTrigger {...control}>
              <SelectValue placeholder="Pick a timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((zone) => (
                <SelectItem key={zone.value} value={zone.value}>
                  {zone.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </React.Fragment>
  );

  const appearanceFields = (
    <React.Fragment>
      <Field label="Theme">
        {() => (
          <RadioGroup
            value={theme}
            onValueChange={onThemeChange}
            className="flex flex-col gap-2"
          >
            {THEMES.map((option) => (
              <Choice key={option.value} label={option.label} description={option.description}>
                <RadioGroupItem value={option.value} />
              </Choice>
            ))}
          </RadioGroup>
        )}
      </Field>
      <Field label="Text size">
        {() => (
          <RadioGroup
            value={scale}
            onValueChange={onScaleChange}
            className="flex flex-col gap-2"
          >
            {SCALES.map((option) => (
              <Choice key={option.value} label={option.label} description={option.description}>
                <RadioGroupItem value={option.value} />
              </Choice>
            ))}
          </RadioGroup>
        )}
      </Field>
    </React.Fragment>
  );

  const workFields = (
    <div className="flex min-w-0 flex-col gap-2">
      {accounts.map((account) => (
        <Choice
          key={account.id}
          label={account.label}
          description={account.description}
        >
          <Checkbox
            checked={owned.has(account.id)}
            onCheckedChange={
              onAccountToggle === undefined
                ? undefined
                : (checked) => {
                    onAccountToggle(account.id, checked === true);
                  }
            }
          />
        </Choice>
      ))}
    </div>
  );

  const sections: FormScreenSection[] = [
    {
      id: step,
      /* ch27.2: a form with one group has no eyebrow at all. */
      columns: step === "identity" ? 2 : 1,
      children:
        step === "identity"
          ? identityFields
          : step === "appearance"
            ? appearanceFields
            : workFields,
    },
  ];

  return (
    <div
      data-slot="system-onboarding"
      data-step={step}
      className="flex w-full min-w-0 flex-col gap-6"
      {...props}
    >
      <Text as="p" size="sm" tone="tertiary">
        {formatSignedInAs(signedInAs)}
      </Text>

      {/* THE RAIL IS ON THE LEFT FROM 45rem UP — 27.38's "the same left rail"
          covers this route too, and the grid is the artifact's own. Below
          45rem it is one column and `StepperHero` lays its own rail down, so
          the phone render is the strip over the form it already was. */}
      <div className="grid items-start gap-[var(--space-6)] min-[45rem]:grid-cols-[repeat(auto-fit,minmax(min(17.5rem,100%),1fr))]">
      {/* The rail names all three from the start, so nobody is walked blind. */}
      <StepperHero
        stages={stages}
        current={index < 0 ? 0 : index}
        door="delivery"
        label={stepsLabel}
        onStageSelect={
          onStepSelect === undefined
            ? undefined
            : (position) => {
                const next = STEP_ORDER[position];
                if (next !== undefined) onStepSelect(next);
              }
        }
        /* VERBATIM, NO TERNARY. This read `state === "error" ? "ready" :
           state`, so a failed request left the rail asserting "you are at
           step 2 of 3" above a form that could not load. A failed rail now
           draws nothing and the FormScreen below carries the one register —
           T3B-6, applied to `StepperHero`. */
        state={state}
      />

      {/* THE COUNT, AT EVERY WIDTH. 27.14: "the count is stated" — and below
          45rem the rail is gone (the artifact draws none on a phone), so this
          eyebrow is the only orientation a phone reader has. Drawn the way
          `screens/onboarding.tsx` draws it, small-capped over the heading. */}
      <div className="flex min-w-0 flex-col gap-[var(--space-2)]">
      <span
        data-slot="onboarding-step-count"
        className="text-micro font-[var(--font-weight-medium)] uppercase text-ink-tertiary"
      >
        {formatStep(index < 0 ? 1 : index + 1, STEP_ORDER.length)}
      </span>

      <FormScreen
        surface="page"
        density="comfortable"
        title={titles[step]}
        description={descriptions[step]}
        sections={sections}
        submitLabel={last ? startLabel : nextLabel}
        cancelLabel={skipLabel}
        onCancel={onSkip}
        submitting={submitting}
        onSubmit={
          onNext === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                onNext();
              }
        }
        state={state}
        copy={copy}
      />
      </div>
      </div>
    </div>
  );
}

OnboardingRoute.displayName = "OnboardingRoute";

export { OnboardingRoute };
