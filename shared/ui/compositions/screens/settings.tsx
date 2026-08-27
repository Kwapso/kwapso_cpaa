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

   WHAT NO SHAPE OFFERED — SYS1-5 still open, SYS1-6 CLOSED HERE (2026-08-26)
     · THE TAB ROW. ch27.20's Settings composition carries six tabs above the
       body. `FormScreen` has no tab slot, and `CollectionScreen` — the only
       shape that has one — cannot take a form as its body. This route
       therefore renders ONE tab's worth of settings as groups, and the tab
       row is the application's own navigation until a shape carries it.
     · THE VISUAL OPTION CARD IS BUILT NOW — `AppearanceOptionGroup`, below,
       drawn to 26.05's "How an option panel is built" with override 33's 1px
       ring, and exported so `onboarding.tsx` renders 27.14's step 2 from the
       same block. The Sidebar (spine) group — client ruling D3, mango
       default by override 56 — ships beside Theme and Scale, which p16 drew
       and this screen previously omitted entirely.

   RENDERING CONTEXT
   `"use client"`. `FormScreen` builds the submit handler during its render.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Card } from "../../components/card/card";
import { Input } from "../../components/input/input";
import { Separator } from "../../components/separator/separator";
import { Headline, Hint, Text } from "../../components/typography/typography";
import { cn } from "../../lib/utils";
import { Choice } from "../../components/choice/choice";
import { Field } from "../../components/field/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/select/select";
import { Switch } from "../../components/switch/switch";
import { FormScreen, MainScreen, type FormScreenSection } from "../templates";
import { type ShapeState, type ShapeStateCopy } from "../states";

/** Every switch and choice this screen holds. */
export interface SettingsValues {
  /** Paper, unlit, or the device's own setting. */
  theme: string;
  /**
   * The rail's spine — ink, paper or mango. Client ruling D3 put the three
   * in Settings · Appearance and override 56 makes mango the default.
   */
  spine: string;
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
  spine: "Sidebar",
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
  spine: "The spine can be ink, paper or mango. The rest of the app does not change.",
  scale: "How large the type and the rows sit. Applies to every screen, not just type.",
  weekStart: "Sets the sprint boundary and the week a figure is counted in.",
  notifyClientReply: "Only on accounts you own.",
  notifyDigest: "Sent on the first working day, in your timezone.",
  syncTime: "Runs nightly. A correction the next day is picked up.",
  syncInvoices: "Drafted, never sent. Somebody still presses send.",
};

/* ============================================================================
   THE SMALL PICTURES — THE KIT'S OWN ANATOMY, VALUE FOR VALUE.
   26.05 draws every picture as ONE 58px band at radius 24: a 54px rail
   column on the left, then two bars — 8px at 66% over 6px at 88%, 8px
   apart, inside 13px of padding. The THEME pictures are PINNED, and the
   coverage chapter licenses exactly this — "the small pictures of light
   and dark inside the Appearance step": a picture OF a palette cannot
   re-theme with the palette without lying about the choice it depicts.
   The kit's own hexes ship — #FFFEF9 / #F7F2EB / rgba(26,25,24,.30/.12)
   for light, #141310 / #1C1B18 / rgba(255,254,249,.42/.18) for dark, and
   the split System picture's 50/50 gradient with its grey rail #8e8b84
   and grey bars rgba(128,126,120,.55/.30). The SPINE and SCALE pictures
   are NOT pinned, because the kit's own markup draws them from tokens
   (`var(--card)`, `var(--inv)`, `var(--sheet)`, `var(--hair)`) — a spine
   or a type size is the same fact in either palette.
   ========================================================================= */

/* Below the shared 45rem the kit redraws the card as a ROW — a 76×40
   picture with a 44px rail on the left, the words in the middle, the badge
   at the end — and the picture regains its full 58px band from 45rem up.
   Both sets of measures are the kit's own (wide: 58 / 54 / 13 / 8@66% /
   6@88%; narrow: 40 / 44 / 11 / 7@64% / 5@88%). */
const THUMB =
  "flex h-10 w-[4.75rem] min-w-0 shrink-0 overflow-hidden rounded-[var(--radius)] " +
  "min-[45rem]:h-[3.625rem] min-[45rem]:w-full";

