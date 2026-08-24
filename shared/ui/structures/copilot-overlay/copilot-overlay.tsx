/* ============================================================================
   CopilotOverlay — the floating launcher, the right-hand sheet, and the ring
   it draws round a control it drove.

   DESIGN SOURCE
   Kwapso UI Kit, chapter 19 ("Collection views"), whose tail is "The floating
   layer", plus the three appendix rulings that codify it. What the kit
   actually states, quoted:

     Ruling 31 · The floating layer
       "One corner, one stack — Both tenants live in the same corner and
        stack … The corner is remembered per member, and dragging one drags
        the stack."
       "Both collapse to a mark — The assistant collapses to a 40px mango
        well … Collapsed is the default on a phone, where the stack sits
        above the bottom bar and never over a control."
       "Nothing behind them changes … No scrim, no blur, no page shift, no
        focus trap. If a panel needs the page disabled it is a dialog, not a
        floating thing."
       "Two, and no third — Nothing else in the system may float."
     Ruling 32 · The assistant is admitted, with a boundary
       "It reads and it proposes; every change it could make appears as a chip
        you press."  ·  "a refusal is a sentence, not an empty panel."
     Ruling 33 · A proposal is not an action
       "nothing is written until a person presses Approve."
     Ruling 36 (the thread), already encoded in kwapso-patterns.css:
       .kw-thread   flex column, gap var(--space-2h)
       .kw-msg      flex, gap var(--space-2), align-items flex-end,
                      max-width 62%
       .kw-msg__bubble  radius var(--radius-card),
                      padding var(--space-3) var(--space-4),
                      var(--text-caption) / var(--leading-normal)
       .kw-msg--theirs  align-self flex-start; bubble --surface-raised
       .kw-msg--mine    align-self flex-end, row-reverse;
                      bubble --surface-inverse / --ink-on-inverse
       .kw-msg__receipt --text-micro, --ink-disabled, tabular
     Chapter 19's own strings, used as the defaults below: "Assistant",
       "Reads your workspace", "Ask about your work".
     motion/motion.css §10 — `.motion-stream-chunk`, `.motion-stream-body`,
       `.motion-stream-caret`, `.motion-thinking-dot`. Every moment of a
       streaming reply is already specified there and none is written here.

   ── CONTRADICTION 1, and it is the shape of the whole component ────────────
   THE COMMISSION says (§7): `copilot-overlay` is a "floating launcher,
   right-hand sheet, the ring it draws round a control it drove", and this
   batch's brief says in as many words: "CopilotOverlay composes Sheet and
   Button."
   THE KIT says (ruling 31): the assistant is a corner-anchored floating card
   with "no scrim, no blur, no page shift, no focus trap. If a panel needs the
   page disabled it is a dialog, not a floating thing."
   A Radix-backed `Sheet` is a modal dialog: it renders a scrim and it traps
   focus. So the two cannot both be honoured by one drawing.
   BUILT: the commission's shape, because it is the delivery contract and the
   call sites are written against it — a right-hand `Sheet`.

   RULED 2026-08-22 (1B, verify/assistant-decisions.html): `modal` defaults to
   FALSE. Kit ruling 31 wins over the commission's wording — "no scrim, no
   blur, no page shift, no focus trap … if a panel needs the page disabled it
   is a dialog, not a floating thing". Seen side by side, the modal reading
   makes the assistant impossible to use as an assistant: you cannot look at
   the figure it is talking about. The Sheet SHAPE is kept, so the 1 call site
   and the commission's export survive; only the scrim and the focus trap go.
   Pass `modal` to get the
   live page ruling 31 asks for, as far as the primitive allows, and the scrim
   element is still rendered by `SheetContent`. Logged as GAPS-COL2 CPO-1 with
   both sides named. RECOMMENDATION: rule whether the assistant is a sheet or
   a corner card before the compositions are built, because a screen designed
   around a live page reads differently from one designed around a scrim.

   ── CONTRADICTION 2 · THE RING DOES NOT EXIST ──────────────────────────────
   The kit contains NO post-hoc marker for a control the assistant changed. A
   search of the whole 1.48 MB kit and of every specimen file returns nothing
   for `drove`, `driven`, `assistant-marked`, `trace`, `glow` or `changed-by`;
   every occurrence of `ring` is the keyboard focus ring, the option-card
   selection ring or the avatar-stack ring. The kit's model is entirely
   PRE-commit — a chip you press, a confidence per field, an Approve — and it
   never says what the control looks like afterwards.
   BUILT — and the reasoning is written out because nothing else settles it:
     · It cannot be an OUTLINE. `outline` at an offset is the one global focus
       treatment (tokens.css §8) and a second outline would be indistinguishable
       from focus, on the very control a keyboard reader is about to land on.
     · It cannot be CHARCOAL. The kit's other two rings — "the 2px charcoal
       ring around the card" and the avatar stack's "2px page-tone ring" — are
       both ink, and ink is what focus already is.
     · So it is an INSET ring in MANGO, at 2, following the control's own
       radius. Inset because focus sits outside the border box and this sits
       inside it, so the two can be read at once and never collide. Mango
       because the assistant is the brand tenant on every surface chapter 19
       draws — the 40 mango well, the mango header mark, the mango send
       button — and because the t22-gaps note establishes the precedent in
       words: a mango dot on a row marks a BRAND POSITION, not a status
       colour. A marker saying "the assistant touched this" is a brand
       position too, so it does not breach "mango is never a hover and never
       a status".
     · A MARK NEVER CARRIES MEANING ALONE (ruling 26), so the ring always
       ships with words: `CopilotTouched` renders a visually-hidden sentence
       and points the control at it with `aria-describedby`.
     · PERSISTENCE is not stated either. The default is to PERSIST until the
       call site clears it, because a marker that fades on its own can be
       missed entirely; `clearAfter` takes a number of milliseconds for a call
       site that wants the other behaviour.
   All of it is logged as GAPS-COL2 CPO-2 with a recommendation.

   THE LAW THIS FILE OBEYS
   · IT PROPOSES; IT DOES NOT ACT. Every change is a chip. This component owns
     no control that writes anything, and `onProposalSelect` hands the press
     straight back to the call site.
   · AN ANSWER SAYS WHAT IT WAS BASED ON. Ruling 32. `message.basis` is drawn
     under the bubble in the receipt's own treatment, and it is a slot rather
     than a computed string because only the caller knows the count.
   · A REFUSAL IS A SENTENCE, NOT AN EMPTY PANEL. Ruling 32, verbatim — which
     is why this is the ONE collection in the batch whose error state is NOT
     `.kw-register`. A failed answer is drawn as an assistant message with the
     poppy dot and ink words of chapter 9, inside the thread, with the
     composer still live under it.
   · THE LAUNCHER IS A `Button`. 40, pill, mango fill, charcoal label — which
     is `Button variant="default" size="icon"` exactly. No control is
     hand-rolled here.
   · Focus is ONE global rule (tokens.css §8). Nothing here rings — the
     assistant's own marker is an INSET shadow, which is not an outline and
     cannot be mistaken for one.
   · Disabled is a fill and an ink; every control here is a `Button`.
   · Every user-facing string is a prop with a default.
   · No product vocabulary (commission §11). A reader, an assistant, a
     message, a proposal, a control.

   RENDERING CONTEXT
   `"use client"`. State for the uncontrolled open flag and the composer, an
   effect for the optional marker timeout, and handlers made during render.
   ========================================================================= */

