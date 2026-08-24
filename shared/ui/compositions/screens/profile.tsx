"use client";

/* ============================================================================
   ProfileRoute — the member's own record, edited. Name, mark, timezone, and
   how they are reached.

   ASSEMBLED FROM ONE SHAPE, NOT DESIGNED
     · FormScreen — grouped fields, one commit, the page surface (shape 5).
   Nothing here is a card, because ch27.2 forbids stacked cards inside a form:
   "Stacked cards inside a form read as several forms and are not used here."

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapters 27.15 (member profile), 27.3 (record edit)
   and 27.2 (the form's own anatomy).

     ch27.15, verbatim: "A member opened from Settings · Members, from an
       avatar, or from a log line. It is the 27.8 detail composition with a
       person in it: identity block, tabs, body, and the same charcoal footer.
       Nothing about a person earns a bespoke layout."

     ch27.2 on the groups, verbatim: "Required group first, optional second,
       never mixed; a form with one group has no eyebrow at all."

     ch27.2 on the footer's sentence, verbatim: "the commit is where the
       scrolling ends, so the footer carries the reason too … 'Two required
       fields are empty — Title, Owner'. Nobody should reach the bottom of a
       long form and have to guess."

   THE LAW THIS FILE OBEYS
   · REQUIRED GROUP FIRST, OPTIONAL SECOND, NEVER MIXED. Two sections, in that
     order, and the required one carries the two fields that cannot be empty.
   · THE MISSING SENTENCE IS COMPUTED, NOT WRITTEN. `missing` is derived from
     the two required values, so the footer states the reason and the commit
     is blocked by the same fact rather than by a second flag.
   · NO PHOTOGRAPH IS SHIPPED. Ruling 30's standing question about avatar
     photographs is not reopened here: the mark slot takes a node from the
     application and this file supplies none.
   · EVERY STRING IS A PROP. Section eyebrows, field labels, help lines and
     both button labels default here and all override.

   WHAT NO SHAPE OFFERED — logged as SYS1-4 in GAPS-SYSTEM1.md
     ch27.15 draws a member as a RECORD — identity block, tabs, body, footer —
     which is `RecordChrome`, shape 1. This route is the member editing their
     OWN profile, which is a form and not a record with tabs, so `FormScreen`
     is right for it. The read-only member record that ch27.15 actually draws
     has no route in this batch and belongs on `RecordChrome`.

     TWO DIFFERENT FOOTERS, AND THIS FILE HAS THE OTHER ONE (DEF-1 sweep,
     2026-08-23). ch27.15's "the same charcoal footer" is CH27.8's ink card —
     Latest activity on the left, Record on the right — and `RecordDetail`
     draws it as of DEF-1. What THIS route ends with is ch27.2's COMMIT
     footer, the one that carries the missing-fields sentence and the save.
     They are not the same object and neither replaces the other: when the
     read-only member record gets a route it will compose `RecordChrome` and
     get the ink card, while this form keeps its commit bar.

   RENDERING CONTEXT
   `"use client"`. `FormScreen` builds the submit handler during its render.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../controls/button/button";
import { Field } from "../../controls/field/field";
import { Input } from "../../controls/input/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../controls/select/select";
import { Textarea } from "../../controls/textarea/textarea";
import { FormScreen, MainScreen, type FormScreenSection } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/** Everything the profile form holds. One object, so a call site controls it in one place. */
export interface ProfileValues {
  /** The member's name, as it appears on a ticket and in the log. */
  name: string;
  /** The address the account is registered to. */
  email: string;
  /** What they do here, in a few words. */
  role: string;
  /** Where they are, for due dates and the sprint boundary. */
  timezone: string;
  /** How they are reached outside the app. */
  phone: string;
  /** The line under their name on a member card. */
  bio: string;
}

export interface ProfileRouteProps
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

  /** The values. Controlled: the app owns the record, not this screen. */
  values?: ProfileValues;
  /** One field changed. */
  onChange?: (field: keyof ProfileValues, value: string) => void;

  /** The mark beside the identity group. A node from the application. */
  mark?: React.ReactNode;
  /** The timezones offered. */
  timezones?: readonly { value: string; label: string }[];

  /** The two group eyebrows. */
  sectionLabels?: { identity?: string; optional?: string };
  /** The field labels. */
  fieldLabels?: Partial<Record<keyof ProfileValues, string>>;
  /** The help line under each field. */
  fieldHelp?: Partial<Record<keyof ProfileValues, React.ReactNode>>;
  /** Per-field validation messages, keyed the same way. */
  fieldErrors?: Partial<Record<keyof ProfileValues, React.ReactNode>>;

  /** Commit. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** The commit's label. Never "Submit" (ch27.2). */
  submitLabel?: React.ReactNode;
  /** Retreat. */
  onCancel?: () => void;
  /** Its label. */
  cancelLabel?: React.ReactNode;
  /** The commit is running. */
  submitting?: boolean;
  /** Nothing may be typed. */
  disabled?: boolean;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** Per-locale words. */
  copy?: Partial<ShapeStateCopy>;
  /** Try to load the record again. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
}

const SECTION_LABELS = {
  identity: "Identity",
  optional: "How you are reached",
};

const FIELD_LABELS: Record<keyof ProfileValues, string> = {
  name: "Name",
  email: "Work email",
  role: "What you do here",
  timezone: "Timezone",
  phone: "Phone",
  bio: "One line about you",
};

const FIELD_HELP: Partial<Record<keyof ProfileValues, string>> = {
  name: "How you appear on a ticket and in the activity log.",
  email: "Changing this signs you out of every other session.",
  timezone: "Due dates and the sprint boundary are read in this zone.",
  bio: "Shown under your name on the members screen.",
};

/* Obviously-fictional system content. */
const TIMEZONES: readonly { value: string; label: string }[] = [
  { value: "europe-berlin", label: "Berlin" },
  { value: "europe-lisbon", label: "Lisbon" },
  { value: "europe-helsinki", label: "Helsinki" },
  { value: "america-toronto", label: "Toronto" },
];

