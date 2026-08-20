import { brand } from "../brand"

// Injects the app's accent colours AND the screen background tone (from
// shared/brand.ts) as token overrides, so the whole UI library re-skins — and
// every screen re-tones — from one place. Uses higher specificity (html:root /
// html.dark) than the library defaults, so it wins no matter the stylesheet
// order, in both light and dark. Pure static <style> — no flash.
export function BrandTheme() {
  const { primary, secondary, ink } = brand.accent
  const { screen } = brand
  // THE FOREGROUNDS TRAVEL WITH THE COLOURS THEY SIT ON.
  //
  // Overriding `--primary` and leaving `--primary-foreground` at the library's
  // value is how every primary button in the app came to be white text on pale
  // mango — about 1.4:1, and the exact look of a disabled control. A token that
  // names a surface and a token that names the text on it are one decision, so
  // they are written in one place and can no longer drift apart.
  const css = [
    `html:root{--primary:${primary.light};--primary-foreground:${ink.light};--ring:${primary.light};--accent:${secondary.light};--accent-foreground:${ink.light};--background:${screen.light}}`,
    `html.dark{--primary:${primary.dark};--primary-foreground:${ink.dark};--ring:${primary.dark};--accent:${secondary.dark};--accent-foreground:${ink.dark};--background:${screen.dark}}`,
  ].join("\n")
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
