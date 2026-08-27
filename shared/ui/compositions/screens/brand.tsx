"use client";

/* ============================================================================
   BrandRoute — the brand, for reference. NOTHING ON THIS SCREEN IS EDITABLE.

   THE CLIENT'S RULING, VERBATIM (2026-08-23, override 26)
       "you cannot edit those colors from the app!!! the brand screen is for
        reference, so any time we have access to branding (in case i am doing
        a design, f.e.)"

   So it is neither of the two things C14 offered. It is not a form of token
   names (C14-1, what was built) and it is not a swatch picker (C14-2, which
   would have cost a primitive that does not exist). It is a REFERENCE
   SURFACE: it shows the brand — the marks, the colours, the type — so anyone
   who needs a value can look one up, and it offers no way to change any of
   it. There is no field, no save, no cancel, no form element of any kind on
   this route.

   EVERYTHING SHOWN IS READ FROM THE TOKENS, LIVE
   Every swatch is filled with `var(--token)` and every value beside it is
   read off the document with `getComputedStyle` at render, and re-read when
   the theme, the scale or the direction changes. Nothing is transcribed.
   That is the whole point: a reference sheet that carried its own copy of the
   palette would keep agreeing with itself after `tokens.css` changed
   underneath it, and somebody would design against a colour the system had
   stopped rendering months earlier. It CANNOT drift, because there is no
   second copy to drift from.

   IT IS A MAIN SCREEN, AND SINCE THIS SWEEP IT SAYS SO IN CODE
   `SHELL.md`, the merged law: "a main screen is in the navbar; a detail
   screen has breadcrumbs." This sheet is reached from Settings and its
   eyebrow says so, which is the same standing `system/roles.tsx` has — and
   roles is a main screen. It has no breadcrumb, no record, no identity chip
   row, no number pill and no charcoal footer, so it fails every part of the
   detail screen's test; `SHELL.md` records the footer on "zero main screens"
   and this screen wants none.

   What that fixed, and it is the same list `shapes/collection-screen.tsx`
   works through for the same reason:

     · THE OFF-BEIGE BODY PANE. This file used to return a bare `div` and put
       its four blocks straight into the document, so the page, the screen
       card, the rail and the body pane were all missing and the cards in the
       marks block stood on whatever the document happened to be. The four
       levels are drawn once, in `screen-shell.tsx`, and reached through
       `MainScreen`.
     · NO MANGO, AND THAT IS ALREADY LEGAL. Override 26 leaves this screen
       nothing to press, so no `onCreate` is passed and `MainScreen` draws no
       `+` at all — which is the same silence `SHELL.md` grants Archive,
       Activity log and Link sent. It is not a disabled button (ch24.6).
     · NO FIGURES AND NO TABS. A reference sheet has no count to strip across
       the top and no subsets to cut itself into, and `MainScreen` draws
       neither when neither is passed.

   THE HEADING MOVES UP A LEVEL AND THE LINE UNDER IT DOES NOT. The kit is
   exact about what the header band carries — "a header that carries eyebrow,
   title and actions" — so the eyebrow and the title go to `MainScreen` and
   the sentence under them stays in the body, where it already was, drawn by
   the same `Text` as before. It is the FIRST thing in the body rather than a
   fourth thing in the band, because there is no band slot for it and
   inventing one would be furniture the kit does not draw.

   THE FOUR BLOCK HEADINGS STEP DOWN TO `h3`, AND THAT IS THE MOVE'S OWN
   CONSEQUENCE. This file used to draw its page heading itself, as `h1`, with
   the blocks under it at `h2`. `MainScreen` draws the heading now and `Title`
   renders it at `h2`, so blocks left at `h2` would be the page heading's
   SIBLINGS and the sheet would have no outline. Only the element moves —
   `size="h4"` is untouched, so nothing on the screen changes shape.

   THE THREE REGISTERS ARE THIS FILE'S WORDS, HANDED DOWN. `MainScreen` takes
   `loadingBody` / `emptyBody` / `errorBody` precisely so a screen that owns
   its own wording is not forced into the collection's. The sentence under the
   heading swaps away with the rest of the body, which is ch27 law 4 read
   straight — a state is a body swap, and the header band, the rail and the
   pane all stay drawn and stay put.

   IT SHOWS BOTH PALETTES AT ONCE. A brand has a light value and a dark one,
   and a designer looking one up needs whichever the artwork is going on — not
   whichever the reader's own theme happens to be. Each row therefore carries
   the live value for the theme on screen, and the row's fill is the token, so
   flipping the theme flips both together and the sheet stays honest.

   WHAT WAS DELETED, SO IT IS NOT QUIETLY RESTORED
   `BrandValues`, `onChange`, `onSubmit`, `submitLabel`, `onCancel`,
   `cancelLabel`, `submitting`, `disabled`, `fieldLabels`, `fieldHelp`,
   `fieldErrors` and the `FormScreen` shape. SYS1-7 — "the kit has no swatch
   picker and no colour field" — is closed by this ruling rather than by a new
   primitive: the kit needed no colour control, because nobody was ever going
   to pick a colour here.

   DESIGN SOURCE
   "Kwapso UI Kit.dc.html" chapter 27.2 for the page's own bones — an eyebrow
   and a heading over grouped blocks — and ruling 35 for what may be done with
   a picture on it.

     Ruling 35, verbatim: "Photography sits under type, never behind it. A
       header image is a contained card at the top of a page. No text is ever
       placed on it, and no scrim is used to make text survive it."

   THE LAW THIS FILE OBEYS
   · NO COLOUR IS INVENTED HERE, AND NONE IS TRANSCRIBED. This file names
     TOKENS. It writes no hex, and the strings it prints are whatever the
     document currently resolves them to.
   · THE MARK SLOTS TAKE NODES. `lightMark` and `darkMark` are rendered where
     the application puts them; this route ships no artwork.
   · NO CONTROL THAT CHANGES ANYTHING. The only pressable thing the route can
     draw is the error register's retry, because a sheet that failed to load
     still has to offer the one next step (chapter 21).
   · Every user-facing string is a prop. No px, no hex, no `border`.

   RENDERING CONTEXT
   `"use client"`. The token reader is a hook and a `MutationObserver`.
   ========================================================================= */

