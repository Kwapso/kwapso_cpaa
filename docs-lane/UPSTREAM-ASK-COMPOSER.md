# Upstream ask — `AgentChat`'s composer hides what you typed

**For the kit, not for this repo.** `shared/ui/` is hash-pinned; this is reported
rather than patched. Two of the four faults the owner reported on the assistant panel
are one defect in `components/agent-chat/agent-chat.tsx`, and neither is reachable
from a consuming app: the textarea takes no `className`, no `rows`, no `maxRows`.

## What it does

`agent-chat.tsx:891-908` renders the composer's `Textarea` as:

```
rows={1}
className="min-h-[var(--control-height-dense)] flex-1 resize-none overflow-hidden
           border-0 bg-transparent p-0
           text-caption leading-[var(--leading-normal)]"
```

There is **no auto-grow** anywhere in the file — `grep scrollHeight` finds only the
message-list autoscroll at :646-649 — and the kit's own `Textarea` has none either
(its base is `min-h-[6rem]` + `resize-y`, both overridden here).

## Fault 1 — a long question is invisible, not scrollable

Measured live, at 375, on staging data. 150 characters typed into the composer:

| | |
|---|---|
| box height | **36px**, before and after |
| content height | **106px** |
| `overflow-y` | `hidden` |
| `resize` | `none` |

So **70px of what the person typed is hidden**, and because the overflow is `hidden`
rather than `auto` they cannot scroll to it either. They cannot read the end of their
own sentence before sending it. The owner's words were that the composer "does not
grow"; it is worse than that — it swallows.

## Fault 2 — the placeholder sits high, and it is the same cause

| | |
|---|---|
| box height | 36px (`--control-height-dense`) |
| line height | 21.2px |
| padding | `0` top and bottom (`p-0`) |
| spare space | **14.8px, all of it below the text** |
| to centre one line | 7.4px above and below |

A textarea renders its first line at the top of its box, so a composer sized for
growth but not growing parks its single line high with the slack underneath. The pill
around it is `items-end`, which is the right choice **for a composer that grows** and
is what makes the misalignment visible when it does not.

These are one defect. If the composer grew from its content, both go.

## Recommendation

Grow the textarea to its content between one row and a cap, and switch the overflow
to `auto` at the cap so nothing is ever unreachable:

- a layout effect setting `height` from `scrollHeight`, bounded — the pattern the
  file already uses for the message list; or
- `field-sizing: content` with a `max-h`, which needs no JS where supported.

Either removes the need for `min-h` to carry the single-line height, which is what
puts the placeholder off-centre today.

**Not worked around app-side on purpose.** The only lever from here is a CSS override
reaching into `[data-slot="agent-chat-composer"] textarea`, which is the hand-patching
of another component's internals that R39 and this lane's own instruction forbid — and
it would rot silently the next time the kit touches the composer.
