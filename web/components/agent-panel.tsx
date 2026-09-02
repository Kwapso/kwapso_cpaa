"use client"

// AgentPanel — the app-wide AI co-pilot, anchored as a popover off the
// floating launcher (agent-host.tsx, which owns go() + runAction() + the
// cache, so the agent can drive real screens). Built on the library AgentChat.
//
// This file is the RENDER SHELL only. The whole state machine — the transcript,
// streaming consumption (text deltas / live step rows / the confirm pause /
// terminal settle), per-device + cross-device thread resume, the broken-stream
// re-sync, staged file attachments (the chat import) and the send / confirm /
// new-chat / open-thread actions — lives in web/lib/use-agent-chat.tsx. The
// usage + history dialogs are self-contained components beside this one.
//
// The credit count (free daily + what an admin added) shows in the header. Using the agent needs
// agent:create; the server re-gates every action AS the signed-in user.

import * as React from "react"
import { Check, History, Paperclip, Plus, Sparkles, X } from "@shared/ui/foundations/icons"

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/components/avatar/avatar"
import { Button } from "@shared/ui/components/button/button"
import { Badge } from "@shared/ui/components/badge/badge"
import { Spinner } from "@shared/ui/components/spinner/spinner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@shared/ui/components/tooltip/tooltip"
import { PopoverContent } from "@shared/ui/components/popover/popover"
import { AgentChat } from "@shared/ui/components/agent-chat/agent-chat"
import { Toggle } from "@shared/ui/components/toggle/toggle"

import { SOURCE_CHIPS } from "@shared/knowledge-chips"
import { CollectionRegister } from "@shared/ui/components/collection-frame/collection-frame"
import { RunSteps } from "@shared/ui/components/run-steps/run-steps"
import { Title } from "@shared/ui/components/title/title"
import { cn } from "@shared/ui/lib/utils"

import { AgentHistoryDialog } from "@/components/agent-history-dialog"
import { AssistantLimitNotice } from "@/components/assistant-limit-notice"
import { citationPills, TurnSources } from "@/components/agent-sources"
import { AgentUsageDialog } from "@/components/agent-usage-dialog"
import { useAgentChat, type AgentChatItem } from "@/lib/use-agent-chat"
import { usePermissions } from "@/lib/perms"
import { personInitials } from "@/lib/identity"
import { useLanguage, useT } from "@shared/web/language"
import { formatRelative } from "@shared/web/format"
import type { SessionUser } from "@shared/types"

/** THE CHIP LABELS. Here rather than in `shared/knowledge-chips.ts` because a
 * sentence a person reads is the front door's to say and to translate (R28/R33):
 * a string in `shared/` that no front door said would be an orphan in the
 * catalogue. The KEYS are shared; the words are ours.
 *
 * "App records" and "Knowledge articles" are two words each on purpose — the
 * other four name a service a person already has a word for, and these two do
 * not: "Records" alone reads as a database table, and "Articles" alone reads as
 * something we published. */
function SourceChips({
  sources,
  onToggle,
  disabled,
}: {
  sources: string[]
  onToggle: (key: string) => void
  disabled?: boolean
}) {
  const t = useT()
  // THE SERVICE'S OWN NAME, not the bare word. "Drive" alone is already in this
  // app's catalogue as a disk drive ("Laufwerk", "Unidad"), and "Mail" and
  // "Chat" are common nouns a translator will faithfully translate — so a chip
  // reading "Drive" would have said "Laufwerk" to a German reader and meant
  // Google Drive. `Gmail` and `Google Chat` are already in the catalogue,
  // correctly untranslated; `Google Drive` joins them for the same reason.
  const LABEL: Record<string, string> = {
    meetings: t("Meetings"),
    mail: t("Gmail"),
    drive: t("Google Drive"),
    chat: t("Google Chat"),
    records: t("App records"),
    articles: t("Knowledge articles"),
  }
  return (
    <div className="flex flex-col gap-1 px-1">
      {/* A VISIBLE caption, not just the group's aria-label — the owner saw
       * this row on staging with no other context ("i dont understand what
       * this black pills with sources are"): `aria-label` names the group for
       * a screen reader but renders nothing a sighted person can read, so the
       * row looked like unlabelled buttons. Styled like the app's other small
       * section captions (e.g. `google-connections.tsx`'s `t("Google")`
       * heading). */}
      <span className="text-muted-foreground text-micro uppercase mt-2">{t("Reading from")}</span>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("Which sources the assistant reads")}
      >
        {SOURCE_CHIPS.map((chip) => {
          const on = sources.includes(chip.key)
          return (
            <Toggle
              key={chip.key}
              size="sm"
              variant="outline"
              pressed={on}
              disabled={disabled}
              onPressedChange={() => onToggle(chip.key)}
              aria-label={LABEL[chip.key] ?? chip.key}
            >
              {LABEL[chip.key] ?? chip.key}
            </Toggle>
          )
        })}
      </div>
    </div>
  )
}

