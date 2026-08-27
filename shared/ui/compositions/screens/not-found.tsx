"use client";

/* ============================================================================
   NotFoundScreen — composition 27.23.

   THE ONE SENTENCE
   "A URL for a record that has been deleted, moved, or never existed. Unlike a
   denial (27.7) there is nothing to ask for, so the screen's job is to say
   what it can about the number and hand back a route."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.23, verbatim:

     IT NAMES THE NUMBER EVERY TIME
       "The record number is stated in the chip and in the sentence. 'Not
        found' without a number is unanswerable — the reader cannot tell
        whether they mistyped, followed a stale link, or lost something real."

     THREE CASES, ONE COMPOSITION
       "Deleted, moved, or never existed. Same card, same two paper buttons;
        only the sentence changes, and only the moved case earns a mango
        because there is somewhere to go."

     THE OTHER TWO CASES
       "Moved: '4182 now lives in Collection B', with a mango button that
        opens it there — the one time this screen carries a mango.
        Never existed: 'There is no record 9999 in Collection' — no date, no
        actor, no apology, and the same two paper buttons."

     IT IS NOT A DENIAL
       "A denial (27.7) says who can grant access; this says what happened.
        Never soften one into the other — telling someone a record does not
        exist when they simply cannot see it is a lie the log will
        contradict."

     THE FRAME STAYS DRAWN
       "Rail, header and the collection's actions remain, because the
        collection is fine — one record inside it is not. Only a whole-page
        failure or a dead session (27.19) may replace the frame."

     NO 404, NO CODE, NO CARTOON
       "The words say it. No status number, no illustration, no 'oops'. The
        tone is the same as a deletion dialog: plain, specific, unembarrassed."

     DOORS DIFFER
       "In the portal a record that has left the client's workspace reads
        'this isn't in your workspace' with a route back to their own
        overview — it never names another client and never says who deleted
        it."

   WHICH FRAME STAYS: THE COLLECTION'S, SO THIS IS A MAIN SCREEN IN A STATE
   THE FRAME STAYS DRAWN, quoted above, is the whole answer: it names the
   frame's parts —
   rail, header, and the COLLECTION's actions. `SHELL.md`'s test settles which
   of the two screens owns those: "a main screen is in the navbar; a detail
   screen has breadcrumbs", and every one of this screen's own defaults is a
   main screen's — the eyebrow reads `Group · 24 records` (scope, then count),
   the heading is the collection's name, and the two controls are the
   collection's Export and its create. There is no breadcrumb here, no
   identity chip row, no record number pill and no charcoal footer, because
   the record this URL asked for does not exist to have any of them.

   So this is not a screen of its own: it is `MainScreen` with its BODY
   swapped, which is ch27 law 4 exactly — a state swaps the body and nothing
   else moves. The register rides `emptyBody`, and the rail, the header band,
   the eyebrow's real count and both controls are drawn straight through it.
   That is also why this file passes `state="empty"` rather than
   `state="error"`: ruling 06's block failure is a collection that could not
   be listed, and this collection listed perfectly.

   THE STEP-DOWN WAS REMOVED, 2026-08-24, AGAINST THE RENDERED PAGE
   This screen used to step the header's create DOWN to a paper glyph on the
   `moved` variant, reading 27.23's "the one time this screen carries a
   mango" as a ration of one across the whole screen. p31 draws `Export` and
   a **mango** `+` on 27.23's header, and 27.22's rule card states the family
   rule in words: *"The page-level mango + stays in the header where it
   always is."* 27.23's sentence is about the BODY — `moved` is the only one
   of the three cases whose register offers a way on, and the other two end
   in two paper buttons. So the header's `+` is mango in all three cases and
   the `registerHasMango` test is gone. NF-1 in GAPS-KIT-F.md.

   HOW THIS IS KEPT DISTINCT FROM 27.21, 27.22 AND 27.7
     · The subject is ONE RECORD, named by its number, in a chip and again in
       the sentence. No other register in the family states a record number.
     · The collection's own count stays REAL in the eyebrow — the collection
       is fine. 27.21's zeros would be wrong; 27.22's facet chips would be
       wrong; there is nothing switched on here.
     · There is nothing to ask for, so there is no grantor, no Request and no
       reference — those belong to 27.7 and must never appear here.
     · Mango appears in exactly ONE of the three cases: `moved`.

   THE LAW THIS FILE OBEYS
   · NO STATUS CODE, ANYWHERE. There is no "404" string in this file and no
     prop that could carry one.
   · THE NUMBER IS SAID TWICE — chip and sentence — and both come from one
     `record` prop, so they cannot drift.
   · MANGO ONLY WHEN `case="moved"`. In `deleted` and `missing` both controls
     are paper, which is the artifact's "same two paper buttons".
   · EVERY STRING IS A PROP with a default; the three sentences are three
     separate props so a locale can order actor, number and date its own way.
   · No CSS `border`, no px, no literal colour, no illustration.
   · Focus is one global rule. Dark is a token flip.

   RENDERING CONTEXT
   `"use client"`. The two routes out carry handlers.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Headline, Text } from "../../components/typography/typography";
import { ClockRotateRight, List } from "../../foundations/icons";
import { MainScreen } from "../templates";

/** Which of the three cases. `missing` is the artifact's "never existed". */
export type NotFoundCase = "deleted" | "moved" | "missing";

