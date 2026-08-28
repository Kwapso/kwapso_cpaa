"use client";

/* ============================================================================
   Tree — a disclosure outline: groups that fold, children that indent
   (0 direct call sites; built on the client's D12 = "pdf" ruling).

   DESIGN SOURCE
   Kit chapter 18 ("Data display · KPIs · progress · charts · calendar ·
   board"), the block captioned "Tree", read out of
   `Design Mothership/kit-current/Kwapso UI Kit.dc.html` (`treeGroups`) and
   confirmed against page 7 of the client's PDF. Client ruling 2026-08-27 on
   `verify/decide-3.html` §D12: **"pdf"** — build the drawing. That closes
   GAPS-KIT-DE L18-1 ("the chapter draws a disclosure tree … there is no tree
   in components/") and overrules the decide page's own SKIP recommendation.
   Kept figure for figure:

     · the list       — `display: flex; flex-direction: column; gap: 2px;`
     · the group row  — `gap: 10px; padding: 9px 12px; border-radius: 999px;
                         font-size: 13.5px; font-weight: 500; cursor: pointer;`
     · the marker     — the kit's OWN rounded triangle, at 50% opacity:
                        open  `viewBox="0 0 12 8"` at 9x6, pointing down;
                        closed `viewBox="0 0 8 12"` at 6x9, pointing toward
                        the children's indent. A glyph SWAP (the artifact's
                        `sc-if` renders one or the other), not a rotation —
                        and NOT an Iconoir chevron: the drawing has its own
                        marker, so that marker is what is built.
     · the children   — `flex column; gap: 2px; padding-left: 22px;`, rendered
                        only while the group is open (the artifact's `sc-if`),
                        exactly as the Rail's group-collapse mounts and
                        unmounts its rows.
     · the child row  — `gap: 10px; padding: 8px 12px; border-radius: 999px;
                         font-size: 13.5px; color: var(--fg2); cursor: pointer;`
                        behind a 5px `--fg4` dot (`--muted-foreground`, the
                        register's own mapping from decide-3 §D12).
     · hover          — `rgba(26,25,24,.05)` on both row kinds, and the child's
                        ink promotes to `var(--ink)`. That raw rgba IS
                        `--accent`'s exact value in both palettes, so the drawn
                        wash and the system's row wash are one token.
     · the card       — the chapter draws the tree on a soft-paper card
                        (`--sheet` r24/24 with a 13/500 title). A card's ground
                        is the composition's job (PATTERN §11), exactly as
                        `activity-feed` — drawn on the same chapter's card —
                        leaves its card to the caller. This file is the rows.

   Every raw rem below is a drawn figure at the 16-per-rem design scale, named
   at its declaration: the 2 list gap, the 9 and 8 block insets, the 22 indent,
   the 5 dot, the 9x6 / 6x9 marker.

   THE ONE SNAP, SAID OUT LOUD. The drawn type step is 13.5 — a half-step,
   and the half-step snap rule is standing law (D16-SNAP, register row 76,
   ruled 2026-08-27 the same day as D12; written into docs/RULES.md §1.4):
   snap to the nearest ladder step whose ROLE fits, and a control label's
   step is 14. A pressable row is a CONTROL — the same reading
   `accordion.tsx` took for its own 13.5 trigger — so both row kinds take
   `text-sm`; the drawn hierarchy survives in what the drawing actually
   varies — weight (500 group / light child) and ink (primary / `--fg2`).

   THE LAW THIS FILE OBEYS
   · Hover is `--accent`, the neutral wash — which is here not a convention
     but the drawing's own hex. Never `--primary`.
   · Disabled is a fill and an ink (`--btn-disabled-fill` /
     `--btn-disabled-label`), never an opacity, with the hover dropped.
   · The exclusive row states are resolved in JS and emitted as ONE class set
     (PATTERN §4). Precedence: disabled > pressable > default.
   · Only four radii; the row is `--radius-pill`, as drawn.
   · Focus is one global rule (tokens.css §8). Nothing here draws a ring.
   · Open state is the kit's usual pair — uncontrolled with `defaultOpen`,
     controlled with `open` + `onOpenChange` — the same escape hatch
     `Rail.collapsed` cuts, and `aria-expanded` sits on the group row exactly
     as it sits on the rail's group heading.
   · The fold is INSTANT — the artifact's `sc-if` and the rail's
     group-collapse both mount/unmount without a height animation; the
     animated disclosure is `accordion`/`collapsible`, a different object.
   · No product vocabulary: GROUPS holding CHILDREN, and every word in them
     is the caller's — the demo's specimen labels are the artifact's own.

   KEYBOARD — the APG tree pattern, which is why the rows are `role="treeitem"`
   with a roving tabIndex rather than a stack of `<button>`s (a treeitem role
   would erase the button role anyway): one tab stop for the whole outline,
   ArrowUp/ArrowDown through the visible rows, ArrowRight opens a group or
   enters it, ArrowLeft closes a group or returns a child to its parent,
   Home/End to the outline's ends, Enter/Space toggles a group or presses a
   leaf.

   RENDERING CONTEXT
   `"use client"` — the fold state and the roving focus are React state, and
   every row builds a handler during this module's own render (PATTERN §8).
   ========================================================================= */

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

