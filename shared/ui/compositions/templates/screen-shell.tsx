"use client";

/* ============================================================================
   ScreenShell — the four levels every screen in both doors sits on.

   WHY THIS FILE EXISTS AT ALL, AND WHY IT IS A SHAPE

   The client, 2026-08-23, on what the build kept getting wrong: "where I see
   you miss a lot is in the things that have a container and the ones that lay
   in the background directly."

   ═════════════════════════════════════════════════════════════════════════
   COLLAPSED 2026-09-02, CLIENT-APPROVED. THERE ARE NO LONGER THREE SCREEN
   TEMPLATES. THERE IS THIS ONE, AND FOUR SLOTS THAT VARY.
   ═════════════════════════════════════════════════════════════════════════
   The client, verbatim: "Let's completely get rid of these three variations.
   Let's just do one shell, and then let's just explain that there are
   variations for the title if it's main screen with no parents or not. Also,
   just define which pages have a footer."

   SHE ASKED FOR IT VALIDATED RATHER THAN AGREED WITH, AND THE KIT ALREADY
   AGREED IN WRITING. `detail-screen.tsx`'s own header, before this change:
   "THE SHELL AND THE RAIL ARE IDENTICAL TO A MAIN SCREEN'S. Neither file
   draws either one: `ScreenShell` does, once, and both hand it the same
   rail." `main-screen.tsx` carried the identical sentence with the two names
   swapped, and reason 1 below quotes `SHELL.md` saying it a third time. Two
   templates whose headers each said they differed from the other in three
   named places, and whose code then made the same `<ScreenShell>` call twice
   with a different `header` node, were two spellings of one screen.

   SO `MainScreen` AND `DetailScreen` STOP BEING TEMPLATES. Everything either
   of them decided is decided here now, once, and every ruling either header
   carried has been MOVED into this file rather than summarised — the mango
   argument, the glyph rule, override 73's identity order, the bare figure
   strip, the narrow "controls, never counts" rule and the footer's home are
   all below, in their own sections. The two exports survive as thin
   adapters over this shell and hold no design of their own; see WHAT SURVIVES
   AS AN ADAPTER, AND WHY, at the end of this block.

   THE FOUR SLOTS, AND WHAT EACH ONE WAS BEFORE

     1 TITLE STEP  · DERIVED, NEVER PASSED. Big when the screen has no parent,
                     one rung smaller when it has one. The BREADCRUMB decides
                     it: a one-tab trail is a top-level location. See
                     `breadcrumbDepth` and TITLE_STEP_CHILD below. No call
                     site anywhere can name a type step — which is the folder's
                     own law ("not one file in this folder writes a fill, a
                     radius, a ring or a type step") kept rather than broken.
     2 IDENTITY    · `recordNumber` · `collectionLabel` · `chips`, in that
                     order, on the line DIRECTLY UNDER the title. Override 73.
                     A collection passes none and no row is drawn.
     3 FIGURES     · `figures`, bare on the body pane, above everything else
                     in the card. A record has no equivalent. This is the
                     FOURTH VARIABLE and neither the client's list nor
                     `SHELL.md`'s table names it — see its own section.
     4 FOOTER      · `footer`. Declared per screen, never inferred. The
                     client's own instruction is "just define which pages have
                     a footer", so it is a slot you can grep for and not a
                     consequence of some other prop being set.

   WHAT HAPPENED TO `SHELL.md`'s THREE, ONE AT A TIME

     · IDENTITY — slot 2, unchanged in substance. `SHELL.md` phrased
       difference 1 as the EYEBROW (`GROUP · 24 RECORDS` on a collection,
       `COLLECTION · 4182` on a record). Override 73 (2026-08-26) already
       killed the record half of that: the client, verbatim, "detail pages do
       not need this bar that you have on top where we have Padelbase and the
       number. these are chips, so the black chip is always the ID." So the
       eyebrow survives as a COLLECTION-ONLY slot and the record's half of it
       is the identity row, under the title. Both are here now, and the ORDER
       is enforced in code rather than asked for in prose — the shell wraps
       `recordNumber` in the charcoal `Badge variant="inverse"` itself, which
       is what "we always use black chips for IDs" means when it is a rule and
       not a hope.
     · TABS — SPENT, AND NOT BY THIS CHANGE. `SHELL.md`'s difference 2 read
       "folder tabs on a main screen, underline on a detail screen". The
       client retired the folder tab VARIANT the same day (v1.2.28): there is
       one tab shape now and the folder silhouette belongs to the breadcrumb.
       So the two screens no longer differ on tabs at all, and this shell
       draws no tab strip of either kind — a collection's subsets are
       `CollectionFrame`'s, a record's sub-views are `RecordDetail`'s, and
       neither is a level of the shell. Nothing in this file touches tabs.
     · MANGO — slot 4 plus `actions`. `SHELL.md`'s difference 3 was "the `+`
       on a main screen, `Edit` on a detail screen, and the footer". The two
       controls were never two mechanisms: both are THE SCREEN'S ONE MANGO,
       both stand at the inline end of the title's row, and both drop below
       the narrow breakpoint. They arrive through one `actions` slot now. The
       footer is slot 4. See THE ONE MANGO below for the whole argument, moved
       here verbatim from `main-screen.tsx`.

   ─────────────────────────────────────────────────────────────────────────
   THE TITLE STEP, AND WHY THE BREADCRUMB DECIDES IT
   ─────────────────────────────────────────────────────────────────────────
   The client: "there are variations for the title if it's main screen with no
   parents or not." A screen with no parent is a screen whose trail is one
   tab; a record's trail is its collection and then itself. So the trail's
   LENGTH is the whole of the rule, and it is a fact the caller already holds
   — it is the array it hands the breadcrumb strip.

       depth 1 · no parent      the door's own step   comfortable h2 · calm h3
       depth 2+ · has a parent  one rung down         comfortable h3 · calm h4

   THE ROOT STEP IS NOT A SECOND SOURCE. `SHAPE_HEADING_SIZE` is imported and
   used unchanged, so the door's step stays the one number `ScreenRenderer`,
   `CollectionFrame` and `RecordChrome` all already agree on; the only new
   thing in this file is the one rung DOWN for a nested screen.

   WHY IT IS A DEPTH AND NOT A SIZE, AND NOT A READ OF THE NODE. The slot is a
   plain node (see `breadcrumb`), and this file will not inspect it: its own
   rule three paragraphs down is that "a shell that inspected its children to
   police them would be guessing at element types across a `React.Fragment`
   and would be wrong the first time somebody wrapped their trail in a
   provider." Counting `<li>`s in CSS would be the same guess wearing a
   selector, and it could not reach `Title`'s `size` prop anyway without this
   file writing a type step by hand. So the caller states the trail's length —
   a fact about navigation, which is the caller's — and the shell owns the
   mapping from that length to a step, which is typography and is not.
   `breadcrumbDepth` DEFAULTS TO 1, so a screen that says nothing is a
   top-level screen with the big title, which is the honest default: a screen
   with no trail has no parent.

   ─────────────────────────────────────────────────────────────────────────
   THE ONE MANGO — MOVED HERE FROM `main-screen.tsx`, UNABRIDGED
   ─────────────────────────────────────────────────────────────────────────
   `SHELL.md`: the page header's `+` is MANGO; the collection panel's own `+`
   is CHARCOAL; only one mango in the pair. The header's is the shell's, from
   `onCreate`. The panel's belongs to the toolbar and is `CollectionFrame`'s.

   THE HEADER'S `+` STAYS MANGO ON THE MANGO SPINE. EXAMINED, NOT ASSUMED.
   On 2026-08-24 the client made MANGO the default spine, and 26.02's mango
   card says "One per workspace, never combined with a mango header." Read as
   covering this control, that sentence would take the mango `+` off every
   collection in the system. It does not, for four reasons, and the fourth is
   the one that settles it:

     1. IT SAYS "HEADER", NOT "ACTION". The header band is off-beige (client
        ruling, below). A mango control standing in an off-beige band is not a
        mango header. The kit draws NO mango header band anywhere — the only
        three mango REGIONS in the whole artifact are 26.02's own spine
        specimen, an unsaved-changes save bar and the rail's active row.
     2. OVERRIDE 17 COUNTS MANGO **ACTIONS**, and the mango spine improves
        that count rather than breaking it. The spine is a ground, not a
        control, and on it the lit row inverts to charcoal — so the rail
        spends ZERO mango actions and this `+` is the screen's one. Under the
        ink or paper spine the same screen carries two. Stepping the `+` down as well
        would leave the screen with NO primary action at all.
     3. 27.22's RULE CARD, verbatim: "No mango on this screen at all …
        **The page-level mango + stays in the header where it always is.**"
     4. 26.02's OWN CLOSING PROSE, verbatim, and it is an exhaustive list:
        "**The rest of the app does not change with the spine**: the page
        stays off-beige, cards stay soft paper, and the active row is mango
        on the ink and paper spines, charcoal on the mango one." The active
        row is the ONLY thing the chapter says varies. A header control that
        changed colour with the spine would make that sentence false.

   SO WHAT DOES "NEVER COMBINED WITH A MANGO HEADER" BIND? A second mango
   CHROME REGION, which is the same kind of thing the spine is. It has one
   live case in this repo and this file enforces it: the mango ambient FIELD
   is dropped on the mango spine. See `ambient`.

   THE ONE THING THIS DOES NOT SETTLE is whether a 40px mango circle still
   READS as the screen's one action when the whole window behind it is mango.
   That is a judgement about the whole screen, not a rule the artifact states,
   so it is measured and put to the client rather than taken here.
   `SHELL.md`'s *Owed* carries it.

   "Create is always the glyph, never the word" (26.01) — so `onCreate` draws
   `size="icon"` with a `+` in it and an `aria-label`, never a labelled button.
   The kit names exactly one exception (27.21's `+ Add the first`) and it is
   not a screen header's.

   `Edit` IS THE ONE LABELLED EXCEPTION, AND IT IS NOT AN EXCEPTION TO THE
   CREATE RULE. 26.01, verbatim: "Create is always the glyph, never the word …
   A lone Edit follows the same rule with the pencil." So `onEdit` draws the
   pencil AND the word, which is what both 26.04 and 27.39 draw (`✎ Edit`),
   and the create rule is untouched because Edit is not a create.

   A SCREEN GETS ONE OR THE OTHER, NEVER BOTH, and that is checked rather than
   trusted: passing `onCreate` and `onEdit` together is two mangos, which
   ruling 26 forbids, so the shell drops `onEdit` and warns in development.
   NO MANGO AT ALL ON SOME SCREENS — `SHELL.md`: "on Archive, Activity log and
   Link sent there is no mango at all." Those routes pass neither handler and
   no control is drawn, not a disabled one, which ch24.6 forbids.

   ─────────────────────────────────────────────────────────────────────────
   THE FOURTH VARIABLE — THE FIGURE STRIP. CONFIRMED, AND IT IS REAL.
   ─────────────────────────────────────────────────────────────────────────
   `SHELL.md`'s table has six rows and none of them is the figures; the
   client's own list of what varies has four items and none of them is the
   figures either. The table is still not wrong, and the reason is worth
   writing down because it is why nobody counted it: a detail screen has no
   figure strip *and has nothing in that place at all*. `SHELL.md` compares
   what the two screens each draw in a shared region; the figures are a region
   ONE of them simply does not have, so there was no cell to fill in. That is
   an absence, not a difference — the same way the table has no row for the
   stage progression, which `record-chrome.tsx` already argues in exactly
   those words ("a main screen has no record and therefore no progression, so
   there is nothing here for the table in `SHELL.md` to compare").

   HOW IT IS HANDLED: as a slot like the other three, and as DATA rather than
   a node, because the LAW about it is the shell's and not a route's.
   `SHELL.md`: "the figure strip on a main screen — bare on the body pane, NOT
   in cards … the one exception is the dashboard (27.11), where the figures
   ARE in cards." A route handed a bare slot would have to remember
   `surface="bare"` forty times. It is passed here, once, and `figuresSurface`
   is the dashboard's one legal escape. This is `main-screen.tsx`'s own
   argument and its own wiring, moved up one level and not restated.

   ─────────────────────────────────────────────────────────────────────────
   THE CARD'S TOP-LEFT CORNER IS SQUARE. ONE KNOWING DEPARTURE, ON ONE EDGE.
   ─────────────────────────────────────────────────────────────────────────
   The client, choosing between the options put to her on 2026-09-02: *"I
   choose option 1 to square it."* At the time the breadcrumb's own leading
   tab was ALSO squared on its top-left, to read as one silhouette with the
   card rather than as a rounded box with a rounded box stuck on it.

   THE TAB HALF WAS REVERSED THE NEXT DAY; THE CARD HALF WAS NOT, AND THAT IS
   A MEASURED CONCLUSION, NOT A LEFTOVER. 2026-09-03, client, on the live
   product: *"When I am on the left tab, the top corner needs to be more
   rounded. That's not how the tabs are, so go and fix it."*
   `breadcrumb-folders.tsx` deleted its own `--folder-radius-lip` patch that
   same day — every tab, leading or not, now draws its ordinary rounded
   shoulder. THIS FILE'S OWN CORNER DOES NOT FOLLOW IT BACK, because it was
   never squared only to match a squared tab: the card's radius (`--radius`,
   24) is bigger than the strip's own overlap (`--folder-tab-overlap`,
   17.02), so an un-squared card corner shows the remaining ~6.98 of its own
   24-unit arc as a curve peeking out below the tab's dead-straight left
   edge — the tab's own `lipPath` (`components/folder/folder.tsx`) runs
   arrow-straight from just under its top corner to its foot, so this collision
   exists no matter what the tab's own top corner is doing. Un-squaring the
   tab removes none of it. So: THE TAB'S OWN CORNER READS AS A TAB AGAIN, the
   CARD'S STAYS SQUARE, and the two now read as they do because ONE OF THEM
   HAS TO GIVE ITS CORNER UP FOR THE JOINT TO HAVE NO VISIBLE SEAM — the tab's
   because its silhouette is fixed and may not be edited, so it is the card's,
   which is a plain CSS radius this file owns outright. Measured, in both
   palettes, in `verify/tab-joint/`.

   THIS IS A DEPARTURE FROM THE TWO-RADII LAW AND IT IS WRITTEN DOWN AS ONE.
   Kit ruling 03 flattens the whole radius ladder onto two box values —
   `--radius` (24) and `rounded-pill` (999) — and `docs/RULES.md` says a fifth
   radius invented for one component is a rejection. NO FIFTH RADIUS IS
   INVENTED HERE. The card keeps `--radius` on all four corners and then
   REMOVES one of them: `rounded-ss-none` is zero, and zero is not a radius —
   it is the absence of one, on the single corner the client named, for the
   single reason that another object is joined to the card there. The other
   three corners are untouched and are still `--radius`. That is the whole of
   the exception; anything that squared a second corner, or squared this one
   on a screen with no breadcrumb, would be a different change and is not this
   one.

   IT IS `rounded-ss-none` AND NOT `rounded-tl-none`. Start-start, not
   top-left, so the corner mirrors with the trail in RTL for free, exactly as
   every other inset in this file does.

   ONE SQUARE, ONE OBJECT, AS OF 2026-09-03. Until yesterday's reversal this
   section read "two squares, two objects, not one drawn twice" — the
   breadcrumb filled its own leading tab's arc in because the folder
   SILHOUETTE's corner is a fixed path it may not edit, and this file removed
   the CARD's corner, a CSS radius it owns outright. The breadcrumb's half is
   gone; this file's own mechanism is unchanged, and the paragraph above is
   the argument for why it did not have to change with it.

   ─────────────────────────────────────────────────────────────────────────
   WHAT SURVIVES AS AN ADAPTER, AND WHY
   ─────────────────────────────────────────────────────────────────────────
   `MainScreen` and `DetailScreen` still exist and still export the same prop
   types. They now hold no design: each is a mapping from its old prop names
   onto this shell's slots, plus the one composition below the band that was
   never the shell's (`CollectionFrame` for a collection, `RecordChrome` for a
   record). Every ruling their headers carried is in THIS file; their headers
   now carry a pointer to the section that took it, and nothing else.

   THE CLIENT SAID "I DON'T WANT ANY DEAD BODY AROUND" ABOUT THE FOLDER TAB
   VARIANT, AND THE SAME INSTINCT APPLIES — TO THE DESIGN, WHICH IS GONE. What
   is left is not a second answer to any question; there is exactly one place a
   screen's shape is decided and this is it. What kept the two names alive is
   the same argument this file already made for `Rail.collapsible`: "the kit is
   vendored into two applications this repo cannot see and removing a prop is a
   build break for a change that is purely visual." Nineteen call sites inside
   this repo import one of the two names, several of them in files under
   concurrent edit today. Deleting the exports is a one-line change to
   `index.ts` and nineteen mechanical call-site rewrites, and it should happen
   — it is logged as owed rather than done, because doing it in this pass would
   have meant editing files this pass does not own.

   ONE PLACE STILL SPELLS A RECORD THE OTHER WAY, AND IT IS NAMED HERE RATHER
   THAN LEFT TO BE FOUND. `record-route.tsx` composes this shell and
   `RecordChrome` directly with an empty band — which was override 73's own
   fix, made in August, before there was a band a record could stand in. So
   the live record route draws its title and chips in the BODY while
   `DetailScreen` now draws them in the BAND. Two spellings of a record is
   exactly the thing the collapse exists to remove; the move is mechanical
   (`title`, `recordNumber`, `collectionLabel`, `chips`, `tags`, `meta` and
   `actions` up one level) and it is owed for the same reason as the rest:
   that file is another session's today.
   ─────────────────────────────────────────────────────────────────────────

   ─────────────────────────────────────────────────────────────────────────
   RESHAPED 2026-09-02, CLIENT-APPROVED, AND IT SUPERSEDES THE LADDER BELOW
   IN EXACTLY ONE PLACE: WHICH LEVEL CARRIES THE SPINE.
   ─────────────────────────────────────────────────────────────────────────
   Until today the rail sat in a FILLED COLUMN inside an off-beige screen
   card, and the spine colour painted that column and nothing else. The
   approved shape inverts it:

       THE GROUND IS THE SPINE, AND ONLY THE CONTENT FLOATS.

   Concretely, and each line is a thing that moved:

     · `--spine-fill` MOVES OUT OF THE RAIL COLUMN AND ONTO THE SHELL ITSELF.
       The page and the screen are both painted `var(--spine-fill)` now, so
       the workspace's chosen spine is the ground the whole window stands on
       rather than a stripe down its leading edge. It is ONE continuous
       ground: nothing between the viewport's edges and the floating card
       paints a second fill anywhere.
     · THE RAIL LIES ON IT AND PAINTS NOTHING, WHICH IS WHAT `rail.tsx` SAID
       IT DID ALL ALONG — its own state 1 reads "No fill of its own: it lies
       on the screen card's soft paper." That sentence was true of the
       component and false of the composition, because the SHELL was painting
       the column underneath it. It is true of both now, and the fix cost the
       rail nothing: not one class in `rail.tsx` changed, because the rail
       never named a colour. What it reads — `--spine-ink`, `--spine-chip-
       fill`, `--spine-active-*` — is inherited from the SCREEN instead of
       from the column, and a custom property does not care which ancestor
       declared it.
     · THE CONTENT BECOMES A FLOATING CARD. `--surface-raised`,
       `rounded-[var(--radius)]`, and an explicit `--shadow-lifted`. The
       header band and the body live inside it; the card is the only thing on
       this screen with a radius and the only thing with an elevation.
     · A THIRD COLUMN ARRIVES — `aside`, for the assistant — flat on the same
       ground, mirroring the rail across the card.
     · A BREADCRUMB SLOT sits above the card, ON the ground, aligned to the
       card's leading edge.
     · FULL VIEWPORT HEIGHT, NO PAGE SCROLL. Each column scrolls on its own.

   THE SHADOW IS THE LOAD-BEARING PART AND IT IS NOT DECORATION, AND THE
   NUMBERS ARE MEASURED RATHER THAN ASSUMED — read off the live cascade in
   `verify/shell-chat/`, on all three spines the client kept, in both
   palettes (six combinations; see `verify/spines/` for the harness).

     INK   · LIGHT   ground #1A1918   card #FFFEF9   contrast 17.386
     INK   · DARK    ground #1C1B18   card #26241F   contrast  1.111
     PAPER · LIGHT   ground #F7F2EB   card #FFFEF9   contrast  1.103
     PAPER · DARK    ground #2F2D28   card #26241F   contrast  1.127
     MANGO · LIGHT   ground #FED069   card #FFFEF9   contrast  1.440
     MANGO · DARK    ground #FED069   card #26241F   contrast 10.661

   ON FOUR OF THE SIX THE STEP IS ABOUT 1.1–1.4 — a real edge, and a thin
   one; the kind you can lose in a bright room or on a bad panel. That is the
   case `--shadow-lifted` exists for, and on those four it is carrying the
   card rather than agreeing with it. In dark it has more to give than in
   light: its dark value is rgba(0,0,0,.55) against the .14 charcoal light
   spends. INK-LIGHT IS THE ONE OUTLIER, AND IT MATTERS MORE THAN THE OTHER
   FIVE: the client's own reason for keeping three spines is "in light i can
   choose to have a 'dark' background" — a light-themed workspace with a dark
   window — so ink-light is not a decorative choice among several, it is the
   feature. Its ground is charcoal against an off-beige card: 17.386, the
   strongest edge of the six by more than an order of magnitude, and the
   shadow there is only manners, same as mango in both palettes.

   AND THE THIN CASE WAS ONCE A BROKEN ONE, WHICH IS WORTH RECORDING BECAUSE
   THE FIX WAS NOT THIS FILE'S, AND BECAUSE THE FIX HAD TO SURVIVE A SECOND
   RULING. Under the THREE-spine tokens this reshape was first written
   against, the `paper` spine in dark resolved its ground and `--card` to the
   SAME `#26241F`: ground and card at **1.000**, with the shadow as the
   entire distinction between them. That was a genuine collision, it was
   found here by measuring rather than by reasoning, and it was routed to
   `tokens.css` rather than patched around — a shell that invented a paper to
   escape it would have been the exact mistake the 2026-08-24 rebuild was
   correcting. The client cut three spines to two the same day, which closed
   it one way (quiet's dark ground was `--surface-panel`, clear of `--card`);
   reverting to three the next day could have reopened it by simply restoring
   paper's old dark hex. IT DID NOT: `tokens.css` §7b moved paper's dark
   ground again, to `--kw-unlit-quiet` #2F2D28 rather than back to
   `--kw-unlit-raised` #26241F, measured 1.127 against the card above. **The
   routing is fulfilled twice over.** Nothing below compensates for anything.

   WHY THE SHADOW IS WRITTEN AS `shadow-[var(--shadow-lifted)]` AND NOT AS
   `shadow-lg`. The two are the same value — tokens.css aliases `--shadow-lg`
   to `--shadow-lifted` — and the alias would read as a size on a ladder
   somebody may re-tune. This is not a size. It is the one elevation the whole
   product spends, on the one object that has one, and naming the elevation
   token directly means a reader of this line cannot mistake it for a nudge.

   WHAT DID NOT MOVE, AND THE LIST IS DELIBERATE: the rail's rows, pills,
   spine colours, member chip and its nav's internal scrolling (v1.2.23) are
   untouched. The header band is still not a container and still paints no
   fill of its own — what changed is the tone underneath it, from the screen's
   off-beige to the card's, which are the same colour in light and both
   `--card` in dark. (WHO BUILDS THE BAND DID CHANGE, LATER THE SAME DAY:
   `MainScreen` and `DetailScreen` each built their own until the COLLAPSE at
   the top of this header; the shell builds it now, from the slots that block
   names, and the band's paper argument is untouched by that.)
   The density insets are the same numbers; `RAIL_WIDTH` is the same
   13rem; `rail={null}` still means no rail, `rail=undefined` still means the
   kit's specimen; and the rail is still dropped whole below the breakpoint.

   THE LADDER THE 2026-08-24 REBUILD WROTE IS STILL THE LADDER. What follows
   is kept verbatim because its reasoning about PAPER — that there are two
   papers and not four levels, and that a filled control on a ground goes to
   the other tone — is exactly what the floating card re-uses. Read it with
   one substitution: where it says the SCREEN is off-beige, the screen is now
   the SPINE and the off-beige has moved onto the card.

   REBUILT 2026-08-24, ON A CLIENT RULING AND ON THE ARTIFACT'S OWN SCREENS.
   The ladder this file drew until today put the header band on SOFT PAPER,
   inside a soft-paper screen card. The client, verbatim, twice, looking at
   the running build:

       "the header section, the title, is also in white like the background!
        see screenshot / both in main screen and detail screen"
       "in this screenshot client and accounts must be with white background!!"

   "CLIENTS" is the eyebrow and "Accounts" is the title — the HEADER BAND.
   And the artifact's own assembled screens agree about everything except
   that one band. Read off chapter 27, from the inline `background:`
   declarations, on all sixty screen frames:

     · THE SCREEN FRAME IS OFF-BEIGE. `background: var(--page)` — #FFFEF9 —
       on 60 of 60 frames in the chapter. Not one is soft paper. The build had
       it soft paper, and that was the error under all the others.
     · THE RAIL IS A CONTAINER AND IT IS SOFT PAPER. `background: var(--sheet)`
       on 28 of 28 rails (22 expanded at 208, 6 collapsed at 56). The build
       painted nothing here and got away with it only because the card behind
       it happened to be soft paper. **RETIRED 2026-09-02 — see the reshape
       above. The rail is a column of the GROUND now, and the ground is the
       spine, so the rail is once again a region that paints nothing and is
       once again visible, for the opposite reason.**
     · THE BODY REGION PAINTS NOTHING. It is a padded div; the frame's own
       off-beige shows through. There is no rounded top-left corner on it
       anywhere in the artifact — grep finds zero. (Still true of the BODY.
       The corner the shell now draws is the CARD's, on all four, and it is
       the client's own 2026-09-02 shape rather than the chapter's.)
     · THE PANEL IS SOFT PAPER, `var(--sheet)` at radius 24, and cards in it
       are `var(--card)` off-beige.
     · 26.02 states the whole thing in one sentence: "the page stays
       off-beige, cards stay soft paper."
     · THE ONE DISAGREEMENT: the artifact draws the header band
       `background: var(--sheet)` on 23 of 23 screens. THE CLIENT RULING BEATS
       IT. The band is off-beige, and it is the only place this file departs
       from the chapter.

       spine GROUND                      --spine-fill  the whole window
       ├─ RAIL         NOT a container           lies on it, paints nothing
       ├─ breadcrumb   NOT a container           lies on it, navigation only
       ├─ ASIDE        NOT a container           lies on it, paints nothing
       └─ off-beige CARD                #FFFEF9  the one floating thing
          ├─ header band  NOT a container        the card's tone · CLIENT RULING
          └─ body         NOT a container        the card's tone
             └─ soft-paper PANEL       #F7F2EB   the collection / the record body
                └─ off-beige CARDS               rows, tiles, figures in cards

   SO THERE ARE TWO PAPERS, NOT FOUR LEVELS: the ground (the spine) and the
   paper on it (the card, and the panel inside it). Everything between them is
   the ground. A card inside a panel comes back to off-beige, and a filled
   control on any off-beige level goes to soft paper — which is ruling 01,
   unchanged, just now applied at one level instead of two.

   It is a SHAPE and not a collection, a primitive or a per-route div, for
   three reasons and each one on its own would be enough:

     1. BOTH SCREENS SHARE IT, UNCHANGED. `SHELL.md`: "The shell above is
        identical on both. The rail never changes between them." A thing two
        screens share and neither owns is the definition of a shape —
        section 9's "needs designing once and applies many times".
        THIS REASON IS THE ONE THAT ATE THE OTHER TWO TEMPLATES. It used to
        end "…and a main screen and a detail screen differ in exactly three
        places and none of them is here", which was true and was also the
        whole case against there being two files: the three places are four
        slots, the slots are on this shape, and the shape is what was always
        shared. See the COLLAPSE block at the top.
     2. IT ARRANGES, IT DOES NOT DRAW. A shape composes; the only classes it
        writes are layout for its own wrapper and the paper tone of each
        level, which IS the arrangement here. It draws no control, no rail
        content and no header content: all three arrive as nodes. THE ONE
        EXCEPTION, ADMITTED 2026-09-02, IS THE EDGE HANDLE — see its own
        section below for why a round button had to be drawn here and could
        not be a node.
     3. PUTTING IT IN A ROUTE WOULD DUPLICATE IT ~40 TIMES. The instruction
        was explicit — do not duplicate the body pane into every route. There
        is exactly one place the four levels are written down, and this is it.

   ─────────────────────────────────────────────────────────────────────────
   THE EDGE HANDLES — CLIENT-APPROVED 2026-09-02, RESKINNED 2026-09-03
   ─────────────────────────────────────────────────────────────────────────
   Both flat columns collapse, by the same control, mirrored across the card.
   THE TOGGLE ITSELF DID NOT CHANGE ON 2026-09-03 — one button, one
   `onClick`, both directions, `aria-expanded` and `data-state` exactly as
   2026-09-02 left them. Owner, verbatim, on the bar this section used to
   describe: "i don't like the vertical line we did to open close assistant
   and navbar... return the floating round yellow button for opening the
   assistant / return the round button to close/open the navbar / make them
   same size and exact same height position, kinda symmetric." That is a
   RESKIN — a shape and a fill, not a second control and not a new direction
   of travel — read against her own reference for the shape: the assistant's
   OWN mobile launcher (`web/components/agent-host.tsx`'s `PopoverTrigger`)
   and this kit's OWN `copilot-overlay.tsx`, which already draws the identical
   mark — `Button variant="default" size="icon"` at `shadow-lg`, `Sparkle`
   inside a 40 mango well. This handle borrows that fill and that elevation,
   not that component: `size="icon"` is `--control-height-button` (2.5rem),
   a REM token, and the ADR two paragraphs down is what stops this control
   from ever being sized off one.

   THE POSITION IS UNCHANGED AND STILL CARRIES THE WHOLE AFFORDANCE. A glyph
   could not fit on a 3px bar; it fits fine on a circle, so the button now
   ALSO carries a directional icon (see below) — but WHERE IT STANDS still
   says which way it is about to move, and that has not stopped being true:

       OPEN → the button is at the column's OUTER RIM.
       SHUT → the button is at the column's INNER EDGE.

   So the button always sits on the side the column is about to travel
   toward, exactly as the bar did, with a caret now saying the same thing a
   second way for the one edge (the rail) that already had a glyph for it.

   THE FILL IS `--btn-primary-fill` / `--btn-primary-label`, NOT `--spine-ink`.
   The bar's whole colour argument was about staying legible while being
   nearly INVISIBLE — a hairline that had to hold contrast against six
   different grounds because it never draws attention to itself, it only
   avoids disappearing into them. A filled mango circle does not have that
   problem: it is meant to be seen, on every ground, the way `Button`'s own
   default variant already is everywhere else in the kit. So it takes the
   SAME two tokens `Button` does — already contrast-proved there, already the
   one brand fill chapter 19 draws for the assistant specifically — rather
   than re-deriving a second contrast case for a colour this file no longer
   uses. (The six-ground `--spine-ink` measurements stayed in this file
   because the CARD section's dark-mode note, further down, still cites them
   for its own shadow argument — they describe the spine's ink now, not this
   handle.)

   THE HIT AREA AND THE PAINTED SHAPE ARE THE SAME BOX NOW. The bar's button
   was a 20 x 44 INVISIBLE target with a 3px bar floating inside it — the
   button had to be bigger than the thing it drew, because a 3px line is not
   a target. A 32px circle IS the target: nothing is invisible any more, so
   there is no separate hit area to keep in step with a separately-drawn
   mark. THE FOCUS RING LANDS ON THIS SAME BOX, exactly as it did on the old
   20 x 44 pill (tokens.css §8 rings every control on its own box) — and
   because the box is a true circle now (`rounded-pill` at equal width and
   height) the ring reads as a circle instead of the stadium shape the old
   asymmetric hit area gave it.

   WHY 32, NOT `Button`'s OWN 40 (`--control-height-button`, 2.5rem). The bar
   section argued this in px for a reason that has not gone away: ruling 28
   authors against a 16px reference, tokens.css §1 sets the real root to 15px
   (ruling 18), and `data-scale` moves it again — 13 at small, 17 at large —
   so a rem token that reads "40" in this file's own source can render as
   little as 32.5px on a reader who has turned the type scale down, which is
   exactly the reader WCAG 2.5.5's target-size minimum exists to protect. So
   this button keeps the bar's OWN departure from ruling 28's rem ladder: a
   LITERAL 32px, in both dimensions, that does not move with the scale.  32
   over 44 (the bar's old hit-height) because the circle is now the visible
   mark and not a hit area wrapping one: the rail's own `--rail-inset`
   padding is 18.75–24px depending on density, and a 44px circle flush to the
   column's outer rim would print mango over the leading edge of whatever
   nav row sits at the vertical centre — the exact "never covers a row"
   guarantee the bar section stated for its own 20px width. 32 keeps that
   guarantee in the common case and trims the worst case (calm density, a
   row exactly centred) to a few px of the row's own leading whitespace,
   never its icon or label — a bar's-eye-view 44 would not have held that
   line, so it is not carried over just because `Button` and the launcher
   both happen to use it elsewhere.

   THE COLOUR NEVER CHANGES ON HOVER OR PRESS, THE FILL DOES. `Button`'s own
   two tokens, `--btn-primary-hover` / `--btn-primary-pressed` — a fill swap,
   never a size change now, which brings this control INTO motion.css §13's
   general hover rule ("a fill swap and nothing else") instead of the
   bespoke grow-on-hover the bar needed because it was otherwise nearly
   impossible to see. `shadow-lg` (bridged to `--shadow-lifted`, same as the
   kit's own launcher) is a CONSTANT elevation, not a hover gain: motion.css
   §13 names exactly three things allowed to gain elevation on hover — "a
   card that is a link, a draggable card, the copilot launcher" — and this
   handle is none of them, so its shadow is drawn once and left alone rather
   than becoming a fourth exception nobody asked for.

   THE ICON DIFFERS BY EDGE, THE SHAPE AND SIZE DO NOT. THE ASIDE takes
   `Sparkle` — the assistant's own brand mark everywhere else it appears
   (chapter 19's header mark, the composer's send mark, the mobile launcher),
   so the docked toggle finally carries the same glyph the floating one
   always did. THE RAIL takes `CaretLineRight` collapsed / `CaretLineLeft`
   expanded — not a new choice: `rail.tsx`'s OWN foot-collapse row (see
   "AND THE RAIL'S FOOT TOGGLE GOES AWAY", next) already drew exactly that
   pair for exactly this meaning, and this handle reuses it rather than
   inventing a second visual language for "collapse/expand" on the same
   column. Both icons render at `--icon-button` (1rem) — the same size a
   nav row's own icon takes, so nothing on the handle out-scales the column
   it sits beside.

   IT IS STILL A REAL `<button>` WITH A REAL LABEL. "Collapse the navbar" /
   "Open the navbar", "Open the assistant" / "Close the assistant" — the
   kit's own nouns (`SHELL.md` and the client both say *navbar*; ch19 and
   27.10 both say *the assistant*), and verbs rather than product words,
   unchanged by the reskin: `aria-label` and `aria-expanded` are exactly the
   props 2026-09-02 wired and are not touched here.

   THE TWO COLUMNS COLLAPSE TO DIFFERENT THINGS, DELIBERATELY, AND THAT ALSO
   DID NOT CHANGE.

     · THE RAIL collapses to THE ICON RAIL it already collapsed to — 26.02's
       "collapsible to an icon rail", unchanged behaviour, unchanged width
       mechanism. A collapsed rail is still usable navigation, so it stays.
     · THE ASIDE collapses to NOTHING AT ALL. Client, verbatim: *"closed
       asstant show nothing. it's literally only the bar."* — a sentence this
       file keeps quoting on purpose even though the shape it names is gone,
       because the RULE it states (zero width, no strip, no icons, no
       element — the column is not rendered — and the card takes the space
       back) is still exactly what happens. The handle remains, at the inner
       side of the ground's own gutter, which is where the mirrored rule
       puts it: a shut aside has no inner edge of its own, so the gutter's is
       the one it borrows.

   AND THE RAIL'S FOOT TOGGLE GOES AWAY. `Rail` has drawn an opt-in collapse
   row at its foot since before v1.2.23 pinned it there; the client has
   approved replacing it with this handle, so the shell never turns it on and
   the rail's footer holds only the member chip again. `Rail.collapsible` is
   left in place and left off — the kit is vendored into two applications this
   repo cannot see and removing a prop is a build break for a change that is
   purely visual.

   WHY THE HANDLE IS DRAWN HERE AND IS NOT A NODE THE ROUTE PASSES. Its whole
   meaning is a POSITION relative to a column whose width the shell owns and
   whose collapsed width the shell cannot predict (the icon rail takes its
   content's width). A node could not know where to stand. And a control that
   is duplicated into forty routes is forty chances for one of them to put it
   somewhere else, which is the same argument that put the rail's placement
   here in the first place.

   WHO OWNS THE COLLAPSED STATE. The shell does, uncontrolled with an escape
   hatch, exactly as `Rail` does its own — `railCollapsed` / `asideOpen`
   control it, `defaultRailCollapsed` / `defaultAsideOpen` seed it, and both
   report every change so an application can persist them (26.02: the collapse
   "persists per user"). The DEFAULT rail is handed the state directly. A
   CALL SITE THAT SUPPLIES ITS OWN RAIL NODE MUST THREAD IT: take
   `onRailCollapsedChange` and pass `collapsed` down to its own `<Rail>`. The
   shell cannot reach inside a node it was given, and cloning one to inject a
   prop is the kind of magic that breaks the first time somebody wraps their
   rail in a provider. The column still narrows on its own either way — the
   `has-[[data-rail-collapsed]]` rule below is unchanged and still reads the
   rail's own published attribute.

   WHAT IT DELIBERATELY DOES NOT DO
   · It does not draw the rail's CONTENTS. The rail's contents are the
     application's nav (`rail` is a node). The shell owns the rail's
     PLACEMENT and its width — and, until 2026-09-02, ITS SPINE FILL; that
     fill is now the ground's and the column paints nothing — and the one
     thing about it that is design law: it is dropped entirely below the
     narrow breakpoint, because the kit draws no hamburger anywhere.

     AMENDED 2026-08-24, AND THE AMENDMENT IS A DEFAULT AND NOT A REDEFINITION.
     That sentence stayed true for a day and cost forty screens their
     navigation: nothing in `components/` or `compositions/` drew a rail, and
     all 44 files that reach this shell thread `rail` through from a prop
     nobody supplied. So `rail` now DEFAULTS to `<Rail />` — shape 0c, the
     kit's own placeholder register — and the shell still draws no navigation
     of its own: it places a node, and when nobody hands it one it places the
     kit's specimen instead of nothing.

     WHY THE DEFAULT IS HERE AND NOT IN THE 29 ROUTES. Every route already
     passes `rail={rail}` straight through, so one default reaches all of them
     with no route able to forget; twenty-nine defaults would be twenty-nine
     chances to drift, and the four routes that must have NO rail — both
     logins, the system's onboarding and the portal's root — do not render
     this shell at all (they keep their own, and each says so in its header).
     `rail={null}` is the opt-out and nothing in the repo needs it today.
   · It does not draw the ASIDE's contents either, and for a stronger reason:
     the assistant is a composition this repo already ships twice (ch19's
     floating `Assistant`, and `AgentChat` docked). The shell places a column;
     what goes in it is the application's conversation, never this file's.
   · It does not draw the BREADCRUMB's contents, and it will not let anything
     else in there. See `breadcrumb`.
   · IT DOES DRAW THE HEADER BAND'S CONTENTS NOW, AND THAT IS THE ONE LINE OF
     THIS LIST THE COLLAPSE REVERSED. Until 2026-09-02 this read "it does not
     draw the header band's contents — `MainScreen` and `DetailScreen` each
     build their own, and that is one of the three places they differ." Both
     halves of that sentence are gone: the band is assembled here from
     `eyebrow`, `title`, `actions`, the identity slots and `meta`, and the
     three places are the four slots at the top of this header.
     IT STILL DRAWS NO CONTENT. Every one of those slots is a node the call
     site supplies; what the shell owns is the ORDER they stand in, the type
     STEP the title takes, and which of them survive a narrow viewport —
     which is arrangement, and is exactly what a shape is for. The two
     controls it does construct are the screen's one mango, from a HANDLER
     rather than from a node, and that is deliberate: a slot would let a route
     draw two.
   · It does not draw a footer's CONTENTS. It does own whether there is one:
     `footer` is an explicit slot, on the client's own instruction ("just
     define which pages have a footer"), placed inside the body pane in normal
     flow — `SHELL.md`: "in normal flow, once per record". It is still not a
     level of the shell and it is still not a bar pinned to the window; it is
     the last thing in the card's scroller.

   THE PAPER LAW, AND WHERE IT IS ENFORCED
   26.04, verbatim: "The page itself is off-beige and every panel on it is
   soft paper: never the other way round."

   The CARD re-resolves `--btn-secondary-fill` and `--pill-fill` to SOFT
   PAPER, which is ruling 01 ("a filled paper button in the other tone, so a
   band and its buttons are never the same tone"). The band is the card's
   off-beige, so its Export pill has to be soft paper or it is a 1.000 against
   the band it stands on. The panel flips them back on its own; neither call
   site has to know which. **This rebinding used to live on the SCREEN; it
   moved down onto the CARD on 2026-09-02 with the off-beige it belongs to,
   and the value a call site sees inside the card is byte-for-byte the one it
   saw before.**

   THE GROUND re-resolves them the other way, to the paper one rung off THE
   SPINE — `--spine-chip-fill` — which is exactly what the rail column used to
   do for itself. It is on the ground now because the ground is the spine, so
   the member chip at the foot of the rail, a control in the aside and
   anything else standing on the ground all read on both spines without
   naming a colour. One declaration where there were two.

   NARROW — the kit's own rule, not a guess
   `SHELL.md`: "Drops the rail entirely — no hamburger is drawn anywhere in
   the kit. Drops controls, never counts." The rail column is absent below
   `md`, not collapsed and not behind a button. Nothing else about the shell
   changes: the ground, the card and the body are all still drawn, because the
   paper law has to hold at 380 as well as at 1440.

   "DROPS CONTROLS, NEVER COUNTS" IS THE BAND'S RULE TOO, AND IT MOVED HERE
   WITH THE BAND. Both retired templates enforced it and both defaulted it
   off: the title row's whole trailing cluster — the paper pills, the overflow
   well and the screen's one mango — hides below `sm`, while the eyebrow's
   count, the identity chips and every figure stay drawn at every width. A
   screen that genuinely needs its controls at 380 passes `narrowActions`, and
   a record that needs its footer there passes `narrowFooter`; both are props
   rather than hard rules because 26.04 and 27.39 are one specimen each.

   AND THE ASIDE IS DROPPED THE SAME WAY, WHICH IS A DECISION AND NOT AN
   OVERSIGHT. A 380-wide phone cannot carry a permanent 208 column and a
   permanent assistant column beside a readable card; something has to go, and
   the kit has already ruled what a narrow screen does with a region it cannot
   seat — it drops it, and it does not grow a drawer, because a drawer is a
   hamburger by another name. THE ASSISTANT IS NOT LOST BY THIS: ch19 gives it
   a floating, non-modal form that needs no column at all ("No scrim, no blur,
   no page shift, no focus trap"), and that form is what a phone gets. So the
   aside column and BOTH edge handles are absent below `md`, and the card
   keeps the ground's gutter on all four sides at every width. Logged as the
   narrow answer for `aside`; if the client wants a sheet there instead, that
   is a route's `Sheet` and not this file's column.

   NO RADIUS ON THE GROUND, AND THAT IS STILL THE CLIENT'S SCREENSHOTS
   The artifact wraps every assembled screen in `border-radius: 24px;
   overflow: hidden; box-shadow: var(--sh2)` because a screen in that document
   is a specimen sitting on a page of prose. In the product it is the window.
   26.02's own page-width note says so: "the real product's content area is
   fluid, not centered: sidebar fixed width, everything else — header,
   toolbar, body — stretches to fill the remaining browser width." And the
   client's spine screenshots show the fill "running the full height of the
   viewport, flush to the leading edge, square at the outer corners" — which a
   24px `overflow: hidden` would round off. So the GROUND fills its box: no
   page padding, no screen radius, no clip at that level. The 24 the shell
   does draw is the CARD's, which is a floating object and is supposed to have
   one, and the rail and the aside are still flush to their outer edges and
   still square, exactly as those screenshots show. The card draws it on
   THREE of its four corners since the client squared the leading one; see
   THE CARD'S TOP-LEFT CORNER IS SQUARE at the top of this header.

   HEIGHT AND SCROLLING
   The window does not scroll. `page` draws a `100dvh` ground with
   `overflow: hidden`, and the three things inside it scroll on their own: the
   rail's `<nav>` (v1.2.23, and untouched here), the card's BODY, and the
   aside. The header band does not scroll — it is `flex-none` inside the card,
   above the body's scroller, which is law 4's "the rail, header and tabs stay
   drawn and stay put" drawn literally for the first time.

   `page={false}` KEEPS ITS OLD MEANING AND GAINS ONE CONSEQUENCE: the shell
   fills the box it is given rather than the viewport, so a document that
   already owns the height — the demo, a specimen page — gets a shell that is
   as tall as its content and whose scrollers therefore never fire. That is
   the honest behaviour for a specimen and it is why every panel in the demo
   passes it.

   RENDERING CONTEXT
   `"use client"`, SINCE 2026-09-02, AND IT IS A REAL CHANGE. This module used
   to hold no state, call no hook and create no handler — it placed nodes. It
   now owns two pieces of interaction state (whether the rail is collapsed and
   whether the aside is open) and builds the two handlers that move them,
   because the handles are its own controls. Both are uncontrolled with an
   escape hatch, for the same reason `Rail`'s are: 26.02 says the collapse
   "persists per user" and persistence is the application's.
   ========================================================================= */

