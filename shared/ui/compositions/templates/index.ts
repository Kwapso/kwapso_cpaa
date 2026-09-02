/* ============================================================================
   The templates — tier 3.

   WHAT A TEMPLATE IS
   An arrangement of controls and structures into the SHAPE of a screen a
   product actually has, with nothing product-specific in it. It composes; it
   does not draw. Not one file in this folder writes a fill, a radius, a ring
   or a type step, and the one place a class appears at all is layout for a
   template's own wrapper.

   THIS FOLDER WAS CALLED `shapes/` UNTIL 2026-08-24. The client retired the
   word: "we only needed the 'template' for main / detail screens!" — so the
   folder, the barrel, the demo's label and every heading that said "shape"
   now say TEMPLATE. Nothing about any file's behaviour changed with the name.

   WHY THIS FILE EXISTS
   One entry point, so an application imports a template by name and never has
   to know which file it lives in. Re-exports only: this module holds no
   component, no constant and no type of its own, so importing it can never
   change what any template does.

   THE FIFTEEN
     0  ScreenShell         · screen-shell.tsx — THE ONE SCREEN. The ground,
                              the two flat columns, the one floating card, and
                              every slot that varies between a top-level
                              collection and a record. It is numbered 0
                              because it is under the others rather than
                              beside them.
     0a MainScreen          · main-screen.tsx   — DEPRECATED ADAPTER
     0b DetailScreen        · detail-screen.tsx — DEPRECATED ADAPTER
     0c Rail                · rail.tsx — THE NAVBAR ITSELF. The second region
                              of the shell. It is here and not in `controls/`
                              for the same reason `ScreenShell` is: every
                              screen shares it UNCHANGED and none owns it, it
                              composes controls rather than drawing, and it
                              needs designing once and applies forty times. A
                              control draws one control; this arranges a whole
                              region of a screen.

     0a AND 0b COLLAPSED INTO 0 ON 2026-09-02, ON A CLIENT RULING: "Let's
     completely get rid of these three variations. Let's just do one shell,
     and then let's just explain that there are variations for the title if
     it's main screen with no parents or not. Also, just define which pages
     have a footer." `SHELL.md`'s three differences and the fourth nobody had
     counted — the figure strip — are four SLOTS on `ScreenShell` now, and
     every ruling either file's header carried has moved into
     `screen-shell.tsx` rather than been summarised there. The two names
     survive as adapters that map old prop names onto those slots and decide
     nothing; a screen written today composes `ScreenShell`.

     1  RecordChrome        · record-chrome.tsx
     2  CollectionScreen    · collection-screen.tsx
     3  StatStrip           · stat-strip.tsx
     4  StepperHero         · stepper-hero.tsx
     5  FormScreen          · form-screen.tsx
     6  SignIn              · sign-in.tsx
     7  ImportFlow          · import-flow.tsx
     8  SearchResults       · search-results.tsx
     9  PortalHome          · portal-home.tsx
    10  MultiStepForm       · multi-step-form.tsx — StepperHero + FormScreen,
                              for decisions with consequences rather than for
                              long forms. Arrived from `screens/` in the
                              2026-08-24 restructure: it is a shape, not a
                              page.
    11  RecordRoute         · record-route.tsx — RecordChrome + StepperHero,
                              the dynamic record screen. Was `system/t.tsx`,
                              the one route the client kept, "becoming part of
                              the DetailScreen template". Its seven-stage
                              vocabulary, `SYSTEM_STAGES`, comes with it.

   THREE THAT USED TO BE LISTED HERE HAVE LEFT THE FOLDER
     Assistant           → `../overlays` — a launcher and a floating panel.
     PortalConversation  → `structures/portal-conversation` — a thread of
                           bubbles with a composer, the same category as
                           `chat` and `ticket-thread`.
     ShapeStateBody      → `../states` — it is literally the three registers.
   All three are still re-exported by `compositions/index.ts`, so an
   application that imports from the top never notices which folder they are
   in. Importing them from HERE is what stopped working.

   TYPES ARE EXPORTED WITH `export type`
   `verbatimModuleSyntax` is on, so a type re-exported through a value export
   would survive into the emitted JavaScript as an import of something that
   does not exist at runtime.

   RENDERING CONTEXT
   No `"use client"`. A barrel is not a component and marking it would push
   the boundary onto every consumer of every template, including the ones that
   need none.
   ========================================================================= */

