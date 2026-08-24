"use client";

/* ============================================================================
   SettingsRoute — the workspace's own switches. Appearance, notifications,
   integrations and the working week.

   ASSEMBLED FROM ONE SHAPE, NOT DESIGNED
     · FormScreen — grouped fields, one commit, the page surface (shape 5).

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 26.05 (Settings — not a special case),
   which is the chapter that draws THIS screen; 27.20 (password and security)
   which states the Settings composition's own anatomy; and 27.14 for the
   onboarding step that offers the same three choices.

     ch26.05, verbatim: "Settings has no layout pattern of its own. It's a
       plain page-title header followed by the same underline tab strip used
       on every detail page's sub-tabs (section 4) — five tabs (Appearance,
       Members, Roles, Notifications, Integrations) instead of a record's
       tabs, that's the only difference."

     WHICH CHAPTER'S WORDS THE APPEARANCE PANEL TAKES, AND WHY IT MATTERS.
     26.05 and 27.14 offer the same three choices in DIFFERENT words, and
     both sets are the artifact's. 26.05 draws "Compact / 13px root, tight
     rows.", "Regular / 15px root, the default in both doors.", "Large / 17px
     root, roomy rows." and heads the group "Scale". 27.14 draws the short
     form — "Text size", "13px", "Tight rows." — which is the ONBOARDING
     step's, and `screens/onboarding.tsx` carries it. This screen is 26.05's,
     so it takes 26.05's, verbatim. Neither set is paraphrased and neither is
     mixed with the other.

     ch27.20, verbatim: "Where a member changes their password and sees where
       they are signed in. It is the Settings composition with a sixth tab —
       no vault imagery, no shield icons, no security score."

     The tab row the same chapter draws, in its own order: Appearance,
     Members, Roles, Notifications, Integrations, Security.

     ch27.14 on how a choice is offered, verbatim: "Choices are shown, not
       described … a small picture of the thing, its name, one line, and the
       ring on the one that is picked — never a list of words."

   THE LAW THIS FILE OBEYS
   · SETTINGS IS NOT A SPECIAL PLACE. No vault imagery, no shield, no score.
     It is the same form shell every other form in the app renders through.
   · EACH GROUP IS A GROUP, NOT A CARD. `FormScreen`'s sections are fieldsets
     with an eyebrow and a hairline. ch27.2 forbids cards inside a form.
   · A SWITCH SAYS WHAT IT DOES. Every toggle carries a description line, so
     nothing on this page is a bare word with a control beside it.
   · THE ASSISTANT IS NOT MODAL. Where the assistant has changed one of these
     controls, the application marks that control with a dot and a sentence —
     never a ring, never a lock. `assistantChanged` is the slot for it, and it
     is drawn as the field's own help line rather than as new furniture.

   WHAT NO SHAPE OFFERED — logged as SYS1-5 and SYS1-6 in GAPS-SYSTEM1.md
     · THE TAB ROW. ch27.20's Settings composition carries six tabs above the
       body. `FormScreen` has no tab slot, and `CollectionScreen` — the only
       shape that has one — cannot take a form as its body. This route
       therefore renders ONE tab's worth of settings as groups, and the tab
       row is the application's own navigation until a shape carries it.
     · THE VISUAL OPTION CARD. ch27.14's picture-name-line card has no
       primitive. `Choice` rows carry the same choice in words.

   RENDERING CONTEXT
   `"use client"`. `FormScreen` builds the submit handler during its render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import { Choice } from "../../controls/choice/choice";
import { Field } from "../../controls/field/field";
import { RadioGroup, RadioGroupItem } from "../../controls/radio-group/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../controls/select/select";
import { Switch } from "../../controls/switch/switch";
import { FormScreen, MainScreen, type FormScreenSection } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/** Every switch and choice this screen holds. */
export interface SettingsValues {
  /** Paper, unlit, or the device's own setting. */
  theme: string;
  /** Which root scale the interface is read at. */
  scale: string;
  /** Which day the sprint boundary falls on. */
  weekStart: string;
  /** A mail when a ticket is assigned to you. */
  notifyAssigned: boolean;
  /** A mail when a client answers a request. */
  notifyClientReply: boolean;
  /** The weekly digest of everything on your accounts. */
  notifyDigest: boolean;
  /** Time is pushed to the ledger as it is booked. */
  syncTime: boolean;
  /** Invoices are drafted from the retainer each month. */
  syncInvoices: boolean;
}