import * as React from "react";

import { Button } from "../../components/button/button";
import { Card } from "../../components/card/card";
import { Text } from "../../components/typography/typography";
import { Title } from "../../components/title/title";
import {
  DescriptionList,
  type DescriptionListItem,
} from "../../components/description-list/description-list";
import { ScreenRegister } from "../../components/screen-renderer/screen-renderer";
import { cn } from "../../lib/utils";
import { MainScreen } from "../templates";
import type { ShapeState } from "../states";

/* ============================================================================
   Reading the tokens
   ========================================================================= */

/**
 * How often the sentinel is checked. Slow enough to cost nothing, fast enough
 * that nobody reads a stale hex off the screen.
 */
const SENTINEL_POLL_MS = 1000;

/** The property watched to decide whether the palette moved under the sheet. */
const SENTINEL = "--card";

/**
 * Read a set of custom properties off the document root, and re-read whenever
 * the palette moves.
 *
 * The same mechanism `demo/sheets/token-sheet.tsx` uses, and for the same
 * reason it gives: "Transcribing would mean the sheet keeps agreeing with
 * itself after tokens.css has changed underneath it, which is the exact
 * failure mode a token sheet exists to prevent."
 *
 * THREE TRIGGERS, AND THE THIRD IS THE ONE THAT MATTERS. The `MutationObserver`
 * catches `data-theme` / `data-scale` / `dir`; the media listener catches the
 * reader changing their operating system's own preference. Both are events,
 * and an event that does not fire leaves the sheet showing a value the system
 * has stopped rendering — which is the ONE failure this screen exists to make
 * impossible (it was measured happening: the swatches flipped to the dark
 * palette and the hexes beside them stayed light, because the media `change`
 * never arrived). So a sentinel property is also checked on a slow timer and
 * everything is re-read only when it actually moved. One `getPropertyValue`
 * a second, and no state update unless the palette really changed.
 */
