/* ============================================================================
   The screens — tier 3.

   WHAT A SCREEN IS, AND WHY THERE ARE ONLY EIGHTEEN OF THEM
   A screen is a place a person navigates TO and that the kit ships as a
   FINISHED PAGE rather than as a template to fill in. The client's law, 
   2026-08-24, verbatim:

     "we only needed the 'template' for main / detail screens! ... we don't
      need the actual pages (only exception home, settings, external pages
      (sign in etc). those are screens."

   Plus two rulings that name three more: "profile onboarding brand are
   screens" and "company hub is a screen".

   So this folder is the exceptions and nothing else. Every collection page
   and every record page a product has is now the application's own, built on
   `../templates`. Eighteen files here, where there were twenty-five screens,
   twenty-three system routes and seven portal routes — 9,504 lines of example
   pages were deleted on 2026-08-24 and are not coming back.

   None of them draws. Every one composes `../templates`, the structures and
   the controls, and writes no fill, no radius, no ring and no type step.

   THE EIGHTEEN, IN THE ORDER A PERSON MEETS THEM
     BEFORE YOU ARE ANYONE
       SplashScreen          · splash.tsx           cold start, the mark on
                               the ground for the instant before the app knows
                               what to draw
       AuthShell             · sign-in.tsx          the frame all five
                               "before you are signed in" screens share
       SignInScreen          · sign-in.tsx
       LoginRoute            · sign-in-system.tsx   the STAFF door: the words
                               and the provider row, forwarded to the SignIn
                               template
       PortalLoginRoute      · sign-in-portal.tsx   the CLIENT door: the same
                               two steps in the portal's calmer measure
       LinkSentScreen        · link-sent.tsx        names the exact address the
                               mail went to, and counts down
       InviteAcceptanceScreen· invite-acceptance.tsx the only place someone
                               meets kwapso before they have an account
       SessionExpiredScreen  · session-expired.tsx  the one state allowed to
                               replace the whole frame
       PortalIndexRoute      · portal-boot.tsx      the portal's `/`. Not a
                               destination — the splash for the instant before
                               it knows whether to send you to home or the door

     THE STAFF DOOR
       HomeRoute             · home.tsx             the ONE landing screen.
                               `/` is a redirect, declared once as
                               `SYSTEM_ROOT_REDIRECT`, not a second screen
       SettingsRoute         · settings.tsx         the workspace's switches
       ProfileRoute          · profile.tsx          your own record, edited
       OnboardingRoute       · onboarding.tsx       the three steps a new
                               member walks once. Never a tour
       BrandRoute            · brand.tsx            for reference. Nothing on
                               it is editable (override 26)
       CompanyHubScreen      · company-hub.tsx      one client company's page
       NotFoundScreen        · not-found.tsx        the rail is still drawn, so
                               you are still inside the app: a main screen with
                               nothing in it

     THE CLIENT DOOR
       PortalHomeRoute       · portal-home.tsx      waiting on you, deliveries,
                               and a savings figure that never renders without
                               the arithmetic behind it
       PortalImpactRoute     · portal-impact.tsx    what the work changed, and
                               the arithmetic behind the claim

   NOTIFICATIONS IS NOT HERE ANY MORE. The client ruled it a control; it is
   `controls/notifications/`. Recorded because it was a 619-line screen in
   this folder until 2026-08-24.

   EVERY PORTAL NAME IS PREFIXED `Portal`, deliberately, so the two doors'
   screens can sit in one application without either being renamed at the
   import.

   THIS LIST IS EXPLICIT AND THAT IS DELIBERATE. A wildcard `export *` cannot
   be merged by two agents editing at once; a list of named blocks can.

   TYPES ARE EXPORTED WITH `export type`, because `verbatimModuleSyntax` is on.
   No `"use client"`: a barrel is not a component.
   ========================================================================= */

/* ---- before you are anyone ---------------------------------------------- */

export { SplashScreen } from "./splash";
export type { SplashField, SplashScreenProps } from "./splash";

export { AuthShell, SignInScreen } from "./sign-in";
export type { AuthShellProps, SignInScreenProps } from "./sign-in";

export { LoginRoute } from "./sign-in-system";
export type { LoginRouteProps } from "./sign-in-system";

export { PortalLoginRoute } from "./sign-in-portal";
export type { PortalLoginLabels, PortalLoginRouteProps } from "./sign-in-portal";

export { LinkSentScreen, formatResendCountdown } from "./link-sent";
export type { LinkSentScreenProps } from "./link-sent";

export { InviteAcceptanceScreen } from "./invite-acceptance";
export type { InviteAcceptanceScreenProps } from "./invite-acceptance";

export { SessionExpiredScreen } from "./session-expired";
export type { SessionExpiredScreenProps } from "./session-expired";

export { PortalIndexRoute } from "./portal-boot";
export type { PortalIndexLabels, PortalIndexRouteProps } from "./portal-boot";

/* ---- the staff door ------------------------------------------------------ */

export { HomeRoute, SYSTEM_ROOT_REDIRECT } from "./home";
export type { HomeColumnKey, HomeRouteProps, HomeTicket } from "./home";

export { SettingsRoute } from "./settings";
export type { SettingsRouteProps, SettingsSectionId, SettingsValues } from "./settings";

export { ProfileRoute } from "./profile";
export type { ProfileRouteProps, ProfileValues } from "./profile";

export { OnboardingRoute } from "./onboarding";
export type {
  OnboardingAccount,
  OnboardingRouteProps,
  OnboardingStepId,
} from "./onboarding";

export { BrandRoute, BRAND_COLOURS, BRAND_TYPE } from "./brand";
export type {
  BrandFact,
  BrandRouteProps,
  BrandSectionId,
  BrandSwatch,
  BrandTypeStep,
} from "./brand";

export { COMPANY_FIGURES, COMPANY_FIGURE_COUNT, CompanyHubScreen } from "./company-hub";
export type { CompanyFigure, CompanyHubLabels, CompanyHubScreenProps } from "./company-hub";

export { NotFoundScreen } from "./not-found";
export type {
  NotFoundCase,
  NotFoundDoor,
  NotFoundLabels,
  NotFoundScreenProps,
} from "./not-found";

/* ---- the client door ----------------------------------------------------- */

export { PortalHomeRoute } from "./portal-home";
export type { PortalHomeLabels, PortalHomeRouteProps } from "./portal-home";

export { PortalImpactRoute } from "./portal-impact";
export type { PortalImpactLabels, PortalImpactRouteProps } from "./portal-impact";