import * as React from "react";

import { Badge } from "../../components/badge/badge";
import { BreadcrumbFolders } from "../../components/breadcrumbs/breadcrumb-folders";
import { Button } from "../../components/button/button";
import { CursorGlow } from "../../components/cursor-glow/cursor-glow";
import { Title } from "../../components/title/title";
import { Text } from "../../components/typography/typography";
import {
  CaretLineLeft,
  CaretLineRight,
  PencilSimple,
  Plus,
  Sparkle,
} from "../../foundations/icons";
import { cn } from "../../lib/utils";
import { Rail } from "./rail";
import { StatStrip, type StatStripFigure } from "./stat-strip";
import { SHAPE_HEADING_SIZE, type ScreenDensity, type ShapeState } from "../states/states";

/**
 * The rail's fixed measure. The kit states it in words — "Fixed 208px,
 * collapsible to an icon rail" (26.02) — and 208 is 13rem against the 16px
 * reference every measurement in this system is authored against (ruling 28).
 *
 * Exported because an application that draws its own rail content needs to
 * know the column it is being drawn into, and reading it off the class string
 * is not an interface.
 */
export const RAIL_WIDTH = "13rem";

/**
 * The assistant column's measure — 380px at the 16px reference.
 *
 * THE KIT STATES NO NUMBER FOR A DOCKED ASSISTANT, AND THAT IS WHY THIS IS
 * EXPORTED RATHER THAN BURIED. 26.02 fixes the rail at 208; ch19 draws the
 * assistant floating and gives its card a `max-width: 380px`; nothing in the
 * document docks it into a column. 380 is that one stated number reused, so
 * the docked conversation is the same measure as the floating one and the two
 * placements of ch27.10's single composition do not read as two widths.
 *
 * LOGGED AS OWED: a client ruling on the docked width would replace this. It
 * is one constant and one line.
 */