export interface SettingsRouteProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title" | "onSubmit" | "onChange"> {
  /* ---- The shell. `MainScreen`'s, which is `ScreenShell`'s. -------------
     SETTINGS IS A MAIN SCREEN, and the client's own test settles it: "a main
     screen is in the navbar; a detail screen has breadcrumbs." Settings is in
     the navbar. It has no breadcrumb, no record, no identity chip row, no
     number pill and no charcoal footer, so nothing about it is a detail
     screen — and `SHELL.md`'s "Record sub-views and Settings" sentence, which
     puts Settings on the underline strip, is an exception ON THE TAB AXIS
     ONLY and not a reclassification. `MainScreen` takes `tabsVariant="line"`
     for exactly this screen and no other.

     Before this the route returned `FormScreen surface="page"`, which is a
     bare `div` with `gap-6` on it: no page, no screen card, no rail and no
     OFF-BEIGE BODY PANE. The form is the BODY of a screen, not the screen. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** The micro line over the heading. */
  eyebrow?: React.ReactNode;

  /** The page heading. */
  title?: React.ReactNode;
  /** The one line under it. */
  description?: React.ReactNode;

  /** The values. Controlled: the workspace owns them, not this screen. */
  values?: SettingsValues;
  /** One control changed. */
  onChange?: (field: keyof SettingsValues, value: string | boolean) => void;

  /**
   * Controls the assistant changed this session, and the sentence saying so.
   * Ruling: the assistant is NOT modal — a control it touched gets a dot and
   * a sentence, never a ring and never a lock.
   */
  assistantChanged?: Partial<Record<keyof SettingsValues, React.ReactNode>>;

  /** The group eyebrows. */
  sectionLabels?: Partial<Record<SettingsSectionId, string>>;
  /** The control labels. */
  fieldLabels?: Partial<Record<keyof SettingsValues, string>>;
  /** The line under each control. */
  fieldHelp?: Partial<Record<keyof SettingsValues, React.ReactNode>>;

  /** Commit. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The commit's label. */
  submitLabel?: React.ReactNode;
  /** Retreat. */
  onCancel?: () => void;
  /** Its label. */
  cancelLabel?: React.ReactNode;
  /** The commit is running. */
  submitting?: boolean;
  /** Nothing may be changed. */
  disabled?: boolean;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** Try to load the settings again. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
}

/** The groups this screen is built from. */
export type SettingsSectionId = "appearance" | "week" | "notifications" | "integrations";

/* OVERRIDE 47 (2026-08-23) — "The working week" WAS INVENTED AND IS GONE.
   Three of these four are CH26.05's own tab words — Appearance, Notifications,
   Integrations, from the five it names — and the fourth was ours. The register
   swept it in N4's TAIL with the collection tab strips and the client ruled the
   same way on all of them: naming a product's sections is the dev team's work.
   THE KEY STAYS AS A SLOT, not a proposal. `sectionLabels` is already a prop,
   so an application supplies the word and the eyebrow comes back; empty, the
   group renders with no eyebrow, which is `FormSection`'s own behaviour and
   costs the screen no field. */
const SECTION_LABELS: Record<SettingsSectionId, string> = {
  appearance: "Appearance",
  week: "",
  notifications: "Notifications",
  integrations: "Integrations",
};

const FIELD_LABELS: Record<keyof SettingsValues, string> = {
  theme: "Theme",
  scale: "Scale",
  weekStart: "Sprint starts on",
  notifyAssigned: "A ticket is assigned to me",
  notifyClientReply: "A client answers a request",
  notifyDigest: "Weekly digest for my accounts",
  syncTime: "Push booked time to the ledger",
  syncInvoices: "Draft invoices from the retainer",
};