function useTokenValues(names: readonly string[]): Record<string, string> {
  const [values, setValues] = React.useState<Record<string, string>>({});

  const read = React.useCallback(() => {
    if (typeof document === "undefined") return;
    const resolved = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const name of names) next[name] = resolved.getPropertyValue(name).trim();
    setValues((previous) => {
      const same =
        Object.keys(next).length === Object.keys(previous).length &&
        Object.keys(next).every((key) => previous[key] === next[key]);
      return same ? previous : next;
    });
  }, [names]);

  React.useEffect(() => {
    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-scale", "dir", "class", "style"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);

    let last = getComputedStyle(document.documentElement)
      .getPropertyValue(SENTINEL)
      .trim();
    const timer = window.setInterval(() => {
      const now = getComputedStyle(document.documentElement)
        .getPropertyValue(SENTINEL)
        .trim();
      if (now === last) return;
      last = now;
      read();
    }, SENTINEL_POLL_MS);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
      window.clearInterval(timer);
    };
  }, [read]);

  return values;
}

/* ============================================================================
   What the sheet lists
   ========================================================================= */

/** One row of the colour sheet. A token NAME and what it is for — never a value. */
export interface BrandSwatch {
  /** The custom property, e.g. `--accent-brand`. */
  token: string;
  /** What it is called in the reader's language. */
  label: string;
  /** One line: where it is used, or what rule governs it. */
  note?: string;
}

/** One row of the type sheet. */
export interface BrandTypeStep {
  /** The size token, e.g. `--text-2xl`. */
  token: string;
  /** What the step is called. */
  label: string;
  /**
   * The Tailwind step class the system actually renders with — `text-2xl`.
   * Named rather than derived, because PATTERN §3 is explicit that the
   * arbitrary form sets `font-size` alone and drops the leading and the
   * tracking, so a sheet built out of arbitrary values would show the size
   * correctly and the line height wrong.
   */
  className: string;
}

/**
 * The brand's own colours. Every one is a token this system already resolves;
 * nothing here is a value and nothing here is editable.
 */
const BRAND_COLOURS: readonly BrandSwatch[] = [
  { token: "--surface-brand", label: "Accent", note: "Mango. A fill, never a data colour; one filled action per screen." },
  { token: "--ink-on-accent", label: "Ink on the accent", note: "Charcoal, at both palette values — the accent law as a token." },
  { token: "--ink-on-accent-secondary", label: "Second ink on the accent", note: "A solid value, never an opacity (override 13)." },
  { token: "--surface-inverse", label: "Inverse surface", note: "The charcoal fill a person's own words take." },
  { token: "--ink-on-inverse", label: "Ink on the inverse", note: "And its quieter twin below it." },
  { token: "--ink-on-inverse-secondary", label: "Second ink on the inverse", note: "A solid value, never an opacity." },
  { token: "--success", label: "Shipped · healthy", note: "A mark, never a surface." },
  { token: "--info", label: "Informational", note: "A mark, never a surface." },
  { token: "--destructive", label: "Blocked · destructive", note: "A mark, never a surface." },
  { token: "--background", label: "Page", note: "The ground everything else stands on." },
  { token: "--surface-panel", label: "Panel", note: "The soft paper a collection sits on." },
  { token: "--card", label: "Card", note: "Raised paper. Colour separates; strokes don’t." },
  { token: "--surface-quiet", label: "Quiet", note: "The fill for what is present but not yours." },
  { token: "--foreground", label: "Ink", note: "And the two quieter steps under it." },
  { token: "--ink-secondary", label: "Second ink" },
  { token: "--ink-tertiary", label: "Third ink" },
];

/** The type ladder, at its own sizes. */
const BRAND_TYPE: readonly BrandTypeStep[] = [
  { token: "--text-3xl", label: "Display", className: "text-3xl" },
  { token: "--text-2xl", label: "Heading", className: "text-2xl" },
  { token: "--text-xl", label: "Subheading", className: "text-xl" },
  { token: "--text-lg", label: "Lead", className: "text-lg" },
  { token: "--text-base", label: "Body", className: "text-base" },
  { token: "--text-sm", label: "Body small", className: "text-sm" },
  { token: "--text-caption", label: "Caption", className: "text-caption" },
  { token: "--text-badge", label: "Badge", className: "text-badge" },
  { token: "--text-micro", label: "Micro · eyebrow", className: "text-micro" },
];

/** The specimen the type ladder is drawn with. */
const SPECIMEN = "Northgale Studio";

/* ============================================================================
   The route
   ========================================================================= */

