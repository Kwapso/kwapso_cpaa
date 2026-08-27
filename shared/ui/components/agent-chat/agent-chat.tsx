"use client";

/* ============================================================================
   AgentChat — the assistant conversation, streaming (1 direct call site).

   DESIGN SOURCE
   Kit chapter 20's "The floating layer" block, read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html`. Kept figure for
   figure:

     · the panel head — a 20 mango mark at radius 6, the name at 13 / 500,
                        and a 16×3 pill handle pushed to the inline end
     · a turn         — a `--card` box at radius 24, inset 10/12, a column at
                        gap 5, with the ROLE NAMED above the words at 11.5 in
                        tertiary ink
     · the answer     — 13 / 1.4 in secondary ink
     · the sources    — pills on the panel tone at 11.5, tabular figures
     · the footnote   — 11.5 tertiary, the kit's own English: "Read 4 records
                        · never writes without you"
     · the composer   — a `--card` pill, inset 9/13, ghost text at 12.5

   Motion is `motion/motion.css` §10 ("STREAMING TEXT ARRIVAL"), and its two
   rules are quoted because the second is the one that gets forgotten:

       "(a) EACH ARRIVING CHUNK fades in over --duration-colour with a 4px
            rise. … The component wraps each streamed chunk in an element
            carrying `.motion-stream-chunk`; it must NOT re-render existing
            chunks, or the whole reply re-animates on every token.
        (b) THE CONTAINER MUST NOT ANIMATE ITS OWN HEIGHT while streaming. A
            growing message that eases its height on every chunk fights the
            scroll position and makes the text unreadable."

   Both are obeyed: chunks are keyed by position so React never remounts one,
   and the body carries `.motion-stream-body`, which states `transition:
   none`. The caret is `.motion-stream-caret` and the pre-first-chunk wait is
   three `.motion-thinking-dot`s.

   THE RULINGS THIS FILE IS BOUND BY
   · Ruling 32 — "kwapso ships an assistant, and it reads. Every answer names
     what it read, in words, underneath itself; it never writes without a
     press; and a refusal is a sentence, not an empty panel." All three are
     structural here: `sources` and `footnote` sit UNDER the answer, an
     `actions` slot is the only way a turn can offer to write anything, and a
     refusal is a normal turn carrying a sentence — there is no empty-panel
     branch to fall into.
   · Ruling 33 — "A proposal is not an action … nothing is written until a
     person presses Approve." A turn's `actions` are rendered as controls
     inside the turn, never auto-fired, and `confidence` is carried per source
     so the unsure ones can be surfaced first by the caller.
   · Ruling 31 — the assistant is one of exactly two tenants of the floating
     layer, with no scrim, no blur and no focus trap. That is the SHELL's law
     and the shell is `copilot-overlay`, not this file. This component is the
     conversation and is equally at home in a panel, a sheet or a page.

   OVERRIDE 25 (2026-08-23) — RULING 36 WINS, AND THIS FILE TAKES THE BUBBLE
   Ruling 36, verbatim: "Threads are yours-right on the charcoal fill,
   theirs-left on paper, avatars outside, 62% maximum width." CH20 drew both
   turns as the same `--card` box at full panel width with the role named in
   words above the text, and the build shipped both on purpose — CH20 here,
   ruling 36 in `chat.tsx`. The client ruled for ruling 36, so this file now
   wears the same skin as a person-to-person thread. GAPS-COL1 AC-1 is closed.

   WHAT THAT DECIDED, IN THE CLIENT'S OWN TERMS: the assistant takes the PAPER
   side and YOU take charcoal, so the charcoal fill still means "a person, and
   that person is you". A machine never wears the fill a person wears.

   THE 62% IS A WIDTH, NOT A MEASURE. Ruling 36's cap is 62 PER CENT of the
   thread; `--measure-body` is a character count — 62 when this was written,
   66 since override 31 (2026-08-23), and never the same rule as the per-cent.
   The two numbers used to read alike, which is exactly why the confusion was
   worth writing down; they now do not, and the argument is unchanged. The
   turn column's old
   `lg:max-w-[var(--measure-body)]` is therefore gone — kept beside a 62% cap
   it would have squeezed an answer to about forty characters a line. Whether
   the assistant's turn should ALSO be capped at the reading measure is open
   and unruled; it is logged, not guessed.

   THE ROLE IS STILL NAMED, FOR A SCREEN READER ONLY. Ruling 36 draws no name
   line, so "You" / "Assistant" is `sr-only`. The side and the fill are what a
   sighted reader reads; a screen reader gets the word, because a thread whose
   only signal is a colour would announce two identical paragraphs.

   RENDERING CONTEXT
   `"use client"` — the composer holds state and two handlers created during
   this module's own render.
   ========================================================================= */

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Button } from "../button/button";
import { Skeleton } from "../skeleton/skeleton";
import { Textarea } from "../textarea/textarea";
import { CollectionRegister } from "../collection-frame/collection-frame";
import { CircleStop, Send, Sparkles } from "../../foundations/icons";