"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../../controls/button/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../controls/sheet/sheet";
import { Sparkles } from "../../icons";

/* ============================================================================
   THE RING
   ========================================================================= */

/**
 * The marker the assistant leaves on a control it changed.
 *
 * Put it on the control itself so it follows the control's OWN radius — a
 * pill rings as a pill, a 24 box rings at 24, exactly as the focus rule does,
 * with no radius prop to get wrong.
 *
 * 2 is `0.125rem`, written in rem because no px may reach a class name. Inset,
 * so it cannot collide with the focus outline sitting 2 outside the same box.
 * Mango, for the reasons argued in this file's header. `transition-shadow` so
 * the marker arrives and leaves on the system's colour clock rather than
 * appearing between two frames.
 */
/* RULED 2026-08-22 (2C, verify/assistant-decisions.html): the control gets NO
   mark. A dot and a sentence sit beneath it instead.

   Three reasons the ring lost. Mango is the brand fill and ruling 26 says it
   is never a status — a ring spent it on one. The inset ring sat exactly
   where the focus ring goes, so a field that was changed AND focused drew
   two. And the kit describes no such treatment anywhere: it was this repo's
   invention, which is the one thing this build is not allowed to do quietly.

   The note is visible text, so it reads for a sighted user and a screen
   reader from the same source, and it needs no colour to work. */
const copilotTouchedClasses = [] as const;

const copilotNoteClasses = [
  "mt-1 inline-flex items-center gap-1",
  "text-micro text-ink-tertiary",
] as const;