/** The two bars — the picture's stand-in for rows of type. */
const ThumbBars = ({ strong, faint }: { strong: string; faint: string }) => (
  <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-[0.6875rem] min-[45rem]:gap-2 min-[45rem]:p-[0.8125rem]">
    <span
      className="h-[0.4375rem] w-[64%] rounded-full min-[45rem]:h-2 min-[45rem]:w-[66%]"
      style={{ background: strong }}
    />
    <span
      className="h-[0.3125rem] w-[88%] rounded-full min-[45rem]:h-1.5"
      style={{ background: faint }}
    />
  </span>
);

/** The rail column inside a picture — 44 narrow, the kit's 54 from 45rem. */
const THUMB_RAIL = "h-full w-11 shrink-0 min-[45rem]:w-[3.375rem]";

/** The theme pictures: light, dark, and the split that is both at once —
    pinned to the kit's own hexes (see the block comment above). */
export const ThemePicture = ({ tone }: { tone: "light" | "dark" | "system" }) => {
  const drawn = {
    light: {
      field: "#FFFEF9",
      rail: "#F7F2EB",
      strong: "rgba(26,25,24,.30)",
      faint: "rgba(26,25,24,.12)",
    },
    dark: {
      field: "#141310",
      rail: "#1C1B18",
      strong: "rgba(255,254,249,.42)",
      faint: "rgba(255,254,249,.18)",
    },
    system: {
      field: "linear-gradient(90deg,#FFFEF9 50%,#141310 50%)",
      rail: "#8e8b84",
      strong: "rgba(128,126,120,.55)",
      faint: "rgba(128,126,120,.30)",
    },
  }[tone];
  return (
    <span className={THUMB} style={{ background: drawn.field }} aria-hidden="true">
      <span className={THUMB_RAIL} style={{ background: drawn.rail }} />
      <ThumbBars strong={drawn.strong} faint={drawn.faint} />
    </span>
  );
};

/** The spine pictures: the rail column in its three fills, rows beside it.
    Token-drawn, as the kit's own markup draws them, and from the SPINE'S OWN
    tokens — `--spine-ink-fill` and `--spine-paper-fill` are what the real
    rail paints in either palette, so the picture cannot drift from the thing
    it depicts. The ground is `--surface-page`, the paper the real rail
    stands on (in light it is the kit's drawn #FFFEF9; in dark, `--card`
    would render the paper rail invisible on itself). The bars are the
    foreground at the kit's .30 and .12. */
export const SpinePicture = ({ spine }: { spine: "ink" | "paper" | "mango" }) => (
  <span className={cn(THUMB, "bg-surface-page")} aria-hidden="true">
    <span
      className={cn(
        THUMB_RAIL,
        spine === "ink" && "bg-[var(--spine-ink-fill)]",
        spine === "paper" && "bg-[var(--spine-paper-fill)]",
        spine === "mango" && "bg-primary",
      )}
    />
    <ThumbBars
      strong="color-mix(in srgb, var(--foreground) 30%, transparent)"
      faint="color-mix(in srgb, var(--foreground) 12%, transparent)"
    />
  </span>
);

/** The scale pictures: the same record row, read at 13, 15 and 17. The kit
    draws the row card as sheet paper inside a hairline, top-aligned, 2px
    between lines — title 12/14/16 over metadata 10/12/14 in tertiary ink. */
export const ScalePicture = ({
  step,
}: {
  step: "compact" | "default" | "large";
}) => {
  const size = step === "compact" ? 12 : step === "default" ? 14 : 16;
  const lines =
    step === "compact"
      ? ["Status · 4 open", "Sprint 24 · shipped"]
      : step === "default"
        ? ["Status · 4 open"]
        : ["Status"];
  return (
    <span
      className={cn(
        THUMB,
        /* The scale picture keeps its 58 band even on narrow — the kit
           never draws it at 40, and three lines of specimen type cannot
           stand in a 40px band; the words truncate instead. */
        "h-[3.625rem] flex-col gap-[0.125rem] bg-surface-panel px-3 py-2.5 shadow-[var(--hairline)]",
      )}
      aria-hidden="true"
    >
      <span
        className="truncate font-[var(--font-weight-medium)] text-foreground"
        style={{ fontSize: `${size / 16}rem`, lineHeight: 1.3 }}
      >
        Record title
      </span>
      {lines.map((line) => (
        <span
          key={line}
          className="truncate text-ink-tertiary"
          style={{ fontSize: `${(size - 2) / 16}rem`, lineHeight: 1.35 }}
        >
          {line}
        </span>
      ))}
    </span>
  );
};