const turnVariants = cva(
  [
    // Ruling 36's bubble, and `chat.tsx`'s own: the box radius, the kit's
    // 12/16 inset, caption at prose leading. Identical on purpose — two
    // components drawing one ruling must not drift apart by a pixel.
    "min-w-0 break-words rounded-[var(--radius)] px-4 py-3",
    "text-caption leading-[var(--leading-normal)]",
  ],
  {
    variants: {
      role: {
        /** What you asked. `.kw-msg--mine` — the charcoal fill. Ruling 36. */
        user: "bg-surface-inverse text-ink-on-inverse",
        /** What it answered. `.kw-msg--theirs` — paper. A machine never wears
            the fill a person wears (override 25). */
        assistant: "bg-card text-card-foreground",
      },
      /**
       * The turn failed — the request errored, or the answer was cut off.
       * Poppy ink on the footnote and a poppy dot beside it, never a poppy
       * FILL: a whole red bubble would read as the assistant shouting.
       */
      failed: { true: "", false: "" },
    },
    defaultVariants: { role: "assistant", failed: false },
  },
);

/* ============================================================================
   RULING D7-2 = 2A, 2026-08-24 — THE CITATION FORMAT
   ============================================================================
   CH27's closing paragraph owed "a citation format for assistant answers", and
   `verify/open.html` §C21 said what was missing was not the pill — the pill was
   already drawn — but WHAT A CITATION SAYS: "until the format is ruled, every
   application that wires the assistant will invent its own, and they will not
   match."

   The client ruled `D7-2 numbered`, which is `verify/decide-2.html` §D7's
   proposal 2A, drawn there as:

     · a SUPERSCRIPT MARK where the claim is made — "Three of the four overdue
       invoices are on the Ostwald retainer¹, and the retainer's own cap was
       raised on 12 August²" — at `--text-micro`, weight medium, raised.
     · a NUMBERED PILL under the turn — "1 · Invoices · 4 rows" — the same
       chip the kit already draws, with the number in front.

   and the page's `.ask` fixed the other half in the same breath: "Either way I
   will also fix the pill's TEXT to one shape — `collection · record` — which
   is the half of this that stops every application inventing its own."

   SO THE FORMAT IS A TYPE, NOT A CONVENTION. `label` is GONE. A source is a
   `collection` and a `record`, both required, and the pill renders them in
   that order with the artifact's middot between them. A caller cannot pass a
   sentence, a filename or a URL as "the label" any more, because there is no
   label to pass. That is the whole point of the ruling and a doc comment
   would not have carried it.

   THE NUMBER IS DERIVED, NEVER AUTHORED. It is the source's 1-based position
   in the turn's own `sources` array, so the mark in the prose and the pill
   under it cannot disagree — which is exactly what would happen if a caller
   numbered them by hand and then re-ordered the array.

   `Cite` IS HOW THE PROSE REACHES THE NUMBER. It takes the source's `id`, not
   a number: `<Cite for="s-2" />`. It reads the turn's sources from context and
   renders the mark for whatever position that source is currently in. A `for`
   that names no source of this turn renders NOTHING and warns in development
   — a superscript pointing at a citation that is not underneath the answer is
   worse than no superscript.

   WHAT A SCREEN READER GETS, WHICH IS NOT A BARE NUMBER
   The mark announces "Source 2" rather than "2"; the pill announces "Source 2:
   Ostwald · Retainer" rather than "2 Ostwald Retainer". Both words come from
   `citationLabel`, one prop with one default, because the applications run in
   more than one language. The middots are `aria-hidden` — they are punctuation
   between two named things, not content.

   WHAT WAS DRAWN AND IS DELIBERATELY NOT BUILT
   2A's "Made of" line offers `HoverCard` "for the preview on the pill". The
   drawing shows no preview and the ruling is about what a citation SAYS, so
   the hover card is not built. A pill with an `href` is a link, as before.
   ========================================================================= */