export const ASIDE_WIDTH = "23.75rem";

/**
 * The spines 26.02 offers in Settings · Appearance — now called Background
 * (see `settings.tsx`).
 *
 * IT WAS THREE, THE CLIENT CUT IT TO TWO ON 2026-09-02, AND SHE PUT IT BACK
 * ON 2026-09-03, VERBATIM: "you know, i changed my mind. i want to go back
 * to the 3 options (sorry)." `ink`, `paper` and `mango` are the three names
 * again, not renamed to anything theme-shaped — Settings · Appearance
 * already offers Light / Dark / System, and a second setting spelled the
 * same way would be the confusing thing, not the useful one.
 *
 * THE REASON IS THE WHOLE POINT OF `ink`, NOT A PREFERENCE AMONG THREE EQUAL
 * OPTIONS. Her words: "my goal is that in light i can choose to have a
 * 'dark' background option." Appearance decides light or dark; Background
 * decides the colour behind everything; `ink` is what lets the two disagree
 * — a light-themed workspace whose window is dark. `paper` is the light one,
 * `mango` the branded one, and each holds in BOTH palettes: `paper` is
 * `--surface-panel` (#F7F2EB / #1C1B18) and `ink` is a charcoal-family ground
 * in both (#1A1918 light / #1C1B18 dark) — the one spine whose whole reason
 * to exist is that it does NOT track the palette the way the other two do.
 * `mango` is #FED069 in both, unmoved, same as before.
 *
 * INK-LIGHT IS THE CASE THAT HAS TO HOLD. It is the one this rebuild
 * exercises hardest — under the pre-09-02 design `ink` only ever painted a
 * rail; today the spine is the ground the whole window stands on (see the
 * file header's reshape note), so a value drawn for a rail's worth of pixels
 * now has to carry a window's worth. See that note for the full measured set
 * this ruling required, card included.
 *
 * A STALE STORED VALUE IS SAFE AND NEEDS NO MIGRATION CODE HERE. tokens.css
 * writes the paper block as `:root, [data-spine="paper"]`, so an account
 * whose saved spine is still `"quiet"` — from the 2026-09-02 build — matches
 * no block, inherits `:root`, and paints PAPER rather than nothing.
 * TypeScript rejects that word at a call site now; the cascade forgives it
 * at runtime. Both of those are what you want.
 */