const FIELD_HELP: Partial<Record<keyof SettingsValues, string>> = {
  theme: "Three choices, and the machine’s is one of them.",
  scale: "How large the type and the rows sit. Applies to every screen, not just type.",
  weekStart: "Sets the sprint boundary and the week a figure is counted in.",
  notifyClientReply: "Only on accounts you own.",
  notifyDigest: "Sent on the first working day, in your timezone.",
  syncTime: "Runs nightly. A correction the next day is picked up.",
  syncInvoices: "Drafted, never sent. Somebody still presses send.",
};

/* CH26.05's Appearance panel, verbatim — the labels and the lines under them
   are the chapter's own words and are not paraphrased. The `value` strings
   are the application's contract and are deliberately untouched: the
   artifact's third scale is called "Regular" and this one has always been
   keyed `default`, so only the WORD moves. */
const THEMES: readonly { value: string; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Off-beige paper, charcoal ink." },
  { value: "dark", label: "Dark", description: "Unlit paper, off-beige type." },
  { value: "system", label: "System", description: "Follow the machine, switch at dusk." },
];

const SCALES: readonly { value: string; label: string; description: string }[] = [
  { value: "compact", label: "Compact", description: "13px root, tight rows." },
  { value: "default", label: "Regular", description: "15px root, the default in both doors." },
  { value: "large", label: "Large", description: "17px root, roomy rows." },
];

const WEEK_START: readonly { value: string; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "sunday", label: "Sunday" },
];

const VALUES: SettingsValues = {
  theme: "system",
  scale: "default",
  weekStart: "monday",
  notifyAssigned: true,
  notifyClientReply: true,
  notifyDigest: false,
  syncTime: true,
  syncInvoices: false,
};

const TOGGLES: readonly (keyof SettingsValues)[] = [
  "notifyAssigned",
  "notifyClientReply",
  "notifyDigest",
];

const SYNCS: readonly (keyof SettingsValues)[] = ["syncTime", "syncInvoices"];

/**
 * The workspace settings form.
 *
 * TEN STATES — every one belongs to `FormScreen` or to a control.
 *  1. default        — four groups, one footer, the commit last.
 *  2. hover          — owned by the controls and the buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button` and by `Switch`.
 *  5. disabled       — `disabled` freezes every group through one fieldset.
 *  6. loading        — `submitting` on the commit; `state="loading"` unfills
 *                      the body while the settings are fetched.
 *  7. empty          — `state="empty"`: a reader whose rights leave no
 *                      settings on this screen. ch24.6 hides rather than
 *                      disables, so this is a real case.
 *  8. error          — `state="error"`: the settings could not be loaded.
 *  9. selected       — the picked option in each radio group.
 * 10. read-only      — pass `disabled` with no `onSubmit`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one column below the form breakpoint, two
 *  above it, owned by `Form`'s grid. The switch groups stay one column at
 *  every width, because a two-column list of switches reads as a grid of
 *  unrelated words.
 *
 * RTL — LTR only by client ruling.
 */