/* Ruling 26: "Mango is the brand, not a status." This dot names a state of
   the field — the assistant changed it — so it may not be mango, which is
   what it was. It is the NEUTRAL ink dot instead: charcoal on light,
   off-beige on dark, the same mark `comments.tsx` uses for an unread batch
   and `alert.tsx` for its default variant. Not `--dot-building`: that is the
   "in build" / "with us" stage dot, and ruling 26's dark clause makes it
   charcoal so it can be read against the accent fill of the pill it lives
   in — bare on an unlit panel it would be invisible. The sentence beside
   this dot still carries the meaning; the dot never carries it alone. */
const copilotDotClasses = [
  "size-[var(--dot-status)] shrink-0 rounded-pill bg-foreground",
] as const;

export interface CopilotTouchedProps {
  /**
   * The control the assistant changed. A single element; its `className` is
   * extended, exactly the way `Field` extends the control it wraps, so no
   * wrapper element is added and no layout moves.
   */
  children: React.ReactElement;
  /**
   * Draw the marker. Default `true` — a call site renders this component only
   * when there is something to mark, and the flag exists so the same tree can
   * stay mounted while the marker comes and goes.
   */
  touched?: boolean;
  /**
   * The sentence a screen reader hears for the marked control, joined to it
   * with `aria-describedby`. Ruling 26: the mark never carries meaning alone.
   * Defaulted so no call site can ship a silent marker, and a prop because the
   * apps run in Arabic, Urdu and Persian.
   */
  label?: string;
  /**
   * Clear the marker by itself, after this many milliseconds. Undefined — the
   * default — means it PERSISTS until the call site stops rendering it. The
   * kit states no lifetime at all (GAPS-COL2 CPO-2); persisting is chosen
   * because a marker that vanishes on its own can be missed completely, and
   * the reader can always dismiss it by acting on the control.
   */
  clearAfter?: number;
  /** Fires when `clearAfter` elapses, so a call site can drop its own flag too. */
  onCleared?: () => void;
}

/**
 * Marks a control the assistant drove.
 *
 * TEN STATES — this component draws exactly one thing and most of the ten
 * belong to the control inside it, which is the honest answer rather than an
 * omission.
 *  1. default        — the child, unchanged, plus the neutral status dot and
 *                      the sentence beside it naming why.
 *  2. hover          — the child's. The marker does not respond to a pointer;
 *                      it is a note about the past, not a target.
 *  3. focus-visible  — NOT here, and deliberately kept CLEAR of here:
 *                      tokens.css §8 rings the control from OUTSIDE its border
 *                      box at a 2 offset, and this marker sits INSIDE it, so a
 *                      focused marked control shows both and neither is
 *                      ambiguous.
 *  4. active/pressed — the child's.
 *  5. disabled       — the child's. A marked control that is also disabled
 *                      keeps both: the disabled fill and ink from its own
 *                      skin, and the ring on top, because "the assistant
 *                      changed this" is still true.
 *  6. loading        — the child's.
 *  7. empty          — `touched={false}`: the child renders untouched and no
 *                      description is attached. Prefer nothing.
 *  8. error          — does not apply. The marker states a fact about who
 *                      changed a value, not whether the value is right; an
 *                      invalid marked field draws its own 65% poppy border
 *                      from `input.tsx` and the two do not fight, one being a
 *                      border and one an inset shadow.
 *  9. selected       — does not apply.
 * 10. read-only      — the child's.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The marker is 2 at every width. It
 *  has no layout of its own: it adds no element, no inset and no margin, so
 *  it cannot reflow anything at any width. That is the reason it is an inset
 *  shadow rather than a wrapper with a border.
 *
 * RTL — safe. An inset shadow with no offset is direction-neutral, and the
 * description is joined by id rather than by position.
 */
function CopilotTouched({
  children,
  touched = true,
  label = "Changed by the assistant",
  clearAfter,
  onCleared,
}: CopilotTouchedProps) {
  const describedById = React.useId();
  const [expired, setExpired] = React.useState(false);

  React.useEffect(() => {
    setExpired(false);
    if (!touched || clearAfter === undefined) return;
    const timer = window.setTimeout(() => {
      setExpired(true);
      onCleared?.();
    }, clearAfter);
    return () => {
      window.clearTimeout(timer);
    };
  }, [touched, clearAfter, onCleared]);

  const on = touched && !expired;
  if (!on) return children;

  const childProps = children.props as Record<string, unknown>;
  const described = [childProps["aria-describedby"] as string | undefined, describedById]
    .filter(Boolean)
    .join(" ");

  return (
    <React.Fragment>
      {React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        "data-copilot-touched": "",
        "aria-describedby": described,
        className: cn(childProps.className as string | undefined, copilotTouchedClasses),
      })}
      {/* Visible, not sr-only: the same sentence serves both readers. */}
      <span id={describedById} className={cn(copilotNoteClasses)}>
        <span aria-hidden="true" className={cn(copilotDotClasses)} />
        {label}
      </span>
    </React.Fragment>
  );
}

