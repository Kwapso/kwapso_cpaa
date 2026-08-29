"use client";

/* ============================================================================
   AccessDeniedScreen — composition 27.7.

   THE ONE SENTENCE
   "Someone pasted a link to a screen their role does not include. The screen
   they asked for still renders behind, blurred and scrimmed like any other
   layer, and the denial sits over it saying plainly what is out of reach and
   who can grant it."

   DESIGN SOURCE — "Kwapso UI Kit.dc.html" chapter 27.7, verbatim:

     DENIAL IS A DIALOG OVER THE PAGE
       "The screen they asked for still renders behind — blurred, desaturated,
        scrimmed, exactly as under a form panel or a delete dialog — and the
        denial sits over it. A signed-in person who mistyped a URL is never
        shown a bare page that implies they're logged out, and the
        surroundings prove they are still where they thought they were."

     SAY WHAT, NOT WHO ELSE
       "'Your role doesn't include this collection' — business language, and
        nothing more. The screen never names which roles do have access, never
        lists what the user is missing, and never shows a code, a '403' or
        'insufficient privileges'. Who can grant it is a person to ask, not a
        permission map."

     ONE WAY OUT: BACK, IN PAPER
       "The only button is Back, because the user chose where they were going
        and we don't reroute them somewhere else. Back, Cancel and Discard are
        never mango — retreating is not the primary action, even when it is
        the only one on screen. Beside it, a named person to ask; Request
        sends the ask with the reference, it does not open a mail client."

     THE RAIL SHOWS THE DOOR IT WON'T OPEN
       "Blocked items stay visible in disabled ink rather than disappearing,
        so the workspace doesn't look different to different people."

     DOORS DIFFER
       "In the portal a denial almost always means the record belongs to
        another client, so the copy says 'this isn't in your workspace' and
        points at their own overview. It never names another client."

   HOW THIS IS KEPT DISTINCT FROM 27.21, 27.22 AND 27.23
     · It is the only one of the four that is a LAYER. The other three are
       body swaps inside a frame that stays; this one leaves the requested
       screen drawn underneath and puts a dialog over it.
     · It is the only one that names a PERSON who can grant it, and the only
       one with a Request control and a reference.
     · It carries NO mango at all — not even the moved case 27.23 allows.
     · It never states a record number as its subject and never says what
       happened to anything. 27.23 says what happened; this says who to ask.

   THE ONE AUTHORISED BLUR — AND THE FIGURES ARE THE ARTIFACT'S OWN.
   Nothing else in the kit blurs. The `behind` node is blurred, desaturated
   and made inert (`aria-hidden`, `pointer-events-none`); the scrim is
   `Dialog`'s own, so it is "exactly as under a form panel or a delete
   dialog". T3B-1 logged the radius and the saturation as unstated and this
   file derived both; the 2026-08-22 extract STATES them — 27.7 and 27.2 draw
   the page behind with `filter: blur(2.5px) saturate(.82); opacity: .5`, and
   27.2's prose spells it out: "blurred 2.5px, desaturated and dropped to
   half opacity". The derivations (`--space-1`, `saturate-50`, full opacity)
   are gone; the drawn values ship. T3B-1 is closed by the artifact itself.

   WHAT THE ARTIFACT ACTUALLY DRAWS, TRANSCRIBED OFF p22
   The card opens on a **poppy-dot chip reading `No access`** in the quiet
   fill — not an uppercase eyebrow, and the words "No access" are not the
   headline. Under it the headline IS the sentence, "This collection isn't
   part of your role.", at the modal's title step. Then the paragraph, with
   the member's name in medium. Then a **nested soft-paper well** holding the
   label "Who can grant it" in sentence case over an avatar row — `AC`,
   "Member name · workspace owner", and `Request` as bare bold type at the
   trailing end, no pill. Then the card's own footer line: `Reference 4182-AC`
   at the reading start, a paper `Back` pill at the end, facing each other.
   The narrow render drops the well's label and the reference and takes Back
   to the full measure; everything else is the desktop card, shorter.

   Five of those were wrong until 2026-08-24 and are recorded in
   GAPS-KIT-F.md as AD-1 … AD-5.

   THE LAW THIS FILE OBEYS
   · NO CODE, EVER. There is no "403" in this file and no prop that can carry
     a status. `reference` is a support reference the artifact draws, not an
     error code.
   · NO MANGO. Back is `secondary`, Request is `secondary`. The chapter says
     retreating is never the primary action even when it is the only one.
   · THE PAGE BEHIND IS REAL. `behind` takes the actual screen. Passing
     nothing draws nothing behind, which is honest — never a fake page.
   · EVERY STRING IS A PROP with a default.
   · No CSS `border`, no px, no literal colour, no illustration.
   · Focus is one global rule. Dark is a token flip.

   RENDERING CONTEXT
   `"use client"`. Radix `Dialog`, and both controls carry handlers.
   ========================================================================= */