export type ScreenSpine = "ink" | "paper" | "mango";

/* THE BREAKPOINT IS WRITTEN OUT AS A LITERAL EVERY TIME, and that is not
   verbosity. Tailwind scans SOURCE TEXT: a class assembled at runtime from a
   `const WIDE = "md"` is never seen by the compiler and never emitted, so the
   rail silently stayed hidden at 1440 the first time this file was built. The
   same trap had just cost the whole repository 69 classes — `demo.css` was
   missing `@source "../compositions/**"`, so every class used only in a
   composition was compiled away — and this is the second face of it. Every
   variant below is a literal `md:` in the file. */

export interface ScreenShellProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "children" | "title"> {
  /**
   * The navigation rail's CONTENTS. The column they sit in is NOT painted any
   * more — since 2026-09-02 the spine is the GROUND and the rail lies flat on
   * it, which is what `rail.tsx`'s own state 1 always claimed it did.
   *
   * Dropped entirely below the narrow breakpoint. Pass it anyway: the shell
   * decides, not the call site, so no route can ship a hamburger.
   *
   * DEFAULTS TO `<Rail />` — the kit's own placeholder register — so a screen
   * that passes nothing still has navigation in it. `null` draws none, which
   * is the only way to get a shell with no rail and is what a screen outside
   * the navbar would pass if it used this shell (none does).
   */
  rail?: React.ReactNode;
  /** Accessible name for the rail's column. */
  railLabel?: string;

  /**
   * Whether the rail is the icon rail. CONTROLLED WHEN GIVEN; otherwise the
   * shell holds it, because the shell now draws the control that moves it.
   *
   * THE SHELL CAN ONLY PUSH THIS INTO THE RAIL IT BUILT ITSELF. A call site
   * that supplies its own `rail` node has to thread the value down to its own
   * `<Rail collapsed={…}>`; take `onRailCollapsedChange` and do it there. The
   * COLUMN narrows either way — it reads the rail's own published
   * `data-rail-collapsed` — so a rail that collapses itself is still seated
   * correctly; what it cannot do is move the handle, which is the shell's.
   */
  railCollapsed?: boolean;
  /** The uncontrolled starting value, for the application to restore. */
  defaultRailCollapsed?: boolean;
  /** Reported on every change, controlled or not, so it can be persisted. */
  onRailCollapsedChange?: (collapsed: boolean) => void;
  /** The rail handle's two accessible names. Verbs, and the kit's own noun. */
  railCollapseLabel?: string;
  railExpandLabel?: string;

  /**
   * THE ASSISTANT COLUMN — a third region, flat on the ground, mirroring the
   * rail across the card. ADDED 2026-09-02 AND ADDITIVE: leave it out and the
   * shell is the two-column shell it has always been, with no column, no
   * gutter and no handle drawn on that side.
   *
   * IT IS A NODE, LIKE THE RAIL, AND FOR A STRONGER REASON. The assistant is
   * a composition this repo already ships twice — ch19's floating `Assistant`
   * and the docked `AgentChat` — and ch27.10 says plainly that they are "the
   * same composition with a different header". The shell places the column;
   * the conversation inside it is the application's.
   *
   * DROPPED BELOW THE NARROW BREAKPOINT, exactly as the rail is, and the
   * assistant's floating form is what a phone gets instead. See the file
   * header's NARROW section for the whole argument.
   */
  aside?: React.ReactNode;
  /** Accessible name for the assistant's column. */
  asideLabel?: string;
  /**
   * Whether the assistant column is open. CONTROLLED WHEN GIVEN; otherwise
   * the shell holds it. Defaults CLOSED, because a column that opens itself
   * on every screen is a column the reader did not ask for.
   */
  asideOpen?: boolean;
  /** The uncontrolled starting value, for the application to restore. */
  defaultAsideOpen?: boolean;
  /** Reported on every change, controlled or not, so it can be persisted. */
  onAsideOpenChange?: (open: boolean) => void;
  /** The aside handle's two accessible names. */
  asideOpenLabel?: string;
  asideCloseLabel?: string;

  /**
   * THE SPINE — 26.02's per-member Settings · Appearance choice, now
   * Settings · Background (see `settings.tsx`). Client ruling D3 offered
   * THREE; the ruling of 2026-09-02 cut it to two, quiet and mango; the
   * ruling of 2026-09-03 put it back to three, verbatim, "you know, i
   * changed my mind. i want to go back to the 3 options (sorry)." `ink` and
   * `paper` are restored, not renamed, and `quiet` is gone. See `ScreenSpine`.
   *
   * `ink` the dark ground · `paper` the light one · `mango` the brand fill.
   * `ink` is the reason three matters rather than two: the client's own
   * words, "in light i can choose to have a 'dark' background option" — a
   * light-THEMED workspace with a dark WINDOW, which two names (quiet,
   * mango) could not say and three can. It is stamped as `data-spine` on the
   * shell's OUTERMOST element — moved there 2026-09-02, because the ground
   * is the spine now and `--spine-fill` has to resolve at the level that
   * paints it — and every value it moves is a token in tokens.css §7b, which
   * is 26.02's own instruction: "the rail's fills must be tokens, not
   * literals, so a switch re-paints without touching markup." What used to
   * be true of the rail column is now true of the whole window; the CARD is
   * what stays put, which is 26.02's own sentence read the other way round —
   * "the page stays off-beige, cards stay soft paper" becomes the card stays
   * off-beige while the page takes the spine.
   *
   * DEFAULT `mango`, ON A CLIENT RULING OF 2026-08-24, verbatim: "the define
   * spine by default is the one with the mango sidebar". This overrides both
   * 26.02's captions (which call ink "the staff default" and paper "the
   * portal default") and the artifact's own 28 assembled rails, every one of
   * which is `var(--sheet)`. A client ruling beats the artifact.
   *
   * ONE THING FOLLOWS AUTOMATICALLY AND IT IS THE ONE 26.02 NAMES: on the
   * mango spine the lit row inverts to charcoal, so the rail stops spending
   * a mango. See `ambient` for the other one.
   */
  spine?: ScreenSpine;

  /**
   * A decorative field laid ON the ground, under the rail, the card and the
   * aside. A NODE, not a flag, for two reasons: the shell arranges and does
   * not draw, and ruling 05/06 scopes the mango field to exactly three
   * screens — auth, splash and the portal's landing screen — so the scoping
   * stays at the three call sites that are allowed it rather than becoming a
   * boolean every screen in the system can reach for.
   *
   * IT IS ON THE GROUND AND NOT ON THE PAGE, AND THAT IS A JUDGEMENT.
   * The card is opaque, so a field behind it is a field nobody sees; the
   * ground is the level the three columns are laid out on, and it is the only
   * level where a flourish still reads. Recorded here because the portal's
   * landing screen drew this field across a whole screen before the levels
   * existed.
   *
   * IT IS DROPPED ON THE MANGO SPINE, AND THAT IS 26.02'S OWN SENTENCE.
   * The mango spine card, verbatim: "Full brand spine. ONE PER WORKSPACE,
   * NEVER COMBINED WITH A MANGO HEADER." Since 2026-08-24 the mango spine is
   * the DEFAULT, so that sentence stopped being a caution about an exotic
   * setting and became a live rule — and it has exactly one live case in this
   * repo: `PortalHome` passes `<AmbientBackground variant="brand" />` (ruling
   * 05/06 scopes the mango field to auth, splash and portal home; auth and
   * splash render no shell, so portal home is the only one that reaches
   * here). A mango field laid across the screen the rail and the card sit on,
   * on a workspace whose ground is already mango, is precisely two mango
   * chrome regions at once — and since 2026-09-02 it is worse than it was,
   * because the mango is no longer a 208 stripe but the entire window.
   *
   * THE SPINE WINS AND THE FIELD YIELDS, because "one per workspace" makes
   * the spine the workspace-level statement and the field a per-screen
   * flourish. Enforced HERE rather than in the route, for the same reason the
   * narrow rail is: one place decides, and no route can forget. The screen
   * publishes `data-ambient="suppressed"` so the drop is observable rather
   * than mysterious, and passing a NON-brand ambient node is unaffected —
   * only the mango spine suppresses, and only because the field is mango.
   */
  ambient?: React.ReactNode;

  /**
   * THE BREADCRUMB — a line of navigation text on the ground, directly above
   * the card and aligned to its leading edge. New 2026-09-02.
   *
   * **IT CARRIES NAVIGATION TEXT AND NOTHING ELSE, AND THAT IS A CLIENT RULE
   * RATHER THAN THIS FILE'S TASTE.** No buttons, no pills, no counts, no
   * actions, no status — a trail and the separators between its parts. The
   * rule is written here because the slot is the temptation: it is the only
   * horizontal strip of ground the product has, it is directly above the
   * card, and every screen that ever wants somewhere to put a control will
   * look at it. Put the control in the header band inside the card, which is
   * what the band is for.
   *
   * IT IS NOT ENFORCED IN CODE, DELIBERATELY. The slot takes a node and the
   * shell places it; a shell that inspected its children to police them would
   * be guessing at element types across a `React.Fragment` and would be wrong
   * the first time somebody wrapped their trail in a provider. The rule is
   * stated, it is in the changelog, and a review reads it here.
   *
   * IT TAKES THE GROUND'S INK. Text in this slot stands on the spine, so it
   * inherits `--spine-ink` from the screen and must not name a colour of its
   * own — a trail written in `--ink-secondary` reads on off-beige and
   * disappears on the ink spine.
   *
   * THE SHELL CONTRIBUTES NO GAP BENEATH IT, DELIBERATELY, AND THAT IS THE
   * ONE THING ABOUT THIS SLOT'S GEOMETRY A NEW READER WILL GET WRONG. Until
   * 2026-09-02 the wrapper paid `pb-[var(--space-3)]`, which was right for a
   * line of trail text floating above the card. The trail is a strip of
   * FOLDER TABS now, and a folder tab is attached to what is under it: the
   * strip carries its own `margin-block-end: calc(var(--folder-tab-overlap) *
   * -1)` so its feet land beneath the card's top edge. Any padding here is
   * subtracted from that overlap — `--space-3` (12) against
   * `--folder-tab-overlap` (17.02) would have left 5.02 of the client's
   * approved 17.02, which reads as a tab resting near a card rather than
   * joined to one. The node owns its relationship to the card; the shell owns
   * only where the pair stands.
   */
  breadcrumb?: React.ReactNode;

  /**
   * HOW MANY LEVELS THE TRAIL HAS — the same array length the call site hands
   * its breadcrumb strip. IT IS NOT A SIZE AND IT IS NOT A LAYOUT OPINION; it
   * is the one fact that decides the title's step, and the mapping from it to
   * a step is this file's. Default 1: no parent, the big title.
   *
   *     1   a top-level location   the door's own step
   *     2+  it has a parent        one rung down
   *
   * WHY THE SHELL IS TOLD RATHER THAN LOOKING. `breadcrumb` is an opaque
   * node and this file does not inspect its children — see that prop and the
   * file header. A caller states a trail's length; it never states a step.
   */
  breadcrumbDepth?: number;

  /**
   * THE HEADER BAND, AS A RAW NODE — THE PRE-COLLAPSE SPELLING, AND IT IS ON
   * ITS WAY OUT. Lies ON the CARD's off-beige and is NOT a container: it
   * paints no fill, takes no radius and carries no rule. CLIENT RULING,
   * 2026-08-24: "in this screenshot client and accounts must be with white
   * background!!" — the one place the build departs from chapter 27, which
   * draws the band `var(--sheet)` on all 23 of its assembled screens.
   *
   * IT DOES NOT SCROLL. Since 2026-09-02 the band is `flex-none` above the
   * body's own scroller inside the card, so it stays put while the body
   * moves — law 4's "the rail, header and tabs stay drawn and stay put",
   * drawn rather than merely asserted.
   *
   * PASSING IT REPLACES THE BUILT BAND ENTIRELY. Since the collapse the shell
   * assembles the band itself from `eyebrow`, `title`, `actions`, the three
   * identity slots and `meta`; this node is drawn INSTEAD, so there is one
   * band on the screen either way and never two. TWO call sites still hand it
   * a finished band — `demo/shapes/templates-0.tsx`'s catalogue specimen and
   * `verify/shell-chat/`'s harness — and both are another session's files
   * today. A screen written now passes `title`.
   *
   * @deprecated Pass `title` (and `eyebrow` / `actions` / `meta`) instead, so
   * the band's order and the title's step are decided in one place.
   */
  header?: React.ReactNode;

  /* ---- THE HEADER BAND, AS SLOTS. Absorbed from the two retired templates
     on 2026-09-02; see the COLLAPSE block in the file header. ------------- */

  /**
   * The micro line above the title — `GROUP · 24 RECORDS`, scope then count.
   * A node, so a route can put a `Badge` in it; a plain string is the
   * ordinary case.
   *
   * A COLLECTION'S, AND ONLY A COLLECTION'S. A record's eyebrow used to be
   * `COLLECTION · 4182` and override 73 (2026-08-26) deleted it: "detail
   * pages do not need this bar that you have on top where we have Padelbase
   * and the number." A record puts that information in the identity row
   * under the title instead. Nothing enforces this — it is one client ruling
   * about what a record says, not a shape the shell can check.
   */
  eyebrow?: React.ReactNode;