/* ============================================================================
   THE VISUAL OPTION CARD — 26.05's "How an option panel is built", verbatim:
   "A choice that changes how the app looks is never a row of pills and never
   a dropdown. It is one card per option: a small picture of the thing
   itself, the option's name, one line of prose, and a mango In use badge on
   the one that is set. Selection is the 2px charcoal ring around the card —
   no tick, no radio. Three options per group, in a row that wraps."
   · THE RING IS 1PX, NOT 2 — override 33, the client's own "the line is too
     thick": the same `--hairline-ink` every selection ring in the kit takes,
     and `flowchart.tsx`'s node holds the precedent for the exact class.
   · THE BADGE IS MANGO — `variant="default"`, stated, because a bare
     <Badge> was ruled QUIET and this chip is the kit's drawn mango "In
     use". Override 17 makes it legal: marks, not actions.
   · EXPORTED for `onboarding.tsx`. 27.14, verbatim: "The appearance step
     uses the same visual option cards as Settings · Appearance … a small
     picture of the thing, its name, one line, and the ring on the one that
     is picked — never a list of words." One block, both screens; SYS1-6
     closes with it.
   ========================================================================= */

/** One choice on an option card. */
export interface AppearanceOption {
  /** Stable key, and the value reported on select. */
  value: string;
  /** The option's name. */
  label: React.ReactNode;
  /** The one line of prose under it. */
  description?: React.ReactNode;
  /** The small picture of the thing itself, above the name. */
  picture?: React.ReactNode;
}

export interface AppearanceOptionGroupProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** The three (or so) choices, in a row that wraps. */
  options: readonly AppearanceOption[];
  /** Which one is set. */
  value?: string;
  /** A different card was pressed. */
  onValueChange?: (value: string) => void;
  /** Nothing may be changed. */
  disabled?: boolean;
  /**
   * The word on the set card's mango badge — 26.05 draws "In use" here and
   * 27.14 draws "Picked" on the same card in onboarding.
   */
  badgeLabel?: React.ReactNode;
}

/**
 * A row of pickable cards, one per option. `role="radiogroup"` because that
 * is what it is; the ring and the badge carry the state visually, per 26.05's
 * "no tick, no radio".
 */