export function AgentPanel({
  teamId,
  user,
  open,
}: {
  teamId: string | null
  /** The signed-in member — item 6 (owner, 31 Aug 2026): "for my messages I
   * need to see my user avatar". Passed down rather than re-read here because
   * agent-host.tsx already holds it (`useActiveTeam()`), and a second
   * subscription to the same session cache would answer the identical
   * question a second time. */
  user: SessionUser | null
  open: boolean
  // NO `onOpenChange` any more (ITEM 1, 31 Aug 2026) — this component had
  // exactly one use for it, the header's own ✕, which is gone outright: the
  // launcher already toggles open/closed (agent-host.tsx) and Escape /
  // outside-click still close a Popover unassisted. `open` stays (still
  // drives `useAgentChat`'s resume-on-open and the composer autofocus
  // effect); the setter that closed it does not.
}) {
  const { t, lang } = useLanguage()
  const attachInputRef = React.useRef<HTMLInputElement>(null)
  const { can } = usePermissions(teamId)
  const canUse = can("agent", "create")

  const chat = useAgentChat(teamId, open, canUse)
  const [usageOpen, setUsageOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Hand focus to the composer once the popover has animated in — Radix
  // focuses the PANEL by default, so keystrokes hit it (and paint a focus
  // ring around the whole bubble) instead of the message box. Best-effort: if
  // the textarea isn't there (no rights), nothing happens.
  React.useEffect(() => {
    if (!open || !canUse) return
    const id = setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(".agent-chat-host textarea")?.focus()
    }, 120)
    return () => clearTimeout(id)
  }, [open, canUse])

  // A "PUNCHED THROUGH" RING (owner, 1 Sep 2026, on last round's avatars:
  // stronger contrast in light mode). The kit already draws exactly this
  // ring for the same reason on `AvatarPresence` and `AvatarStack` —
  // `shadow-[0_0_0_var(--avatar-ring)_var(--background)]`, a 2.5px ring in
  // the GROUND tone, "so it reads as punched through the mark rather than
  // laid on it" (avatar.tsx's own words) — reached here directly rather than
  // re-invented, because a round mark sitting flush against a bubble that is
  // now genuinely close to it in tone (item 1's beige, `--surface-quiet`) is
  // exactly the case that ring exists for: light mode's beige-on-white is a
  // visibly weaker edge than dark mode's near-black-on-charcoal, so the ring
  // is what restores a crisp boundary in the palette that needed it, without
  // a second, mode-specific override.
  const AVATAR_RING = "shadow-[0_0_0_var(--avatar-ring)_var(--background)]"

  // ITEM 6, THE ASSISTANT'S OWN SIDE — round (item 6: "avatars are always
  // round"), the kit's brand fill, its own Sparkles mark: the same glyph the
  // launcher and `AssistantMark` already draw, just carried on `Avatar`
  // instead of a square record-mark, because the kit's own ruling 30 ("square
  // for a THING, pill for a person") is a KIT design law, not a Law of the
  // Base — and the owner, today, is asking for this one call site to read as
  // a face rather than a record mark. `Avatar`'s own default shape is
  // already `pill` (round); nothing here overrides it.
  const assistantAvatar = (
    <Avatar size="sm" variant="brand" className={AVATAR_RING}>
      <AvatarFallback>
        <Sparkles className="size-3" aria-hidden />
      </AvatarFallback>
    </Avatar>
  )
  // ITEM 6, YOUR OWN SIDE — the same `Avatar` the profile menu already draws
  // (app-shell.tsx's `ProfileMenu`): a photograph if there is one, else your
  // initials. Left `undefined` with no signed-in user, which is the kit's own
  // "nothing invented" behaviour for a missing avatar.
  const userAvatar = user ? (
    <Avatar size="sm" className={AVATAR_RING}>
      {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback>{personInitials(user.firstName, user.lastName)}</AvatarFallback>
    </Avatar>
  ) : undefined

  // ITEM 7, TAKEN FURTHER THREE TIMES NOW (owner: 31 Aug "on top of the
  // bubble", then 1 Sep "make it eyebrow and aligned to right on my messages
  // and to left on the assistant's. a bit more space… currently its
  // overlapping", then the client's screenshot of the LOADING turn: a small
  // mango avatar beside "jus / t / no / w" — "just now" wrapping one letter
  // at a time down the panel, and a request that the label move BELOW the
  // bubble instead of above it, with the avatar riding the TOP of a tall,
  // multi-line bubble rather than its full-height centre.
  //
  // ROOT CAUSE OF THE LETTER-WRAP, FOUND ON THE PENDING TURN SPECIFICALLY:
  // the label used to be `inset-x-0` — STRETCHED to the width of its
  // positioned ancestor. That is fine once the bubble holds real words, but
  // the turn that is still waiting for its first token is pushed with
  // `content: ""` (use-agent-chat.tsx's optimistic placeholder), and an
  // empty box has nothing to size itself by: absolutely positioned
  // descendants take no part in a box's own width calculation (CSS §10.3.7),
  // so the bubble collapsed to its bare `px-4`/padding and the label
  // stretched to fit THAT — a container a few pixels wide, which is exactly
  // where "just now" started breaking one character per line. Fixed at the
  // root two ways at once: the label is `whitespace-nowrap` now (its own
  // width, never a container's, so nothing it sits inside can ever pinch it
  // apart) and the pending turn no longer reaches this function at all — see
  // the `messages` filter below, which keeps the empty placeholder out of
  // the rendered list while `AgentChat`'s own `thinking` dots stand in for
  // it instead. Belt and braces: even a short REAL reply can never repeat
  // this now.
  //
  // BELOW, NOT ABOVE. Anchored one level up from before: `relative` moved
  // from the bubble itself to the COLUMN that holds the bubble, its sources
  // and its footnote (the same descendant-selector technique, now
  // `[&_[data-slot=agent-chat-turn]>div]:relative`, below), so `top-full`
  // resolves against the column's own auto height — the bottom of WHATEVER
  // that turn rendered last (a plain reply's bubble, or a cited one's source
  // pills under it) — rather than the bubble alone. A label anchored to the
  // bubble would have sat on top of a citation pill on any turn that carries
  // one; anchored to the column it can't, because an absolutely positioned
  // box takes no part in ITS OWN containing block's height either, so
  // `top-full` always lands past every in-flow sibling, never over one.
  //
  // ALIGNMENT: "right on my messages, left on the assistant's" is now
  // `end-0`/`start-0` (logical, RTL-safe) rather than a full-width
  // `text-align` — the label hugs the edge its bubble already sits on
  // without needing to stretch across it first.
  const eyebrow = (createdAt: string | undefined, role: "user" | "assistant") =>
    createdAt ? (
      <span
        className={cn(
          "absolute top-full mt-1 whitespace-nowrap text-micro tabular-nums text-ink-tertiary",
          role === "user" ? "end-0" : "start-0"
        )}
      >
        {formatRelative(createdAt, t, lang)}
      </span>
    ) : null

  return (
    // ITEM 2 (owner, 31 Aug 2026): "more like a bubble coming out of its
    // button, instead of a slide-in". A `Popover`, anchored to the launcher
    // button in agent-host.tsx (which owns the `Popover` root + trigger, and
    // renders this component as its content) — NOT the kit's own
    // `overlays/assistant.tsx` / `CopilotOverlay`. Checked first, per the law
    // of this change: that composition's own file header names it
    // "CONTRADICTION 1" — chapter 19 calls for a corner-anchored floating
    // card, but what got BUILT, on purpose, "because it is the delivery
    // contract", is a right-hand `Sheet` (`copilot-overlay.tsx` lines ~43-68).
    // Adopting it would trade one slide-in drawer for another, not for a
    // bubble — the one thing this change is asked to fix — while also
    // dropping this app's whole message model (streamed chunks, tool-step
    // rows, R23 citations, staged file attachments) for `CopilotOverlay`'s
    // flat `CopilotMessage` list, which has no concept of any of them. A
    // genuine mismatch, not a missed adoption (COMPOSITION-MISMATCHES.md
    // already carries a `[!]` row for it, on different — and now stale —
    // reasoning: it says this app's panel "is deliberately modal", which is
    // no longer true of this file at all — the panel was already
    // `modal={false}` before this change and stays non-modal now, only on a
    // different primitive. Worth a follow-up correction to that file; out of
    // scope here).
    //
    // So: the kit's own anchored primitive one level down — `Popover`
    // (`components/popover/popover.tsx`, 3 existing call sites) — composed by
    // hand into a chat-sized panel, same as `record-picker.tsx` composes
    // `Popover` + `Command` rather than reaching for a mismatched whole
    // composition. Never modal, never traps focus (Radix's own Popover
    // default — nothing passed here changes it), which is this surface's law
    // regardless of primitive: you can type in a table while the assistant is
    // open.
    //
    // The usage + history dialogs render as SIBLINGS of the popover content
    // (below), not nested inside it — exactly as they were siblings of
    // `SheetContent` before. Radix unmounts a closed overlay's content, so
    // nesting them inside would have closed Usage/History the instant the
    // assistant bubble itself closed, which was never the intent (open Usage
    // from the panel, then dismiss the panel with Escape — Usage stays put).
    <>
    <PopoverContent
      side="top"
      align="end"
      sideOffset={12}
      collisionPadding={16}
      className={
        // ITEM (owner, 1 Sep 2026): "make the assistant as wide as the
        // add/edit [panel]". That panel is `FormShellDialog`'s Sheet
        // (shared/web/form-shell.tsx), fixed the same day to
        // `w-[clamp(26.25rem,34vw,40rem)] max-w-[min(100%,40rem)]` — 420px
        // floor, 34% of the viewport in between, 640px ceiling, with the
        // matching `max-w` so the floor and ceiling never fight on a view
        // narrower than 420px either. Copied verbatim rather than
        // re-derived, so the two surfaces track the SAME number if it ever
        // changes again, not two numbers that happened to agree today.
        "flex w-[clamp(26.25rem,34vw,40rem)] max-w-[min(100%,40rem)] flex-col gap-0 overflow-hidden p-0 " +
        // ITEM 2 (owner, 31 Aug 2026): "make it taller until the top of the
        // page (while keeping its bubble behaviour)". `h-[100dvh]` is
        // deliberately larger than any viewport EVER is — the kit's own
        // `max-h-[var(--radix-popover-content-available-height)]` (from
        // `popover.tsx`'s SURFACE, still applied, untouched by this
        // className) is what actually wins: Radix computes that variable as
        // the real gap between the launcher and the viewport's top edge
        // (minus `collisionPadding`, 16 below), so the panel always grows to
        // fill exactly that space — the top of the page, responsively, on a
        // phone (button at `bottom-20`) and on desktop (`md:bottom-6`) alike
        // — with NO separate breakpoint math to keep in sync with
        // agent-host.tsx's launcher offsets. Still the anchored bubble
        // (`side="top"`), never the old full-width slide-in sheet.
        "h-[100dvh] bg-background " +
        // ITEM 1 (owner, 31 Aug 2026 — the precise repeat of the 28 Aug
        // report, GAPS-A.md OVL-1): "the background of the assistant should
        // be white, and his messages in beige." `--card` and `--popover`
        // (this component's own default ground) are #FFFEF9 in light and
        // #26241F in dark — IDENTICAL to `--background` above, which is why
        // the earlier `bg-surface-panel` patch (still visible in git blame)
        // never really fixed it: `--surface-panel` (#F7F2EB light /
        // #1C1B18 dark) sits only ONE faint step from `--card`, not a
        // genuinely different tone. So: the ground is `bg-background` — the
        // token tokens.css itself calls "the kwapso white" — and every
        // `bg-card` inside this one subtree (the assistant's bubble, its
        // composer pill, a pending confirm step's marker) is repointed, by a
        // LOCALLY SCOPED custom property, at `--surface-quiet` instead:
        // #E2DDD4 light (a real beige, not an off-white) and #3A3833 dark
        // (distinctly lighter than the near-black ground — the dark-mode
        // variation the owner asked for). Still one token each side, per
        // R32 — reassigned for this one surface, not a new colour, and not a
        // change to `--card` anywhere else in the app. Your OWN messages
        // (`bg-surface-inverse`, ruling 36's charcoal-on-light /
        // off-beige-on-dark fill) were never part of this bug — checked: they
        // sit nowhere near the ground tone in either palette.
        //
        // ITEM 3 (owner, 31 Aug 2026): "fix the color of the texts... you
        // invented that color. refer to guide and rules for colors!"
        // `--card-foreground` is set EXPLICITLY here, alongside `--card`,
        // rather than left to inherit — R32's own words, "what a colour
        // MEANS has a token": both halves of this surface's paper/ink pair
        // are now named together in one place instead of one being declared
        // and the other assumed. The VALUE is unchanged (`var(--foreground)`
        // is exactly what `--card-foreground` already resolves to
        // globally — tokens.css line 203 — so no bubble repaints), which is
        // the honest finding after tracing every text colour in this surface
        // back to its source: the assistant's bubble (`text-card-foreground`,
        // agent-chat.tsx's `turnVariants`), the composer's typed text
        // (`text-foreground`, `textarea.tsx`'s own base class, FLD-B5 — "a
        // field flips against its ground exactly as a card does") and your
        // own sent bubble (`text-ink-on-inverse`) all already resolve
        // through real, paired tokens with strong contrast in both palettes
        // — none of them a literal hex or an Un-registered class. The one
        // GENUINE gap found while tracing this: `shared/web/markdown-html.ts`
        // emits bare `<a>`/`<code>`/`<strong>` with no class at all, so a
        // link inside an assistant reply was rendering in the BROWSER'S
        // default blue rather than any app token — fixed in
        // `agent-markdown.tsx`, the one real "invented" (or rather,
        // UN-invented — browser-default) colour this trace turned up.
        "[--card:var(--surface-quiet)] [--card-foreground:var(--foreground)] " +
        // ITEM (owner, 1 Sep 2026): "add a mango soft glow around it (#FED069)
        // so that it sticks more out of the page." #FED069 IS this app's
        // primary token, verbatim — `--kw-mango` (tokens.css line 145,
        // "PRIMARY. A fill, never a data colour."), `--primary` and
        // `--surface-brand` both resolve to it, in EITHER palette (its own
        // comment: "is #FED069 in light and in dark"). So `var(--primary)`
        // reaches it directly rather than the literal hex the owner quoted —
        // R32 by the letter (no hex in this file) and by the point (the
        // colour still MEANS "primary" if that token is ever retuned).
        // `color-mix(in_srgb, var(--primary) 32%, transparent)` is the same
        // technique `sheet.tsx`'s own scrim already uses for a translucent
        // token fill (`color-mix(in_srgb,var(--kw-charcoal)_28%,transparent)`)
        // — reached, not invented. Layered AFTER (not replacing) the kit's
        // own `--shadow-overlay` elevation shadow (`popover.tsx`'s SURFACE,
        // `shadow-xl`): `box-shadow` accepts a comma-separated list, so the
        // panel keeps its normal drop shadow AND gains a soft, wide, low-
        // opacity mango ring around it — a glow, not a hard border (no
        // spread tight enough to read as an edge, no full opacity).
        "shadow-[var(--shadow-overlay),0_0_3rem_0.5rem_color-mix(in_srgb,var(--primary)_32%,transparent)]"
      }
    >
      <div className="flex shrink-0 flex-col gap-[var(--space-2h)] shadow-[var(--hairline-under)] px-4 pt-[var(--space-5)] pb-[var(--space-4h)]">
        {/* ITEM 1 (owner, 31 Aug 2026): "remove the x button on top right (i
            dont need it anymore)". The launcher button itself already toggles
            open/closed (agent-host.tsx, this round's own item 3 fix), and
            Escape / outside-click still close a Popover on their own — a
            second, redundant close control is gone outright, not just hidden.

            ITEM 5 — "put the + and history button... on top next to the
            title assistant... copy the rules for when we put buttons next to
            a title". That rule is a real, unused kit part: `Title`
            (shared/ui/components/title/title.tsx, 0 direct call sites before
            this) — eyebrow/heading on the start, `actions` pushed to the end
            with `ms-auto`, wrapping on a narrow row, exactly the "aligned
            with the title" convention record-chrome.tsx just adopted for
            record detail screens today (override 73 / the 31 Aug refinement).
            `rule={false}` — the heavy hairline `Title` draws under its own
            row would double up with this header block's own
            `shadow-[var(--hairline-under)]` underneath the quota badge.
            `size="h4"` — the "band inside a panel" step (20px), not `h2`'s
            32px page-section size; this is a popover, not a page. */}
        <Title
          as="h2"
          size="h4"
          rule={false}
          actions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setHistoryOpen(true)}
                    disabled={chat.busy}
                    aria-label={t("Past conversations")}
                  >
                    <History className="size-5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("Past conversations")}</TooltipContent>
              </Tooltip>
              {chat.items.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={chat.newChat}
                      disabled={chat.busy}
                      aria-label={t("New chat")}
                    >
                      <Plus className="size-5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("New chat")}</TooltipContent>
                </Tooltip>
              )}
            </>
          }
        >
          {t("Assistant")}
        </Title>
        {/* ITEM 6 — "remove the subtitle... for space purposes". Gone outright
            (not hidden): the vertical room it held goes to the now much
            taller panel (item 2) instead. */}
        {canUse && chat.quotaLabel && (
          <div>
            <button
              type="button"
              onClick={() => setUsageOpen(true)}
              className="rounded-pill"
              title={t("See where your assistant credits went")}
            >
              <Badge
                variant={
                  chat.quota?.blocked
                    ? "destructive"
                    : // NEARLY OUT wears the warning colour — a colour, not a
                      // sentence, so R28 owes nothing. The threshold is the
                      // last handful, not a fraction: 3 is "you will feel this
                      // today", whatever the team's allowance is.
                      chat.quota && !chat.quota.unlimited && chat.quota.remaining <= 3
                      ? "warning"
                      : "secondary"
                }
                className="cursor-pointer text-badge"
              >
                {chat.quotaLabel}
              </Badge>
            </button>
          </div>
        )}
      </div>

      {!canUse ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
          {t("The assistant isn't available for your role here.")}
        </div>
      ) : (
        // agent-chat-host scopes the composer autofocus selector. Dropping files
        // anywhere on the panel stages them for the chat import, same as the
        // composer's own paperclip (library 0.4.0 attach slot).
        //
        // PADDING, REGULARIZED (owner, 1 Sep 2026, round 2 on this: "the
        // padding in the assistant on the sides is excessive. regularize with
        // standardized paddings. also it's missing padding from the bottom.").
        // `CardContent`'s `p-6 lg:p-[var(--space-7)]` (card.tsx) was borrowed
        // for the FIRST padding pass, but that pattern is sized for a page
        // CARD that genuinely widens at the `lg:` breakpoint — this panel
        // never does (`w-[clamp(26.25rem,34vw,40rem)]`, capped at 640px
        // always), so the 32px step was dead weight at best and, once item
        // 1's bubbles started using the FULL width inside it with their own
        // MINIMAL padding, read as an oversized gutter around content that
        // no longer needed one. `px-4` — plain, no responsive escalation — is
        // the flatter, more standard inset for a fixed-width floating panel;
        // AgentChat itself sets no horizontal inset of its own, so this is
        // still the one place the whole conversation's gutter is set.
        // `pb-4` is new: NOTHING below the composer/confirm-panel previously
        // reserved room from the panel's own bottom edge, so with neither an
        // attachment strip nor a pending confirm in view the composer's own
        // pill could sit flush against it — the "missing… padding from the
        // bottom" the owner saw. Three children still carry their own
        // VERTICAL-only inset that would double up on the horizontal if it
        // came back: the attach row's `pb-2`, the confirm panel's `py-4`, and
        // `AssistantLimitNotice`'s own `mb-2`.
        <div
          className="agent-chat-host flex min-h-0 flex-1 flex-col px-4 pb-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void chat.addAttachments(e.dataTransfer.files)
          }}
        >
          {/* WHY IT COULDN'T ANSWER, when the model door was the reason.
              PINNED UNDER THE HEADER, above the conversation — the first
              placement put it under the composer, which on screen reads as a
              note stranded below the input rather than as a status the panel
              is reporting (seen in the browser, 27 Aug 2026; the composer
              belongs to AgentChat, so "above the composer" and "at the bottom
              of the panel" are the same place). It is a fact about the APP,
              not something the assistant said, so it stays outside the
              conversation entirely. Clears the moment the next question is
              asked. */}
          {chat.failure && <AssistantLimitNotice failure={chat.failure} />}

          {/* WHICH DOORS THIS CONVERSATION READS FROM — all on, untick to
              narrow. Control when somebody wants it, and a diagnostic when an
              answer smells wrong: re-ask with one chip on and see which door
              lied.

              UNDER THE HEADER, NOT UNDER THE INPUT, and the owner asked for
              "above the input". Two reasons, and the first is this file's own
              precedent: the limit notice was moved out from under the composer
              on 27 Aug 2026 because the composer belongs to `AgentChat`, so
              "above the composer" and "at the bottom of the panel" are the
              same place — and a row of controls stranded below the input reads
              as an afterthought rather than as the scope the conversation is
              running under. The second is that this IS the conversation's
              scope, not the message's: it is held for the whole thread, so it
              belongs where the thread's other facts are.

              THE LAST CHIP ON STAYS ON — see `toggleSource`: an empty list
              reads as "every door" everywhere behind this, so unticking the
              last one would silently WIDEN the search. */}
          <SourceChips sources={chat.sources} onToggle={chat.toggleSource} disabled={chat.busy} />

          {/* ITEM 4, REVERSED (owner: "right of the send" on 31 Aug, then "move
              the attach button to the left of the send button" on 1 Sep), THEN
              FOUND ACTUALLY OVERLAPPING ON LIVE RENDER (owner, 1 Sep, round 6:
              "13, attach is overlapping, and not fully visible").
              AgentChat's composer is one opaque pill (Textarea + Send) with
              no attach slot to reach INTO — TicketThread already carries
              exactly this feature as a real prop (`onAttach`, a paperclip
              drawn inside its own pill, left of the field); AgentChat has no
              equivalent yet (logged for Aurora — the real fix is that prop,
              mirrored from TicketThread's).
              THE TWO SIDES ARE NOT SYMMETRIC, and that is why this is a
              different reservation, not just a different `end-*` number.
              "Right of Send" could vacate space by pushing the COMPOSER's own
              trailing padding wider (`pe-11` on `agent-chat-composer`), which
              carries Send inward WITH it — Send stayed the last flex child,
              just closer to centre. "Left of Send" must NOT move Send at
              all, so the reservation instead goes on the TEXTAREA itself
              (below): the composer's own edge padding and Send's position are
              both untouched, and the textarea's typed text simply wraps well
              before ITS OWN right edge — which is exactly the strip
              immediately left of Send, since the textarea's right edge IS
              Send's left edge.
              WHY IT OVERLAPPED: Send here is `Button size="sm"` — height
              `--control-height-dense` (32px) but WIDTH is `px-4` (16px) either
              side of the `Send` glyph, NOT a forced square. Measured on an
              actual render (this file's own comment claimed a 32px SQUARE
              Send, copied from a DIFFERENT composer, `copilot-overlay.tsx`'s,
              without checking this one): Send is ~45px wide, so a strip sized
              for a 32px Send left the paperclip's own 32px lapping ~11px into
              it. Re-measured this time, not re-derived: composer `pe-2` (8px)
              + Send's real ~45px + a gap ≈ 60px before Send's own left edge —
              `end-16` (64px) puts the paperclip comfortably past it, and
              `pe-28` (112px) on the textarea clears the paperclip's own 32px
              with room to spare, so typed text never runs under either
              control. `bottom-2` still matches Send's own vertical inset. */}
          <div className="relative min-h-0 flex-1">
            {/* Fill the panel and shed the component's own card chrome (it
             * ships as a standalone fixed-height card) so it reads as one
             * surface, not a card-in-a-card with a double border. The 3-dot
             * indicator shows only in the gap before the first streamed
             * event. */}
            <AgentChat
              className={cn(
                "h-full rounded-none border-0 bg-transparent",
                // ITEM 4's paperclip (see the comment below, over the attach
                // Button) reserves its own strip on the TEXTAREA now, not the
                // composer's edge padding — see that comment for why the two
                // are not interchangeable.
                "[&_[data-slot=agent-chat-composer]_[data-slot=textarea]]:pe-28",
                // ITEM (owner, 1 Sep 2026, on the text-write field
                // specifically): "this is the color of the text write field
                // #F7F2EB (like everywhere else!)". #F7F2EB is `--kw-soft-
                // paper`, which `--surface-panel` (and `--secondary`) already
                // resolve to — the token the recent pill-colour
                // standardisation pass put everywhere else, and the one
                // thing this composer never picked up. The composer pill is
                // `bg-card` (agent-chat.tsx, can't hand-edit), and `--card`
                // is already scoped once for this whole panel, at
                // `--surface-quiet` (item 1's message beige) — redefining it
                // AGAIN there would repaint the message bubbles too, which
                // nobody asked to change. So the redefinition happens one
                // level deeper, ON the composer itself: a CSS custom
                // property set directly on an element always wins over one
                // it would otherwise have inherited from an ancestor,
                // regardless of the ancestor rule's own specificity, so this
                // repoints `--card` to `--surface-panel` for the composer
                // (and only the composer) without touching the outer scope
                // or the bubbles at all. Verified live: computed
                // background-color on the composer pill is `rgb(247, 242,
                // 235)` (#F7F2EB) after this change, was `rgb(226, 221,
                // 212)` (#E2DDD4, the bubble's own tone) before it.
                "[&_[data-slot=agent-chat-composer]]:[--card:var(--surface-panel)]",
                // ITEM (owner, 1 Sep 2026): "make the text full width and add
                // minimum padding around it." Ruling 36's own 62% cap
                // (`max-w-[62%] … max-sm:max-w-[85%]`, agent-chat.tsx) is a
                // TURN-row width, not the bubble's — it caps how much of the
                // panel a message may use at all, which is exactly what the
                // owner is asking to lift: a long reply should wrap at the
                // panel's own width, not one-off at 62% of it. Full-width is
                // an UPPER bound, not a forced stretch: a short "ok" still
                // shrinks to its own text (`min-w-0`, unchanged), nothing
                // about that changed — only the CEILING moved.
                "[&_[data-slot=agent-chat-turn]]:max-w-full",
                // THE BUBBLE, REPOINTED TO MATCH THE COMPOSER (client, 31 Aug
                // 2026, on top of the composer fix a few lines up: "make the
                // message bubble beige too, same as the text field — #F7F2EB").
                // The assistant's bubble is `bg-card` (`turnVariants`, above),
                // and this whole panel already reassigns `--card` to
                // `--surface-quiet` at the OUTER scope (the PopoverContent
                // className above, item 1's fix) — which is exactly why the
                // composer needed its OWN, deeper override to reach
                // `--surface-panel` instead (see that comment for the
                // mechanism: a custom property set directly on an element wins
                // over inheritance regardless of the ancestor rule's
                // specificity). Same technique, applied one scope up: this
                // repoints `--card` to `--surface-panel` for every
                // `[data-slot=agent-chat-turn]` (both roles' turn wrapper),
                // which reaches the assistant's `bg-card` bubble two levels
                // down through ordinary inheritance and touches nothing else
                // that still reads `--surface-quiet` from the outer scope —
                // your OWN bubble (`bg-surface-inverse`, never part of `--card`
                // at all) and the pending-confirm marker (`RunSteps`, a
                // sibling of `AgentChat` outside this subtree) are both
                // untouched, so the turn-to-turn (you vs. the assistant) and
                // bubble-to-confirm-marker distinctions this panel already
                // relies on both survive. Separation from the PANEL's own
                // ground is still a FILL difference, never a stroke (rejected
                // outright by the client the same day, "pills no border!" —
                // see `web/app/layout.tsx`'s hairline comment): the panel
                // itself is `bg-background` (#FFFEF9 light / #141310 dark),
                // one faint step from `--surface-panel` (#F7F2EB /
                // #1C1B18) — the identical gap the composer already stands on,
                // client-approved, so the bubble now reads exactly as
                // legible against the same ground.
                "[&_[data-slot=agent-chat-turn]]:[--card:var(--surface-panel)]",
                // The bubble itself — `turnVariants`' `px-4 py-3` — has no
                // `data-slot` of its own to target directly; it is reached
                // structurally, as "the first DIV inside a turn's own
                // column div" (the sr-only role name before it is a SPAN,
                // so `:first-of-type` on `div` skips it correctly). The
                // MINIMAL padding the owner asked for (`px-4 py-3` →
                // `px-2 py-1.5`) still rides this selector. Logged for
                // Aurora same as the others: a REAL per-bubble className
                // slot on AgentChat would retire this the day it ships.
                "[&_[data-slot=agent-chat-turn]>div>div:first-of-type]:px-2",
                "[&_[data-slot=agent-chat-turn]>div>div:first-of-type]:py-1.5",
                // `relative` moved UP a level, off the bubble and onto the
                // COLUMN that holds it (the bubble, its sources, its
                // footnote) — see the long comment above the `eyebrow`
                // function for why: anchoring the timestamp to the column
                // rather than the bubble is what lets `top-full` clear a
                // turn's sources pills instead of sitting on top of them.
                "[&_[data-slot=agent-chat-turn]>div]:relative",
                // The avatar-to-bubble vertical alignment (top-align a tall,
                // wrapped bubble instead of centring the mark against its
                // full height) is fixed once, for every consumer of the
                // library's chat parts, in shared/web/library-overrides.css
                // — not repeated here as a one-off. See that file for why.
                //
                // ITEM 7's timestamp sits BELOW each bubble rather than above
                // it (see `eyebrow`, above), which is why this can't just be
                // the kit's own 10px turn gap (`--space-2h`) — a turn's own
                // label needs room to clear before the NEXT turn's bubble
                // starts.
                //
                // TOO MUCH BLANK SPACE (client screenshot, 1 Sep 2026): a
                // question, a visible gap, two tool-step pills, another gap,
                // then the answer — `--space-7` (32px) was landed for the
                // eyebrow clearance above and never re-checked against how it
                // reads with the tool-step chips this turn gap also governs
                // (agent-chat.tsx has one `agent-chat-turns` gap for every
                // turn — a real message or a tool-step chip alike), where a
                // 32px gap around a one-line chip reads as dead air rather
                // than structure. MEASURED on this exact conversation shape
                // (question → 2 tool chips → answer), live, via
                // `getBoundingClientRect`: the eyebrow's own box (line-height
                // + its `mt-1`) bottoms out 17px below its turn's own bottom
                // edge, so 32px was carrying 15px more clearance than the
                // label ever needed. `--space-5` (20px) is the nearest named
                // step that still clears it (measured, not assumed: turn
                // bottom 115 + gap 20 = 135, past the eyebrow's own bottom at
                // 132) — tokens.css ruling 28's "above 32px use the named
                // token" doesn't apply below it, but staying on the named
                // ladder rather than an arbitrary `gap-[]` keeps this
                // consistent with every other spacing decision in this file.
                "[&_[data-slot=agent-chat-turns]]:gap-[var(--space-5)]"
              )}
              // ITEM 6 — round marks on both sides (see above); `avatars`
              // stays at the kit's own default (`true`).
              userAvatar={userAvatar}
              assistantAvatar={assistantAvatar}
              // NO `header` any more (ITEM 5, 31 Aug 2026) — History and New
              // chat moved UP to share the panel's own `Title` row, aligned
              // with "Assistant" per the just-established title/actions
              // convention (see the comment above the `Title` element). The
              // kit's own AssistantMark + heading this slot would have drawn
              // are gone with it: the panel's title already names it, once.
              // The kit's chat knows user and assistant; a TOOL STEP renders
              // as a quiet assistant-side chip carrying the step's outcome.
              //
              // THE PENDING REPLY BUBBLE IS DROPPED HERE, NOT RENDERED EMPTY.
              // send()/resolve() (use-agent-chat.tsx) push the next assistant
              // turn optimistically, before anything has arrived, so it can
              // be found and filled the moment text streams in — carrying
              // `content: ""` until then. Rendering that bubble was the
              // whole bug: an empty box has no width of its own to offer the
              // timestamp beneath it (see `eyebrow`'s comment), and a
              // blinking caret with no words to sit after read as nothing
              // happening at all rather than as a reply in progress (the
              // client's own report — no visible sign the assistant was
              // composing). The turn stays IN `chat.items` throughout (the
              // hook still needs it as the target text deltas write into),
              // it just does not reach the kit's render list while it is
              // still empty — `AgentChat`'s own `thinking` state (three
              // breathing dots, its own turn, below) stands in for it
              // instead, which is the state the library actually built for
              // this wait.
              messages={chat.items
                .filter((it) => !(it.role === "assistant" && it.content === ""))
                .map((it: AgentChatItem) => {
                  if (it.role === "tool")
                    return {
                      id: it.id,
                      role: "assistant" as const,
                      content: (
                        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                          {it.status === "pending" ? (
                            <Spinner size="sm" />
                          ) : it.status === "failed" ? (
                            <X className="text-destructive size-3.5" aria-hidden />
                          ) : (
                            <Check className="text-success size-3.5" aria-hidden />
                          )}
                          {it.actionLabel}
                        </span>
                      ),
                    }
                  // WHAT THIS TURN READ (Law R23), in the kit's ruled shape.
                  // `evidence` is app data — a knowledge citation with a kind, a
                  // record path and the passage's own words — and the kit's
                  // `sources` is two names and a link. The mapping is the whole
                  // job of agent-sources.tsx; the numbering is the kit's, derived
                  // from this array's order, so a mark in the prose and the pill
                  // under it cannot disagree.
                  const { evidence, createdAt, ...message } = it
                  const withSources =
                    evidence && teamId ? (
                      <>
                        {message.content}
                        {/* The passages, one press away, INSIDE the turn's own
                            body — see agent-sources.tsx for why it is here
                            rather than in the `actions` slot. */}
                        <TurnSources evidence={evidence} teamId={teamId} />
                      </>
                    ) : (
                      message.content
                    )
                  return {
                    ...message,
                    ...(evidence && teamId ? { sources: citationPills(evidence, t) } : null),
                    content: (
                      <>
                        {eyebrow(createdAt, message.role)}
                        {withSources}
                      </>
                    ),
                  }
                })}
              // The caret at the end of a turn's own words — on once real
              // text is actually arriving, never before (see `streamingReply`
              // in use-agent-chat.tsx: it is the complement of `showTyping`
              // below, specifically so the two can never both point at the
              // same turn — a caret blinking after a tool-step chip's label
              // was the failure mode that made them separate props).
              streaming={chat.streamingReply}
              // NOTHING HAS ARRIVED YET. The kit's own state for this wait —
              // three breathing dots, drawn as their own turn beneath
              // whatever tool steps are already showing — replacing the
              // caret-in-an-empty-bubble that used to be the only sign
              // anything was happening (see the long comment on `messages`,
              // above).
              thinking={chat.showTyping}
              disabled={chat.busy || chat.quota?.blocked || !!chat.pending}
              // THE EMPTY PANEL, THROUGH THE KIT'S OWN REGISTER RATHER THAN A
              // HAND-BUILT BOX.
              //
              // THE OWNER, 26 Aug 2026: "the interface of the chat is still
              // quite wonky and weird, not only when the chat is new but even
              // in an existing chat."
              //
              // The examples were a bare `flex max-w-64 flex-col` — vertically
              // centred by the kit's empty register, horizontally NOT, so two
              // ragged left-aligned lines hung in the middle of an otherwise
              // empty panel with no eyebrow, no measure and no relationship to
              // anything above or below them. It is the one screen state a new
              // person always sees, and it was the one part of this panel the
              // design system had never drawn.
              //
              // `CollectionRegister` is what the kit puts in an empty region
              // everywhere else in the app — eyebrow, centred body, the 40ch
              // measure — so the assistant's blank state now looks like every
              // other blank state instead of like a mistake. Email-free on
              // purpose: an inline address auto-detects on phones and breaks
              // the centred line mid-quote.
              emptyState={
                <CollectionRegister
                  tone="quiet"
                  eyebrow={t("Try asking")}
                  body={t("“Invite a member as a Viewer”, or “what changed this week?”")}
                />
              }
              onSend={(text) => void chat.send(text)}
            />
            <input
              ref={attachInputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,text/csv"
              multiple
              className="hidden"
              onChange={(e) => {
                void chat.addAttachments(e.currentTarget.files)
                e.currentTarget.value = ""
              }}
            />
            {/* THE CHAT IMPORT's launcher, now genuinely IN the composer's own
                row, LEFT of Send (see the long comment above this wrapper for
                why "left" is a different reservation, not just a different
                `end-*`, and why the first numbers overlapped — Send is wider
                than this file assumed). `end-16` clears Send's real ~45px
                width with a gap; `bottom-2` still matches Send's own inset. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Attach a file to import")}
              onClick={() => attachInputRef.current?.click()}
              disabled={chat.busy || !!chat.pending}
              className="absolute end-16 bottom-2 size-8"
            >
              <Paperclip className="size-4" aria-hidden />
            </Button>
          </div>

          {/* Files staged for the next message. A quiet strip under the
              composer rather than a second control beside it — the ICON
              moved to sit with Send (above); the file list itself is
              secondary information, not a control, so it stays out of that
              row. Renders only once something is actually staged. */}
          {chat.attached.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-2">
              {chat.attached.map((f, i) => (
                <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1">
                  {f.name}
                  <button
                    type="button"
                    aria-label={t("Remove attachment")}
                    onClick={() => chat.removeAttachment(i)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* A paused turn: the proposed actions + approve / decline. */}
          {chat.pending && (
            <div className="flex flex-col gap-4 shadow-[var(--hairline-over)] py-4">
              <p className="text-sm font-medium">{t("I'd like to make these changes:")}</p>
              {/* Each step now carries the PAYLOAD under its label (a role's
               * whole access sheet is a dozen lines), so the list scrolls on
               * its own and the two buttons stay where a thumb expects them —
               * a confirm you have to hunt for is nearly as bad as one you
               * can't read. */}
              <div className="max-h-[40vh] min-h-0 overflow-y-auto">
                <RunSteps steps={chat.confirmSteps} />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void chat.resolve(false)}
                  disabled={chat.busy}
                >
                  {t("Not now")}
                </Button>
                <Button size="sm" onClick={() => void chat.resolve(true)} disabled={chat.busy}>
                  {t("Go ahead")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </PopoverContent>

      <AgentUsageDialog open={usageOpen} onOpenChange={setUsageOpen} summary={chat.usageSummary} />
      <AgentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        busy={chat.busy}
        currentThreadId={chat.threadId}
        onPick={(id) => void chat.openThread(id)}
      />
    </>
  )
}