CopilotTouched.displayName = "CopilotTouched";

/* ============================================================================
   The conversation
   ========================================================================= */

/** One change the assistant could make. Ruling 32: a chip you press. */
export interface CopilotProposal {
  /** Stable key, and the handle `onProposalSelect` is called with. */
  id: string;
  /** The words on the chip. Chapter 19's own are "Open the list", "Draft a nudge". */
  label: React.ReactNode;
  disabled?: boolean;
}

export interface CopilotMessage {
  /** Stable id. The React key. */
  id: string;
  /** Who said it. `reader` is the person; `assistant` is the tenant. */
  from: "reader" | "assistant";
  /** What was said. */
  body: React.ReactNode;
  /**
   * What the answer was based on — ruling 32's "answers state what they were
   * based on". A node rather than a count, because only the caller knows what
   * was read and how to say it in the reader's language.
   */
  basis?: React.ReactNode;
  /** The changes this answer offers. Every one is a chip; none of them acts. */
  proposals?: CopilotProposal[];
  /** The reply is still arriving. Draws the caret motion.css §10 owns. */
  streaming?: boolean;
  /**
   * This answer failed or was refused. Ruling 32: "a refusal is a sentence,
   * not an empty panel", so it is drawn INSIDE the thread as chapter 9's
   * message — a poppy dot and ink words — and not as a register.
   */
  refusal?: React.ReactNode;
  /** A timestamp or a read receipt under the last message. `.kw-msg__receipt`. */
  receipt?: React.ReactNode;
}

/* ============================================================================
   CopilotOverlay
   ========================================================================= */

export interface CopilotOverlayProps {
  /* ---- the panel ---------------------------------------------------------- */
  /** Controlled open flag. */
  open?: boolean;
  /** Uncontrolled starting state. Closed, which is the kit's own default on a phone. */
  defaultOpen?: boolean;
  /** The panel opened or closed. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Which edge the panel is anchored to. `right` — the reading END edge — is
   * the commission's word and the default. Positioned logically by `Sheet`,
   * so it mirrors with the document.
   */
  side?: "left" | "right";
  /**
   * Hold the page while the panel is open. `true` is Radix's own default and
   * what a `Sheet` means. `false` is as close as this component can get to
   * ruling 31's "no page shift, no focus trap" without editing the primitive
   * — see CONTRADICTION 1 in the file header.
   */
  modal?: boolean;
  /** The panel's name. Chapter 19's own word. */
  title?: React.ReactNode;
  /** The line under it. Chapter 19's own words. */
  description?: React.ReactNode;
  /** The close chip's accessible name, passed to `SheetContent`. */
  closeLabel?: string;

  /* ---- the launcher ------------------------------------------------------- */
  /**
   * Draw the floating mark. Default `true`. `false` is for a call site that
   * opens the panel from its own control — a menu row, a keyboard shortcut —
   * and honours ruling 31's "two, and no third" by not adding a second
   * floating thing.
   */
  showLauncher?: boolean;
  /**
   * The launcher's accessible name AND its tooltip text. It has no visible
   * label — it is a 40 mark — so this is the only name it has and it must
   * never be missing.
   */
  launcherLabel?: string;
  /** Replace the glyph inside the launcher. */
  launcherIcon?: React.ReactNode;
  /**
   * Where the launcher sits. `fixed` pins it to the viewport corner, which is
   * what "floating" means and the default. `static` renders it in the flow,
   * for a call site that places the whole stack itself — which is what ruling
   * 31's "the corner is remembered per member, and dragging one drags the
   * stack" will eventually need, and which this component does not implement
   * (GAPS-COL2 CPO-3).
   */
  launcherPosition?: "fixed" | "static";
  /** A count on the launcher — unread answers. A `Badge` from the call site. */
  launcherBadge?: React.ReactNode;