export function AppearanceOptionGroup({
  options,
  value,
  onValueChange,
  disabled = false,
  badgeLabel = "In use",
  className,
  ...props
}: AppearanceOptionGroupProps) {
  return (
    <div
      role="radiogroup"
      data-slot="appearance-options"
      className={cn(
        /* Kit: `repeat(auto-fit, minmax(210px, 1fr))`, gap 12 — 13.125rem
           under the kit's px-to-rem convention, and the row wraps by losing
           columns, never by squeezing a card under the picture's own width.
           Below the shared 45rem the kit stacks the cards as ROWS, 8px
           apart. */
        "flex min-w-0 flex-col gap-2",
        "min-[45rem]:grid min-[45rem]:grid-cols-[repeat(auto-fit,minmax(13.125rem,1fr))] min-[45rem]:gap-3",
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={
              onValueChange === undefined || selected
                ? undefined
                : () => {
                    onValueChange(option.value);
                  }
            }
            className={cn(
              "min-w-0 cursor-pointer rounded-[var(--radius)]",
              "border-0 bg-transparent p-0 text-start",
              disabled && "cursor-not-allowed",
            )}
          >
            <Card
              /* The kit's option card is SHEET paper (`var(--sheet)`) on the
                 group's off-beige ground — `Card`'s default variant, not
                 `raised`, which is the ground's own paper and would vanish
                 on it. No shadow: the kit draws none here. Below 45rem the
                 card is the kit's narrow ROW — picture left, words centre,
                 badge at the end, 12px 14px of padding. */
              className={cn(
                "h-full flex-row items-center gap-3 px-3.5 py-3",
                "min-[45rem]:flex-col min-[45rem]:items-stretch min-[45rem]:p-4",
                /* Override 33 — the selection ring is 1px `--hairline-ink`,
                   not 26.05's drawn 2px, on the client's own "the line is
                   too thick"; `flowchart.tsx`'s node holds the precedent. */
                selected && "shadow-[var(--hairline-ink)]",
              )}
            >
              {option.picture}
              <span className="flex min-w-0 flex-1 flex-col gap-[0.1875rem]">
                <span className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <Text as="span" size="sm" className="font-[var(--font-weight-medium)]">
                    {option.label}
                  </Text>
                  {/* Kit: the badge sits `margin-left: auto` — pushed to the
                      card's far edge, not beside the word — and it is the
                      MANGO fill, which is `variant="default"` and no longer
                      the bare <Badge> (an unqualified Badge was ruled QUIET).
                      Override 17 licenses it: a non-interactive mark, so
                      three "Picked" chips beside a mango Next are legal. */}
                  {selected ? (
                    <Badge variant="default" className="ms-auto">
                      {badgeLabel}
                    </Badge>
                  ) : null}
                </span>
                {option.description === undefined ? null : (
                  <Hint>{option.description}</Hint>
                )}
              </span>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

/* CH26.05's Appearance panel, verbatim — the labels and the lines under them
   are the chapter's own words and are not paraphrased. The `value` strings
   are the application's contract and are deliberately untouched: the
   artifact's third scale is called "Regular" and this one has always been
   keyed `default`, so only the WORD moves. */
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
    description: "Follow the machine, switch at dusk.",
    picture: <ThemePicture tone="system" />,
  },
];

/* p16's Sidebar group, previously MISSING FROM THIS SCREEN ENTIRELY — and it
   is client-ruled territory twice over: D3 ("offer teh threee!") put all
   three spines in Settings · Appearance, and override 56 makes MANGO the
   default. The captions are 26.05's own. */
const SPINES: readonly AppearanceOption[] = [
  {
    value: "ink",
    label: "Ink",
    description: "Charcoal spine, mango active row.",
    picture: <SpinePicture spine="ink" />,
  },
  {
    value: "paper",
    label: "Paper",
    description: "Soft-paper spine, the quiet one.",
    picture: <SpinePicture spine="paper" />,
  },
  {
    value: "mango",
    label: "Mango",
    description: "Full brand spine, charcoal active row.",
    picture: <SpinePicture spine="mango" />,
  },
];

const SCALES: readonly AppearanceOption[] = [
  {
    value: "compact",
    label: "Compact",
    description: "13px root, tight rows.",
    picture: <ScalePicture step="compact" />,
  },
  {
    value: "default",
    label: "Regular",
    description: "15px root, the default in both doors.",
    picture: <ScalePicture step="default" />,
  },
  {
    value: "large",
    label: "Large",
    description: "17px root, roomy rows.",
    picture: <ScalePicture step="large" />,
  },
];

const WEEK_START: readonly { value: string; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "sunday", label: "Sunday" },
];

const VALUES: SettingsValues = {
  theme: "system",
  /* Override 56 — "the define spine by default is the one with the mango sidebar". */
  spine: "mango",
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
 *  9. selected       — the ringed card in each option group.
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
      /* ONE COLUMN — each group is 26.05's row of three cards, and a row of
         cards beside another row of cards is a grid of unrelated pictures. */
      columns: 1,
      children: (
        <React.Fragment>
          {/* 26.05's three groups, in p16's own order: Theme, Sidebar, Scale.
              Each is the visual option card row — "shown, not described". */}
          <Field label={labels.theme} help={helpFor("theme")} disabled={disabled}>
            {(control) => (
              <AppearanceOptionGroup
                {...control}
                options={THEMES}
                value={values.theme}
                disabled={disabled}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("theme", value);
                      }
                }
              />
            )}
          </Field>
          <Field label={labels.spine} help={helpFor("spine")} disabled={disabled}>
            {(control) => (
              <AppearanceOptionGroup
                {...control}
                options={SPINES}
                value={values.spine}
                disabled={disabled}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("spine", value);
                      }
                }
              />
            )}
          </Field>
          <Field label={labels.scale} help={helpFor("scale")} disabled={disabled}>
            {(control) => (
              <AppearanceOptionGroup
                {...control}
                options={SCALES}
                value={values.scale}
                disabled={disabled}
                onValueChange={
                  onChange === undefined
                    ? undefined
                    : (value) => {
                        onChange("scale", value);
                      }
                }
              />
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
          /* p15's page-width law names its ONE exception by name: "the real
             product's content area is fluid … The one deliberate exception
             is Settings, which caps its content at 1000px because its forms
             and tables read better narrow." 62.5rem under the px-to-rem
             convention. */
          className="max-w-[62.5rem]"
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

/* ----------------------------------------------------------------------------
   SettingsSecurity — ch27.20's Security TAB, the body only.

   MISSING UNTIL 2026-08-26. The client deleted `password-security` as a
   SCREEN because "it is the Settings composition with a sixth tab — no vault
   imagery, no shield icons, no security score" — and after the deletion the
   tab's CONTENT existed nowhere. This is that content, transcribed from
   27.20's own markup: the Password panel and "Where you are signed in", two
   soft-paper panels on the body pane, exactly as the other five tabs draw
   theirs. The tab ROW stays the application's navigation (SYS1-5).

     ch27.20's own cards, verbatim where they rule:
       "The password is optional, and says so … Save stays disabled in quiet
        ink until both fields carry something."
       "Consequences before the button — the line above Save says what
        happens: every other device is signed out."
       "Sessions are named, not counted — device, browser, city and last use,
        one row each, with the current one marked by a neutral pill and a
        forest dot rather than being hidden."
       "Revoke is poppy text, and is logged … never a filled red button in a
        list … Sign out everywhere sits last, alone."
       "Two-factor is out of scope for now — no 2FA row is drawn."

   THE DESTRUCTIVE WORDS take override 19's underlined `text` variant in
   override 43's `--destructive-ink` — the AA-passing poppy step — never a
   filled red button.
   ------------------------------------------------------------------------- */

/** One place a member is signed in. */
export interface SettingsSession {
  /** Stable key. */
  id: string;
  /** "Mac · Chrome" — device, then browser. */
  device: string;
  /** "Berlin · in use now" — city, then last use. */
  meta: string;
  /** This browser. Marked with the neutral pill, never hidden. */
  current?: boolean;
}

/** Every user-facing string on the Security tab. */
export interface SettingsSecurityLabels {
  passwordTitle: string;
  passwordNote: string;
  currentLabel: string;
  newLabel: string;
  newPlaceholder: string;
  consequence: string;
  save: string;
  sessionsTitle: string;
  sessionsNote: string;
  thisDevice: string;
  revoke: string;
  revokeNote: string;
  signOutEverywhere: string;
}

const SECURITY_LABELS: SettingsSecurityLabels = {
  passwordTitle: "Password",
  passwordNote: "Optional. The email link works whether or not you set one.",
  currentLabel: "Current password",
  newLabel: "New password",
  newPlaceholder: "At least 12 characters",
  consequence: "Changing it signs out every other device.",
  save: "Save",
  sessionsTitle: "Where you are signed in",
  sessionsNote: "Three sessions. Sessions end after 30 days of not being used.",
  thisDevice: "This device",
  revoke: "Revoke",
  revokeNote: "Revoking a session is recorded in the activity log.",
  signOutEverywhere: "Sign out everywhere",
};

/* The artifact's own three rows. Obviously-fictional content. */
const SECURITY_SESSIONS: readonly SettingsSession[] = [
  { id: "mac", device: "Mac · Chrome", meta: "Berlin · in use now", current: true },
  { id: "iphone", device: "iPhone · Safari", meta: "Berlin · yesterday, 18:20" },
  { id: "win", device: "Windows · Edge", meta: "Barcelona · 11 Aug" },
];

export interface SettingsSecurityProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** The sessions, current one included. */
  sessions?: readonly SettingsSession[];
  /** Merged over the artifact's own strings. */
  labels?: Partial<SettingsSecurityLabels>;
  /** Save the new password. Never called while either field is empty. */
  onPasswordSave?: (current: string, next: string) => void;
  /** End one session. Omit for a reader who may not. */
  onRevoke?: (session: SettingsSession) => void;
  /** End every session but this one. Sits last, alone. */
  onSignOutEverywhere?: () => void;
  /** Nothing may be typed or pressed. */
  disabled?: boolean;
}

/**
 * The Security tab's body — ch27.20, drawn as the Settings composition's
 * sixth tab and nothing more.
 *
 * TEN STATES
 *  1. default        — the two panels.
 *  2. hover          — the controls' own.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — the controls' own.
 *  5. disabled       — `disabled` closes both panels; Save is ALSO closed on
 *                      its own condition — "disabled in quiet ink until both
 *                      fields carry something" — which is the chapter's own
 *                      arming, stated by the consequence line beside it.
 *  6. loading        — does not apply here; a tab in flight is 27.6's body
 *                      swap, owned by the route.
 *  7. empty          — cannot occur. A member always has at least the one
 *                      session they are reading this screen over.
 *  8. error          — does not apply. A refused save is the caller's to
 *                      report beside its own field.
 *  9. selected       — does not apply.
 * 10. read-only      — no handlers: the sessions still read at full strength
 *                      and no dead control is drawn (ch24.6).
 *
 * THREE BREAKPOINTS
 *  · below `sm` the password fields stack and each session row keeps its
 *    action reachable — "sessions become cards, Revoke stays reachable" is
 *    the chapter's narrow caption, and the row wraps rather than clipping.
 *  · `sm` up: the two password fields sit side by side at the artifact's
 *    720 cap; sessions are one row each with the action at the end.
 *
 * RTL — LTR only by client ruling. Every inset is logical.
 */
function SettingsSecurity({
  className,
  sessions = SECURITY_SESSIONS,
  labels,
  onPasswordSave,
  onRevoke,
  onSignOutEverywhere,
  disabled = false,
  ...props
}: SettingsSecurityProps) {
  const words: SettingsSecurityLabels = { ...SECURITY_LABELS, ...labels };
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");

  /* "Save stays disabled in quiet ink until both fields carry something." */
  const armed = current.length > 0 && next.length > 0;

  return (
    <div
      data-slot="settings-security"
      className={cn("flex w-full min-w-0 flex-col gap-[var(--space-4)]", className)}
      {...props}
    >
      {/* ---- The Password panel ------------------------------------------ */}
      <Card className="gap-[var(--space-4h)] p-[var(--space-6)]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-3h)] gap-y-1">
          <Headline as="h3" size="h4">
            {words.passwordTitle}
          </Headline>
          <Hint as="span">{words.passwordNote}</Hint>
        </div>

        <div className="grid max-w-[45rem] grid-cols-1 gap-[var(--space-3h)] sm:grid-cols-2">
          <Field label={words.currentLabel} disabled={disabled}>
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={words.newLabel} disabled={disabled}>
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                placeholder={words.newPlaceholder}
                value={next}
                onChange={(event) => setNext(event.currentTarget.value)}
              />
            )}
          </Field>
        </div>

        {/* Consequences BEFORE the button, next to the control — never a
            dialog after it. */}
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)]">
          <Hint as="span">{words.consequence}</Hint>
          <Button
            variant="secondary"
            className="ms-auto"
            disabled={disabled || !armed}
            onClick={
              onPasswordSave === undefined
                ? undefined
                : () => {
                    if (!armed) return;
                    onPasswordSave(current, next);
                  }
            }
          >
            {words.save}
          </Button>
        </div>
      </Card>

      {/* ---- Where you are signed in ------------------------------------- */}
      <Card className="gap-0 p-[var(--space-6)]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-3h)] gap-y-1 pb-2">
          <Headline as="h3" size="h4">
            {words.sessionsTitle}
          </Headline>
          <Hint as="span">{words.sessionsNote}</Hint>
        </div>

        {sessions.map((session, index) => (
          <React.Fragment key={session.id}>
            {index === 0 ? null : <Separator />}
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)] py-[var(--space-3h)]">
              <div className="flex min-w-0 flex-col gap-1">
                <Text as="span" size="sm">
                  {session.device}
                </Text>
                <Hint as="span">{session.meta}</Hint>
              </div>
              {session.current ? (
                /* The current one is MARKED, never hidden: a neutral pill
                   with a forest dot. A member should be able to spot the
                   session they do not recognise. */
                <Badge variant="outline" className="ms-auto gap-[var(--space-1h)]">
                  <span
                    aria-hidden="true"
                    className="size-[var(--dot-status)] shrink-0 rounded-pill bg-success"
                  />
                  {words.thisDevice}
                </Badge>
              ) : onRevoke === undefined ? null : (
                /* Poppy TEXT, logged — never a filled red button in a list.
                   Override 19's variant, override 43's ink. */
                <Button
                  variant="text"
                  size="sm"
                  className="ms-auto text-destructive-ink"
                  disabled={disabled}
                  onClick={() => onRevoke(session)}
                >
                  {words.revoke}
                </Button>
              )}
            </div>
          </React.Fragment>
        ))}

        <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-3h)] pt-3">
          <Hint as="span">{words.revokeNote}</Hint>
          {onSignOutEverywhere === undefined ? null : (
            /* Sign out everywhere sits last, alone. */
            <Button
              variant="text"
              size="sm"
              className="ms-auto text-destructive-ink"
              disabled={disabled}
              onClick={onSignOutEverywhere}
            >
              {words.signOutEverywhere}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

SettingsSecurity.displayName = "SettingsSecurity";

export { SettingsRoute, SettingsSecurity };
