// shared/brand.ts — THE one place to brand this app, minus the palette.
//
// Change these values and the app's IDENTITY changes everywhere: name, logo,
// motto, description. It is read by the web UI AND by communications (login
// emails), so changing the name here updates it in the app and in the post.
//
// ── THE COLOURS MOVED OUT ON 2026-08-22, AND THAT IS THE FIX ───────────────
//
// This file used to carry the palette too, as six oklch values that
// `BrandTheme` injected over the component library's own theme at raised
// specificity. That arrangement existed for one reason: the library was a
// separate package shipping a "Teal" preset nobody here wanted, and it could
// not be edited, so the app painted over it from outside.
//
// It cost exactly what a corrective layer costs. The comment further down this
// file — kept, because the correction is the useful part — records `--primary`
// being overridden while `--primary-foreground` was left at the library's pure
// white, which made every primary button in the app white-on-pale-mango at about
// 1.4:1: the precise look of a control you are not meant to press. A token that
// names a surface and a token that names the text on it are ONE decision, and
// they were living in two files.
//
// The library is `shared/ui/` now and its theme IS the kwapso palette, so there
// is nothing to paint over. THE PALETTE LIVES IN `shared/ui/styles.css`, in one
// block, exactly as that file's own header always said a re-theme should work.
// Forking this base for a new product means editing that block — and this file
// for the name and the logo.
//
// WHAT STAYS HERE ARE THE COLOURS NO TOKEN CAN REACH: `accentHex`, for the
// pre-bundle splash (painted by the OS before any stylesheet exists) and the
// email template (mail clients strip custom properties), plus the per-door
// manifest colours, which are two values rather than one.

// ── AND THE NAME IS READ, NOT SPELLED OUT (5 Sep 2026) ─────────────────────
//
// Twenty-three files read this seam and sixteen user-visible SENTENCES did not:
// they had the word typed into them, in the catalogue, in four languages. A
// rebrand — or a fork of this base for the next product, which §5 of
// BASE-MANUAL says is what it is FOR — would have left every one of them saying
// the old name on a screen that looked finished, and nothing would have gone red.
//
// Fourteen of them now carry a `{brand}` hole filled from `brand.name`
// (`shared/i18n.ts`, `fill`) — a hole rather than a concatenation, because it is
// the only shape a translator can reorder. Every existing translation was
// carried to the new key rather than re-requested, so all 56 renderings are
// byte-identical to what they were.
//
// TWO KEEP THE LITERAL, ON PURPOSE, and they are named here so nobody
// "finishes the rename" and changes what a screen says:
//
//   • `t("Kwapso")` — the nav destination, TITLE CASE by design
//     (web/components/app-shell.tsx says so where the team name is drawn beside
//     it). `brand.name` is lower case, so reading the seam here would quietly
//     change the label.
//   • `t("e.g. Kwapso GmbH")` — the legal-name field's placeholder. That is an
//     EXAMPLE of a company name, not the app naming itself; a fork would want a
//     different example, not this seam's value.
export const brand = {
  name: "kwapso",
  description: "Tailored digital operating systems for mature businesses.",
  motto: "Work, structured.",

  /** App logo URL. null = show a monogram built from the name.
   * The kwapso isotype on its mango field — the same mark the PWA icons and the
   * browser tab use, so the app looks like itself everywhere it appears. */
  logoUrl: "/icons/kwapso-mark.png" as string | null,

  /** THE ACCENT AND SCREEN oklch VALUES USED TO SIT HERE, and the note they
   * carried is worth keeping because it is the argument for where they went.
   *
   * `BrandTheme` overrode `--primary` and left `--primary-foreground` at the
   * LIBRARY's value, which is pure white in light mode. Mango is a LIGHT colour,
   * so every primary button in the app was white text on pale mango: about
   * 1.4:1, far under the 4.5:1 a person needs, and the specific way a control
   * reads as switched off. The owner's words on 20 Aug 2026 were "the buttons
   * are seeming so dull… it feels like I should not be pressing them", which is
   * exactly what an unreadable label does. Dark mode was fine by accident, so it
   * was invisible to anyone testing in dark.
   *
   * The fix at the time was to move the foreground here beside its surface. The
   * better fix, available only once the library was ours, was to delete the
   * second place entirely: `shared/ui/styles.css` now sets `--primary` and
   * `--primary-foreground` three lines apart, and they cannot drift because
   * there is nowhere for them to drift to. */

  /** THE TWO PLACES A TOKEN CANNOT REACH, as literals.
   *
   * The pre-bundle splash is painted by the OS from a markup string before any
   * stylesheet exists, and an email client strips custom properties before it
   * renders. Neither has a cascade to read a variable out of, so both take the
   * value written out. These are the same colours `shared/ui/styles.css` sets —
   * mango and charcoal — and they are exact, not approximations.
   *
   * `surface` is the odd one: a soft mango tint used as the email's panel band,
   * and it is NOT in the kwapso palette. Ruling 23 says an email is "a letter,
   * not a banner — isotype plus one mango button, no colour band", so it is on
   * its way out with the template rather than being re-toned. */
  accentHex: {
    primary: "#FED069",
    surface: "#FFE9B0",
    ink: "#1A1918",
  },

  /** THE MANIFEST THEME COLOUR IS TWO VALUES, NOT ONE (ruling 09).
   *
   * It is the colour the operating system paints around the app — the status bar
   * on a phone, the title bar in a standalone window — and the ruling ties it to
   * the app ICON rather than to the brand: mango tile with a charcoal isotype
   * for the client portal, charcoal tile with a mango isotype for the agency. So
   * the two doors are deliberately opposite, and a single brand colour cannot
   * express that.
   *
   * It used to be one value, `#0e9e86`, an off-palette teal left over from the
   * base this product was forked from. It was wrong on both doors and belonged
   * to neither. */
  manifestTheme: {
    agency: "#1A1918",
    portal: "#FED069",
  },
}