  /* ---- the conversation --------------------------------------------------- */
  /** The thread, oldest first. This component never sorts. */
  messages?: CopilotMessage[];
  /** A proposal chip was pressed. Nothing is written by this component. */
  onProposalSelect?: (proposal: CopilotProposal, message: CopilotMessage) => void;
  /**
   * The one-line note under the whole thread — chapter 19's "it can read, it
   * never writes without you pressing something". A prop with NO default: the
   * boundary it states is the caller's promise to keep, and a component must
   * not put words in their mouth.
   */
  footnote?: React.ReactNode;

  /* ---- the composer ------------------------------------------------------- */
  /** Controlled composer value. */
  value?: string;
  /** Uncontrolled starting value. */
  defaultValue?: string;
  /** The composer changed. */
  onValueChange?: (value: string) => void;
  /** Asked. Called with the text; the composer clears itself when uncontrolled. */
  onAsk?: (value: string) => void;
  /** The composer's placeholder AND its accessible name. Chapter 19's own. */
  composerPlaceholder?: string;
  /** The send control's accessible name. It is a 32 mark with no visible label. */
  sendLabel?: string;
  /** Nothing may be asked. A fill and an ink on the control. */
  disabled?: boolean;

  /* ---- the three states --------------------------------------------------- */
  /**
   * An answer is on its way and no chunk has landed yet. Draws motion.css's
   * three thinking dots — the same rhythm as a skeleton, because it is the
   * same event: waiting.
   */
  thinking?: boolean;
  /** What a screen reader hears while the dots breathe. */
  thinkingLabel?: string;
  /**
   * The whole panel failed — the assistant could not be reached at all. Drawn
   * as a SENTENCE in the thread with chapter 9's poppy dot, never as a
   * register and never as an empty panel: ruling 32 says so in those words.
   */
  error?: React.ReactNode | boolean;
  /** The sentence used when `error` is `true` rather than a node. */
  errorLabel?: string;
  /** The words on a first-run panel with nothing in it yet. */
  emptyLabel?: string;
}

/* ----------------------------------------------------------------------------
   Chapter 9's message, the mark `field.tsx` draws: a 6 poppy dot leading INK
   words. The kit keeps the drawn 6 rather than snapping to `--dot-status`
   (t9-gaps T9-7); kept here so the two do not diverge.
   ------------------------------------------------------------------------- */
function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-caption text-foreground">
      <span aria-hidden="true" className="size-[0.375rem] shrink-0 rounded-pill bg-destructive" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * The assistant's floating layer.
 *
 * TEN STATES
 *  1. default        — the 40 mango mark in the corner; the panel, when open,
 *                      is the system's right-hand drawer with the assistant's
 *                      own head, the thread, and the composer pinned to the
 *                      foot.
 *  2. hover          — the launcher takes `--btn-primary-hover`, which is
 *                      `Button`'s own; the proposal chips take
 *                      `--btn-secondary-hover`; the close chip takes
 *                      `--surface-quiet`, which is `SheetContent`'s. Named
 *                      tokens throughout, never an opacity. A MESSAGE does
 *                      not hover: it is read, not operated.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once, at
 *                      the control's own radius. Radix traps focus inside the
 *                      panel while `modal` — which is the point of
 *                      CONTRADICTION 1.
 *  4. active/pressed — the controls' 1px nudge, `Button`'s own.
 *  5. disabled       — `disabled`: the composer's field takes the disabled ink
 *                      and the send control takes `--btn-disabled-fill` /
 *                      `--btn-disabled-label`. A fill and an ink. A proposal
 *                      chip disables individually. No opacity anywhere.
 *  6. loading        — `thinking`: three dots on motion.css's own rhythm,
 *                      inside an assistant-side bubble so the reply arrives
 *                      where the dots were, with `aria-busy` and a
 *                      translatable label for a screen reader. A streaming
 *                      message adds motion.css's caret. Never a spinner: the
 *                      shape of the answer is known — it is a bubble.
 *  7. empty          — first run: `.kw-empty`, the centred register, with the
 *                      composer still live under it. It is words rather than
 *                      an illustration because the kit has no empty-state
 *                      graphic anywhere, and it is words rather than a blank
 *                      panel because ruling 32 forbids the blank panel.
 *  8. error          — a SENTENCE in the thread: chapter 9's poppy dot and ink
 *                      words, announced as an alert, with the composer still
 *                      live. Ruling 32: "a refusal is a sentence, not an empty
 *                      panel." This is the one collection in the batch that
 *                      does NOT use `.kw-register` for its error state, and
 *                      the kit is the reason.
 *  9. selected       — does not apply to the panel. What IS marked out is a
 *                      CONTROL the assistant drove, and that is
 *                      `CopilotTouched` — a separate export precisely because
 *                      the marked control lives on the page, not in here.
 * 10. read-only      — no `onAsk`: the composer is withdrawn entirely and the
 *                      thread reads. Chapter 9's rule that a system-set value
 *                      loses its box, applied to a whole control.
 *
 * THREE BREAKPOINTS
 *  mobile   — the launcher sits at the corner inset of 20 (`--space-5`), which
 *             is chapter 19's own demo figure and the only number it gives
 *             (GAPS-COL2 CPO-4). The panel is `Sheet`'s `max-w-full`, so the
 *             420 drawer fills a 375 phone and reads as a page — with the head
 *             and the composer fixed and only the thread scrolling, which is
 *             what makes it usable one-handed. The bubbles keep their 62%
 *             maximum from ruling 36; at 375 that is about 220, which is a
 *             readable measure for the caption step and is why the figure is
 *             not widened on small screens.
 *  tablet   — the 420 panel now fits inside the viewport with the page visible
 *             beside it, so it stops being a page and becomes a panel — with
 *             no class changing. `Sheet` argues this at length in its own
 *             breakpoint block and it is inherited, not restated.
 *  desktop  — UNCHANGED. The panel does not widen with the viewport: 420 is
 *             the measure the kit states for a drawer, and a wider assistant
 *             is a worse one. The launcher does not move or grow either.
 *
 * RTL — safe. `Sheet` positions with `start-*` / `end-*` and rounds its inner
 * edge logically, so `side="right"` is the reading END edge in every
 * direction. The launcher is placed with `end-*`, the thread's own sides are
 * `self-start` / `self-end` on the inline axis, and the composer's asymmetric
 * inset is `ps-*` / `pe-*`. Nothing here writes `left`, `right`, `pl-*` or
 * `pr-*`. The one thing that does NOT yet mirror is the drawer's ENTRANCE
 * animation, which motion.css reads as physically left/right — `sheet.tsx`
 * logs that as GAPS-A SHT-1 and it is inherited here.
 */