/* 0 · ScreenShell — THE ONE SCREEN. A ground and two papers, established by
   counting chapter 27's own assembled screens: the frame is off-beige 87
   times out of 87 and the rail is soft paper 28 out of 28. The header band is
   off-beige on the client's ruling of 2026-08-24, which is the one place this
   shell departs from the artifact. `SHELL.md` carries the counts and the
   departure. Since 2026-09-02 it also carries the four slots that vary — the
   derived title step, the identity chips, the bare figure strip and the
   declared footer. `ScreenSpine` is exported beside it because a route that
   sets a spine should not have to reach into the module for its type. */
export { ScreenShell, RAIL_WIDTH, ASIDE_WIDTH } from "./screen-shell";
export type { ScreenShellProps, ScreenSpine } from "./screen-shell";

/* 0a · MainScreen — DEPRECATED. A mapping from a collection screen's old prop
   names onto `ScreenShell`'s slots, plus the `CollectionFrame` that was never
   the shell's. It decides nothing. Compose `ScreenShell` directly. */
export { MainScreen } from "./main-screen";
export type { MainScreenProps } from "./main-screen";

/* 0b · DetailScreen — DEPRECATED. The same mapping for a record, plus the
   `RecordChrome` that was never the shell's. It decides nothing. Compose
   `ScreenShell` directly. */
export { DetailScreen } from "./detail-screen";
export type { DetailScreenProps } from "./detail-screen";

/* 0c · Rail — the navbar. Grouped entries on the screen card's soft paper,
   one lit, a member chip at the foot, and an icon rail when collapsed.
   `ScreenShell` falls back to it, so no screen renders without navigation. */
export { Rail, RAIL_PLACEHOLDER_GROUPS } from "./rail";
export type { RailGroup, RailItem, RailMember, RailProps } from "./rail";

/* 1 · RecordChrome — the four regions every record screen is made of. */
export { RecordChrome, RECORD_STAGE_COUNT } from "./record-chrome";
export type { RecordChromeProps, RecordDoor } from "./record-chrome";

/* 2 · CollectionScreen — heading, count, tabs, toolbar, rows, pager. */
export { CollectionScreen } from "./collection-screen";
export type { CollectionScreenProps } from "./collection-screen";

/* 3 · StatStrip — the headline numbers, each with an optional spark. */
export { StatStrip, MAX_SPARK_SERIES, MAX_STRIP_FIGURES } from "./stat-strip";
export type { StatSpark, StatStripFigure, StatStripProps } from "./stat-strip";

/* 4 · StepperHero — the stage progression above a record. */
export { StepperHero, STEPPER_FOLD_AFTER, STEPPER_STAGE_COUNT } from "./stepper-hero";
export type { StepperDoor, StepperHeroProps } from "./stepper-hero";

/* 5 · FormScreen — grouped fields, one commit, the slide-in and the page. */
export { FormScreen } from "./form-screen";
export type { FormScreenProps, FormScreenSection, FormSurface } from "./form-screen";

/* 6 · SignIn — the two-step door, and the splash in front of it. */
export { SignIn, SignInSplash, SIGN_IN_CODE_LENGTH } from "./sign-in";
export type {
  SignInProps,
  SignInProvider,
  SignInSplashProps,
  SignInStep,
  SplashField,
} from "./sign-in";

/* 7 · ImportFlow — file, mapping, preview, commit. Nothing written early. */
export { ImportFlow, IMPORT_STEPS } from "./import-flow";
export type { ImportFailure, ImportFlowProps } from "./import-flow";

/* 8 · SearchResults — facets, sort, the exact count, and pages. */
export { SearchResults, SEARCH_PAGE_SIZE, SEARCH_PORTAL_KINDS } from "./search-results";
export type {
  SearchDoor,
  SearchResultGroup,
  SearchResultsProps,
} from "./search-results";

/* 9 · PortalHome — waiting on you, deliveries, and a savings figure that
   cannot be rendered without the words that explain it. */
export { PortalHome, PortalSavingsFigure } from "./portal-home";
export type {
  PortalHomeProps,
  PortalSavings,
  PortalSavingsFigureProps,
} from "./portal-home";

/* 10 · MultiStepForm — StepperHero over FormScreen. For a decision with
   consequences, never for a long form. */
export { MAX_WIZARD_STEPS, MultiStepForm, WizardPickList } from "./multi-step-form";
export type {
  MultiStepFormLabels,
  MultiStepFormProps,
  WizardPick,
  WizardPickListProps,
  WizardStep,
} from "./multi-step-form";

/* 11 · RecordRoute — the dynamic record screen: RecordChrome + StepperHero,
   one file, fourteen screens across the two doors. `SYSTEM_STAGES` is its
   seven-stage vocabulary. */
export { RecordRoute, SYSTEM_STAGES } from "./record-route";
export type { RecordLabels, RecordRouteProps } from "./record-route";