export interface AgentChatSource {
  /** Stable key, and what `Cite for=` names. */
  id: string;
  /**
   * WHAT it read — the collection's own name. The first half of the ruled
   * shape `collection · record`, and never a sentence.
   */
  collection: React.ReactNode;
  /**
   * WHICH part of it — one record's name, or how much of the collection was
   * read ("4 rows"). The second half of the ruled shape. Required: a pill
   * carrying only a collection is the invention this ruling closes.
   */
  record: React.ReactNode;
  /**
   * How sure the assistant is, 0 to 1. Ruling 33 wants a confidence per
   * field where the system guesses; carried here so a caller can order the
   * unsure ones first. Drawn as a quiet suffix, never as a colour — a red
   * source chip would read as an error rather than as a doubt.
   */
  confidence?: number;
  /** Opening it. Given, the chip becomes a real link. */
  href?: string;
}

export interface AgentChatMessage {
  /** Stable key. Never an array index — the conversation appends. */
  id: string;
  /** Who is speaking. The role is NAMED in words above the text (the kit). */
  role: "user" | "assistant";
  /** The whole turn, where it arrived at once. */
  content?: React.ReactNode;
  /**
   * The turn as it streamed, in arrival order. Each entry is wrapped in
   * `.motion-stream-chunk` and keyed by POSITION, so an entry that has
   * already landed is never remounted and never re-animates — motion.css §10
   * rule (a).
   */
  chunks?: React.ReactNode[];
  /** What it read, named in words underneath. Ruling 32. */
  sources?: AgentChatSource[];
  /** The sentence under the sources — the kit's "never writes without you". */
  footnote?: React.ReactNode;
  /**
   * The one press. Ruling 33: nothing is written until a person presses.
   * These are `Button`s, rendered inside the turn and never fired for you.
   */
  actions?: React.ReactNode;
  /** This turn failed or was cut off. Poppy ink on the footnote, and words. */
  failed?: boolean;
}

export interface AgentChatProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "onSubmit" | "onChange"> {
  /** The conversation, OLDEST FIRST. */
  messages?: AgentChatMessage[];

  /**
   * Ruling 36's "avatars outside". The assistant's mark is the kit's own
   * mango square (ruling 30 — the assistant is a thing, not a person); YOURS
   * is whatever `userAvatar` holds, and where a caller supplies none, nothing
   * is drawn on that side rather than a person's initials being invented.
   *
   * WHETHER THE ASSISTANT GETS A MARK AT ALL IS OPEN. C13's own foot says the
   * picture "does not settle whether the assistant gets an avatar" — ruling
   * 36 asks for one, so one is drawn, and `avatars={false}` is the way out
   * until that second question is answered.
   */
  avatars?: boolean;
  /** The mark outside YOUR turn. A node: this panel knows no identity. */
  userAvatar?: React.ReactNode;
  /** Replace the assistant's mango square with something else. */
  assistantAvatar?: React.ReactNode;

  /** Draw the panel head — the mark, the name, and whatever `headerActions` holds. */
  header?: boolean;
  /** What the assistant is called. A prop: the name is copy, not code. */
  heading?: React.ReactNode;
  /** Controls at the inline end of the head — a collapse, a menu, a new-thread. */
  headerActions?: React.ReactNode;

  /**
   * An answer is arriving. The last assistant turn grows the blinking caret
   * and, if `onStop` is given, the send control becomes a stop control.
   */
  streaming?: boolean;
  /** Nothing has arrived yet. Draws the three breathing dots as their own turn. */
  thinking?: boolean;
  /** Stop the answer. Only meaningful while `streaming`. */
  onStop?: () => void;

  /* -- composer ------------------------------------------------------- */
  /** Mount the composer. Off for a transcript. */
  composer?: boolean;
  /** Controlled draft. */
  value?: string;
  /** Uncontrolled starting draft. */
  defaultValue?: string;
  /** Fires on every keystroke. */
  onValueChange?: (value: string) => void;
  /** Fires on send — the control, or Enter without a modifier. */
  onSend?: (value: string) => void;
  /** The composer cannot be typed in. A fill and an ink, never an opacity. */
  disabled?: boolean;
  /** Ghost text. The kit's own English is "Ask about your work". */
  placeholder?: string;