  /**
   * What the screen is called. The collection's name, or the record's.
   *
   * ITS STEP IS NOT A PROP AND CANNOT BE MADE ONE. See `breadcrumbDepth`.
   */
  title?: React.ReactNode;

  /**
   * The heading's ELEMENT, so a page keeps a real outline. `Title` defaults
   * to `h2`; a screen that is the whole document passes `h1`. Separate from
   * the heading's STEP, which is derived — `CollectionFrame` already splits
   * the two the same way and for the same reason.
   */
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "div";

  /**
   * The band's secondary controls — `⤓ Export` and its neighbours. PAPER
   * PILLS ONLY. They stand at the inline end of the TITLE'S OWN ROW, which is
   * override 73's "the edit button should be aligned with the title", and the
   * screen's one mango is drawn after them by `onCreate` or `onEdit`.
   *
   * There is no prop here that can add a second mango. Ruling 26.
   */
  actions?: React.ReactNode;
  /** The reader may act. `false` draws NO actions, never a disabled one. */
  actionsVisible?: boolean;
  /**
   * Whether the title row's controls survive the narrow width. Off, because
   * the kit drops Export and the mango there and keeps every count. See
   * NARROW in the file header.
   */
  narrowActions?: boolean;

  /**
   * THE SCREEN'S ONE MANGO, WHEN THE SCREEN IS A COLLECTION. Drawn as an
   * unlabelled `+` — "create is always the glyph, never the word" (26.01).
   * Omit it and NO control is drawn, which is Archive, Activity log and Link
   * sent. A handler and not a node, so a route cannot draw two.
   */
  onCreate?: () => void;
  /** What a screen reader hears on the `+`. Required by the glyph-only rule. */
  createLabel?: string;

  /**
   * THE SCREEN'S ONE MANGO, WHEN THE SCREEN IS A RECORD. The pencil AND the
   * word — 26.01's one stated exception, and what 26.04 and 27.39 both draw.
   *
   * `onCreate` and `onEdit` together are two mangos on one screen, which
   * ruling 26 forbids; the shell keeps the `+` and warns in development.
   */
  onEdit?: () => void;
  /** The word beside the pencil. 26.04 and 27.39 both draw "Edit". */
  editLabel?: string;

  /* ---- THE IDENTITY ROW — directly UNDER the title. Override 73. -------- */

  /**
   * The record number, and it is ALWAYS FIRST. Wrapped here in the charcoal
   * `Badge variant="inverse"` rather than by the call site, because the
   * client's rule is a rule: "these are chips, so the black chip is always
   * the ID. we always use black chips for IDs." A slot that took a finished
   * node would have made that a request.
   */
  recordNumber?: React.ReactNode;
  /**
   * The chip naming the record's collection — "next to it, add a chip for
   * Padelbase like in the example" (override 73), generalised to any
   * collection. Second, right after the ID chip, in the plain `Badge`.
   */
  collectionLabel?: React.ReactNode;
  /** Status, type, since — the rest of the row, after those two. Nodes. */
  chips?: React.ReactNode;
  /**
   * Tags. 27.8 puts them on their own line beneath the identity row and
   * override 73 left that alone: the client ruled on the chip row and the
   * breadcrumb, and a tag is a topic label where a chip is identity.
   */
  tags?: React.ReactNode;
  /**
   * The quiet line that closes the band — "In build since 21 Mar · Aurora
   * owns it", or a collection's "Everything on this page is yours to read".
   * It lies BARE: `SHELL.md`'s list of what lies bare names "the
   * collection-views name and description lines", and `Title` has no slot for
   * one, so it is placed here rather than smuggled into the heading node.
   *
   * Rendered inside a `<p>`, so pass a string or inline nodes, not a block.
   */
  meta?: React.ReactNode;

  /* ---- THE FIGURE STRIP — the fourth variable. See the file header. ----- */

  /**
   * The figures. DATA, not a node, because the law about them is the shell's
   * and not a route's: `SHELL.md` says the strip lies BARE on the body pane,
   * and a route handed a slot would have to remember `surface="bare"` forty
   * times. It is passed here, once. A record passes none.
   */
  figures?: readonly StatStripFigure[];
  /** Accessible name for the strip. */
  figuresLabel?: string;
  /** The reader may see the figures at all. `false` draws NOTHING. */
  figuresVisible?: boolean;
  /**
   * THE ONE EXCEPTION THE KIT NAMES, AND THE ONLY REASON THIS PROP EXISTS.
   * `SHELL.md`: the strip is bare — "the one exception is the dashboard
   * (27.11), where the figures ARE in cards." The dashboard passes `"card"`.
   * Nothing else may.
   */
  figuresSurface?: "bare" | "card";
  /**
   * A strip a route has drawn itself, for the rare screen whose numbers are
   * not `StatStrip`'s shape. Rendered INSTEAD of `figures`, in the same slot,
   * and it is the route's job to keep it bare.
   */
  figureStrip?: React.ReactNode;
  /**
   * Loading, empty or error — forwarded to the strip ONLY. The shell has no
   * state of its own: law 4, "a state is a body swap … either way the rail,
   * header and tabs stay drawn and stay put". The shell is what stays put.
   */
  state?: ShapeState;

  /** Everything below the header band. Goes in the card's body, and scrolls. */
  children?: React.ReactNode;

  /**
   * THE FOOTER — declared, never inferred. The client, verbatim: "just define
   * which pages have a footer."
   *
   * It is the LAST thing in the card's body, in normal flow, inside the same
   * scroller as `children` — `SHELL.md`: "Charcoal, two columns, in normal
   * flow, once per record, unchanged per tab. … No mango. Appears on zero
   * main screens." It is not a bar pinned to the window and it is not a level
   * of the shell; what the shell owns is that it exists and where it stands,
   * which is what makes "which pages have a footer" a question you can answer
   * by grepping for this prop.
   *
   * A RECORD ASSEMBLED BY `RecordChrome` ALREADY CARRIES ITS OWN, drawn by
   * `RecordDetail` from `activity` + `audit` + `onAddNote`, and it lands in
   * this same region because the chrome is inside `children`. Passing both is
   * a call-site error and draws two footers; the shell does not police it,
   * for the reason the breadcrumb's rule is not policed either.
   */
  footer?: React.ReactNode;
  /** The reader may see the footer at all. `false` draws none. */
  footerVisible?: boolean;
  /**
   * Whether the footer survives the narrow width. Off by default: 27.39's
   * narrow render drops it with the other controls.
   */
  narrowFooter?: boolean;

  /**
   * The two-door measure (commission §9). The system door is the wide one,
   * the portal the narrow calm one; it changes the air the shell spends, not
   * its structure.
   */
  density?: ScreenDensity;

  /**
   * Whether the PAGE level is drawn. `false` renders the screen alone, for a
   * document that already paints its own ground — a demo stage, a specimen
   * page, an application that owns `<body>`.
   *
   * SINCE 2026-09-02 IT ALSO DECIDES THE HEIGHT. `true` draws a `100dvh`
   * ground that does not scroll, which is the product; `false` fills whatever
   * box it is given, which is a specimen. A specimen therefore has no
   * independent column scrolling, because it has no height to scroll within,
   * and that is correct rather than a limitation.
   *
   * The default is `true` and it is the honest one: the page is the ground,
   * and a shell that assumed somebody else had painted it was how the whole
   * ladder went wrong in the first place.
   */
  page?: boolean;
}

/* ----------------------------------------------------------------------------
   THE PAGE — THE SPINE, and the ground.

   NO PADDING, and that is unchanged: the client's screenshots pin the spine
   flush to the leading edge and square at the outer corners, and any inset
   here would be a band of ground around a box of ground that pushed the rail
   off that edge. It stays as a LEVEL because it is the tone `<body>` has to
   be and because `page={false}` has to mean something.

   `h-dvh` + `overflow-hidden` IS THE "NO PAGE SCROLL" RULE, and it is the one
   thing about this level that is new. Everything that can grow past the
   window is a scroller inside it.
   -------------------------------------------------------------------------- */
const PAGE = cn(
  "h-dvh w-full overflow-hidden",
  "bg-[var(--spine-fill)] text-[var(--spine-ink)]",
);

/* ----------------------------------------------------------------------------
   THE SCREEN — THE SPINE, the same tone as the page. A BOX, NOT A STEP.

   It is a level of the STRUCTURE (it is what the three columns are laid out
   inside) and not a level of the PAPER LADDER, and saying so plainly is
   better than keeping a fourth paper nobody can measure.

   No radius and no rounding: the ground is the window. `overflow-hidden`
   because it is the box the columns are clipped to, not because anything here
   has a corner.

   THE TWO REBINDINGS ARE THE RAIL COLUMN'S, MOVED UP. A filled control on
   this ground is the paper one rung off THE SPINE — `--spine-chip-fill` — so
   the member chip at the foot of the rail reads on both spines without
   `rail.tsx` naming a colour, and so does anything the aside or the
   breadcrumb puts on the ground. This declaration used to be on the rail
   column and is byte-for-byte the same; what changed is how far it reaches.
   -------------------------------------------------------------------------- */
const SCREEN = cn(
  "relative isolate flex h-full w-full min-w-0 overflow-hidden",
  "bg-[var(--spine-fill)] text-[var(--spine-ink)]",
  "[--btn-secondary-fill:var(--spine-chip-fill)]",
  "[--pill-fill:var(--spine-chip-fill)]",
);

/* ----------------------------------------------------------------------------
   THE CARD — THE ONE FLOATING THING, and the only radius and the only
   elevation on the screen.

   `--surface-raised` is `--card`: off-beige in light, `--kw-unlit-raised` in
   dark. So the tone the header band and the body stand on is exactly the tone
   they stood on before this reshape — the off-beige moved from the screen
   onto the card and did not change value.

   `overflow-hidden` so the 24 clips the body's scroller. The card is a flex
   COLUMN: the band is `flex-none`, the body takes the rest and scrolls.

   THE SHADOW IS NAMED, NOT ALIASED. See the file header: on paper (both
   palettes) and ink-dark the ground and this card are a few points apart and
   this line is what carries the edge.

   AND THE PAPER LAW COMES BACK DOWN HERE WITH THE OFF-BEIGE. A filled control
   on this level is SOFT PAPER, the OTHER tone (ruling 01) — the rebinding
   that keeps the header band's Export pill visible.

   THE LEADING CORNER IS SQUARE — `rounded-ss-none`, CLIENT-APPROVED
   2026-09-02 ("I choose option 1 to square it"). Written as a REMOVAL after
   `rounded-[var(--radius)]` rather than as a per-corner list, so the file
   reads "the card takes the system's one box radius, and then gives one
   corner back". No fifth radius is invented and the other three corners are
   `--radius` exactly as before; see the file header for the whole argument
   and for why this corner stayed square on 2026-09-03 after the breadcrumb's
   own square lip (its leading tab's matching corner-fill) was retired.

   `relative z-[2]` IS PART OF THE SAME JOINT AND IS NOT DECORATION.
   `breadcrumb-folders.tsx` states the contract in its own words: its rest
   tabs sit at `z-[1]` and its live tab at `z-[3]`, "kept so a caller that
   draws its card at `z-[2]` gets ch14's 'clipped by the card edge' for the
   rest tabs and an attached live tab, without this file knowing what the card
   is." This shell IS that caller. The two indices resolve against the same
   stacking context — the SCREEN's `isolate` — because the breadcrumb's own
   wrapper deliberately creates none; see the breadcrumb slot in the render.
   `relative` is there so the index applies whatever the card's display ends
   up being, rather than relying on it being a flex item forever.
   -------------------------------------------------------------------------- */
const CARD = cn(
  "relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
  "rounded-[var(--radius)]",
  "bg-[var(--surface-raised)] text-foreground",
  "shadow-[var(--shadow-lifted)]",
  "[--btn-secondary-fill:var(--surface-panel)]",
  "[--pill-fill:var(--surface-panel)]",
);

/* THE SQUARE IS CONDITIONAL, AND THE BLOCK ABOVE ALREADY SAID SO.
   Its own words: anything that squared this corner "on a screen with no
   breadcrumb would be a different change and is not this one". It was drawn
   unconditionally anyway — case C of `verify/one-shell/`, the bare screen,
   measured start-start 0 with no trail above it. Code and comment disagreed,
   which this repo calls a defect wherever it finds one.

   The corner is removed BECAUSE another object is joined there. With no
   breadcrumb nothing is joined, and a squared corner under empty ground reads
   as a mistake rather than as a joint — the one shape on the screen with a
   flat corner and no reason for it. So `record-route` (client ruling: that
   route has no breadcrumb at all) and every other trail-less screen keep the
   full radius on all four corners.

   Kept as a separate constant rather than a ternary inside `CARD` so the two
   states are legible side by side and neither is a modifier of the other. */
const CARD_JOINED = "rounded-ss-none";

/* ----------------------------------------------------------------------------
   THE BODY — the card's tone, and NOT a container.

   In the artifact this is a bare padded div: 27.1 draws `padding: 22px 28px
   26px` with no `background` and no radius, and so does every screen after
   it. The tone is written out anyway rather than left transparent, because a
   transparent body inside a card somebody re-parents is a body with no
   ground, and that is the class of bug this whole rebuild is correcting.

   IT IS THE CARD'S SCROLLER since 2026-09-02: `min-h-0` (without which
   `flex-1` floors it at its content's height and nothing can ever overflow —
   the same trap `rail.tsx`'s `<nav>` hit in v1.2.23) plus `overflow-y-auto`.

   The rebindings are the card's, restated. They are redundant TODAY — the two
   levels are the same tone — and they are kept so that a panel nested inside
   the body can flip them back and get the right answer without reaching two
   levels up.
   -------------------------------------------------------------------------- */
const BODY = cn(
  "min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--surface-raised)]",
  "[--btn-secondary-fill:var(--surface-panel)]",
  "[--pill-fill:var(--surface-panel)]",
);

/* ----------------------------------------------------------------------------
   THE RAIL COLUMN — flat on the ground, and painting nothing.

   THIS BLOCK USED TO CARRY FOUR MORE CLASSES AND NOW CARRIES ONE. The fill,
   the ink and the two chip rebindings all moved up onto the SCREEN with the
   spine; what is left is the column's own padding, which is the thing the
   rail genuinely needs from it and the thing a component sitting inside the
   column cannot set for itself. The shell publishes that padding as
   `--rail-inset` exactly as before.
   -------------------------------------------------------------------------- */
const RAIL_COLUMN = cn("p-[var(--rail-inset)]");

