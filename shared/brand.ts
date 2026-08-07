// shared/brand.ts — THE one place to brand this app.
//
// Change these values and the whole APP re-skins everywhere: name, logo,
// motto, description, and the accent colours (primary + secondary). It's read
// by the web UI AND by communications (e.g. login emails) — so changing the
// name here updates it in the app and in emails, exactly like Glide.
//
// What it does NOT touch: the *visual theme* (accent colours + background)
// styles the app UI only — colours never bleed into emails or PDFs (those keep
// their own simple formatting; only the text identity flows into them).
//
// Reusing this base for a new app? Edit ONLY this file (and drop in a logo).

export type AccentPair = { light: string; dark: string } // oklch values

export const brand = {
  name: "kwapso",
  description: "Tailored digital operating systems for mature businesses.",
  motto: "Work, structured.",

  /** App logo URL. null = show a monogram built from the name. */
  logoUrl: null as string | null,

  /** Accent colours — override the UI library's theme tokens (oklch, per mode).
   * Defaults reproduce the library's teal; change them to re-skin the app. */
  accent: {
    /** main brand colour: buttons, links, focus rings, the living light.
     * kwapso mango (#FED069) — text on it is always charcoal, never white. */
    primary: {
      light: "oklch(0.87 0.12 86)",
      dark: "oklch(0.8 0.12 86)",
    } as AccentPair,
    /** soft tinted surfaces (subtle hovers, badges, highlights) — soft mango. */
    secondary: {
      light: "oklch(0.93 0.055 88)",
      dark: "oklch(0.35 0.05 86)",
    } as AccentPair,
  },

  /** Email-safe HEX mirror of the accent. Email clients don't support oklch, so
   * branded emails use these. Keep roughly in step with `accent` above.
   * primary = buttons/links · surface = soft tint panel · ink = text on surface. */
  accentHex: {
    primary: "#FED069",
    surface: "#FFE9B0",
    ink: "#1A1918",
  },

  /** The screen background tone — the SINGLE source for the page surface behind
   * every screen (not the glass/menus on top). Softened off pure white / pure
   * black so no screen ever looks "super white" or "super dark"; the brand glow
   * + ambient light layer on top. Change these two values to re-tone every
   * screen in both modes at once (BrandTheme injects them as --background). */
  screen: {
    light: "oklch(0.99 0.004 95)",
    dark: "oklch(0.2 0.004 80)",
  } as AccentPair,
}