import * as React from "react";

import { ActionRow } from "../../components/action-row/action-row";
import { Avatar, AvatarFallback } from "../../components/avatar/avatar";
import { Badge } from "../../components/badge/badge";
import { Button } from "../../components/button/button";
import { Card } from "../../components/card/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/dialog/dialog";
import { Hint, Text } from "../../components/typography/typography";

/** Which door. The portal never names another client. */
export type AccessDeniedDoor = "system" | "portal";

/** The person who can grant it. A person to ask, never a permission map. */
export interface AccessGrantor {
  /** Their name. */
  name: string;
  /** What they are, in business language — "workspace owner". */
  role: string;
  /** Two characters, ruling 30's law for the fallback. */
  initials: string;
}

/** Every user-facing string on this screen. */
export interface AccessDeniedLabels {
  /**
   * NO LONGER DRAWN. The artifact's denial card opens on the chip, not on an
   * eyebrow; the "Collection" micro line this used to print is nowhere on
   * either render. Kept because removing a field from an exported interface
   * is an API change and two applications import this type — the removal is
   * written out in GAPS-KIT-F.md as **API-F1** and belongs to the next
   * release rather than to a fidelity pass.
   *
   * @deprecated Nothing renders this.
   */
  eyebrow: string;
  /** The chip over the headline. Poppy dot, quiet fill, sentence case. */
  title: string;
  /** THE HEADLINE. One sentence, at the modal's title step. */
  lead: string;
  /** The paragraph. Desktop wording. */
  body: string;
  /** The paragraph below `sm`, which the artifact shortens. */
  bodyNarrow: string;
  /** The label over the grantor. */
  grantorLabel: string;
  /** The grantor's role below `sm`, which the artifact shortens. */
  grantorRoleNarrow: string;
  /** Sends the ask with the reference. It does not open a mail client. */
  request: string;
  /** The words before the reference. */
  referenceLabel: string;
  /** The only way out. Paper. */
  back: string;
}

const SYSTEM_LABELS: AccessDeniedLabels = {
  eyebrow: "Collection",
  title: "No access",
  lead: "This collection isn't part of your role.",
  body:
    "You're signed in as Member name, and your role doesn't include this collection. Nothing is wrong with the link — it simply isn't yours to open.",
  bodyNarrow: "Your role doesn't include this collection.",
  grantorLabel: "Who can grant it",
  grantorRoleNarrow: "owner",
  request: "Request",
  referenceLabel: "Reference",
  back: "Back",
};

/* 27.7 doors differ, verbatim: "In the portal a denial almost always means the
   record belongs to another client, so the copy says 'this isn't in your
   workspace' and points at their own overview. It never names another
   client." */
const PORTAL_LABELS: AccessDeniedLabels = {
  ...SYSTEM_LABELS,
  lead: "This isn't in your workspace.",
  body:
    "It isn't one of your requests. Nothing is wrong with the link — it simply isn't yours to open.",
  bodyNarrow: "It isn't one of your requests.",
  back: "Back to your overview",
};

const DEFAULT_GRANTOR: AccessGrantor = {
  name: "Member name",
  role: "workspace owner",
  initials: "AC",
};

export interface AccessDeniedScreenProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  /** Which door. */
  door?: AccessDeniedDoor;
  /** Per-locale words. */
  labels?: Partial<AccessDeniedLabels>;
  /**
   * The screen they asked for. Rendered behind, blurred, desaturated and
   * inert. Undefined draws nothing behind — never an invented page.
   */
  behind?: React.ReactNode;
  /**
   * The person to ask.
   *
   * DEFAULTS TO THE KIT'S SPECIMEN, and `null` is the opt-out — the same
   * shape `ScreenShell` uses for `rail`, and for the same reason: a screen
   * handed nothing should still draw as a screen, and an application that
   * genuinely has nobody to name needs a way to say so.
   *
   * IT SAID `Undefined draws no grantor block at all` FOR AS LONG AS IT HAS
   * EXISTED AND IT NEVER DID. The default below made the documented empty
   * register (state 7) unreachable, so an application that supplied no
   * grantor shipped "Member name · workspace owner" — an invented person —
   * to a real reader on a real denial, which is exactly what state 7 says is
   * worse than none. `null` is now that state, and the words are true.
   */
  grantor?: AccessGrantor | null;
  /**
   * The support reference the Request carries. `null` draws no reference —
   * for a product that has no support-reference concept, which otherwise got
   * the specimen "4182-AC" printed at a reader who can do nothing with it.
   * The footnote's slot stays, so the way out stays at the row's end.
   */
  reference?: string | null;
  /** Whether the denial is up. Controlled so a router can own it. */
  open?: boolean;
  /** The denial closed — the reader pressed Back. */
  onOpenChange?: (open: boolean) => void;
  /** Send the ask, with the reference. Never opens a mail client. */
  onRequest?: () => void;
  /** The only way out. */
  onBack?: () => void;
}