/** The blocks this sheet is built from. */
export type BrandSectionId = "marks" | "colour" | "type" | "identity";

const SECTION_LABELS: Record<BrandSectionId, string> = {
  marks: "The marks",
  colour: "Colour",
  type: "Type",
  identity: "What clients are shown",
};

/** One fact a client sees. Read-only, like everything else here. */
export interface BrandFact {
  id: string;
  label: string;
  value?: React.ReactNode;
}

/* Obviously-fictional system content. No colour value is written here. */
const FACTS: readonly BrandFact[] = [
  { id: "displayName", label: "Display name", value: "Northgale Studio" },
  { id: "legalName", label: "Legal entity", value: "Northgale Studio GmbH" },
  { id: "replyTo", label: "Reply-to", value: "hello@studio.example" },
  { id: "typePairing", label: "Type pairing", value: "Grotesk with a condensed serif" },
  { id: "toneOfVoice", label: "Tone", value: "Plain — say what happened, then the next step" },
  {
    id: "mailSignoff",
    label: "Mail sign-off",
    value: "Northgale Studio — we build the thing you actually run on.",
    full: true,
  } as BrandFact & { full?: boolean },
];

export interface BrandRouteProps
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
  /** The micro line above the heading. */
  eyebrow?: React.ReactNode;
  /** The page heading. */
  title?: React.ReactNode;
  /**
   * The one line under it. Its default says the rule out loud, because a
   * reader who cannot find the save button deserves to be told there is none.
   */
  description?: React.ReactNode;

  /** The mark shown on paper grounds. A node from the application. */
  lightMark?: React.ReactNode;
  /** The mark shown on unlit grounds. A node from the application. */
  darkMark?: React.ReactNode;
  /** What the two mark slots are called. */
  lightMarkLabel?: string;
  /** What the two mark slots are called. */
  darkMarkLabel?: string;
  /** Drawn where the application supplies no artwork. */
  markPlaceholder?: React.ReactNode;

  /** The colour rows. Tokens, never values. */
  colours?: readonly BrandSwatch[];
  /** The type ladder. */
  typeSteps?: readonly BrandTypeStep[];
  /** The words the type ladder is set in. */
  specimen?: string;
  /** The facts a client is shown. */
  facts?: readonly BrandFact[];

  /** The block headings. */
  sectionLabels?: Partial<Record<BrandSectionId, string>>;

  /** Loading, empty or error. */
  state?: ShapeState;
  /** What a screen reader hears while the sheet loads. */
  loadingLabel?: string;
  /** The empty register's sentence, and the line under it. */
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  /** The error register's sentence, and the line under it. */
  errorTitle?: React.ReactNode;
  errorDescription?: React.ReactNode;
  /** Try again. The only press this screen can draw. */
  onRetry?: () => void;
  /** Its label. */
  retryLabel?: React.ReactNode;
}

/* ----------------------------------------------------------------------------
   One colour row: the fill IS the token, and the value beside it is read.
   ------------------------------------------------------------------------- */