export interface TreeLeaf {
  /** Stable key, unique across the whole tree. Never an array index. */
  id: string;
  /** What the row says. A node, so a count or a code chip can ride inside. */
  label: React.ReactNode;
  /** This row cannot be pressed: a fill and an ink, never an opacity. */
  disabled?: boolean;
}

export interface TreeGroup {
  /** Stable key, unique across the whole tree — and the value `open` holds. */
  id: string;
  /** The group's name — 500, primary ink, behind the marker. */
  label: React.ReactNode;
  /** The indented rows. An empty or absent list opens onto nothing, honestly. */
  children?: readonly TreeLeaf[];
  /** This group cannot fold or unfold: a fill and an ink, never an opacity. */
  disabled?: boolean;
}

export interface TreeProps
  extends Omit<React.ComponentPropsWithoutRef<"ul">, "onSelect"> {
  /** The outline, in order. An empty array renders nothing at all. */
  groups: readonly TreeGroup[];
  /** Controlled: which group ids are open. Beats the self-held state. */
  open?: readonly string[];
  /** Uncontrolled start. The chapter's own drawing opens its first group. */
  defaultOpen?: readonly string[];
  /** Every fold and unfold, with the whole next open set. */
  onOpenChange?: (open: readonly string[]) => void;
  /**
   * Pressing a leaf. Absent, the leaves render as plain rows — no cursor, no
   * hover — because a control that silently does nothing is worse than a
   * label. The groups still fold: disclosure is how an outline is read.
   */
  onSelect?: (leaf: TreeLeaf, group: TreeGroup) => void;
  /** Nothing may be pressed. A fill and an ink on every row. */
  disabled?: boolean;
  /** The outline's accessible name. Defaulted so no call site ships it nameless. */
  label?: string;
}

/* ----------------------------------------------------------------------------
   The row. One cva; the exclusive skins are picked in JS (PATTERN §4):
   disabled > pressable > default.
   ------------------------------------------------------------------------- */
const treeRowVariants = cva(
  [
    "flex w-full min-w-0 items-center text-start",
    // Drawn: `gap: 10px` between marker/dot and label.
    "gap-[var(--space-2h)] rounded-[var(--radius-pill)] px-3",
    // Drawn 13.5, snapped UP to 14 per the half-step role rule — see the
    // header. Both row kinds are controls.
    "text-sm",
    "transition-colors duration-[var(--duration-colour)] ease-kwapso",
  ],
  {
    variants: {
      kind: {
        // Drawn: `padding: 9px 12px; font-weight: 500` — 9 has no ladder step.
        group: "py-[0.5625rem] font-[var(--font-weight-medium)] text-foreground",
        // Drawn: `padding: 8px 12px; color: var(--fg2)`.
        leaf: "py-2 text-ink-secondary",
      },
      state: {
        default: "",
        /* The drawn hover: `rgba(26,25,24,.05)` — which is `--accent`, to the
           digit, in both palettes. The child's drawn hover also promotes its
           ink to `var(--ink)`; harmless on the group, whose ink is already
           primary. */
        pressable: "cursor-pointer hover:bg-accent hover:text-foreground",
        disabled:
          "cursor-not-allowed bg-[var(--btn-disabled-fill)] text-[var(--btn-disabled-label)]",
      },
    },
    defaultVariants: { kind: "group", state: "default" },
  },
);

