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
     · The appearance step's "visual option cards" ARE a primitive now —
       `AppearanceOptionGroup`, built in `settings.tsx` to 26.05's "How an
       option panel is built" and imported here, because 27.14 says this step
       "uses the same visual option cards as Settings · Appearance". The
       badge reads "Picked" (27.14's word) where Settings reads "In use".
       This step also offers the SIDEBAR group — ink / paper / mango — which
       p27 draws between Theme and Text size and this file previously
       omitted; client ruling D3 offers all three and override 56 defaults
       mango.


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

import { Checkbox } from "../../components/checkbox/checkbox";
import { Choice } from "../../components/choice/choice";
import { Field } from "../../components/field/field";
import {
  AppearanceOptionGroup,
  ScalePicture,
  SpinePicture,
  ThemePicture,
  type AppearanceOption,
} from "./settings";
import { Input } from "../../components/input/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/select";
import { Text } from "../../components/typography/typography";
import type { StatusStage } from "../../components/status-stepper/status-stepper";
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
  /** The words INSIDE the steps — the field labels, their help lines, the
   *  timezone placeholder and the appearance badge. Partial: name only what
   *  moves. See `OnboardingFieldLabels`. */
  fieldLabels?: Partial<OnboardingFieldLabels>;
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
  /**
   * Which spine is picked — `ink`, `paper` or `mango` (client ruling
   * 2026-09-03, reversing the 2026-09-02 cut to `mango` / `quiet`). p27
   * draws the Background group between Theme and Text size; override 56
   * makes mango the default.
   */
  spine?: string;
  /** Spine changed. */
  onSpineChange?: (value: string) => void;
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

/* The kit's own step rail, verbatim — "Who you are · How it should look ·
   What you work on" (27.14 draws the three from the start, "so nobody is
   walked blind"). Only step 2's title and description are drawn in the
   chapter; steps 1 and 3 carry this file's own words, flagged as such. */
const STEP_LABELS: Record<OnboardingStepId, string> = {
  identity: "Who you are",
  appearance: "How it should look",
  work: "What you work on",
};

const TITLES: Record<OnboardingStepId, string> = {
  identity: "Tell us who you are",
  appearance: "How should it look?",
  work: "Pick up your accounts",
};

const DESCRIPTIONS: Partial<Record<OnboardingStepId, string>> = {
  identity: "Only what the app cannot work out on its own.",
  appearance:
    "Pick a theme, a spine and a text size — shown, not described. This is " +
    "yours alone: it changes nothing for anyone else on the account.",
  work: "Claim the accounts you own. Anything you miss can be handed to you later.",
};

/**
 * THE WORDS INSIDE THE THREE STEPS, WHICH THIS SCREEN USED TO OWN.
 *
 * Ten user-visible strings were written as literals in the render — five
 * `<Field label>`s, two `help` lines, a Select placeholder and the appearance
 * badge three times — on a screen whose step names, titles, descriptions and
 * every button already arrive as props. Nothing distinguished them from their
 * neighbours; they were simply the ones nobody lifted, and an application
 * translating this screen could translate the frame around them and not one
 * word inside it.
 *
 * The kit still owns the DEFAULTS, so a screen handed nothing reads exactly
 * as it read before. 27.14's own word for the appearance badge is "Picked",
 * and it stays the default here for that reason.
 */
export interface OnboardingFieldLabels {
  /** The name field. */
  name: string;
  /** The line under it. */
  nameHelp: string;
  /** The timezone field. */
  timezone: string;
  /** The line under it. */
  timezoneHelp: string;
  /** The empty timezone select. */
  timezonePlaceholder: string;
  /** The appearance step's three groups. */
  theme: string;
  sidebar: string;
  textSize: string;
  /** The badge on the option that is set — 27.14's word. */
  picked: string;
}

const FIELD_LABELS: OnboardingFieldLabels = {
  name: "Your name",
  nameHelp: "How you appear on a ticket and in the log.",
  timezone: "Timezone",
  timezoneHelp: "Used for due dates and for the sprint boundary.",
  timezonePlaceholder: "Pick a timezone",
  theme: "Theme",
  sidebar: "Background",
  textSize: "Text size",
  picked: "Picked",
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

/* 27.14's own captions, read off the kit's WIDE onboarding render — Light
   and Dark share 26.05's words, System takes the step's own "Follows your
   machine." (Settings says "Follow the machine, switch at dusk."). The
   narrow render abbreviates further ("Off-beige paper.") and that is its
   truncation, not a second vocabulary. The previous strings here ("Paper
   ground, charcoal ink.", "Everything a step smaller.") appeared in no
   chapter. */
const THEMES: readonly AppearanceOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Off-beige paper, charcoal ink.",
    picture: <ThemePicture tone="light" />,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Unlit paper, off-beige type.",
    picture: <ThemePicture tone="dark" />,
  },
  {
    value: "system",
    label: "System",
    description: "Follows your machine.",
    picture: <ThemePicture tone="system" />,
  },
];

