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
     0  ScreenShell         · screen-shell.tsx — the GROUND AND TWO PAPERS
                              every screen in both doors sits on. The page, the
                              header band and the body are all OFF-BEIGE; the
                              only soft paper is the RAIL and the PANEL. It
                              is numbered 0 because it is under the others
                              rather than beside them.
     0a MainScreen          · main-screen.tsx   — "in the navbar"
     0b DetailScreen        · detail-screen.tsx — "has breadcrumbs"
     0c Rail                · rail.tsx — THE NAVBAR ITSELF. The third region
                              of the shell, beside the two screens that fill
                              in the header band. It is here and not in
                              `controls/` for the same reason `ScreenShell`
                              is: both screens share it UNCHANGED and neither
                              owns it, it composes controls rather than
                              drawing, and it needs designing once and applies
                              forty times. A control draws one control; this
                              arranges a whole region of a screen.
        The client's own two words for the kit's "list page" and "detail
        page". They are the shell with the three things that differ between
        them filled in, and nothing else; `SHELL.md`'s table is exhaustive.

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

/* 0 · ScreenShell — a ground and two papers, established by counting chapter
   27's own assembled screens: the frame is off-beige 87 times out of 87 and
   the rail is soft paper 28 out of 28. The header band is off-beige on the
   client's ruling of 2026-08-24, which is the one place this shell departs
   from the artifact. `SHELL.md` carries the counts and the departure.
   `ScreenSpine` is exported beside the shell because a route that sets a
   spine should not have to reach into the module for its type. */
export { ScreenShell, RAIL_WIDTH } from "./screen-shell";
export type { ScreenShellProps, ScreenSpine } from "./screen-shell";

/* 0a · MainScreen — a screen that is in the navbar. Eyebrow with a count,
   folder tabs, a bare figure strip, the mango `+`, and never a footer. */
export { MainScreen } from "./main-screen";
export type { MainScreenProps } from "./main-screen";

/* 0b · DetailScreen — a screen that has breadcrumbs. Parent-and-number
   eyebrow, underline tabs, the identity chip row, the mango `Edit`, and the
   charcoal footer. */
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