/** Which door. The portal never names an actor and never names another client. */
export type NotFoundDoor = "system" | "portal";

/** Every user-facing string on this screen. */
export interface NotFoundLabels {
  eyebrow: string;
  heading: string;
  exportLabel: string;
  createLabel: string;
  /** The chip's accessible name, so the bare number is not read alone. */
  recordLabel: string;

  /** `deleted` — the one sentence. */
  deletedTitle: string;
  /**
   * `deleted` — the paragraph. The artifact's desktop wording; the narrow
   * render shortens it, which `deletedBodyNarrow` carries.
   */
  deletedBody: string;
  /** `deleted` — the paragraph below `sm`. */
  deletedBodyNarrow: string;

  /** `moved` — the one sentence. Takes the record number and the destination. */
  movedTitle: string;
  /** `moved` — the paragraph. */
  movedBody: string;
  /** `moved` — the label on the ONE mango this screen may carry. */
  movedAction: string;

  /** `missing` — the one sentence. No date, no actor, no apology. */
  missingTitle: string;
  /** `missing` — the paragraph. */
  missingBody: string;

  /** The first paper route out. */
  back: string;
  /** The second paper route out. */
  log: string;
}

const SYSTEM_LABELS: NotFoundLabels = {
  eyebrow: "Group · 24 records",
  heading: "Collection",
  exportLabel: "Export",
  createLabel: "Add a record",
  recordLabel: "Record number",

  deletedTitle: "This record was deleted.",
  deletedBody:
    "Member name deleted 4182 on 14 August. Deleting is permanent, so there is nothing to restore — but the activity log still holds what happened to it.",
  deletedBodyNarrow:
    "Member name deleted it on 14 August. Deleting is permanent — the log still holds what happened.",

  movedTitle: "4182 now lives in Collection B",
  movedBody: "It was moved on 14 August. Everything on it moved with it.",
  movedAction: "Open it in Collection B",

  missingTitle: "There is no record 9999 in Collection",
  missingBody: "Check the number, or look for it from the collection.",

  back: "Back to Collection",
  log: "Open the log",
};

/* 27.23 doors differ, verbatim: "In the portal a record that has left the
   client's workspace reads 'this isn't in your workspace' with a route back to
   their own overview — it never names another client and never says who
   deleted it." So: no actor, no destination, and the log is not offered. */
const PORTAL_LABELS: NotFoundLabels = {
  ...SYSTEM_LABELS,
  deletedTitle: "This isn't in your workspace.",
  deletedBody: "It is not one of your requests. Nothing is wrong with the link.",
  deletedBodyNarrow: "It is not one of your requests.",
  movedTitle: "This isn't in your workspace.",
  movedBody: "It is not one of your requests. Nothing is wrong with the link.",
  missingTitle: "This isn't in your workspace.",
  missingBody: "Check the number, or start from your overview.",
  back: "Back to your overview",
  log: "",
};

