"use client";

/* ============================================================================
   DeleteConfirmationDialog + ArchiveConfirmationDialog — compositions 27.4
   and the second half of 27.5. The one composition that is a modal, and the
   softer dialog that points away from it.

   MISSING UNTIL 2026-08-26. The client's fidelity re-audit against the
   original artifact found that neither dialog was built anywhere: 27.4 is a
   headline specimen ("Deletion is the only irreversible action in either
   door, so it is the only one that stops the page") and archive.tsx's own
   header logged its dialog as ARCH-2, "raised from the row menu of every
   collection rather than from here" — and no file ever raised it. Both are
   drawn here from the artifact's own markup, figure for figure.

   DESIGN SOURCE — "Kwapso UI Kit.dc.html", 27.4 and 27.5.

     27.4's own opening, verbatim:
       "Deletion is the only irreversible action in either door, so it is the
        only one that stops the page. Type delete in the field below to see
        the confirm arm."

     27.4 "The title is the sentence", verbatim:
       "Number, em-separator, record title, question mark. The body then lists
        exactly what goes and what stays, in counts — '14 comments, 3
        attachments', not 'all related data'."

     27.4 "Type-to-confirm above ten", verbatim:
       "A single record deletes on one press. Ten or more, or anything a
        client can see, requires typing the word. The button stays poppy
        throughout — a destructive action is never disguised as a quiet one;
        only the press is gated."

     27.4 "Poppy fill, charcoal label", verbatim:
       "Solid #E94A32 with charcoal type in light, lifted #F2634B in dark.
        Never red text, never a red outline. Keep is the #E2DDD4 quiet fill,
        and the pair follows the one button order the kit uses everywhere:
        context left, Keep then Delete against the right edge, the deciding
        button furthest right."

     27.4 "It offers the softer route", verbatim:
       "Every delete dialog names archive as the alternative, in prose. That
        is why 27.5 exists and why archive is never buried in a menu."

     27.4 narrow, verbatim:
       "Below 720px the dialog becomes a bottom sheet with 24px corners. The
        two buttons share one row, each taking half the width — Keep on the
        left, Delete on the right — exactly as Discard and Save do on a form."

     27.5's archive action, its own caption:
       "The archive action · same dialog contract as delete, softer words."
       And the prose: "Same dialog, same geometry, same button order — the
       words and the fill are what differ. … the confirm is mango rather than
       poppy because the action is reversible. Archiving always records why:
       the reason field is required, the confirm stays in the quiet fill until
       it holds something, and the reason is written into the log and shown on
       the Archived tab."

   ONE CONTRADICTION IN THE ARTIFACT, RESOLVED TOWARD ITS OWN PROSE
   The artifact's interactive script draws the DELETE button in the quiet
   fill until the word is typed (`cpDelBg = cpDelArmed ? 'var(--poppy)' :
   '#E2DDD4'`). Its prose card rules the opposite: "The button stays poppy
   throughout — a destructive action is never disguised as a quiet one; only
   the press is gated." The prose is the sentence that RULES; the script is a
   demo's convenience. Delete therefore keeps `variant="destructive"` at all
   times and the PRESS is gated (`aria-disabled`, click swallowed) until the
   word matches. ARCHIVE has no such prose and its script and prose agree, so
   its confirm genuinely swaps fills: quiet until the reason holds something,
   mango after — which is also why archiving is visibly the softer act.

   THE LAW THIS FILE OBEYS
   · LAW 5 — NAME THE RECORD. The title is assembled "Delete 4182 — Record
     title goes here?"; "Delete this item?" is not a kwapso dialog.
   · ONE BUTTON ORDER. Context (the hint) left, Keep, then the deciding
     button furthest right. `AlertDialogFooter` already draws it.
   · THE MODAL IS THE KIT'S ONE MODAL. `AlertDialog` — no close chip, no
     dismiss-on-scrim, Escape routes to Keep. Below 45rem it is the kit's
     bottom sheet (ruling W1's side rule and 27.4's own narrow render).
   · NEVER RED TEXT, NEVER A RED OUTLINE. The destructive fill comes whole
     from `buttonVariants({ variant: "destructive" })`.
   · EVERY STRING IS A PROP with the artifact's drawn value as its default.

   RENDERING CONTEXT
   `"use client"`. Controlled/uncontrolled confirm text, a media query hook.
   ========================================================================= */

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/alert-dialog/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/sheet/sheet";
import { Button } from "../../components/button/button";
import { Field } from "../../components/field/field";
import { Input } from "../../components/input/input";
import { Hint } from "../../components/typography/typography";