  /* -- strings -------------------------------------------------------- */
  /** What the role line over your turn says. */
  userLabel?: string;
  /** What the role line over its turn says. */
  assistantLabel?: string;
  /** The line before the source chips, for a screen reader and the eye. */
  sourcesLabel?: string;
  /**
   * The word a screen reader hears in front of a citation's number, on the
   * mark in the prose and on the pill under the turn. RULING D7-2: a
   * citation is never announced as a bare number.
   */
  citationLabel?: string;
  /** What a screen reader hears while the three dots breathe. */
  thinkingLabel?: string;
  /** The send control's accessible name. */
  sendLabel?: string;
  /** The stop control's accessible name. */
  stopLabel?: string;
  /** Accessible name for the composer field. */
  composerLabel?: string;
  /** The footnote on a turn that failed, where the caller gives none. */
  failedLabel?: string;

  /* -- registers ------------------------------------------------------ */
  /** The conversation has not arrived. Cold cache only. */
  loading?: boolean;
  /** Loading the conversation failed. Beats `empty`. */
  error?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingLabel?: string;
  emptyLabel?: string;
  emptyBody?: string;
  errorLabel?: string;
  errorBody?: string;
  /** Accessible name for the conversation region. */
  label?: string;
}

/**
 * The assistant's mark, outside its bubble — ruling 36's "avatars outside"
 * and ruling 30's "the assistant is a thing, not a person" at once. A SQUARE
 * at the selection radius, never the round `Avatar` a colleague gets, so the
 * shape says which party is the machine before the fill does. The panel head
 * draws the same mark, from the same function, so the two cannot drift.
 */
function AssistantMark() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-5 shrink-0 place-content-center rounded-[var(--radius-select)]",
        "bg-surface-brand text-ink-on-accent",
      )}
    >
      <Sparkles className="size-3" />
    </span>
  );
}

/**
 * The turn's own sources, so `Cite` can find a source's NUMBER without the
 * caller having to know it. Scoped per turn: two turns each numbered from 1
 * is what the artifact draws, and a document-wide counter would make the
 * fourth answer's first source "9".
 */
const CiteContext = React.createContext<{
  sources: readonly AgentChatSource[];
  label: string;
} | null>(null);

export interface CiteProps extends React.ComponentPropsWithoutRef<"sup"> {
  /** The `id` of a source under this same turn. Never a number. */
  for: string;
}

/**
 * RULING D7-2's superscript. Written inside a turn's `content` or one of its
 * `chunks`, where the claim is made:
 *
 *     content: <>Three of the four overdue invoices are on the Ostwald
 *              retainer<Cite for="s-1" />.</>
 *
 * It renders the source's 1-based position among that turn's `sources`, so
 * the mark and the pill can never disagree. Outside a turn, or naming a
 * source this turn does not carry, it renders nothing and says so in
 * development.
 */