/* The kit's own marker, both poses — transcribed paths, 50% opacity, drawn
   9x6 open and 6x9 closed. `currentColor`, so the disabled ink carries into
   the marker with no second rule. */
const MarkerOpen = () => (
  <svg
    viewBox="0 0 12 8"
    aria-hidden="true"
    className="h-[0.375rem] w-[0.5625rem] flex-none opacity-50"
  >
    <path
      d="M6,7.6 0.3,0.9 C0.1,0.6 0.3,0.2 0.7,0.2 h10.6 c0.4,0 0.6,0.4 0.4,0.7 Z"
      fill="currentColor"
    />
  </svg>
);

const MarkerClosed = () => (
  <svg
    viewBox="0 0 8 12"
    aria-hidden="true"
    /* Drawn pointing right — toward the side the children indent from. Under
       RTL that side is the other one, so the glyph mirrors; the open marker
       is symmetric and needs nothing. */
    className="h-[0.5625rem] w-[0.375rem] flex-none opacity-50 rtl:-scale-x-100"
  >
    <path
      d="M7.6,6 0.9,11.7 C0.6,11.9 0.2,11.7 0.2,11.3 V0.7 c0,-0.4 0.4,-0.6 0.7,-0.4 Z"
      fill="currentColor"
    />
  </svg>
);

/** One visible row, for the roving focus walk. */
interface FlatRow {
  id: string;
  kind: "group" | "leaf";
  groupId?: string;
}

/**
 * A disclosure outline: groups that fold, indented children behind dots.
 *
 * TEN STATES
 *  1. default        — closed groups behind the kit's side-pointing marker;
 *                      an open group swaps it for the down-pointing one and
 *                      mounts its children, indented the drawn 22 behind the
 *                      drawn 5px dots, the whole list at the drawn 2 of gap.
 *  2. hover          — `--accent` on any operable row — which is the
 *                      artifact's own drawn wash, `rgba(26,25,24,.05)`, not a
 *                      convention applied to it — and the row's ink promotes
 *                      to `--foreground`, the child's drawn hover ink. Only
 *                      while operable: a leaf without `onSelect` and any
 *                      disabled row never match the rule.
 *  3. focus-visible  — NOT here. tokens.css §8 rings every control at once,
 *                      at the row's own pill radius. The outline is one tab
 *                      stop with a roving tabIndex; the arrows move the ring.
 *  4. active/pressed — does not apply as a skin. The kit draws no pressed
 *                      row; the acknowledgement is the fold happening or the
 *                      leaf's destination arriving, the same reading `list`
 *                      and `accordion` record.
 *  5. disabled       — per group, per leaf, or the whole tree:
 *                      `--btn-disabled-fill` / `--btn-disabled-label`,
 *                      `aria-disabled`, hover dropped. A fill and an ink,
 *                      never an opacity. A disabled group keeps its current
 *                      fold and refuses to change it.
 *  6. loading        — does not apply. CH18 draws the tree with no loading
 *                      tier, and D12 = "pdf" builds the drawing. An outline
 *                      that has not arrived renders a `Skeleton` in the
 *                      tree's place — the call site's job, as `collapsible`
 *                      records for its own contents.
 *  7. empty          — no groups renders nothing at all — prefer nothing
 *                      (PATTERN §4); the register belongs to the composition.
 *                      A group whose `children` are empty still folds, and
 *                      opens onto nothing, honestly.
 *  8. error          — does not apply. A tree reports nothing, and CH18
 *                      draws no error tier for it.
 *  9. selected       — does not apply as a third skin: the drawing gives a
 *                      chosen row nothing. Open is not selected — it is the
 *                      swapped marker, published as `data-state="open"` on
 *                      the group for any call site that wants more.
 * 10. read-only      — no `onSelect`: the leaves are plain rows — no cursor,
 *                      no hover, no `treeitem` press — while the groups still
 *                      fold, because disclosure is how an outline is read. An
 *                      outline whose FOLD must not change is `disabled`.
 *
 * THREE BREAKPOINTS
 *  mobile / tablet / desktop — UNCHANGED. The kit states one geometry at
 *  every width; the rows fill the column their parent gives them, and a long
 *  label truncates (`min-w-0` + `truncate`) rather than wrapping the drawn
 *  row height or pushing the page sideways at 380.
 *
 * RTL — safe. The indent is `ps-*` (padding-inline-start), every inset is
 * logical, and the closed marker — the one asymmetric glyph — mirrors with
 * `rtl:-scale-x-100` so it keeps pointing at the children it hides.
 */