const CopilotOverlay = React.forwardRef<HTMLButtonElement, CopilotOverlayProps>(
  (
    {
      open,
      defaultOpen = false,
      onOpenChange,
      side = "right",
      modal = false,
      title = "Assistant",
      description = "Reads your workspace",
      closeLabel = "Close",
      showLauncher = true,
      launcherLabel = "Assistant",
      launcherIcon,
      launcherPosition = "fixed",
      launcherBadge,
      messages,
      onProposalSelect,
      footnote,
      value,
      defaultValue = "",
      onValueChange,
      onAsk,
      composerPlaceholder = "Ask about your work",
      sendLabel = "Ask",
      disabled = false,
      thinking = false,
      thinkingLabel = "Thinking",
      error,
      errorLabel = "The assistant could not answer",
      emptyLabel = "Ask a question about what is on this page.",
    },
    ref,
  ) => {
    const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
    const [ownValue, setOwnValue] = React.useState(defaultValue);

    const isOpen = open ?? ownOpen;
    const setOpen = (next: boolean) => {
      if (open === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    };

    const composerValue = value ?? ownValue;
    const setComposerValue = (next: string) => {
      if (value === undefined) setOwnValue(next);
      onValueChange?.(next);
    };

    const ask = () => {
      const trimmed = composerValue.trim();
      if (trimmed.length === 0) return;
      onAsk?.(trimmed);
      if (value === undefined) setOwnValue("");
    };

    const thread = messages ?? [];
    const failed = error !== undefined && error !== null && error !== false && error !== "";
    const failure = typeof error === "boolean" ? errorLabel : error;
    const isEmpty = thread.length === 0 && !thinking && !failed;

    return (
      <Sheet open={isOpen} onOpenChange={setOpen} modal={modal}>
        {showLauncher ? (
          /* The 40 mango well, ruling 31's own words. `Button
             variant="default" size="icon"` IS that — 40 square, pill, mango
             fill, charcoal label, with the kit's hover and pressed tones —
             so nothing is hand-rolled. The elevation is `shadow-lg`, bridged
             to `--shadow-lifted`: the kit states none for the collapsed mark
             (GAPS-COL2 CPO-4) and a floating thing with no shadow at all
             would read as painted onto the page. */
          <div
            data-slot="copilot-launcher"
            className={cn(
              "flex items-center",
              launcherPosition === "fixed" &&
                "fixed bottom-[var(--space-5)] end-[var(--space-5)] z-40",
            )}
          >
            {launcherBadge}
            <Button
              ref={ref}
              type="button"
              size="icon"
              aria-label={launcherLabel}
              aria-expanded={isOpen}
              className="shadow-lg"
              onClick={() => {
                setOpen(!isOpen);
              }}
            >
              {launcherIcon ?? <Sparkles />}
            </Button>
          </div>
        ) : null}

        <SheetContent side={side} closeLabel={closeLabel} className="gap-0">
          <SheetHeader>
            <div className="flex min-w-0 items-center gap-3">
              {/* Chapter 19's header mark: a 26 square at the 6 radius in
                  mango with a charcoal glyph. `--control-height-pill` is 26
                  and `rounded-select` is the 6, so both are tokens. */}
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-[var(--control-height-pill)] shrink-0 place-content-center",
                  "rounded-select bg-primary text-primary-foreground",
                  "[&_svg]:size-[var(--icon-16)]",
                )}
              >
                {launcherIcon ?? <Sparkles />}
              </span>
              <SheetTitle className="min-w-0">{title}</SheetTitle>
            </div>
            {description !== undefined && description !== null ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>

          {/* The thread. This is the one child with no `sheet-*` slot, so
              `SheetContent` gives it the drawer body's inset, its scroll and
              its remaining height — see the note in `sheet.tsx`'s cva. */}
          <div data-slot="copilot-thread" aria-busy={thinking || undefined}>
            {isEmpty ? (
              /* `.kw-empty` — a LEFT-ALIGNED column, --space-2 between its
                 lines, --space-8 / --space-6 inset, tertiary ink at 14. Words,
                 not a blank panel: ruling 32. Left, not centred: 27.21,
                 "left-aligned like everything else" — GAPS-TRACK3C DEF-2. */
              <div className="flex flex-col items-start gap-2 px-6 py-[var(--space-8)] text-start text-sm text-ink-tertiary">
                <span role="status">{emptyLabel}</span>
              </div>
            ) : (
              /* `.kw-thread` — a column at --space-2h. */
              <div className="flex min-w-0 flex-col gap-[var(--space-2h)]">
                {thread.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    onProposalSelect={onProposalSelect}
                  />
                ))}

                {thinking ? (
                  <div className="flex max-w-[62%] flex-col gap-2 self-start">
                    <div className="rounded-[var(--radius)] bg-surface-raised px-4 py-3">
                      {/* motion.css §10 owns the rhythm; this file only draws
                          three 6 dots for it to breathe. */}
                      <span aria-hidden="true" className="flex items-center gap-1">
                        <span className="motion-thinking-dot size-[0.375rem] rounded-pill bg-surface-quiet" />
                        <span className="motion-thinking-dot size-[0.375rem] rounded-pill bg-surface-quiet" />
                        <span className="motion-thinking-dot size-[0.375rem] rounded-pill bg-surface-quiet" />
                      </span>
                      <span className="sr-only" role="status">
                        {thinkingLabel}
                      </span>
                    </div>
                  </div>
                ) : null}

                {failed ? (
                  <div className="max-w-[62%] self-start">
                    <Refusal>{failure}</Refusal>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <SheetFooter className="flex-col items-stretch gap-3 sm:flex-col sm:items-stretch sm:justify-start">
            {onAsk !== undefined ? (
              /* `.kw-composer` — one pill in `--surface-raised` at the
                 8/8/8/16 inset, a BARE field, and a mark to send. The field is
                 bare because the pill around it IS its box; an `Input` here
                 would draw a second pill inside the first, the same doubling
                 `field.tsx` refuses for the textarea counter. */
              <div
                data-slot="copilot-composer"
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-pill bg-surface-raised",
                  "py-2 ps-4 pe-2",
                  disabled && "bg-hair-faint",
                )}
              >
                <input
                  type="text"
                  value={composerValue}
                  placeholder={composerPlaceholder}
                  aria-label={composerPlaceholder}
                  disabled={disabled}
                  onChange={(event) => {
                    setComposerValue(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      ask();
                    }
                  }}
                  className={cn(
                    "min-w-0 flex-1 appearance-none border-0 bg-transparent p-0",
                    "text-caption text-foreground placeholder:text-ink-tertiary",
                    // A fill above, an ink here. Never an opacity.
                    "disabled:cursor-not-allowed disabled:text-ink-disabled",
                  )}
                />
                {/* Chapter 19 draws a 32 mango round send mark. `Button
                    size="sm"` is the 32 and `variant="default"` is the mango;
                    `size-8` squares it, which is the one thing the size
                    variant does not do for a dense control. */}
                <Button
                  type="button"
                  size="sm"
                  aria-label={sendLabel}
                  disabled={disabled || composerValue.trim().length === 0}
                  className="size-[var(--control-height-dense)] shrink-0 p-0"
                  onClick={ask}
                >
                  <Sparkles />
                </Button>
              </div>
            ) : null}

            {footnote !== undefined && footnote !== null ? (
              /* Ruling 32's boundary, in the caller's own words. The micro
                 step in TERTIARY: the artifact's `--fg4` and `--fg3` are the
                 same ink (ruling 27), and CH01 reserves `#a8a59f` for
                 "disabled only — exempt from contrast". A boundary a person
                 has to read is not exempt. */
              <p className="text-micro text-ink-tertiary">{footnote}</p>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  },
);

CopilotOverlay.displayName = "CopilotOverlay";

/* ----------------------------------------------------------------------------
   One message. Local: a bubble outside the thread that decides its side is
   just a box.

   Ruling 36, transcribed: theirs-left on `--surface-raised`, yours-right on
   `--surface-inverse`, 62% maximum width, no tails. The assistant is
   "theirs"; the reader is "mine". `self-start` / `self-end` are on the inline
   axis, so both sides mirror with the document.
   ------------------------------------------------------------------------- */
function Message({
  message,
  onProposalSelect,
}: {
  message: CopilotMessage;
  onProposalSelect?: (proposal: CopilotProposal, message: CopilotMessage) => void;
}) {
  const mine = message.from === "reader";
  const proposals = message.proposals ?? [];

  return (
    <div
      data-slot="copilot-message"
      data-from={message.from}
      className={cn("flex max-w-[62%] flex-col gap-2", mine ? "self-end" : "self-start")}
    >
      <div
        className={cn(
          // `.kw-msg__bubble` — the 24 radius, 12/16 inset, caption at the
          // normal leading. `.motion-stream-body` states, rather than omits,
          // that the container must not animate its own height while text is
          // arriving (motion.css §10b).
          "motion-stream-body rounded-[var(--radius)] px-4 py-3",
          "text-caption leading-[var(--leading-normal)]",
          mine
            ? "bg-surface-inverse text-ink-on-inverse"
            : "bg-surface-raised text-foreground",
        )}
      >
        {/* Each arriving chunk is the caller's own element; this wrapper only
            carries the class motion.css §10a selects on, so a streamed reply
            does not re-animate on every token. */}
        <span className="motion-stream-chunk">{message.body}</span>
        {message.streaming === true ? (
          <span
            aria-hidden="true"
            className="motion-stream-caret ms-1 inline-block h-[1em] w-[0.0625rem] align-[-0.1em] bg-current"
          />
        ) : null}
      </div>

      {message.refusal !== undefined && message.refusal !== null ? (
        <Refusal>{message.refusal}</Refusal>
      ) : null}

      {proposals.length > 0 ? (
        /* Ruling 32: "every change it could make appears as a chip you press".
           A secondary `Button` — the other paper tone — because ruling 33 says
           nothing is written until a person presses, and a mango chip would
           read as the primary action of the whole panel. */
        <div className="flex flex-wrap items-center gap-2">
          {proposals.map((proposal) => (
            <Button
              key={proposal.id}
              type="button"
              variant="secondary"
              size="sm"
              disabled={proposal.disabled}
              onClick={() => {
                onProposalSelect?.(proposal, message);
              }}
            >
              {proposal.label}
            </Button>
          ))}
        </div>
      ) : null}

      {message.basis !== undefined && message.basis !== null ? (
        /* Ruling 32: "answers state what they were based on" — the micro
           step in TERTIARY, tabular so a count does not jitter. The artifact
           draws this line `color: var(--fg3)` in the floating layer's own
           panel ("Read 4 records · never writes without you"). */
        <p className="text-micro tabular-nums text-ink-tertiary">{message.basis}</p>
      ) : null}

      {message.receipt !== undefined && message.receipt !== null ? (
        <p className={cn("text-micro tabular-nums text-ink-tertiary", mine ? "self-end" : "self-start")}>
          {message.receipt}
        </p>
      ) : null}
    </div>
  );
}

export { CopilotOverlay, CopilotTouched, copilotTouchedClasses };