/**
 * A denial, over the page it denies.
 *
 * TEN STATES
 *  1. default        — the dialog over the blurred, desaturated, scrimmed
 *                      page.
 *  2. hover          — owned by the two Buttons.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once.
 *                      Radix moves focus into the dialog and traps it.
 *  4. active/pressed — owned by `Button`.
 *  5. disabled       — does not apply. Neither control is ever switched off:
 *                      Back is the way out and Request is the ask.
 *  6. loading        — the Request in flight is `Button loading`, which keeps
 *                      its own fill. Nothing else here waits.
 *  7. empty          — `grantor={null}` renders no grantor block. A denial with
 *                      nobody to ask still says what is out of reach, which
 *                      is the honest picture; an invented name would be
 *                      worse than none.
 *  8. error          — DOES NOT APPLY, and this is the whole point of the
 *                      composition. A denial is not an error and never shows
 *                      a code (27.7). A request that FAILED to send is the
 *                      Button's own business.
 *  9. selected       — does not apply.
 * 10. read-only      — always. Nothing here is editable.
 *
 * NARROW (380px), STATED
 *  · The page behind stays blurred and scrimmed at every width — the point is
 *    that the reader can see they are still where they thought they were, and
 *    that is as true on a phone.
 *  · `DialogContent` is `max-w-full` inside a 24 gutter, so the 460 surface
 *    becomes the width of the phone minus its gutter. Its 32 inset does not
 *    shrink.
 *  · The paragraph swaps to the artifact's shorter narrow wording, and the
 *    grantor's role shortens with it ("owner", not "workspace owner").
 *  · The grantor row and the two controls stack; `ActionRow align="end"`
 *    reverses below `sm` so Back is on top while staying last in the DOM.
 *
 * RTL — LTR only by client ruling.
 */