/* p27's Background group — previously missing from this step entirely, cut
   to two options (Mango and Quiet) on 2026-09-02, and back to THREE on
   2026-09-03 (client: "you know, i changed my mind. i want to go back to the
   3 options (sorry)"). Same captions as `settings.tsx`'s, shortened the way
   every other caption on this step is: 27.14 is the same words under
   pressure, a truncation and not a second vocabulary. Fills are not
   described — the three names carry the colour, so each line says what the
   choice is like instead, Ink included: hers is the one that needs saying
   even shortened, since "dark" alone would read as a theme rather than a
   background you can pick on either theme. */
const SPINES: readonly AppearanceOption[] = [
  {
    value: "ink",
    label: "Ink",
    description: "Dark, whatever your theme.",
    picture: <SpinePicture spine="ink" />,
  },
  {
    value: "paper",
    label: "Paper",
    description: "Calm, and out of the way.",
    picture: <SpinePicture spine="paper" />,
  },
  {
    value: "mango",
    label: "Mango",
    description: "Warm, and easy to find.",
    picture: <SpinePicture spine="mango" />,
  },
];

const SCALES: readonly AppearanceOption[] = [
  {
    value: "compact",
    label: "13px",
    description: "Tight rows.",
    picture: <ScalePicture step="compact" />,
  },
  {
    value: "default",
    label: "15px",
    description: "The default.",
    picture: <ScalePicture step="default" />,
  },
  {
    value: "large",
    label: "17px",
    description: "Roomy rows.",
    picture: <ScalePicture step="large" />,
  },
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
 *  9. selected       — the current step in the rail, and the ringed card in
 *                      each option group.
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
  fieldLabels,
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
  spine,
  onSpineChange,
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

  /* One merge, the same shape `PortalLoginRoute` uses for its own labels. */
  const words: OnboardingFieldLabels = { ...FIELD_LABELS, ...fieldLabels };

  const owned = new Set(ownedAccounts ?? []);

  const identityFields = (
    <React.Fragment>
      <Field label={words.name} help={words.nameHelp}>
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
      <Field label={words.timezone} help={words.timezoneHelp}>
        {(control) => (
          <Select value={timezone} onValueChange={onTimezoneChange}>
            <SelectTrigger {...control}>
              <SelectValue placeholder={words.timezonePlaceholder} />
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

  /* 27.14: "The appearance step uses the same visual option cards as
     Settings · Appearance … never a list of words." Three groups in p27's
     own order — Theme, Sidebar, Text size — each a row of picture cards with
     the mango "Picked" badge on the one that is set. */
  const appearanceFields = (
    <React.Fragment>
      <Field label={words.theme}>
        {(control) => (
          <AppearanceOptionGroup
            {...control}
            options={THEMES}
            value={theme}
            onValueChange={onThemeChange}
            badgeLabel={words.picked}
          />
        )}
      </Field>
      <Field label={words.sidebar}>
        {(control) => (
          <AppearanceOptionGroup
            {...control}
            options={SPINES}
            value={spine}
            onValueChange={onSpineChange}
            badgeLabel={words.picked}
          />
        )}
      </Field>
      <Field label={words.textSize}>
        {(control) => (
          <AppearanceOptionGroup
            {...control}
            options={SCALES}
            value={scale}
            onValueChange={onScaleChange}
            badgeLabel={words.picked}
          />
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