const VALUES: ProfileValues = {
  name: "Anja Kessler",
  email: "anja.kessler@studio.example",
  role: "Delivery lead, sports and leisure accounts",
  timezone: "europe-berlin",
  phone: "",
  bio: "Runs the Fernbank and Tidewell builds.",
};

/**
 * The member's own profile form.
 *
 * TEN STATES — every one belongs to `FormScreen` or to a field.
 *  1. default        — two groups, one footer, the commit last.
 *  2. hover          — owned by the fields and the buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — `disabled` freezes the whole form through one fieldset.
 *  6. loading        — `submitting` keeps the commit's fill and grows a
 *                      spinner; `state="loading"` unfills the body while the
 *                      record is fetched.
 *  7. empty          — `state="empty"`: a reader with no fields to fill in.
 *  8. error          — `fieldErrors` is per-field validation; `state="error"`
 *                      is the record failing to load at all. Kept apart.
 *  9. selected       — does not apply.
 * 10. read-only      — pass `disabled` with no `onSubmit`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — one column below the form breakpoint, two
 *  above it. `Form`'s own grid owns that and this file does not restate it.
 *
 * RTL — LTR only by client ruling.
 */
function ProfileRoute({
  rail,
  railLabel,
  eyebrow,
  title = "Your profile",
  description = "What the rest of the studio sees, and how we reach you.",
  values = VALUES,
  onChange,
  mark,
  timezones = TIMEZONES,
  sectionLabels,
  fieldLabels,
  fieldHelp,
  fieldErrors,
  onSubmit,
  submitLabel = "Save profile",
  onCancel,
  cancelLabel = "Cancel",
  submitting = false,
  disabled = false,
  state = "ready",
  copy,
  onRetry,
  retryLabel = "Try again",
  ...props
}: ProfileRouteProps) {
  const groups = { ...SECTION_LABELS, ...sectionLabels };
  const labels = { ...FIELD_LABELS, ...fieldLabels };
  const help = { ...FIELD_HELP, ...fieldHelp };

  const set = (field: keyof ProfileValues) =>
    onChange === undefined
      ? undefined
      : (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          onChange(field, event.currentTarget.value);
        };

  const sections: FormScreenSection[] = [
    {
      id: "identity",
      title: groups.identity,
      columns: 2,
      children: (
        <React.Fragment>
          {mark}
          <Field
            label={labels.name}
            help={help.name}
            error={fieldErrors?.name}
            required
            disabled={disabled}
          >
            {(control) => (
              <Input
                {...control}
                name="name"
                autoComplete="name"
                value={values.name}
                onChange={set("name")}
              />
            )}
          </Field>
          <Field
            label={labels.email}
            help={help.email}
            error={fieldErrors?.email}
            required
            disabled={disabled}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                name="email"
                autoComplete="email"
                value={values.email}
                onChange={set("email")}
              />
            )}
          </Field>
          <Field label={labels.role} error={fieldErrors?.role} disabled={disabled}>
            {(control) => (
              <Input {...control} name="role" value={values.role} onChange={set("role")} />
            )}
          </Field>
          <Field
            label={labels.timezone}
            help={help.timezone}
            error={fieldErrors?.timezone}
            disabled={disabled}
          >
            {(control) => (
              <Select
                value={values.timezone}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("timezone", value);
                      }
                }
                disabled={disabled}
              >
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
      ),
    },
    {
      id: "optional",
      title: groups.optional,
      columns: 1,
      children: (
        <React.Fragment>
          <Field label={labels.phone} error={fieldErrors?.phone} disabled={disabled}>
            {(control) => (
              <Input
                {...control}
                type="tel"
                name="phone"
                autoComplete="tel"
                value={values.phone}
                onChange={set("phone")}
              />
            )}
          </Field>
          <Field
            label={labels.bio}
            help={help.bio}
            error={fieldErrors?.bio}
            disabled={disabled}
          >
            {(control) => (
              <Textarea {...control} name="bio" value={values.bio} onChange={set("bio")} />
            )}
          </Field>
        </React.Fragment>
      ),
    },
  ];

  /* ch27.2 — the footer states the reason, and it is the same fact that
     blocks the commit rather than a second flag kept beside it. */
  const missing: string[] = [];
  if (values.name.trim().length === 0) missing.push(labels.name);
  if (values.email.trim().length === 0) missing.push(labels.email);

  return (
    <MainScreen
      data-slot="system-profile"
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
          missing={missing}
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

ProfileRoute.displayName = "ProfileRoute";

export { ProfileRoute };