/* 27.4: "Below 720px the dialog becomes a bottom sheet." 45rem is 720 at the
   16px authoring base — the same query every other layered surface uses. */
const NARROW_QUERY = "(min-width: 45rem)";

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readWidth(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(NARROW_QUERY).matches;
}

function useHasRoom(): boolean {
  return React.useSyncExternalStore(subscribeToWidth, readWidth, () => true);
}

/** Every user-facing string the delete dialog owns. */
export interface DeleteConfirmationLabels {
  /** The verb that opens the title sentence. */
  verb: string;
  /** The field's label, around the word. "Type delete to confirm." */
  confirmPrefix: string;
  confirmSuffix: string;
  /** The field's placeholder — the word itself. */
  confirmPlaceholder: string;
  /** The context line while the press is gated. */
  hintUnarmed: string;
  /** The context line once the word matches. The artifact draws "Armed". */
  hintArmed: string;
  /** The answer that walks away. */
  keep: string;
  /** The answer that commits. */
  confirm: string;
}

const DELETE_LABELS: DeleteConfirmationLabels = {
  verb: "Delete",
  confirmPrefix: "Type",
  confirmSuffix: "to confirm",
  confirmPlaceholder: "delete",
  hintUnarmed: "Type the word to arm",
  hintArmed: "Armed",
  keep: "Keep",
  confirm: "Delete",
};

export interface DeleteConfirmationDialogProps {
  /** Whether the dialog is up. */
  open: boolean;
  /** Keep, Escape, or (on the narrow sheet) the scrim. */
  onOpenChange: (open: boolean) => void;

  /** The record's number. Law 5: the title names the record. */
  recordNumber: React.ReactNode;
  /** The record's title. */
  recordTitle: React.ReactNode;

  /**
   * What goes and what stays, IN COUNTS, and the archive alternative in
   * prose — 27.4 requires both. The default is the artifact's own sentence.
   */
  body?: React.ReactNode;
  /** The narrow sheet's shorter sentence, per the artifact's own render. */
  bodyNarrow?: React.ReactNode;

  /**
   * The word that arms the press. 27.4: "A single record deletes on one
   * press. Ten or more, or anything a client can see, requires typing the
   * word." Pass `null` for the one-press case — the field and the hint are
   * then not drawn at all. Defaults to the artifact's "delete".
   */
  confirmWord?: string | null;

  /** The press that deletes. Never called while the press is gated. */
  onConfirm?: () => void;
  /** Merged over the artifact's own strings. */
  labels?: Partial<DeleteConfirmationLabels>;
}

/**
 * 27.4 — the one composition that is a modal.
 *
 * TEN STATES
 *  1. default        — title naming the record, the counts, the word field,
 *                      hint · Keep · poppy Delete.
 *  2. hover          — the two answers', from `Button`'s skin.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once;
 *                      Radix parks initial focus on Keep.
 *  4. active/pressed — the answers' own 1-hairline nudge.
 *  5. disabled       — THE GATED PRESS, and it is deliberately NOT chapter
 *                      10's disabled skin: the button stays poppy throughout
 *                      (27.4's own prose) and only the press is swallowed,
 *                      said in words beside it ("Type the word to arm").
 *  6. loading        — a committing delete keeps its question; show the wait
 *                      on the answer via `onConfirm` upstream.
 *  7. empty          — the unarmed field IS the resting drawing.
 *  8. error          — does not apply; a refused delete is reported by the
 *                      caller, never by recolouring this frame.
 *  9. selected       — does not apply.
 * 10. read-only      — does not apply. A reader who may not delete is never
 *                      shown this dialog (ch24.6 hides, it does not dim).
 *
 * THREE BREAKPOINTS
 *  · below 45rem — the kit's bottom sheet, 24px top corners, the two answers
 *    sharing one row at half width each, Keep leading, Delete trailing.
 *  · 45rem and up — the kit's 460 modal, centred, no close chip.
 *
 * RTL — LTR only by client ruling; every inset here is logical.
 */