function AccessDeniedScreen({
  className,
  door = "system",
  labels,
  behind,
  grantor = DEFAULT_GRANTOR,
  reference = "4182-AC",
  /* `null` on either is the opt-out; `undefined` keeps the specimen. */
  open = true,
  onOpenChange,
  onRequest,
  onBack,
  ...props
}: AccessDeniedScreenProps) {
  const words: AccessDeniedLabels = {
    ...(door === "portal" ? PORTAL_LABELS : SYSTEM_LABELS),
    ...labels,
  };

  return (
    <div
      data-slot="access-denied-screen"
      data-door={door}
      className={className}
      {...props}
    >
      {/* THE ONE AUTHORISED BLUR. The requested screen stays drawn behind:
          blurred, desaturated and inert. Nothing else in the kit blurs. */}
      {behind === undefined ? null : (
        <div
          data-slot="access-denied-behind"
          aria-hidden="true"
          /* The artifact's drawn treatment, figure for figure — 27.7/27.2:
             `filter: blur(2.5px) saturate(.82); opacity: .5`. */
          className="pointer-events-none select-none opacity-50 blur-[2.5px] saturate-[.82]"
        >
          {behind}
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-slot="access-denied-dialog"
          /* The only exit is Back. No close chip: 27.7 says "the only button
             is Back", and a second dismissal in the corner would be a way out
             the chapter did not give. */
          showClose={false}
          /* A denial cannot be dismissed by pressing past it or by Escape —
             the reader has to take the one route the screen offers. */
          onEscapeKeyDown={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
        >
          {/* `pe-0` — `DialogHeader` reserves the close chip's lane, and this
              dialog has no close chip (`showClose={false}`). The artifact's
              headline runs the card's full measure. */}
          <DialogHeader className="pe-0">
            {/* THE CHIP, AND IT IS THE FIRST THING ON THE CARD. The artifact
                draws `No access` as a poppy-dot chip in the quiet fill, above
                the headline — not as the headline and not as an uppercase
                eyebrow. The dot is the kit's own status dot
                (`--dot-status`, the drawing `tiles.tsx` already ships); the
                pill is `Badge` in its quiet variant, because a poppy FILL
                here would read as a destructive action and a denial is not
                one. `--fg` on the label, so the word carries and only the dot
                is poppy. */}
            <Badge
              data-slot="access-denied-chip"
              className="self-start gap-[var(--space-1h)]"
            >
              <span
                aria-hidden="true"
                className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
              />
              {words.title}
            </Badge>
            {/* THE HEADLINE IS THE SENTENCE. The artifact sets "This
                collection isn't part of your role." at the modal's title step
                and the chip above it at 12; the two used to be swapped. It is
                also the right accessible name for the dialog — a screen
                reader hears what is out of reach, not the word "No access". */}
            <DialogTitle>{words.lead}</DialogTitle>
            {/* Business language, and nothing more. No role list, no code.
                One description node, two wordings — Radix names the dialog
                from this element and two of them would leave the tree
                describing the hidden one. */}
            <DialogDescription>
              <span className="hidden sm:inline">{words.body}</span>
              <span className="sm:hidden">{words.bodyNarrow}</span>
            </DialogDescription>
          </DialogHeader>

          {/* `undefined` never reaches here — the destructure defaults it to
              the specimen — so `null` is what the opt-out has to be read on.
              `undefined` is kept in the test anyway: it is the honest reading
              of "there is nobody to name", and a later commit that drops the
              default should not have to remember to come back here. */}
          {grantor === null || grantor === undefined ? null : (
            /* THE NESTED WELL. The artifact draws the grantor inside a well
               on the modal, not bare on it: `DialogContent` is `--popover`
               (off-beige) and law 3 alternates the tone on nesting, so the
               well is soft paper — `Card`'s default. `variant="well"` is
               chapter 13's grey wash and would put a cool block on a warm
               card. The inset is 16 rather than `CardContent`'s 24, which is
               a page inset and swallows a 32-tall row. */
            <Card
              data-slot="access-denied-grantor"
              className="mt-6 gap-3 p-[var(--space-4)]"
            >
              {/* Sentence case, at the caption step. The artifact does not
                  small-cap this label, and narrow drops it with the
                  reference — the row says who it is on its own. */}
              <Hint className="hidden sm:block">{words.grantorLabel}</Hint>
              <div className="flex flex-wrap items-center gap-3">
                {/* MANGO, AND IT IS A MARK. The artifact draws this avatar in
                    the brand fill on both renders; the build had it on the
                    card's own paper, which is `Avatar`'s default and reads as
                    a hole rather than a person. Override 17 settles that it
                    is legal here — "one mango per screen counts ACTIONS, not
                    objects" — and this screen's two actions, Request and
                    Back, are both paper. The count of mango ACTIONS is still
                    zero. */}
                <Avatar size="md" variant="brand">
                  {/* Ruling 30's two-character law governs the fallback;
                      override 8 allows a photograph, which a call site
                      supplies by passing its own `AvatarImage` if it has one. */}
                  <AvatarFallback>{grantor.initials}</AvatarFallback>
                </Avatar>
                <Text as="span" size="sm">
                  {grantor.name}
                  {" · "}
                  <span className="hidden sm:inline">{grantor.role}</span>
                  <span className="sm:hidden">{words.grantorRoleNarrow}</span>
                </Text>
                {/* ONE WORD, NO BUTTON — the artifact draws Request as bare
                    medium-weight type at the end of the row, exactly as 27.5
                    draws Restore, and `link` is the only variant that
                    "occupies no box". A paper pill here put a second standing
                    control beside Back and made the ask look like the way
                    out. Sends the ask with the reference; it does not open a
                    mail client. */}
                <Button
                  variant="link"
                  size="sm"
                  className="ms-auto"
                  onClick={onRequest}
                >
                  {words.request}
                </Button>
              </div>
            </Card>
          )}

          {/* THE FOOTER ROW: the reference at the reading start, the one way
              out at the end. The artifact draws them on one line facing each
              other; the reference used to sit inside the grantor block, which
              read as part of the ask rather than as the card's own footnote.
              `between` is the kit's two-ended row. Narrow drops the reference
              with the well's label and Back takes the full measure. */}
          <ActionRow align="between" className="mt-6 items-center">
            {/* The slot is kept even when there is no reference, so `between`
                still faces the way out at the row's end rather than pulling it
                to the start. Same shape as the narrow render, which hides
                these words and keeps Back where it was. */}
            <Hint className="hidden sm:block">
              {reference === null ? null : (
                <>
                  {words.referenceLabel} {reference}
                </>
              )}
            </Hint>
            {/* ONE WAY OUT, IN PAPER. There is no mango on this screen. */}
            <Button variant="secondary" className="max-sm:w-full" onClick={onBack}>
              {words.back}
            </Button>
          </ActionRow>
        </DialogContent>
      </Dialog>
    </div>
  );
}

AccessDeniedScreen.displayName = "AccessDeniedScreen";

export { AccessDeniedScreen };