function SettingsRoute({
  rail,
  railLabel,
  eyebrow,
  title = "Settings",
  description = "How this workspace behaves for you.",
  values = VALUES,
  onChange,
  assistantChanged,
  sectionLabels,
  fieldLabels,
  fieldHelp,
  onSubmit,
  submitLabel = "Save settings",
  onCancel,
  cancelLabel = "Cancel",
  submitting = false,
  disabled = false,
  state = "ready",
  copy,
  onRetry,
  retryLabel = "Try again",
  ...props
}: SettingsRouteProps) {
  const groups = { ...SECTION_LABELS, ...sectionLabels };
  const labels = { ...FIELD_LABELS, ...fieldLabels };
  const help = { ...FIELD_HELP, ...fieldHelp };

  /* The assistant's sentence rides the field's own help line. No ring, no
     lock, no second surface — the assistant is not modal. */
  const helpFor = (field: keyof SettingsValues): React.ReactNode => {
    const changed = assistantChanged?.[field];
    if (changed === undefined) return help[field];
    return changed;
  };

  const toggleRow = (field: keyof SettingsValues) => (
    <Choice
      key={field}
      label={labels[field]}
      description={helpFor(field)}
      disabled={disabled}
    >
      <Switch
        checked={values[field] === true}
        disabled={disabled}
        onCheckedChange={
          onChange === undefined
            ? undefined
            : (checked) => {
                onChange(field, checked);
              }
        }
      />
    </Choice>
  );

  const sections: FormScreenSection[] = [
    {
      id: "appearance",
      title: groups.appearance,
      columns: 2,
      children: (
        <React.Fragment>
          <Field label={labels.theme} help={helpFor("theme")} disabled={disabled}>
            {() => (
              <RadioGroup
                value={values.theme}
                disabled={disabled}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("theme", value);
                      }
                }
                className="flex flex-col gap-2"
              >
                {THEMES.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    disabled={disabled}
                  >
                    <RadioGroupItem value={option.value} />
                  </Choice>
                ))}
              </RadioGroup>
            )}
          </Field>
          <Field label={labels.scale} help={helpFor("scale")} disabled={disabled}>
            {() => (
              <RadioGroup
                value={values.scale}
                disabled={disabled}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("scale", value);
                      }
                }
                className="flex flex-col gap-2"
              >
                {SCALES.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    disabled={disabled}
                  >
                    <RadioGroupItem value={option.value} />
                  </Choice>
                ))}
              </RadioGroup>
            )}
          </Field>
        </React.Fragment>
      ),
    },
    {
      id: "week",
      /* An unnamed group draws no eyebrow rather than an empty one. */
      title: groups.week === "" ? undefined : groups.week,
      columns: 1,
      children: (
        <Field label={labels.weekStart} help={helpFor("weekStart")} disabled={disabled}>
          {(control) => (
            <Select
              value={values.weekStart}
              disabled={disabled}
              onValueChange={
                onChange === undefined
                  ? undefined
                  : (value) => {
                      onChange("weekStart", value);
                    }
              }
            >
              <SelectTrigger {...control}>
                <SelectValue placeholder="Pick a day" />
              </SelectTrigger>
              <SelectContent>
                {WEEK_START.map((day) => (
                  <SelectItem key={day.value} value={day.value}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ),
    },
    {
      id: "notifications",
      title: groups.notifications,
      columns: 1,
      children: (
        <div className="flex min-w-0 flex-col gap-3">{TOGGLES.map(toggleRow)}</div>
      ),
    },
    {
      id: "integrations",
      title: groups.integrations,
      columns: 1,
      children: <div className="flex min-w-0 flex-col gap-3">{SYNCS.map(toggleRow)}</div>,
    },
  ];

  return (
    <MainScreen
      data-slot="system-settings"
      density="comfortable"
      rail={rail}
      railLabel={railLabel}
      eyebrow={eyebrow}
      title={title}
      meta={description}
      panel={false}
      state={state}
      body={
        /* THE TITLE AND THE LEDE ARE IN THE HEADER BAND, AND THE FORM DRAWS
           NEITHER. `Form` renders its description only inside its title branch,
           so passing the title down and the lede up was not possible — both move
           together, the title to `MainScreen`'s heading and the lede to its
           `meta`, which is the bare line `SHELL.md` allows under a heading. The
           form keeps its groups, its footer and its one commit.

           `panel={false}`: the form's sections ARE the soft-paper panels 26.05
           draws, so they stand straight on the off-beige body pane. Wrapping them
           in a panel of their own would be a panel inside a panel and a level the
           nesting does not have. With no panel there is no toolbar and no folder
           tab, which is right — Settings cuts no collection. */
        <FormScreen
          surface="page"
          density="comfortable"
          sections={sections}
          onSubmit={onSubmit}
          submitLabel={submitLabel}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          submitting={submitting}
          disabled={disabled}
          state={state}
          copy={copy}
          errorAction={
            onRetry === undefined ? undefined : (
              <Button variant="secondary" onClick={onRetry}>
                {retryLabel}
              </Button>
            )
          }
        />
      }
      {...props}
    />
  );
}

SettingsRoute.displayName = "SettingsRoute";

export { SettingsRoute };