function ColourRow({
  swatch,
  value,
}: {
  swatch: BrandSwatch;
  value: string | undefined;
}) {
  return (
    <div
      data-slot="brand-swatch"
      data-token={swatch.token}
      className="flex min-w-0 items-center gap-3"
    >
      {/* The one legitimate inline style in the file: the fill is the token
          itself, which is the only way a sheet can be proof rather than a
          claim. `--hairline` carries the edge, because a pale swatch on pale
          paper otherwise has no shape and there is no `border` in this
          system. */}
      <span
        aria-hidden="true"
        className="size-8 flex-none rounded-[var(--radius-select)] shadow-[var(--hairline)]"
        style={{ background: `var(${swatch.token})` }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-[var(--font-weight-medium)]">{swatch.label}</span>
        <span className="truncate text-badge tabular-nums text-ink-tertiary">
          <code>{swatch.token}</code>
          {value ? ` · ${value}` : null}
        </span>
        {swatch.note === undefined ? null : (
          <span className="text-badge text-ink-tertiary">{swatch.note}</span>
        )}
      </span>
    </div>
  );
}

/**
 * The brand, for reference.
 *
 * TEN STATES
 *  1. default        — four blocks: the marks, the colours, the type, and the
 *                      facts a client is shown.
 *  2. hover          — NONE. Nothing on this screen is a target, which is the
 *                      ruling drawn rather than written.
 *  3. focus-visible  — NOT here, and mostly not reachable: the only focusable
 *                      thing the route can draw is the error register's
 *                      retry. tokens.css §8 rings it.
 *  4. active/pressed — the same one control, and only when the sheet failed.
 *  5. disabled       — DOES NOT APPLY, and that is the point. A disabled
 *                      field says "you could change this, but not now"; this
 *                      screen says "this is not changed here at all", and the
 *                      honest drawing of that is no field, not a grey one.
 *  6. loading        — `state="loading"`: the BODY unfills and nothing else
 *                      moves (ch27 law 4) — the rail, the header band and the
 *                      body pane all stay drawn. The swatches wait with it,
 *                      because a swatch reading an unresolved token would
 *                      flash the wrong colour.
 *  7. empty          — `state="empty"`, same mechanism: a reader who may see
 *                      no brand at all.
 *  8. error          — `state="error"`, same mechanism: the sheet failed to
 *                      load, with the retry. Never a per-field error: there
 *                      are no fields.
 *  9. selected       — does not apply. Nothing here is chosen.
 * 10. read-only      — THE WHOLE SCREEN, at all times, by ruling. There is no
 *                      prop that turns editing on.
 *
 * THREE BREAKPOINTS
 *  mobile   — one column throughout: the marks stack, the colour rows stack,
 *             the type ladder stacks, and the facts keep `DescriptionList`'s
 *             two columns at every width because that is the kit's own grid.
 *             Nothing scrolls horizontally: a swatch row truncates its token
 *             name rather than widening the page.
 *  tablet   — the colour rows go to two columns.
 *  desktop  — three. The type ladder stays one column at every width, because
 *             a ladder read across columns is not a ladder.
 *
 * RTL — LTR only by client ruling.
 */
function BrandRoute({
  className,
  rail,
  railLabel,
  eyebrow = "Settings",
  title = "Brand",
  description = "For reference. Nothing on this screen can be changed here — the values are read live from the system’s own tokens, so what you see is what it renders.",
  lightMark,
  darkMark,
  lightMarkLabel = "On paper",
  darkMarkLabel = "On unlit",
  markPlaceholder = "No mark supplied",
  colours = BRAND_COLOURS,
  typeSteps = BRAND_TYPE,
  specimen = SPECIMEN,
  facts = FACTS,
  sectionLabels,
  state = "ready",
  loadingLabel = "Loading the brand sheet…",
  emptyTitle = "No brand recorded",
  emptyDescription = "Nothing has been set for this workspace yet.",
  errorTitle = "Brand unavailable",
  errorDescription = "We can’t show this right now. Try again in a moment.",
  onRetry,
  retryLabel = "Try again",
  ...props
}: BrandRouteProps) {
  const groups = { ...SECTION_LABELS, ...sectionLabels };

  const tokenNames = React.useMemo(
    () => [...colours.map((c) => c.token), ...typeSteps.map((t) => t.token)],
    [colours, typeSteps],
  );
  const values = useTokenValues(tokenNames);

  /* A REFERENCE SHEET THAT LISTS A TOKEN THAT DOES NOT RESOLVE IS A TRAP: the
     swatch renders transparent and the value beside it is empty, and a
     designer reads that as "no colour" rather than as "wrong name". Say so,
     in development, where a wrong name is written. */
  if (process.env.NODE_ENV !== "production") {
    const missing = tokenNames.filter(
      (name) => Object.keys(values).length > 0 && (values[name] ?? "") === "",
    );
    if (missing.length > 0) {
      console.warn(
        `BrandRoute: these tokens resolve to nothing on :root and would draw an empty row — ${missing.join(", ")}`,
      );
    }
  }

  const items: DescriptionListItem[] = facts.map((fact) => ({
    id: fact.id,
    label: fact.label,
    value: fact.value,
    full: (fact as { full?: boolean }).full,
  }));

  /* THE REGISTER IS THIS FILE'S, NOT THE COLLECTION'S. `MainScreen` carries
     `loadingBody` / `emptyBody` / `errorBody` for exactly this: a screen that
     owns its own wording hands it down rather than accepting the default one
     a collection would draw. The tone is read off `state`, so one node serves
     all three slots and the three sentences cannot drift apart. */
  const register = (
    <ScreenRegister
      tone={state === "loading" ? "loading" : state === "error" ? "error" : "empty"}
      loadingLabel={loadingLabel}
      title={state === "error" ? errorTitle : state === "empty" ? emptyTitle : undefined}
      description={
        state === "error" ? errorDescription : state === "empty" ? emptyDescription : undefined
      }
      action={
        state === "error" && onRetry !== undefined ? (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    />
  );

  const body = (
    <React.Fragment>
      {/* THE LINE UNDER THE HEADING IS BODY, NOT BAND. The kit's own
          sentence on the header is exhaustive — "a header that carries
          eyebrow, title and actions" — so this stays where it already was,
          drawn by the same `Text`, and is simply the first thing on the
          body pane instead of the third thing in the band. */}
      {description === undefined || description === null ? null : (
        <Text as="p" size="sm" tone="secondary" className="max-w-[var(--measure-body)]">
          {description}
        </Text>
      )}

      {/* ---- the marks ------------------------------------------------ */}
      <section data-slot="brand-marks" className="flex min-w-0 flex-col gap-4">
        <Title as="h3" size="h4">
          {groups.marks}
        </Title>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {(
            [
              [lightMarkLabel, lightMark, "bg-card text-card-foreground"],
              [darkMarkLabel, darkMark, "bg-surface-inverse text-ink-on-inverse"],
            ] as const
          ).map(([markLabel, mark, ground]) => (
            <Card key={markLabel} className={cn("flex min-w-0 flex-col gap-3 p-5", ground)}>
              <span className="text-micro uppercase tracking-[var(--tracking-eyebrow)]">
                {markLabel}
              </span>
              <span className="flex min-h-[var(--space-9)] min-w-0 items-center">
                {mark ?? <span className="text-caption">{markPlaceholder}</span>}
              </span>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- the colours ---------------------------------------------- */}
      <section data-slot="brand-colour" className="flex min-w-0 flex-col gap-4">
        <Title as="h3" size="h4">
          {groups.colour}
        </Title>
        <div className="grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {colours.map((swatch) => (
            <ColourRow key={swatch.token} swatch={swatch} value={values[swatch.token]} />
          ))}
        </div>
      </section>

      {/* ---- the type -------------------------------------------------- */}
      <section data-slot="brand-type" className="flex min-w-0 flex-col gap-4">
        <Title as="h3" size="h4">
          {groups.type}
        </Title>
        <div className="flex min-w-0 flex-col gap-[var(--space-3h)]">
          {typeSteps.map((step) => (
            <div
              key={step.token}
              data-slot="brand-type-step"
              data-token={step.token}
              className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1"
            >
              {/* Rendered with the bridged step class, not an arbitrary
                  size, so the leading and the tracking are the real ones. */}
              <span className={cn("min-w-0 truncate", step.className)}>{specimen}</span>
              <span className="text-badge tabular-nums text-ink-tertiary">
                {step.label} · <code>{step.token}</code>
                {values[step.token] ? ` · ${values[step.token]}` : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the facts -------------------------------------------------- */}
      <section data-slot="brand-identity" className="flex min-w-0 flex-col gap-4">
        <Title as="h3" size="h4">
          {groups.identity}
        </Title>
        <DescriptionList items={items} />
      </section>
    </React.Fragment>
  );

  return (
    <MainScreen
      data-slot="system-brand"
      data-readonly=""
      rail={rail}
      railLabel={railLabel}
      density="comfortable"
      eyebrow={eyebrow}
      title={title}
      /* NO `onCreate`, AND THEREFORE NO MANGO. Override 26 leaves this screen
         nothing to press, so `MainScreen` draws no `+` at all — the same
         silence `SHELL.md` grants Archive, Activity log and Link sent. A
         disabled create would be the ch24.6 mistake instead. */
      body={body}
      state={state}
      loadingBody={register}
      emptyBody={register}
      errorBody={register}
      className={className}
      {...props}
    />
  );
}

BrandRoute.displayName = "BrandRoute";

export { BrandRoute, BRAND_COLOURS, BRAND_TYPE };