function Cite({ for: id, className, ...props }: CiteProps) {
  const ctx = React.useContext(CiteContext);
  const index = ctx === null ? -1 : ctx.sources.findIndex((source) => source.id === id);

  if (process.env.NODE_ENV !== "production" && index < 0) {
    console.warn(
      ctx === null
        ? `Cite: <Cite for="${id}" /> is outside an AgentChat turn, so it has no sources to number against. Nothing is drawn.`
        : `Cite: this turn carries no source with id "${id}", so there is no pill for the mark to point at. Nothing is drawn.`,
    );
  }
  if (ctx === null || index < 0) return null;

  const number = index + 1;
  return (
    <sup
      data-slot="agent-chat-cite"
      /* The one new thing 2A names, and it is a type step the kit already
         has: `--text-micro`, weight medium, raised. No token is invented. */
      className={cn(
        "align-super text-micro font-[var(--font-weight-medium)] tabular-nums",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{number}</span>
      {/* Not a bare number to a screen reader. */}
      <span className="sr-only">{`${ctx.label} ${number}`}</span>
    </sup>
  );
}

Cite.displayName = "Cite";

/**
 * One source chip, in RULING D7-2's ruled shape: the number, then
 * `collection · record`, then the confidence if there is one.
 *
 * Local; a conversation's parts are not addressable outside.
 */
function SourceChip({
  source,
  number,
  label,
}: {
  source: AgentChatSource;
  number: number;
  label: string;
}) {
  /* The middots are punctuation between two named things, so they are hidden
     and the reader hears "Source 2: Ostwald, Retainer" instead of a string of
     dots. */
  const dot = (
    <span aria-hidden="true" className="shrink-0 text-ink-tertiary">
      ·
    </span>
  );

  const inner = (
    <>
      <span aria-hidden="true" className="shrink-0">
        {number}
      </span>
      <span className="sr-only">{`${label} ${number}: `}</span>
      {dot}
      {/* BOTH HALVES TRUNCATE. A collection called
          "Depot handover, Hafenwerk Logistik, 2026 season" must not push the
          record out of the pill or the pill out of the turn: each half is its
          own `min-w-0` truncating box, the chip is capped at the turn's width,
          and the row wraps. */}
      <span className="min-w-0 truncate">{source.collection}</span>
      {dot}
      <span className="min-w-0 truncate">{source.record}</span>
      {source.confidence === undefined ? null : (
        <span className="shrink-0 text-ink-tertiary tabular-nums">
          {Math.round(source.confidence * 100)}
        </span>
      )}
    </>
  );

  const shape = cn(
    // The kit's chip: the panel tone, pill, 4/10 inset, tabular.
    // `min-w-0` IS LOad-BEARING and is the same defect override 57 wrote up:
    // a flex item's automatic minimum size is its min-content, so `max-w-full`
    // is dropped during intrinsic sizing and never bites. Without it a source
    // whose collection is a long sentence draws a pill wider than the phone
    // and hangs off the edge instead of truncating. Measured at 380: 423.6
    // wide with a right edge at 508.1 before, inside the line after.
    "inline-flex min-w-0 max-w-full items-center gap-1 rounded-pill bg-surface-panel px-[var(--space-2h)] py-1",
    "text-badge tabular-nums text-ink-secondary",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  );

  return source.href ? (
    <a href={source.href} className={cn(shape, "hover:bg-surface-quiet")}>
      {inner}
    </a>
  ) : (
    <span className={shape}>{inner}</span>
  );
}

/**
 * The assistant conversation.
 *
 * TEN STATES
 *  1. default        — a sided thread: your turn right on the charcoal fill,
 *                      its answer left on paper, marks outside, 62% maximum
 *                      width (ruling 36, override 25). Every answer still
 *                      names what it read underneath itself, under the bubble
 *                      and never inside the fill.
 *  2. hover          — a source chip that is a link washes to
 *                      `--surface-quiet`; a bubble does not. A conversation
 *                      whose every turn lit up as you read down it would be
 *                      unreadable, and a bubble is not a target.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the control's own radius. The composer, the send or
 *                      stop control, a source link and every action inside a
 *                      turn are all real controls already.
 *  4. active/pressed — belongs to the controls: the 1-hairline nudge every
 *                      Button carries.
 *  5. disabled       — `disabled` on the composer: the field takes the
 *                      disabled skin and the send control takes
 *                      `--btn-disabled-fill` / `--btn-disabled-label`. A fill
 *                      and an ink. A TURN is never disabled — what was said
 *                      was said.
 *  6. loading        — three genuinely different waits, and conflating them
 *                      is the usual bug:
 *                        · `loading` — the CONVERSATION is arriving from
 *                          storage. Skeleton turns, cold cache only.
 *                        · `thinking` — the request is out and nothing has
 *                          come back. Three breathing dots as their own turn,
 *                          on the skeleton's rhythm, because it is the same
 *                          event: waiting. It sits on the assistant's side,
 *                          in the assistant's bubble, behind the assistant's
 *                          mark — a wait that changed sides would read as a
 *                          second speaker.
 *                        · `streaming` — text is arriving. The caret blinks
 *                          at the end of the last answer; each chunk rises 4
 *                          and fades in once; the body's height is immediate.
 *  7. empty          — no messages: the quiet register, with the composer
 *                      still mounted. Ruling 32's "a refusal is a sentence,
 *                      not an empty panel" applies to a REFUSAL, which is a
 *                      turn carrying a sentence — there is deliberately no
 *                      code path that turns an answer into an empty panel.
 *  8. error          — two. `error` is the conversation failing to load: the
 *                      register, poppy dot, its own wording. `message.failed`
 *                      is one turn failing or being cut off: a poppy dot
 *                      beside the role and poppy ink on the footnote. Never a
 *                      poppy card — the dot names it and the words say it
 *                      (ruling 26).
 *  9. selected       — does not apply. A bubble is not a choice; where a turn
 *                      OFFERS choices they are `actions`, which are Buttons.
 * 10. read-only      — `composer={false}`. Every turn renders unchanged and
 *                      only the way in is gone, which is the honest read-only
 *                      for a transcript.
 *
 * THREE BREAKPOINTS
 *  · mobile (base) — the 62% cap opens to 85%, exactly as `chat.tsx` does it:
 *    at 380 a 62% bubble is about 200px of paper with a mark beside it, which
 *    is four words a line. The composer stays one row with the send control
 *    at the 32 dense height inside a 44 pill, clearing the touch row.
 *  · tablet (`sm:`) — the 62% cap takes over. The conversation inherits its
 *    width from whatever holds it — a floating panel, a sheet, a column — and
 *    a bubble that re-flowed on its own would fight that container.
 *  · desktop — UNCHANGED: 62% of whatever holds it, at every width above
 *    `sm:`. The turn column is NO LONGER capped at `--measure-body`; ruling
 *    36's 62% is a percentage of the thread and the measure is a count of
 *    characters, and stacking the two squeezed an answer to roughly forty
 *    characters a line. Whether the assistant's turn should also obey the
 *    reading measure is open (C15's own foot asks it) and is not guessed
 *    here.
 *
 * RTL — safe, and unused: the system is LTR only. Every inset is logical, the
 * head's controls are pushed with `ms-auto`, and the two sides are `self-end`
 * and `self-start` rather than left and right, so the thread mirrors whole.
 */
const AgentChat = React.forwardRef<HTMLDivElement, AgentChatProps>(
  (
    {
      className,
      messages,
      avatars = true,
      userAvatar,
      assistantAvatar,
      header = false,
      heading,
      headerActions,
      streaming = false,
      thinking = false,
      onStop,
      composer = true,
      value,
      defaultValue,
      onValueChange,
      onSend,
      disabled = false,
      placeholder = "Ask about your work",
      userLabel = "You",
      assistantLabel = "Assistant",
      sourcesLabel = "Read",
      citationLabel = "Source",
      thinkingLabel = "Thinking…",
      sendLabel = "Send",
      stopLabel = "Stop",
      composerLabel = "Message",
      failedLabel = "That answer did not finish.",
      loading = false,
      error = false,
      loadingState,
      emptyState,
      errorState,
      loadingLabel = "Loading conversation…",
      emptyLabel = "Nothing asked yet",
      emptyBody = "Ask a question about what you are looking at.",
      errorLabel = "Conversation unavailable",
      errorBody = "We can’t show this right now. Try again in a moment.",
      label,
      ...props
    },
    ref,
  ) => {
    const list = messages ?? [];

    /* Exclusive states resolved in JS (PATTERN §4): loading beats error beats
       empty. `thinking` is NOT one of these — it is a turn that is added to a
       conversation that already exists, so it lives alongside `default`. */
    const state = loading
      ? "loading"
      : error
        ? "error"
        : list.length === 0 && !thinking
          ? "empty"
          : "default";

    const [draft, setDraft] = React.useState(defaultValue ?? "");
    const text = value ?? draft;

    const write = (next: string) => {
      if (value === undefined) setDraft(next);
      onValueChange?.(next);
    };

    const send = () => {
      if (disabled || streaming) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      onSend?.(trimmed);
      if (value === undefined) setDraft("");
    };

    /* Which turn carries the caret: the last one, and only while streaming. */
    const lastIndex = list.length - 1;

    /* KEEP THE FOOT IN VIEW. A thread that scrolls needs to follow its own
       newest words — and "newest words" is a MUTATION, not a prop: while a
       reply streams, the last message grows without the message count or the
       `streaming` flag changing, so an effect keyed on those fired once and
       then watched 1,700px of answer walk below the fold (measured live,
       26 Aug 2026). So: a new turn snaps to the foot, and a MutationObserver
       follows growth — but only while the reader is already NEAR the foot,
       which is what lets somebody scroll up mid-stream to re-read without
       being dragged back down. Inert in the standalone auto-height card:
       nothing to scroll, no surplus to follow. */
    const turnsRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
      const el = turnsRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      const follow = () => {
        const nearFoot = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        if (nearFoot) el.scrollTop = el.scrollHeight;
      };
      const observer = new MutationObserver(follow);
      observer.observe(el, { childList: true, subtree: true, characterData: true });
      return () => observer.disconnect();
    }, [list.length]);

    return (
      <div
        ref={ref}
        data-slot="agent-chat"
        data-state={state}
        data-streaming={streaming ? "" : undefined}
        aria-busy={loading || undefined}
        aria-label={label}
        /* 10. The artifact's floating panel stacks head / turn / turn /
           composer at `gap: 10px`, and ruling 36's thread gap is
           `.kw-thread` at `--space-2h` — which is what `chat.tsx` and
           `ticket-thread.tsx` already use. This file was the only one at 12. */
        className={cn("flex min-w-0 flex-col gap-[var(--space-2h)]", className)}
        {...props}
      >
        {header ? (
          <div data-slot="agent-chat-header" className="flex min-w-0 items-center gap-[var(--space-2h)]">
            {/* The kit's 20 mango mark at the selection radius — a square is a
                thing, and the assistant is a thing, not a person (ruling 30).
                The same function draws it beside every answer. */}
            <AssistantMark />
            {heading === undefined || heading === null ? null : (
              <span className="min-w-0 truncate text-caption font-[var(--font-weight-medium)]">
                {heading}
              </span>
            )}
            {headerActions ? <div className="ms-auto flex items-center gap-2">{headerActions}</div> : null}
          </div>
        ) : null}

        <div
          ref={turnsRef}
          data-slot="agent-chat-turns"
          /* motion.css §10 rule (b): the container must not animate its own
             height while streaming. `.motion-stream-body` states that. */
          /* No `--measure-body` cap: ruling 36's 62% is the width rule now,
             and the two are different numbers for different things. */
          /* FILL AND SCROLL. In a height-constrained host (the assistant
             slide-in gives this component `h-full`), a column with no growing
             region huddles at the top: empty state and composer pressed under
             the header, a void below, and a LONG thread walking invisibly out
             of the panel with no way to scroll it — the owner's screenshot,
             26 Aug 2026: "the chat function is completely broken". The turns
             region is the part that grows and the part that scrolls, which is
             also what pins the composer to the foot, where a thumb expects
             it. In the standalone auto-height card these three classes are
             inert: no free space to grow into, nothing to scroll. The empty
             register centres in the grown region rather than hanging off the
             header. */
          className={cn(
            "motion-stream-body flex min-w-0 flex-col items-stretch gap-[var(--space-2h)]",
            "min-h-0 flex-1 overflow-y-auto",
            state === "empty" && "justify-center",
          )}
        >
          {state === "loading"
            ? (loadingState ?? <Skeleton variant="text" lines={4} label={loadingLabel} />)
            : null}

          {state === "error"
            ? (errorState ?? (
                <CollectionRegister tone="error" eyebrow={errorLabel} body={errorBody} />
              ))
            : null}

          {state === "empty"
            ? (emptyState ?? (
                <CollectionRegister tone="quiet" eyebrow={emptyLabel} body={emptyBody} />
              ))
            : null}

          {state === "default"
            ? list.map((message, index) => {
                const caret = streaming && index === lastIndex && message.role === "assistant";

                const mine = message.role === "user";

                return (
                  <div
                    key={message.id}
                    data-slot="agent-chat-turn"
                    data-role={message.role}
                    data-side={mine ? "mine" : "theirs"}
                    className={cn(
                      // `.kw-msg` — ruling 36's 62% cap, at every width above
                      // mobile. Below `sm:` it leaves a bubble too narrow to
                      // read, exactly as `chat.tsx` found.
                      "flex max-w-[62%] min-w-0 items-end gap-2 max-sm:max-w-[85%]",
                      mine ? "flex-row-reverse self-end" : "self-start",
                    )}
                  >
                    {avatars ? (
                      <span className="mb-1 flex-none">
                        {mine ? userAvatar : (assistantAvatar ?? <AssistantMark />)}
                      </span>
                    ) : null}

                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-1",
                        mine ? "items-end" : "items-start",
                      )}
                    >
                      {/* Ruling 36 draws no name line. The word survives for a
                          screen reader, which otherwise hears two identical
                          paragraphs and no idea which is the machine. */}
                      <span className="sr-only">{mine ? userLabel : assistantLabel}</span>

                      {/* RULING D7-2 — the turn's own sources, so a `Cite`
                          written into the prose reads its NUMBER from the
                          same array the pills below are drawn from. Scoped to
                          this turn: every answer numbers from 1. */}
                      <CiteContext.Provider
                        value={{ sources: message.sources ?? [], label: citationLabel }}
                      >
                      <div
                        className={cn(turnVariants({ role: message.role, failed: message.failed }))}
                      >
                        {message.chunks
                          ? message.chunks.map((chunk, chunkIndex) => (
                              /* Keyed by POSITION on purpose: an entry that has
                                 already landed keeps its identity and is never
                                 remounted, so it never re-animates. */
                              <span key={chunkIndex} className="motion-stream-chunk">
                                {chunk}
                              </span>
                            ))
                          : message.content}

                        {caret ? (
                          <span
                            aria-hidden="true"
                            /* The one place an opacity is the right tool: it is
                               not a state, it is a cursor. motion.css says so
                               in the same words. */
                            className="motion-stream-caret ms-px inline-block h-[1em] w-[0.0625rem] align-[-0.15em] bg-current"
                          />
                        ) : null}
                      </div>
                      </CiteContext.Provider>

                      {/* Ruling 32: what it read is named UNDERNEATH the
                          answer — so under the bubble, on the bubble's own
                          side, never inside the charcoal fill.
                          RULING D7-2: numbered, in the order they are given,
                          and the number is the position rather than a value
                          the caller wrote down. */}
                      {message.sources?.length ? (
                        <div
                          className={cn(
                            /* `w-full` IS LOAD-BEARING. The column above is
                               `items-start`, so a row without it takes its
                               MAX-CONTENT width and a long citation walks
                               straight out of the bubble — measured at 380:
                               the row 423.6 wide inside a 197.7 column, right
                               edge at 508.1 against a 380 viewport. With it
                               the row is the bubble's width, the chips wrap
                               inside it, and a long collection name truncates
                               where it always should have. `justify-end` still
                               puts your own turn's pills on your side. */
                            "flex w-full min-w-0 flex-wrap items-center gap-1",
                            mine && "justify-end",
                          )}
                        >
                          <span className="sr-only">{sourcesLabel}</span>
                          {message.sources.map((source, sourceIndex) => (
                            <SourceChip
                              key={source.id}
                              source={source}
                              number={sourceIndex + 1}
                              label={citationLabel}
                            />
                          ))}
                        </div>
                      ) : null}

                      {message.footnote !== undefined || message.failed ? (
                        <span
                          className={cn(
                            "flex items-center gap-2 text-badge leading-[var(--leading-normal)]",
                            message.failed ? "text-destructive-ink" : "text-ink-tertiary",
                          )}
                        >
                          {message.failed ? (
                            <span
                              aria-hidden="true"
                              className="size-[var(--dot-status)] shrink-0 rounded-pill bg-destructive"
                            />
                          ) : null}
                          {message.footnote ?? failedLabel}
                        </span>
                      ) : null}

                      {message.actions ? (
                        /* Ruling 33: the press, and nothing happens without it. */
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {message.actions}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            : null}

          {thinking && state === "default" ? (
            <div
              data-slot="agent-chat-thinking"
              data-side="theirs"
              role="status"
              aria-label={thinkingLabel}
              className="flex max-w-[62%] min-w-0 items-end gap-2 self-start max-sm:max-w-[85%]"
            >
              {avatars ? (
                <span className="mb-1 flex-none">{assistantAvatar ?? <AssistantMark />}</span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(turnVariants({ role: "assistant" }), "flex items-center gap-[var(--space-1h)]")}
              >
                <span className="motion-thinking-dot size-[var(--dot-status)] rounded-pill bg-surface-quiet" />
                <span className="motion-thinking-dot size-[var(--dot-status)] rounded-pill bg-surface-quiet" />
                <span className="motion-thinking-dot size-[var(--dot-status)] rounded-pill bg-surface-quiet" />
              </span>
            </div>
          ) : null}
        </div>

        {composer ? (
          <div
            data-slot="agent-chat-composer"
            /* The kit's composer: a paper pill, 8 of inset with 16 at the
               inline start. */
            className="flex min-w-0 items-end gap-2 rounded-pill bg-card ps-4 pe-2 py-2"
          >
            <Textarea
              aria-label={composerLabel}
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              rows={1}
              onChange={(event) => write(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              className={cn(
                "min-h-[var(--control-height-dense)] flex-1 resize-none overflow-hidden",
                "border-0 bg-transparent p-0",
                "text-caption leading-[var(--leading-normal)]",
              )}
            />

            {streaming && onStop ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onStop}
                aria-label={stopLabel}
              >
                <CircleStop aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="inverse"
                size="sm"
                disabled={disabled}
                loading={streaming}
                onClick={send}
                aria-label={sendLabel}
              >
                <Send aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : null}
      </div>
    );
  },
);

AgentChat.displayName = "AgentChat";

export { AgentChat, Cite, turnVariants as agentChatTurnVariants };