/* ----------------------------------------------------------------------------
   THE ASIDE COLUMN — the rail's mirror, split in two the same way the
   content column already is (breadcrumb, then card).

   CLIENT, 2026-09-03: "Assistant (the name) should be a folder tab, like the
   breadcrumbs — then the full container for the assistant would be aligned
   with the main one." Before this the whole column was one padded box
   (`p-[var(--aside-inset)]` on every side) with the caller's panel dropped
   straight in — no furniture of its own, which is why it never lined up with
   the content column: `--aside-inset` and `--shell-gutter` are the SAME
   token at every density (see `DENSITY_ASIDE`/`DENSITY_GUTTER` below), but
   the content column spends its copy as `py` on the COLUMN itself, one level
   above the breadcrumb, while the aside used to spend its copy as `p` one
   level BELOW the dock — so the aside's panel sat a whole tab's height
   higher than the card, before either column ever grew a tab.

   TWO REGIONS NOW, so the tab can own the top edge the way the breadcrumb
   does: `ASIDE_TAB` pays the block-start only — no block-end, because the
   tab strip owns its own overlap (`--folder-tab-overlap`) exactly as
   `screen-shell-breadcrumb` above does — and `ASIDE_BODY` pays the
   block-end, no block-start, because the strip's negative margin already
   closes that gap. Split this way, the two columns' tabs start at the same
   measured y (both are `--shell-gutter`/`--aside-inset` below the row they
   share) and the two containers start at the same y below them (both
   `tab height − overlap` further down) — proven in `verify/shell-chat/`
   (`asideTab`/`asideBody` rects against `breadcrumb`/`card`).

   NEITHER REGION PAYS ITS OWN INLINE SIDES ANY MORE — CLIENT, 2026-09-03,
   ITEM 5: "there's way too much space between the content and the
   assistant", confirmed on every screen. `screen-shell-aside-dock` (below)
   already spends `--shell-gutter` getting from the card to this column,
   the SAME measure `screen-shell-breadcrumb`'s own dock spends getting from
   the rail to the CARD — and the breadcrumb pays no second inset of its own
   once it is there, it sits flush at the column's edge. `ASIDE_TAB`/
   `ASIDE_BODY` used to ALSO spend `--aside-inset` on top of the dock's
   gutter, `px-[var(--aside-inset)]` on both, and because `--aside-inset`
   and `--shell-gutter` are the same token (see above), that is the same
   number spent twice — 45px of air between the card and the assistant's own
   folder tab/panel where the card's every other neighbour (the rail, the
   ground on every other side) gets 22.5. Measured in `verify/shell-chat/`:
   the aside dock's own column started 22.5 past the dock's inner edge before
   this line, 0 after it — the panel and its tab now start flush at the
   dock's edge, the same way the breadcrumb starts flush at the content
   column's. `BreadcrumbFolders` (inside `ASIDE_TAB`) keeps its own internal
   tab padding (`px-5`) regardless — that is the label's OWN breathing room,
   never this column's, exactly as it already is for the content trail. */
const ASIDE_TAB = cn("pt-[var(--aside-inset)]");
const ASIDE_BODY = cn("pb-[var(--aside-inset)]");

/** How much air each door spends. Structure is identical; only the inset moves. */
const DENSITY_RAIL: Record<ScreenDensity, string> = {
  comfortable: "[--rail-inset:var(--space-6)]",
  calm: "[--rail-inset:var(--space-5)]",
};

const DENSITY_ASIDE: Record<ScreenDensity, string> = {
  comfortable: "[--aside-inset:var(--space-5)]",
  calm: "[--aside-inset:var(--space-5)]",
};

/* THE GROUND'S OWN GUTTER — the air between the card and everything around
   it, and the strip a shut aside's handle stands in.

   IT IS NOT A NEW NUMBER: it is the same `--space-6` / `--space-5` pair the
   rail's inset already spends, so the air outside the card and the air inside
   the rail are the same measure and the window reads as one rhythm.

   STEPPED DOWN ONE RUNG ON 2026-09-03, COMFORTABLE ONLY. Owner, on the live
   product: "this margin between navbar and content — so reduce the spacing
   there", said in the same breath as the ruling above it ("same margins
   everywhere") — read together, the ONE shared value was too big, not just
   the rail edge she happened to name, and shrinking only that edge would
   have broken the uniformity the sentence before it asked for. So the token
   itself moves, one step on the scale already in `tokens.css` (`--space-6`,
   24, down to `--space-5`, 20) rather than an invented pixel value, and it
   moves at every one of the gutter's call sites at once — the rail-to-content
   gap, the card's own four sides, the content-to-assistant gap and the new
   assistant-to-window edge (see the aside dock, below) all read the same
   smaller number after this line, because they were always one token.

   COMFORTABLE NOW EQUALS CALM ON THIS ONE PROPERTY, AND THAT IS AS FAR AS
   THIS CHANGE GOES. Calm was already `--space-5`; nothing here says whether
   it should step down again to keep a gap between the two densities — that
   is a separate call the owner has not made, so calm is untouched.

   MEASURED, at the kit's own 15px root (ruling 18, not ruling 28's 16px
   authoring reference): both densities now spend `--space-5` = 18.75. The
   handle's target is a fixed 20px, so both densities now carry the 1.25
   overhang onto the outermost 1.25px of the card's own rounded corner
   region (no content there to intercept) that used to be calm-only — see
   `verify/shell-chat/` for the measured before/after on both densities. */
const DENSITY_GUTTER: Record<ScreenDensity, string> = {
  comfortable: "[--shell-gutter:var(--space-5)]",
  calm: "[--shell-gutter:var(--space-5)]",
};

const DENSITY_HEADER: Record<ScreenDensity, string> = {
  comfortable: "px-[var(--space-7)] pt-[var(--space-7)] pb-[var(--space-6)]",
  calm: "px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-5)]",
};

const DENSITY_BODY: Record<ScreenDensity, string> = {
  comfortable: "p-[var(--space-6)] lg:p-[var(--space-7)]",
  calm: "p-[var(--space-5)] lg:p-[var(--space-6)]",
};

/* The air between the three things the body can hold — the figure strip, the
   screen's own content, and the footer. NOT A NEW NUMBER: it is the same
   `--space-6` / `--space-5` pair the body's own inset and the ground's gutter
   already spend, so the whole window keeps one rhythm. */
const DENSITY_STACK: Record<ScreenDensity, string> = {
  comfortable: "gap-[var(--space-6)]",
  calm: "gap-[var(--space-5)]",
};

/* ----------------------------------------------------------------------------
   THE TITLE'S STEP WHEN THE SCREEN HAS A PARENT — one rung below the door's.

   The door's own step is `SHAPE_HEADING_SIZE` and is NOT restated here: it is
   imported and used for the depth-1 case, so `ScreenRenderer`,
   `CollectionFrame`, `RecordChrome` and this shell all keep reading one
   number. This map is the only new typography in the file and it is a
   RELATION, not a size — "one rung down `Title`'s own three-rung ladder" —
   which is why it can be written at all in a folder whose law is that no file
   in it writes a type step.

       comfortable  h2 (32) → h3 (24)
       calm         h3 (24) → h4 (20)

   `Title`'s ladder has exactly three rungs and calm's nested step lands on
   the last of them, so a fourth level of nesting cannot ask for a fifth size:
   the depth rule is "root or not", never "one rung per crumb". A five-deep
   trail and a two-deep trail take the same step, which is correct — the title
   says what this record is called, not how far in it is. The trail says that.
   -------------------------------------------------------------------------- */
const TITLE_STEP_CHILD: Record<ScreenDensity, "h3" | "h4"> = {
  comfortable: "h3",
  calm: "h4",
};

/** A trail of one tab is a top-level location. See `breadcrumbDepth`. */
const ROOT_DEPTH = 1;

/* ----------------------------------------------------------------------------
   THE EDGE HANDLE — a 32px mango circle, and a position that means
   something. See the file header for the whole ruling, including WHY 32
   and not `Button`'s own 40.

   EVERY NUMBER HERE IS STILL THE CLIENT'S, AND EVERY ONE IS STILL WRITTEN IN
   px. THAT IS THE ONE PLACE THIS FILE DEPARTS FROM ruling 28's rem, AND IT
   IS ARGUED, AND THE RESKIN DID NOT REOPEN THE ARGUMENT.

   Ruling 28 authors against a 16px reference; tokens.css §1 then sets the
   real root to 15px (ruling 18), and `data-scale` moves it again — 13 at
   small, 17 at large. A rem-sized control shrinks with that scale — the
   ORIGINAL reason this handle never took `Button`'s own `size="icon"`
   (`--control-height-button`, 2.5rem: 41.25px at the default scale, 32.5px
   at small) — and shrinking is exactly the failure mode WCAG 2.5.5's
   target-size minimum exists to catch, for the reader most likely to have
   turned the scale down. So the circle keeps a LITERAL 32px, in both
   dimensions, which does not move with the scale, in place of the bar's own
   3 x 34 and 20 x 44 literals.

   Everything else the shell draws — the gutter, the insets, the radius —
   stays on the rem ladder, because all of it IS measure.

   It is a literal rather than a token for the same reason the bar was: none
   of it is on a ladder the kit ships, and there is no 32px rung to reach for
   instead of writing the number down.
   -------------------------------------------------------------------------- */

/**
 * The button IS the target now — no separate invisible hit area wrapping a
 * smaller mark, because nothing here is invisible any more. `rounded-pill`
 * at equal width and height is a true circle, so the global focus ring
 * (tokens.css §8) reads as one too.
 *
 * `--btn-primary-fill` / `--btn-primary-label` / `--btn-primary-hover` /
 * `--btn-primary-pressed` are `Button`'s OWN default-variant tokens — the
 * one brand fill the kit already contrast-proved, reused rather than
 * re-derived. `shadow-lg` (→ `--shadow-lifted`) is constant, not a hover
 * gain: motion.css §13 names exactly three things allowed to gain elevation
 * on hover and this handle is not a fourth. Hover and press are a fill swap
 * only — motion.css §13's general rule, now that the mark itself is the
 * whole affordance and does not also need to grow to be seen.
 */
const HANDLE_HIT = cn(
  /* NO VERTICAL POSITION HERE — `placement` carries BOTH axes now. It used to
     hard-code `top-1/2 -translate-y-1/2`, which was right while every handle
     was a mid-edge grab, and wrong the moment one of them had to live in a
     CORNER: the client, 2026-09-04, on the shut assistant's opener — "move
     the open assistant button to the top right corner of the screen, real top
     right corner, outside of main content, where i would naturally search for
     it after i close it." A class fixed in here could not express that, and
     the alternative — a second boolean prop meaning "but not centred" — is
     the shape that grows a third and a fourth. One `placement` string, both
     axes, chosen by the caller from its own state. */
  "absolute z-10",
  /* SAME SIZE AS A COLLECTION'S `+`, on the client's instruction: "make the
     button same size as the + button on collections, needs to be bigger." It
     was 32px against that button's 40. `--control-height-button` is the token
     `<Button size="icon">` itself spends, so the two are now the same number
     BY DERIVATION rather than by two hand-typed values that agree today. */
  "flex size-[var(--control-height-button)] shrink-0 items-center justify-center",
  "cursor-pointer rounded-pill border-0 p-0",
  "bg-[var(--btn-primary-fill)] text-[var(--btn-primary-label)] shadow-lg",
  "transition-[background-color] duration-[var(--duration-colour)] ease-kwapso",
  "hover:bg-[var(--btn-primary-hover)] active:bg-[var(--btn-primary-pressed)]",
  "[&_svg]:pointer-events-none [&_svg]:size-[var(--icon-button)] [&_svg]:shrink-0",
);

interface EdgeHandleProps {
  /** Which column it belongs to. Published as `data-edge` for the harness. */
  edge: "rail" | "aside";
  /** Whether that column is showing. Drives the label and `aria-expanded`. */
  open: boolean;
  /** The accessible name for the press that is about to happen. */
  label: string;
  /**
   * WHICH GLYPH, chosen by the caller: `Sparkle` for the aside (the
   * assistant's own brand mark, constant across states) or the rail's own
   * `CaretLineRight` / `CaretLineLeft` pair, flipped by the caller's current
   * state — see "THE ICON DIFFERS BY EDGE" in the file header. Always
   * `aria-hidden`; the accessible name is `label`, not the glyph.
   */
  icon: React.ReactNode;
  onToggle: () => void;
  /**
   * WHERE IT STANDS, and this is the whole affordance. One logical inset
   * class, chosen by the caller from the column's state — never a physical
   * side, so the mirror is free in RTL.
   */
  placement: string;
}

function EdgeHandle({ edge, open, label, icon, onToggle, placement }: EdgeHandleProps) {
  return (
    <button
      type="button"
      data-slot="screen-shell-handle"
      data-edge={edge}
      data-state={open ? "open" : "shut"}
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className={cn(HANDLE_HIT, placement)}
    >
      {icon}
    </button>
  );
}

/**
 * The ground, the two flat columns, and the one card that floats.
 *
 * TEN STATES
 *  1. default        — the spine ground; the rail flat on it; the breadcrumb
 *                      on it, joined to the card's squared leading corner;
 *                      the floating card with the header band — eyebrow,
 *                      title at its derived step, the identity chips under
 *                      it, the quiet line — then the figures and the body,
 *                      and the footer last when one is declared; the aside
 *                      when one is passed; an edge handle per column.
 *  2. hover          — the edge handles only, a fill swap
 *                      (`--btn-primary-hover`) on the kit's own colour
 *                      duration and curve, same as `Button`'s. Nothing else
 *                      here is pressable; the band's own controls, the
 *                      rail's and the body's own theirs.
 *  3. focus-visible  — tokens.css §8 rings every control at once, and the
 *                      control here is the handle's own 32px circle (the
 *                      button IS the mark now, so the ring rings the same
 *                      box it paints) and the band's own mango, which is a
 *                      `Button` and carries its own.
 *  4. active/pressed — none of the shell's. A handle's press MOVES the
 *                      handle, which is a louder answer than a 1px nudge, and
 *                      the band's mango is a `Button`.
 *  5. disabled       — does not apply, anywhere. A shell is not a control,
 *                      and a region the reader may not see is ABSENT
 *                      (ch24.6): `rail={null}`, an omitted `aside`, an
 *                      omitted `onCreate` / `onEdit`, `actionsVisible={false}`
 *                      and `footerVisible={false}` all draw NOTHING rather
 *                      than something dimmed.
 *  6. loading        — NOT the shell's. Law 4: "a state is a body swap …
 *                      either way the rail, header and tabs stay drawn and
 *                      stay put." The shell is what stays put, so it has no
 *                      loading form of its own; `state` is forwarded to the
 *                      figure strip and to nothing else, and the body's own
 *                      state is `children`'s.
 *  7. empty          — same. An empty screen is a full shell with a register
 *                      in its card. A count of zero still renders as nothing
 *                      rather than "0" (`Badge`'s rule).
 *  8. error          — same, except the one exception law 4 names: a dead
 *                      session replaces the window, and a screen that does
 *                      that renders no shell at all rather than an empty one.
 *  9. rtl            — logical properties throughout. No physical side is
 *                      named anywhere in the file; the columns take their
 *                      edges from flex order, the handles from `start` /
 *                      `end`, and the card's one squared corner from
 *                      `rounded-ss` — start-start, not top-left — so the
 *                      mirror is free.
 * 10. dark           — every fill is a token. The ground is the spine —
 *                      #1C1B18 ink, #2F2D28 paper, #FED069 mango, which does
 *                      not move with the palette and must not — and the card
 *                      above it is #26241F, with `--shadow-lifted` at
 *                      rgba(0,0,0,.55) rather than light's .14 charcoal. Ink
 *                      measures 1.111, paper 1.127, mango 10.661. The thin
 *                      case is ink and paper, ~1.1–1.3 in both palettes
 *                      except ink-light (17.386 — see the file header's
 *                      "THE EDGE HANDLES" for the full six), which is what
 *                      the shadow exists for.
 *
 * THREE BREAKPOINTS
 *  mobile  — no rail, no aside, no handles; no title-row controls and no
 *            mango; no footer. The breadcrumb and the card stack on the
 *            ground, and the card keeps the gutter on all four sides. Every
 *            figure, every count and every identity chip stays: "drops
 *            controls, never counts".
 *  tablet  — both columns arrive at `md` and the shell is in its wide form;
 *            the band's controls and the footer come back at `sm`.
 *  desktop — the same form; only the body's inset steps up at `lg`.
 */