const Tree = React.forwardRef<HTMLUListElement, TreeProps>(
  (
    {
      className,
      groups,
      open,
      defaultOpen,
      onOpenChange,
      onSelect,
      disabled = false,
      label = "Outline",
      ...props
    },
    ref,
  ) => {
    /* Uncontrolled with an escape hatch — the kit's usual pair, exactly as
       `Rail.collapsed ?? selfCollapsed`. */
    const [selfOpen, setSelfOpen] = React.useState<readonly string[]>(
      () => defaultOpen ?? [],
    );
    const openIds = open ?? selfOpen;

    const setOpen = (next: readonly string[]) => {
      if (open === undefined) setSelfOpen(next);
      onOpenChange?.(next);
    };

    /* The roving tab stop. `null` until the keyboard arrives: the first
       visible row is the resting stop. */
    const [focusId, setFocusId] = React.useState<string | null>(null);
    const itemRefs = React.useRef(new Map<string, HTMLElement>());

    const leafPressable = onSelect !== undefined && !disabled;

    /* The visible rows, in reading order — what the arrows walk. */
    const visible = React.useMemo<FlatRow[]>(() => {
      const rows: FlatRow[] = [];
      for (const g of groups) {
        rows.push({ id: g.id, kind: "group" });
        if (openIds.includes(g.id)) {
          for (const c of g.children ?? []) {
            rows.push({ id: c.id, kind: "leaf", groupId: g.id });
          }
        }
      }
      return rows;
    }, [groups, openIds]);

    const restingId = visible[0]?.id ?? null;
    const activeId =
      focusId !== null && visible.some((r) => r.id === focusId) ? focusId : restingId;

    const moveFocus = (id: string | undefined) => {
      if (id === undefined) return;
      setFocusId(id);
      itemRefs.current.get(id)?.focus();
    };

    const toggleGroup = (g: TreeGroup) => {
      const isOpen = openIds.includes(g.id);
      const next = isOpen ? openIds.filter((k) => k !== g.id) : [...openIds, g.id];
      /* Closing a group whose child held the roving stop would strand it on
         an unmounted row; the stop returns to the group doing the hiding. */
      if (isOpen && (g.children ?? []).some((c) => c.id === focusId)) {
        setFocusId(g.id);
      }
      setOpen(next);
    };

    const onRowKeyDown = (event: React.KeyboardEvent, row: FlatRow) => {
      const index = visible.findIndex((r) => r.id === row.id);
      const group = groups.find((g) => g.id === (row.kind === "group" ? row.id : row.groupId));
      const dead = disabled || group?.disabled === true;

      switch (event.key) {
        case "ArrowDown":
          moveFocus(visible[index + 1]?.id);
          break;
        case "ArrowUp":
          moveFocus(visible[index - 1]?.id);
          break;
        case "Home":
          moveFocus(visible[0]?.id);
          break;
        case "End":
          moveFocus(visible[visible.length - 1]?.id);
          break;
        case "ArrowRight":
          if (row.kind === "group" && group) {
            if (!openIds.includes(group.id)) {
              if (!dead) toggleGroup(group);
            } else {
              moveFocus((group.children ?? [])[0]?.id);
            }
          }
          break;
        case "ArrowLeft":
          if (row.kind === "group" && group) {
            if (openIds.includes(group.id) && !dead) toggleGroup(group);
          } else if (row.groupId !== undefined) {
            moveFocus(row.groupId);
          }
          break;
        case "Enter":
        case " ": {
          if (row.kind === "group") {
            if (group && !dead) toggleGroup(group);
          } else if (group) {
            const leaf = (group.children ?? []).find((c) => c.id === row.id);
            if (leaf && leafPressable && leaf.disabled !== true) onSelect?.(leaf, group);
          }
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    };

    const registerRef = (id: string) => (node: HTMLElement | null) => {
      if (node === null) itemRefs.current.delete(id);
      else itemRefs.current.set(id, node);
    };

    // Nothing to outline: nothing at all. The register is the caller's.
    if (groups.length === 0) return null;

    return (
      <ul
        ref={ref}
        role="tree"
        data-slot="tree"
        aria-label={label}
        aria-disabled={disabled || undefined}
        // Drawn: the list runs at 2 of gap — no ladder step; quoted.
        className={cn("flex min-w-0 list-none flex-col gap-[0.125rem]", className)}
        {...props}
      >
        {groups.map((group) => {
          const isOpen = openIds.includes(group.id);
          const groupDead = disabled || group.disabled === true;
          const groupState = groupDead ? "disabled" : "pressable";

          return (
            <li
              key={group.id}
              role="none"
              data-slot="tree-group"
              data-state={isOpen ? "open" : "closed"}
              className="flex min-w-0 flex-col gap-[0.125rem]"
            >
              <div
                ref={registerRef(group.id)}
                role="treeitem"
                aria-expanded={isOpen}
                aria-disabled={groupDead || undefined}
                tabIndex={group.id === activeId ? 0 : -1}
                data-slot="tree-group-row"
                onClick={() => {
                  if (!groupDead) toggleGroup(group);
                }}
                onFocus={() => {
                  setFocusId(group.id);
                }}
                onKeyDown={(e) => {
                  onRowKeyDown(e, { id: group.id, kind: "group" });
                }}
                /* cn so tailwind-merge drops the resting ink under the
                   disabled pair rather than leaving two same-specificity
                   rules to race (PATTERN §4). */
                className={cn(treeRowVariants({ kind: "group", state: groupState }))}
              >
                {isOpen ? <MarkerOpen /> : <MarkerClosed />}
                <span className="min-w-0 truncate">{group.label}</span>
              </div>

              {isOpen ? (
                <ul
                  role="group"
                  data-slot="tree-children"
                  // Drawn: children indent 22 (no ladder step; quoted), the
                  // same 2 of gap between rows.
                  className="flex min-w-0 list-none flex-col gap-[0.125rem] ps-[1.375rem]"
                >
                  {(group.children ?? []).map((leaf) => {
                    const leafDead = groupDead || leaf.disabled === true;
                    const leafState = leafDead
                      ? "disabled"
                      : leafPressable
                        ? "pressable"
                        : "default";

                    return (
                      <li key={leaf.id} role="none" data-slot="tree-leaf">
                        <div
                          ref={registerRef(leaf.id)}
                          role="treeitem"
                          aria-disabled={leafDead || undefined}
                          tabIndex={leaf.id === activeId ? 0 : -1}
                          data-slot="tree-leaf-row"
                          onClick={() => {
                            if (leafPressable && !leafDead) onSelect?.(leaf, group);
                          }}
                          onFocus={() => {
                            setFocusId(leaf.id);
                          }}
                          onKeyDown={(e) => {
                            onRowKeyDown(e, {
                              id: leaf.id,
                              kind: "leaf",
                              groupId: group.id,
                            });
                          }}
                          className={cn(treeRowVariants({ kind: "leaf", state: leafState }))}
                        >
                          {/* The drawn 5px dot, in the drawn `--fg4` —
                              `--muted-foreground`, decide-3 §D12's own
                              mapping. `flex: none`, as drawn. */}
                          <span
                            aria-hidden="true"
                            className="size-[0.3125rem] flex-none rounded-[var(--radius-pill)] bg-[var(--muted-foreground)]"
                          />
                          <span className="min-w-0 truncate">{leaf.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  },
);

Tree.displayName = "Tree";

export { Tree, treeRowVariants };