export interface NotFoundScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /* ---- The shell's rail -------------------------------------------------
     The screen this route renders is one of the two the kit has, and both of
     them carry the same rail: `SHELL.md`, "the shell above is identical on
     both. The rail never changes between them." The rail's CONTENTS are the
     application's navigation, so they arrive as a node; its placement, its
     measure and the one law about it — dropped entirely below the narrow
     breakpoint, because the kit draws no hamburger anywhere — all belong to
     `ScreenShell` and are not this file's to decide.

     27.23 names the rail as the first thing that STAYS, so this pair is not
     an addition to the screen: it is the screen finally being handed the
     thing the chapter always said it kept. */

  /** The navigation rail's contents. Placed by the shell, dropped narrow. */
  rail?: React.ReactNode;
  /** Accessible name for the rail. */
  railLabel?: string;
  /** Which of the three. Only `moved` earns a mango. */
  variant?: NotFoundCase;
  /** Which door. */
  door?: NotFoundDoor;
  /** Per-locale words. */
  labels?: Partial<NotFoundLabels>;
  /** The record number. Said in the chip AND in the sentence. */
  record?: string;
  /**
   * RETAINED, NO LONGER DRAWN AS A CHIP. It counted the collection, and the
   * collection is fine — but on a main screen the count belongs in the
   * EYEBROW and nowhere else. `SHELL.md`: the eyebrow is `GROUP · 24
   * RECORDS`, "the scope, then the count", and there is no count slot beside
   * the heading for a chip to ride; this screen's own note says the same
   * thing in its own words, "the collection's own count stays REAL in the
   * eyebrow". `labels.eyebrow` is where the number is said, and it says it in
   * one place instead of two.
   *
   * Kept because `NotFoundScreenProps` is exported and an application passing
   * it today would stop compiling if the prop went. Remove at the next
   * intentional break — the precedent is `NewEmptyRecordLabels.noteSubmit`.
   *
   * @deprecated A main screen states its count in the eyebrow.
   */
  count?: number;
  /** Back to the collection. Paper, always. */
  onBack?: () => void;
  /** Open the activity log. Paper, always. Absent in the portal. */
  onOpenLog?: () => void;
  /** `moved` only: open the record where it now lives. THE one mango. */
  onOpenMoved?: () => void;
  /** The collection's own export, which stays drawn. */
  onExport?: () => void;
  /** The collection's own create, which stays drawn. */
  onCreate?: () => void;
}

/**
 * A record's URL that leads nowhere.
 *
 * TEN STATES
 *  1. default        — THIS IS the state, in one of three cases.
 *  2. hover          — owned by the Buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — does not apply. Every route offered is live.
 *  6. loading        — does not apply. A record still being fetched is 27.6.
 *  7. empty          — does not apply, and the distinction matters: the
 *                      COLLECTION is not empty, so this is never 27.21.
 *  8. error          — does not apply. A record that could not be FETCHED is
 *                      ruling 06's block failure; a record that is GONE is
 *                      this screen, and the two say different true things.
 *  9. selected       — does not apply.
 * 10. read-only      — always. Nothing here is editable.
 *
 * NARROW (380px), STATED — the artifact's caption is "the number leads, both
 * routes stack":
 *  · The number chip is the first thing in the body, above the sentence, at
 *    every width — so on a phone the number leads.
 *  · The `deleted` paragraph swaps to its shorter wording below `sm`; the
 *    other two cases already fit.
 *  · The two routes stack full-width below `sm`, in reading order, and become
 *    a row from `sm` up.
 *  · The frame does not change: header, count and the collection's actions
 *    stay drawn, because the collection is fine.
 *
 * RTL — LTR only by client ruling.
 */