const ScreenShell = React.forwardRef<HTMLDivElement, ScreenShellProps>(
  (
    {
      rail,
      railLabel = "Sections",
      railCollapsed,
      defaultRailCollapsed = false,
      onRailCollapsedChange,
      railCollapseLabel = "Collapse the navbar",
      railExpandLabel = "Open the navbar",
      aside,
      asideLabel = "Assistant",
      asideOpen,
      defaultAsideOpen = false,
      onAsideOpenChange,
      asideOpenLabel = "Open the assistant",
      asideCloseLabel = "Close the assistant",
      spine = "mango",
      ambient,
      breadcrumb,
      breadcrumbDepth = ROOT_DEPTH,
      header,
      eyebrow,
      title,
      headingAs,
      actions,
      actionsVisible = true,
      narrowActions = false,
      onCreate,
      createLabel = "Add a record",
      onEdit,
      editLabel = "Edit",
      recordNumber,
      collectionLabel,
      chips,
      tags,
      meta,
      figures,
      figuresLabel,
      figuresVisible = true,
      figuresSurface = "bare",
      figureStrip,
      state = "ready",
      children,
      footer,
      footerVisible = true,
      narrowFooter = false,
      density = "comfortable",
      page = true,
      className,
      ...props
    },
    ref,
  ) => {
    /* BOTH PIECES OF STATE ARE UNCONTROLLED WITH AN ESCAPE HATCH, which is
       `Rail`'s own pattern and is here for `Rail`'s own reason: 26.02 says
       the collapse "persists per user", persistence is the application's, and
       the toggling is not worth making every call site own. */
    const [selfRailCollapsed, setSelfRailCollapsed] = React.useState(defaultRailCollapsed);
    const isRailCollapsed = railCollapsed ?? selfRailCollapsed;

    const [selfAsideOpen, setSelfAsideOpen] = React.useState(defaultAsideOpen);
    const isAsideOpen = asideOpen ?? selfAsideOpen;

    const toggleRail = () => {
      const next = !isRailCollapsed;
      if (railCollapsed === undefined) setSelfRailCollapsed(next);
      onRailCollapsedChange?.(next);
    };

    const toggleAside = () => {
      const next = !isAsideOpen;
      if (asideOpen === undefined) setSelfAsideOpen(next);
      onAsideOpenChange?.(next);
    };

    /* THE DEFAULT RAIL, and it has to be computed rather than a default
       parameter now: `Rail` needs the spine to pick which cut of the mark to
       load, and a default parameter cannot see a sibling parameter's value.
       `undefined` still means "the kit's specimen" and `null` still means
       "no rail at all", exactly as before.

       IT IS ALSO HANDED THE COLLAPSED STATE, SINCE 2026-09-02, because the
       shell now draws the control that moves it. A rail the CALL SITE built
       is not reachable this way and has to be threaded — see
       `railCollapsed`. */
    const railNode =
      rail === undefined ? <Rail spine={spine} collapsed={isRailCollapsed} /> : rail;

    /* An omitted `aside` is the two-column shell, unchanged. `null` says the
       same thing, so both are read the same way and no call site has to
       remember which. */
    const hasAside = aside !== undefined && aside !== null;

    /* 26.02: "One per workspace, never combined with a mango header." The
       mango spine IS the workspace's one brand fill, so the screen-level
       mango field yields to it. See the `ambient` prop doc for the whole
       argument and for why this lives here and not in the route. */
    const fieldSuppressed = spine === "mango" && ambient !== undefined;

    /* ── THE TITLE'S STEP, DERIVED ────────────────────────────────────────
       One tab means no parent means the door's own step; anything deeper
       steps down one rung. `SHAPE_HEADING_SIZE` is the door's number and is
       not restated — see TITLE_STEP_CHILD. Published as `data-title-step` so
       a harness can read the decision rather than infer it from a font size,
       and so a screenshot is not the only evidence. */
    const nested = breadcrumbDepth > ROOT_DEPTH;
    const titleStep = nested ? TITLE_STEP_CHILD[density] : SHAPE_HEADING_SIZE[density];

    /* ── THE SCREEN'S ONE MANGO ───────────────────────────────────────────
       A collection creates and a record edits; no screen does both, and
       ruling 26 is what says so. Checked rather than trusted, because the
       failure is silent — two mangos look like a design, not like a bug. */
    if (process.env.NODE_ENV !== "production" && onCreate && onEdit) {
      console.warn(
        "ScreenShell: onCreate and onEdit together are two mango actions on one screen (ruling 26). Drawing the create and dropping the edit.",
      );
    }

    /* GLYPH FOR CREATE, PENCIL AND WORD FOR EDIT — 26.01, and the one stated
       exception to it. `size="icon"` is what makes the create the circle the
       kit draws rather than a pill with a plus in it. No handler, no control:
       ch24.6 hides, never dims. */
    const mango = !actionsVisible
      ? null
      : onCreate !== undefined
        ? (
            <Button size="icon" onClick={onCreate} aria-label={createLabel}>
              <Plus aria-hidden="true" />
            </Button>
          )
        : onEdit !== undefined
          ? (
              <Button onClick={onEdit}>
                <PencilSimple aria-hidden="true" />
                {editLabel}
              </Button>
            )
          : null;

    /* The title row's trailing cluster: the paper pills, then the mango —
       commit furthest out, retreat beside it, the order every bar in the kit
       keeps. CONTROLS DROP NARROW, COUNTS DO NOT. */
    const rowActions =
      !actionsVisible || (actions === undefined && mango === null) ? undefined : (
        <span
          data-slot="screen-shell-actions"
          className={
            narrowActions ? "flex items-center gap-3" : "hidden items-center gap-3 sm:flex"
          }
        >
          {actions}
          {mango}
        </span>
      );

    /* ── THE IDENTITY ROW — DIRECTLY UNDER THE TITLE. OVERRIDE 73. ────────
       The black ID chip first, always; then the collection chip; then
       whatever else the record is. The two Badges are written here rather
       than asked for, because the client's sentence is a rule: "the black
       chip is always the ID. we always use black chips for IDs." */
    const hasIdentity =
      recordNumber !== undefined || collectionLabel !== undefined || chips !== undefined;

    const identityRow = !hasIdentity ? null : (
      <span data-slot="screen-shell-identity" className="flex flex-wrap items-center gap-2">
        {recordNumber !== undefined ? <Badge variant="inverse">{recordNumber}</Badge> : null}
        {collectionLabel !== undefined ? <Badge>{collectionLabel}</Badge> : null}
        {chips}
      </span>
    );

    /* ── THE BAND ─────────────────────────────────────────────────────────
       eyebrow → title (with the actions in its own row) → identity chips →
       tags → the quiet line. Nothing is drawn above the title on a record,
       which is the whole of override 73's removal.

       `rule={false}` KEEPS THE HAIRLINE OFF. The band is not a container, and
       a heavy hairline under it would be a stroke doing a container's job,
       which CH13 forbids ("Colour separates, strokes don't").

       `header` WINS WHEN IT IS GIVEN — the pre-collapse spelling, drawn
       instead of this, never beside it. See that prop. */
    const hasBand =
      title !== undefined ||
      eyebrow !== undefined ||
      identityRow !== null ||
      tags !== undefined ||
      meta !== undefined ||
      rowActions !== undefined;

    const band =
      header !== undefined ? (
        header
      ) : !hasBand ? null : (
        <div className="flex min-w-0 flex-col gap-3">
          <Title
            data-slot="screen-shell-heading"
            eyebrow={eyebrow}
            size={titleStep}
            as={headingAs}
            rule={false}
            actions={rowActions}
          >
            {title}
          </Title>
          {identityRow === null && tags === undefined && meta === undefined ? null : (
            <div className="flex min-w-0 flex-col gap-2">
              {identityRow}
              {tags !== undefined ? (
                <span className="flex flex-wrap items-center gap-2">{tags}</span>
              ) : null}
              {/* BARE. No fill, no radius, no rule — the band is not a
                  container and neither is the line under its heading. */}
              {meta === undefined ? null : (
                <Text as="p" size="sm" tone="secondary">
                  {meta}
                </Text>
              )}
            </div>
          )}
        </div>
      );

    /* ── THE FIGURE STRIP — BARE, AND NOT A CALL SITE'S DECISION ──────────
       `figureStrip` is the route's own drawing and wins; otherwise the strip
       is built from data at `surface="bare"`, which is the whole reason
       `figures` is data. An empty array draws nothing, not an empty strip. */
    const strip =
      figureStrip ??
      (figures === undefined || figures.length === 0 ? undefined : (
        <StatStrip
          figures={figures}
          visible={figuresVisible}
          surface={figuresSurface}
          label={figuresLabel}
          state={state}
        />
      ));

    /* ── THE FOOTER — DECLARED, AND ONLY DRAWN WHEN IT IS ─────────────────
       "Just define which pages have a footer." A page that passes none has
       none; `footerVisible={false}` is the reader who may not see the one
       this page has, and it draws NOTHING rather than something greyed
       (ch24.6). It drops narrow with the other controls unless the screen
       says otherwise — 27.39's own narrow render. */
    const footerNode =
      !footerVisible || footer === undefined ? null : (
        <div
          data-slot="screen-shell-footer"
          data-level="footer"
          className={cn("min-w-0", narrowFooter ? undefined : "hidden sm:block")}
        >
          {footer}
        </div>
      );

    const card = (
      <div
        data-slot="screen-shell-card"
        data-level="screen"
        data-spine={spine}
        data-ambient={fieldSuppressed ? "suppressed" : undefined}
        className={cn(
          SCREEN,
          DENSITY_GUTTER[density],
          DENSITY_RAIL[density],
          DENSITY_ASIDE[density],
        )}
      >
        {/* THE FIELD, if this is one of the three screens allowed one and the
            spine has not already spent the workspace's mango. It is placed,
            never drawn: the node decides what it is and the screen's own
            `relative isolate` decides where it can reach. */}
        {fieldSuppressed ? null : ambient}

        {/* THE CURSOR GLOW — client ruling 2026-09-03, "bring back the mango
            glow that follows the mouse … would be on the background layer,
            never over the body." MOUNTED HERE, UNCONDITIONALLY, RATHER THAN
            AS A SLOT: unlike `ambient` this is not a per-screen flourish a
            route opts into, it is a property of the shell itself, on every
            screen this shell ever draws.

            THE STACKING PROOF, NOT AN ASSUMPTION. `CursorGlow`'s own wrapper
            carries `-z-10` (see that file), which is a NEGATIVE stack level —
            CSS2.1 §E.2 step 2, painted before this SCREEN's own in-flow
            content (step 3+) and before every positioned descendant at
            stack level >= 0, which is everything else this shell draws: the
            rail dock and its `EdgeHandle` (`z-auto`/`z-10`), the content
            column carrying the breadcrumb, and the CARD itself
            (`relative z-[2]`, see the `CARD` comment below). A negative
            z-index inside THIS element's own `relative isolate` (the SCREEN
            div, immediately below) cannot ever paint above a z-0-or-higher
            sibling — that is what "negative" means in the stacking algorithm,
            not a convention this file has to maintain by keeping the glow
            first in the JSX. Measured in `verify/cursor-glow/`: the orb's
            resolved `z-index` is negative, the card's is positive, and a
            simulated `mousemove` over the card's own coordinates never
            changes the card's rendered pixels. Same guarantee `ambient`
            already relies on for this exact slot. */}
        <CursorGlow />

        {/* THE RAIL DOCK — the column PLUS the gutter after it, in one
            positioned box, and that pairing is what makes the handle's rule
            expressible in two classes.

            OPEN, the handle takes `start-0`: the dock's leading edge IS the
            rail's outer rim, flush to the window, which is where the client's
            spine screenshots have always put that edge.
            SHUT, it takes `end-[var(--shell-gutter)]`: one gutter in from the
            dock's trailing edge is exactly the COLUMN's inner edge, whatever
            width the icon rail happens to be.

            Either way the 32px circle lands mostly inside the column's own
            `--rail-inset` padding (18.75–24px depending on density), close
            enough to it that it never reaches a row's own icon or label —
            see "WHY 32, NOT `Button`'s OWN 40" in the file header for the
            arithmetic and the honest edge case it does not fully clear. */}
        {railNode ? (
          <div
            data-slot="screen-shell-rail-dock"
            className="relative hidden flex-none pe-[var(--shell-gutter)] md:flex"
          >
            <div
              data-slot="screen-shell-rail"
              data-level="rail"
              aria-label={railLabel}
              className={cn(
                "flex w-[13rem] min-h-0 flex-none flex-col",
                /* THE ICON RAIL. 26.02: the rail is "collapsible to an icon
                   rail", and a 32-wide column of glyphs inside a 208 column is
                   not one. The rail publishes `data-rail-collapsed` on its own
                   root and the column takes its content's width instead — a CSS
                   relationship, so the collapsed state stays the rail's single
                   source of truth and this shell grows no prop for it. THE
                   SHELL NOW HOLDS A STATE TOO, for the handle; this rule is
                   deliberately left reading the RAIL, so a rail that collapses
                   itself is still seated correctly. */
                "has-[[data-rail-collapsed]]:w-auto",
                RAIL_COLUMN,
              )}
            >
              {railNode}
            </div>
            <EdgeHandle
              edge="rail"
              open={!isRailCollapsed}
              label={isRailCollapsed ? railExpandLabel : railCollapseLabel}
              icon={
                isRailCollapsed ? (
                  <CaretLineRight aria-hidden="true" />
                ) : (
                  <CaretLineLeft aria-hidden="true" />
                )
              }
              onToggle={toggleRail}
              placement={cn(
                "top-1/2 -translate-y-1/2",
                isRailCollapsed ? "end-[var(--shell-gutter)]" : "start-0",
              )}
            />
          </div>
        ) : null}

        {/* THE CONTENT COLUMN — the breadcrumb on the ground, then the card.

            THE INLINE GUTTERS ARE PAID BY WHOEVER IS THERE TO PAY THEM. A
            dock pays its own side at `md` and up; below `md` the docks are
            gone, so this column pays both. Written as literal `md:` variants
            because Tailwind scans source text — see the note at the top. */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col py-[var(--shell-gutter)]",
            railNode ? "ps-[var(--shell-gutter)] md:ps-0" : "ps-[var(--shell-gutter)]",
            hasAside ? "pe-[var(--shell-gutter)] md:pe-0" : "pe-[var(--shell-gutter)]",
          )}
        >
          {/* THE BREADCRUMB — on the ground, aligned to the card's leading
              edge because it is the card's own sibling in this column and
              takes no inset of its own. NAVIGATION TEXT AND NOTHING ELSE:
              client rule, stated at the prop and not enforced in code.

              NO BLOCK-END PADDING, AND NO STACKING CONTEXT. Both are the
              joint with the card and both are argued at the `breadcrumb`
              prop and in the CARD block: the strip owns its own overlap, so
              any padding here is subtracted from it; and the strip's tabs sit
              at `z-[1]` and `z-[3]` around the card's `z-[2]`, which only
              resolves if this wrapper stays out of the way. So it declares no
              `z-index`, no `isolate`, no `transform`, no `opacity` and no
              `filter` — every one of those would open a context of its own
              and trap the tabs inside it. */}
          {breadcrumb ? (
            <div
              data-slot="screen-shell-breadcrumb"
              data-level="ground"
              className="min-w-0 shrink-0"
            >
              {breadcrumb}
            </div>
          ) : null}

          {/* THE CARD — the one floating thing. Square on its leading corner
              ONLY where the trail actually attaches; see `CARD_JOINED`.

              `<main>`, NOT `<div>` — THE ONLY LANDMARK CHANGE IN THIS BLOCK,
              AND IT IS LOAD-BEARING. Grepping the agency app's `layout.tsx`,
              `app-shell.tsx` and this file finds no `<main>` and no
              `role="main"` anywhere in its authenticated shell — every
              routed screen sits in plain `<div>`s, so a screen-reader user's
              landmark list has no entry for "the page" at all, only
              whatever this file already labels (the rail's `<nav>`, and now
              the aside's `role="complementary"`, above). `ScreenShell` is
              THE screen since the 2026-09-02 collapse — every route in the
              agency app renders exactly one of these per document — so
              fixing it here, once, is one correct answer both doors inherit
              instead of each hand-rolling its own. THE CLIENT PORTAL DOES
              NOT DOUBLE UP: `web-portal/components/portal-shell.tsx` draws
              its own `<main>` directly and never imports `ScreenShell`, so
              this element and that one are never on the same page — checked
              before this landed, not assumed. THE HEADER BAND AND THE BODY
              ARE BOTH INSIDE IT, THE BREADCRUMB IS NOT: the trail above is
              navigation chrome (and `BreadcrumbFolders` already carries its
              own `<nav>`), but the title, the actions and everything the
              route actually renders are the page's main content, which is
              exactly what this element wraps. */}
          <main
            data-slot="screen-shell-content"
            data-level="card"
            data-joined={breadcrumb ? "" : undefined}
            className={cn(CARD, breadcrumb ? CARD_JOINED : undefined)}
          >
            {/* THE HEADER BAND — not a container, and now literally so.
                ch24.6, verbatim: "The header band is transparent — it takes
                the page tone." Inside the card that tone is the card's, and
                after the client's ruling it is a tone rather than a paper.

                Since the collapse the band's CONTENTS are the shell's too;
                `band` is either the slots assembled above or the raw `header`
                node a pre-collapse call site handed in. */}
            {band ? (
              <div
                data-slot="screen-shell-header"
                data-level="header-band"
                data-title-step={header === undefined && title !== undefined ? titleStep : undefined}
                className={cn("min-w-0 shrink-0", DENSITY_HEADER[density])}
              >
                {band}
              </div>
            ) : null}

            {/* THE BODY — the card's tone, padded, and the card's scroller.
                Every panel on it is soft paper.

                THE FIGURES LEAD IT AND THE FOOTER CLOSES IT, both in normal
                flow inside this one scroller. The column is only drawn when
                there is more than one thing in it, so a screen that passes
                neither gets exactly the markup it got before the collapse —
                `children` alone in the padded body. */}
            <div
              data-slot="screen-shell-body"
              data-level="body"
              className={cn(BODY, DENSITY_BODY[density])}
            >
              {strip === undefined && footerNode === null ? (
                children
              ) : (
                <div
                  data-slot="screen-shell-stack"
                  className={cn("flex min-w-0 flex-col", DENSITY_STACK[density])}
                >
                  {strip}
                  {children}
                  {footerNode}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* THE ASIDE DOCK — the gutter BEFORE the column, mirroring the rail
            dock — AND, OPEN ONLY, A SECOND GUTTER AFTER IT, which the rail
            deliberately does not carry.

            THE RAIL'S OUTER EDGE STAYS FLUSH ON PURPOSE (see `screen-shell-
            rail-dock`, above): the client's spine screenshots pin that edge
            to the window with no gutter at all, and this file leaves it
            alone. THE ASIDE'S OUTER EDGE IS A DIFFERENT RULING. Owner,
            2026-09-03, on the live product: "the same spacing that is at
            the bottom of the content and between the content and the
            assistant — I want it on the right of the assistant / so same
            margins everywhere." Today that edge is flush to the window with
            NO margin at all — the one edge of the card's whole neighbourhood
            that was not `--shell-gutter` — so `pe-[var(--shell-gutter)]`
            joins the dock's own `ps-[var(--shell-gutter)]` when the column is
            open, spending the SAME token a second time rather than a new
            number: card-to-assistant and assistant-to-window are now the one
            measure, exactly as content-to-rail and content-to-window
            (window-to-rail, rather — the rail's flush edge) already read as
            one measure apiece.

            IT IS CONDITIONAL ON `isAsideOpen`, NOT A PERMANENT CLASS, because
            the SHUT case has its own settled invariant one paragraph down
            ("the dock IS the gutter" — one `--shell-gutter`, not two) and
            widening it unconditionally would double the window-edge gap
            every time the column is closed, which nobody asked for.

            OPEN, the handle takes `end-[var(--shell-gutter)]`: the new
            padding sits OUTSIDE the handle's containing block's coordinate
            system (insets are measured from the padding edge, so `end-0`
            would still have landed at the window regardless of the new
            padding) — so the placement has to move in step with it, from
            the window's edge to the ASIDE COLUMN's own outer edge, one
            gutter in. This is the identical formula the rail's own SHUT
            state already uses to find ITS column's edge past a `pe-gutter`
            (`placement={isRailCollapsed ? "end-[var(--shell-gutter)]" : ...}`
            above) — read here for the open case instead of the collapsed
            one, because this dock's extra padding is on the open case.
            SHUT, the column is not rendered at all — zero width, no strip, no
            icons, client verbatim — so the dock IS the gutter, ONLY
            `--shell-gutter` (18.75–20px) wide with no buffer past it to the
            window's true edge, unlike the open case above.

            THIS IS WHERE THE CIRCLE GENUINELY CHANGED THE GEOMETRY, so it
            gets its own placement rather than the bar's `start-0`. The bar
            was 20px wide and the gutter was ~18.75–24, so `start-0` (pinned
            to the dock's card-facing edge, extending TOWARD the window)
            landed inside the dock with at most a sub-pixel spillage nobody
            could see. The circle is 32px — wider than the gutter at every
            density — so the same `start-0` would push its far edge PAST the
            window's true edge (measured: 13.25px off-canvas at 1440 wide),
            which is not an overlap, it is the button getting cropped by the
            viewport. `end-0` instead: the circle's WINDOW-facing edge is
            what is pinned now, flush to the true edge exactly the way the
            kit's own floating launcher is (`fixed right-4 …` in
            `web/components/agent-host.tsx`), and it is the card that eats
            the extra width, the same direction the old 20px box already
            spilled into by 1.25px — a floating round button sitting slightly
            over the card's own rounded corner is the shape a floating button
            is supposed to take, not a defect to hide. */}
        {hasAside ? (
          <div
            data-slot="screen-shell-aside-dock"
            data-state={isAsideOpen ? "open" : "shut"}
            className={cn(
              /* `py-[var(--shell-gutter)]` MAKES THE ASSISTANT END WHERE THE
                 CARD ENDS. The content column's own wrapper has always paid
                 this vertical gutter, which is what insets the card away from
                 the window's top and bottom edges. This dock paid only the
                 horizontal one, so the assistant ran the full height of the
                 viewport and its composer sat hard against the bottom edge,
                 past where the card stops (client, 2026-09-04: "the assistant
                 frame is too long and it exits the screen. make it exactly as
                 the main content"). Same token, same number, both columns —
                 so the two can never disagree about where the page ends.

                 BOTTOM ONLY, and the top is not an oversight. `py-` was tried
                 first and pushed the whole column down 18.75px: the aside
                 pays its top gutter INSIDE the tab already, which is what
                 puts the tab's control level with the breadcrumb (18.75) and
                 the body's top level with the card's (47.33). A top padding
                 here double-counts that. Measured both ways before settling
                 on `pb-`. */
              "relative hidden flex-none pb-[var(--shell-gutter)] ps-[var(--shell-gutter)] md:flex",
              isAsideOpen && "pe-[var(--shell-gutter)]",
            )}
          >
            {/* IT COLLAPSES NOW RATHER THAN VANISHING — client, 2026-09-04:
                "that should minimize it with a nice animation."

                The column used to be mounted on `isAsideOpen` and unmounted
                the instant it flipped, so there was nothing left in the tree
                for an exit to play on. This wrapper is what stays: it holds
                the column at all times and collapses the track it sits in,
                `.motion-column-collapse` (motion.css §7) — the inline-axis
                twin of the row collapse, added for this, so the timing and
                curve stay in the motion layer where law 6.1 requires them.

                `inert` WHEN SHUT IS NOT OPTIONAL. A collapsed track is zero
                pixels wide and fully transparent, but its contents are still
                in the accessibility tree and still in the tab order — a
                keyboard reader would tab into a panel nobody can see, which
                is a worse bug than the instant disappearance this replaces.
                `inert` removes the whole subtree from focus and from the
                accessibility tree in one attribute, which is exactly the
                "shows nothing" the client's own earlier ruling asked for
                ("closed assistant show nothing, it's literally only the
                bar") — now true for a keyboard and a screen reader, not only
                for the eye.

                ONE THING STILL STEPS RATHER THAN EASING, said plainly: the
                dock's own trailing gutter (`pe-[var(--shell-gutter)]`, above)
                is dropped the moment the state flips, so the ~22px of air
                beyond the column disappears in one frame while the column
                itself eases away. It sits OUTSIDE this wrapper — moving it
                inside would either double the shut state's gutter or shrink
                the open panel's own width, both of which are measured
                properties other rulings depend on. A small step at the
                outermost edge, during a 140ms exit; logged here rather than
                left for someone to rediscover. */}
            <div
              /* `flex min-h-0` IS LOAD-BEARING, NOT TIDINESS. The dock is a
                 flex row and the column used to be its DIRECT child, so it
                 stretched to the row's height for free. Putting this wrapper
                 between them broke that: a block box does not stretch its
                 child, so the column sized to its CONTENT and ran off the
                 bottom of the viewport while the card beside it still ended
                 correctly (client screenshot, 2026-09-04: "the assistant
                 frame is too long and it exits the screen"). Making the
                 wrapper a flex container hands the stretch back down, and
                 `min-h-0` is what lets the column's own `overflow-y-auto`
                 scroll instead of pushing the box taller. */
              className="motion-column-collapse flex min-h-0 flex-none"
              data-state={isAsideOpen ? "open" : "closed"}
              inert={!isAsideOpen}
              /* THE OPEN WIDTH IS DECLARED HERE, ONCE, and read by the motion
                 layer through `--motion-column-size` — see that rule for why
                 it cannot derive the width itself inside a flex row. It is
                 the same `min(23.75rem, 40vw)` the column below spells as
                 `w-[23.75rem] max-w-[40vw]`, which is the one duplication
                 this approach costs: Tailwind's arbitrary values cannot be
                 read back out as a custom property. Kept adjacent and
                 measured together in verify/shell-chat so the two cannot
                 drift silently. */
              style={{ "--motion-column-size": "min(23.75rem, 40vw)" } as React.CSSProperties}
            >
              <div
                data-slot="screen-shell-aside"
                data-level="aside"
                role="complementary"
                aria-label={asideLabel}
                className="flex w-[23.75rem] min-h-0 max-w-[40vw] flex-none flex-col overflow-y-auto"
              >
                {/* `role="complementary"` IS THE FIX, NOT DECORATION. A `<div>`
                    computes to the `generic` role no matter what `aria-label`
                    it carries, and a labelled generic is not a landmark — the
                    accessible-name-and-description spec attaches the name to
                    the element's own role, and `generic` has no landmark
                    mapping for that name to land on. So `asideLabel` was
                    always readable AT the assistant, never as an entry in a
                    screen reader's "jump to region" list; a reader had to tab
                    linearly through the rail, the breadcrumb and the card to
                    reach it. `RAIL` (above) does not share this defect even
                    though `screen-shell-rail`'s own wrapper is the identical
                    role-less-div shape — its landmark comes from the real
                    `<nav aria-label>` `Rail`'s own root draws one level in,
                    not from this shell's wrapper. The aside has no such inner
                    node — `BreadcrumbFolders` renders a `<nav>` of its own for
                    the tab, but that nav names the TAB ("Clients"), not the
                    panel — so the wrapper has to carry the role itself.
                    `complementary` over `<aside>`: this file's other levels
                    (`rail`, `card`, `body`) are all plain `<div>`s keyed by
                    `data-level`, and swapping element types for one of five
                    would make the shape read as an exception rather than a
                    role attribute doing its one job. */}
                {/* THE TAB — `asideLabel` drawn as ONE folder tab, through the
                    same component the content trail uses rather than a second
                    drawing of the shape. `label` reuses `asideLabel` too — the
                    landmark's name is the same word the tab shows, not a
                    second string to translate.

                    CLIENT, 2026-09-04: "i want to close the assistant by
                    clicking on its folder tab, that should minimize it." A
                    single, otherwise-read-only crumb is `BreadcrumbFolders`'
                    own "one tab, nothing to its left" state (its TEN STATES
                    #1) — but THIS tab is not a location, it is furniture that
                    doubles as the column's close control, so it now takes
                    that component's `onCurrentActivate` escape hatch instead:
                    the ONLY call site in the kit that does, added to
                    `BreadcrumbFolders` for exactly this. Every real
                    breadcrumb trail (the content column's own, above) never
                    passes it and renders BYTE-IDENTICAL to before this
                    change — see that prop's own doc for why a real trail's
                    "current page is not a link" law cannot be reached by a
                    call site that leaves it out.

                    `toggleAside` / `asideCloseLabel` ARE THE EDGE HANDLE'S
                    OWN — not a second pair invented for the tab. Both
                    controls flip the identical `isAsideOpen` state through
                    the identical handler, and both announce the identical
                    string ("Close the assistant" by default) while the
                    column is open, so a screen reader hears one description
                    of one action from either control, never two. This block
                    only renders while `isAsideOpen` is true (see the
                    ternary above), which is also why `currentActivateExpanded`
                    can safely read `isAsideOpen` directly rather than a
                    literal `true` — it is always true here, and stays
                    correct if that ever stops being so.

                    NO ANIMATION IS WIRED TO THE CLOSE ITSELF. "Minimise"
                    wants the column collapsing toward its edge rather than
                    the instant unmount below; `foundations/motion/motion.css`
                    has a grid-template-ROWS 0fr/1fr collapse for a row
                    (`.motion-row-collapse`) and for a disclosure
                    (`.motion-disclosure-grid`), but nothing that collapses on
                    the INLINE axis (columns/width), which is this column's
                    own direction of travel — and `rail.tsx`'s own collapse
                    (the only other column that shrinks in this file) is
                    ALSO unanimated today, confirming there is no existing
                    class to reach for instead. Motion is a foundation this
                    file may not edit while another agent owns it, so the
                    close/open toggle stays exactly the instant swap it
                    already was rather than growing a local transition —
                    see the report for the class this needs.

                    UNPADDED AT THE BLOCK-END, same reasoning as
                    `screen-shell-breadcrumb`: the strip's own negative margin
                    (`--folder-tab-overlap`) is the whole attachment mechanic,
                    so padding here would be subtracted from it. */}
                <div data-slot="screen-shell-aside-tab" className={cn("min-w-0 shrink-0", ASIDE_TAB)}>
                  <BreadcrumbFolders
                    items={[{ label: asideLabel }]}
                    label={asideLabel}
                    onCurrentActivate={toggleAside}
                    currentActivateLabel={asideCloseLabel}
                    currentActivateExpanded={isAsideOpen}
                  />
                </div>
                {/* THE PANEL'S OWN SLOT. Still "paper on the ground, painting
                    nothing" — the caller's node fills this exactly as it
                    filled the old single wrapper; only the padding moved. */}
                <div data-slot="screen-shell-aside-body" className={cn("min-h-0 flex-1", ASIDE_BODY)}>
                  {aside}
                </div>
              </div>
            </div>
            <EdgeHandle
              edge="aside"
              open={isAsideOpen}
              label={isAsideOpen ? asideCloseLabel : asideOpenLabel}
              icon={<Sparkle aria-hidden="true" />}
              onToggle={toggleAside}
              /* TWO DIFFERENT PLACES, because it is answering two different
                 questions. OPEN, it is a close control belonging to the
                 column it sits against, so it stays where that column's own
                 edge is — vertically centred, the mid-edge grab every other
                 handle uses. SHUT, the column is gone and the button is the
                 only way back to the assistant; the client looked for it in
                 the screen's top-right corner and it was floating in the
                 middle of the right edge instead. So when shut it takes the
                 corner: one shell gutter down from the top, one in from the
                 end, the same inset the content column pays, which is what
                 makes it read as sitting in the page's corner rather than
                 stuck to its side. */
              placement={
                isAsideOpen
                  ? "top-1/2 -translate-y-1/2 end-[var(--shell-gutter)]"
                  : "top-[var(--shell-gutter)] end-[var(--shell-gutter)]"
              }
            />
          </div>
        ) : null}
      </div>
    );

    if (!page) {
      return (
        <div
          ref={ref}
          data-slot="screen-shell"
          data-spine={spine}
          className={cn("min-w-0", className)}
          {...props}
        >
          {card}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-slot="screen-shell"
        data-level="page"
        data-spine={spine}
        className={cn(PAGE, className)}
        {...props}
      >
        {card}
      </div>
    );
  },
);

ScreenShell.displayName = "ScreenShell";

export { ScreenShell };