function DeleteConfirmationDialog({
  open,
  onOpenChange,
  recordNumber,
  recordTitle,
  body = (
    <>
      This removes the record, its 14 comments and its 3 attachments. Anything
      already invoiced against it stays. There is no undo — archive it instead
      if you only want it out of the way.
    </>
  ),
  bodyNarrow = <>Removes the record and everything filed under it. No undo.</>,
  confirmWord = "delete",
  onConfirm,
  labels,
}: DeleteConfirmationDialogProps) {
  const words: DeleteConfirmationLabels = { ...DELETE_LABELS, ...labels };
  const hasRoom = useHasRoom();
  const [typed, setTyped] = React.useState("");

  /* Re-arm from scratch every time the dialog opens. */
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const gated = confirmWord !== null && confirmWord !== undefined;
  const armed = !gated || typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  /* The title IS the sentence: number, em-separator, record title, question
     mark. The number keeps its tabular figures, as the artifact draws it. */
  const title = (
    <>
      {words.verb} <span className="tabular-nums">{recordNumber}</span> — {recordTitle}?
    </>
  );

  const field = !gated ? null : (
    <Field
      label={
        <>
          {words.confirmPrefix}{" "}
          <span className="font-[var(--font-weight-medium)]">{confirmWord}</span>{" "}
          {words.confirmSuffix}
        </>
      }
    >
      {(control) => (
        <Input
          {...control}
          value={typed}
          placeholder={words.confirmPlaceholder}
          autoComplete="off"
          onChange={(event) => setTyped(event.currentTarget.value)}
        />
      )}
    </Field>
  );

  const hint = !gated ? null : (
    /* The context, left of the answers, per the one button order. It states
       the gate's condition in words, which is why the gate needs no tooltip. */
    <Hint as="span" aria-live="polite" className="sm:me-auto">
      {armed ? words.hintArmed : words.hintUnarmed}
    </Hint>
  );

  if (!hasRoom) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" data-slot="delete-confirmation" data-width="narrow">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{bodyNarrow}</SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-4)]">
            {field}
            {hint}
          </div>
          {/* "The two buttons share one row, each taking half the width —
              Keep on the left, Delete on the right." */}
          <SheetFooter className="grid grid-cols-2 gap-2">
            <Button variant="cancel" onClick={() => onOpenChange(false)}>
              {words.keep}
            </Button>
            <Button
              variant="destructive"
              aria-disabled={armed ? undefined : true}
              onClick={() => {
                if (!armed) return;
                onConfirm?.();
              }}
            >
              {words.confirm}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-slot="delete-confirmation" data-width="wide">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {field === null ? null : <div className="mt-[var(--space-4)]">{field}</div>}
        <AlertDialogFooter>
          {hint}
          <AlertDialogCancel>{words.keep}</AlertDialogCancel>
          {/* Poppy THROUGHOUT; only the press is gated. Radix closes on
              Action click, so the swallow has to preventDefault. */}
          <AlertDialogAction
            variant="destructive"
            aria-disabled={armed ? undefined : true}
            onClick={(event) => {
              if (!armed) {
                event.preventDefault();
                return;
              }
              onConfirm?.();
            }}
          >
            {words.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

DeleteConfirmationDialog.displayName = "DeleteConfirmationDialog";

/* ----------------------------------------------------------------------------
   ArchiveConfirmationDialog — 27.5's dialog. Same contract, softer words.
   ------------------------------------------------------------------------- */

/** Every user-facing string the archive dialog owns. */
export interface ArchiveConfirmationLabels {
  verb: string;
  /** The required reason's label. */
  reasonLabel: string;
  /** Its placeholder — the artifact's own example reason. */
  reasonPlaceholder: string;
  /** The context line while the confirm is still quiet. */
  hintUnarmed: string;
  /** The context line once the reason holds something. */
  hintArmed: string;
  keep: string;
  confirm: string;
}

const ARCHIVE_LABELS: ArchiveConfirmationLabels = {
  verb: "Archive",
  reasonLabel: "Why is it being archived?",
  reasonPlaceholder: "Superseded by 4210",
  hintUnarmed: "A reason is required",
  hintArmed: "Reason recorded with the record",
  keep: "Keep",
  confirm: "Archive",
};

export interface ArchiveConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Law 5 again: the title names the record. */
  recordNumber: React.ReactNode;
  recordTitle: React.ReactNode;
  /** What leaves and what stays. The default is the artifact's own sentence. */
  body?: React.ReactNode;
  /** The narrow sheet's shorter sentence. */
  bodyNarrow?: React.ReactNode;
  /** The press that archives. Called with the reason; never while unarmed. */
  onConfirm?: (reason: string) => void;
  labels?: Partial<ArchiveConfirmationLabels>;
}

/**
 * The softer dialog the delete dialog points at.
 *
 * TEN STATES — as the delete dialog's, with one difference stated: the
 * confirm genuinely swaps fills. Quiet (`cancel`'s skin) until the reason
 * holds something, mango after — the artifact's own script (`cpArchArmed =
 * reason.trim().length >= 3`) and its prose agree here, and the swap is what
 * makes archiving visibly the reversible act. The reason is written into the
 * log and shown on the Archived tab; the caller receives it in `onConfirm`.
 *
 * THREE BREAKPOINTS / RTL — as the delete dialog's. The narrow sheet is the
 * artifact's own drawing: 24px top corners, a grabber, half-width answers.
 */
function ArchiveConfirmationDialog({
  open,
  onOpenChange,
  recordNumber,
  recordTitle,
  body = (
    <>
      It leaves the collection and stops counting toward the figures. Its 14
      comments, 3 attachments and full history stay, and any member can
      restore it from the Archived tab.
    </>
  ),
  bodyNarrow = <>It leaves the collection and keeps its history. Any member can restore it.</>,
  onConfirm,
  labels,
}: ArchiveConfirmationDialogProps) {
  const words: ArchiveConfirmationLabels = { ...ARCHIVE_LABELS, ...labels };
  const hasRoom = useHasRoom();
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  /* The artifact's own threshold: three characters of reason arm the press. */
  const armed = reason.trim().length >= 3;

  const title = (
    <>
      {words.verb} <span className="tabular-nums">{recordNumber}</span> — {recordTitle}?
    </>
  );

  const field = (
    <Field label={words.reasonLabel}>
      {(control) => (
        <Input
          {...control}
          value={reason}
          placeholder={words.reasonPlaceholder}
          autoComplete="off"
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      )}
    </Field>
  );

  const hint = (
    <Hint as="span" aria-live="polite" className="sm:me-auto">
      {armed ? words.hintArmed : words.hintUnarmed}
    </Hint>
  );

  /* Quiet until the reason holds something, mango after. `cancel` is the
     kit's named quiet-fill button skin — nothing is derived. */
  const confirmVariant = armed ? "default" : "cancel";

  if (!hasRoom) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" data-slot="archive-confirmation" data-width="narrow">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{bodyNarrow}</SheetDescription>
          </SheetHeader>
          <div className="flex min-w-0 flex-col gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-4)]">
            {field}
            {hint}
          </div>
          <SheetFooter className="grid grid-cols-2 gap-2">
            <Button variant="cancel" onClick={() => onOpenChange(false)}>
              {words.keep}
            </Button>
            <Button
              variant={confirmVariant}
              aria-disabled={armed ? undefined : true}
              onClick={() => {
                if (!armed) return;
                onConfirm?.(reason.trim());
              }}
            >
              {words.confirm}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-slot="archive-confirmation" data-width="wide">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="mt-[var(--space-4)]">{field}</div>
        <AlertDialogFooter>
          {hint}
          <AlertDialogCancel>{words.keep}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            aria-disabled={armed ? undefined : true}
            onClick={(event) => {
              if (!armed) {
                event.preventDefault();
                return;
              }
              onConfirm?.(reason.trim());
            }}
          >
            {words.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

ArchiveConfirmationDialog.displayName = "ArchiveConfirmationDialog";

export { ArchiveConfirmationDialog, DeleteConfirmationDialog };