function NotFoundScreen({
  className,
  rail,
  railLabel,
  variant = "deleted",
  door = "system",
  labels,
  record = "4182",
  /* Accepted and ignored — see the prop. Destructured rather than left in the
     rest so it cannot reach the DOM as an unknown attribute. */
  count: _count,
  onBack,
  onOpenLog,
  onOpenMoved,
  onExport,
  onCreate,
  ...props
}: NotFoundScreenProps) {
  const words: NotFoundLabels = {
    ...(door === "portal" ? PORTAL_LABELS : SYSTEM_LABELS),
    ...labels,
  };

  const title =
    variant === "moved"
      ? words.movedTitle
      : variant === "missing"
        ? words.missingTitle
        : words.deletedTitle;

  /* WHICH CASE EARNS A MANGO IN THE BODY. 27.23: "only the moved case earns
     a mango because there is somewhere to go" — `deleted` and `missing`
     reach the register with two paper buttons and nothing else. The header's
     `+` is mango in all three cases regardless; see the step-down note in
     the header block. */

  return (
    /* A MAIN SCREEN IN A STATE. The frame 27.23 keeps — rail, header, the
       collection's actions — is `MainScreen`'s, and the register is its BODY.
       The four levels arrive with the shape: off-beige page, soft-paper
       screen card, the rail and header band lying on it, and the off-beige
       body pane the register stands on. */
    <MainScreen
      data-slot="not-found-screen"
      data-case={variant}
      data-door={door}
      className={className}
      rail={rail}
      railLabel={railLabel}
      /* The collection's own eyebrow, count and all: `SHELL.md`'s `GROUP · 24
         RECORDS`. It is REAL, because the collection is fine. */
      eyebrow={words.eyebrow}
      title={words.heading}
      /* No tabs and no figures: 27.23's render carries the header and the
         collection's actions and goes straight to the body. */
      actions={
        <Button variant="secondary" onClick={onExport}>
          {words.exportLabel}
        </Button>
      }
      /* THE HEADER'S `+` IS MANGO IN ALL THREE CASES. It used to step down to
         a paper glyph whenever the register held a mango — which is the
         "moved" case, the one case that offers `Open it there`. p31 draws
         `Export` and a MANGO `+` on this screen's header, and 27.22's rule
         card states the rule in words for the whole family: *"The page-level
         mango + stays in the header where it always is."* 27.23's own card,
         *"the one time this screen carries a mango"*, is about the BODY —
         the moved case is the only one whose register offers a way on. See
         NF-1 in GAPS-KIT-F.md. */
      onCreate={onCreate}
      createLabel={words.createLabel}
      state="empty"
      emptyBody={
        <div
          data-slot="not-found-body"
          className="flex min-w-0 flex-col items-start gap-3 py-[var(--space-7)]"
        >
          {/* THE NUMBER, FIRST. Said here and again in the sentence. THE
              BLACK CHIP IS ALWAYS THE ID — override 73, the client's
              universal rule ("we always use black chips for IDs"); it was
              `outline` per 27.23's lighter drawing and the ruling wins. */}
          <Badge variant="inverse" aria-label={words.recordLabel}>
            {record}
          </Badge>

          <Headline as="h3" size="h3">
            {title}
          </Headline>

          {variant === "deleted" ? (
            <React.Fragment>
              <Text as="p" size="sm" tone="secondary" measure className="hidden sm:block">
                {words.deletedBody}
              </Text>
              <Text as="p" size="sm" tone="secondary" measure className="sm:hidden">
                {words.deletedBodyNarrow}
              </Text>
            </React.Fragment>
          ) : (
            <Text as="p" size="sm" tone="secondary" measure>
              {variant === "moved" ? words.movedBody : words.missingBody}
            </Text>
          )}

          <div className="mt-2 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            {/* THE ONE TIME THIS SCREEN CARRIES A MANGO: there is somewhere
                to go. `deleted` and `missing` never reach this branch. */}
            {variant === "moved" ? (
              <Button onClick={onOpenMoved}>{words.movedAction}</Button>
            ) : null}
            {/* THE TWO PAPER ROUTES LEAD WITH THEIR GLYPHS — p31 draws a
                list mark on "Back to Collection" and a clock on "Open the
                log", both widths. They shipped as bare words while the
                icon slots waited on the pack; the Iconoir set is on main
                now and the drawing is honoured. */}
            <Button variant="secondary" onClick={onBack}>
              <List aria-hidden="true" />
              {words.back}
            </Button>
            {words.log ? (
              <Button variant="secondary" onClick={onOpenLog}>
                <ClockRotateRight aria-hidden="true" />
                {words.log}
              </Button>
            ) : null}
          </div>
        </div>
      }
      {...props}
    />
  );
}

NotFoundScreen.displayName = "NotFoundScreen";

export { NotFoundScreen };
