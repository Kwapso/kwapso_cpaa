// ONE branded email template every transactional email goes through (login
// code, invites, email-change). It moulds to the app: name, motto, logo and the
// accent come from shared/brand.ts, so a rebrand re-skins every email too. Pure
// string building (web-safe) — table layout + inline CSS + hex colours so it
// renders across email clients (which don't support oklch or modern CSS).

import { brand } from "../brand"

export type BrandedEmail = {
  /** big heading inside the card */
  heading: string
  /** one or two sentences under the heading */
  intro: string
  /** a large code to display (e.g. the 6-digit login code) */
  code?: string
  /** a call-to-action button (e.g. "Accept invite") */
  ctaLabel?: string
  ctaUrl?: string
  /** small print at the bottom of the card */
  footnote?: string
  /** the app's public origin, e.g. https://agency.kwapso.app — the ONLY way the
   * logo can be absolute, and email is the one place a relative src is useless. */
  origin?: string
}

/** Build { html, text } for a branded email. `text` is the plaintext fallback. */
/** HTML-escape any value that may carry user-supplied content (e.g. a help-reply
 * snippet or a mentioner's name flows into heading/intro). Without this, attacker
 * text could inject markup/links into the branded email body. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function brandedEmail(o: BrandedEmail): { html: string; text: string } {
  const { primary, surface, ink } = brand.accentHex
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

  // A mail client has no origin to resolve a path against, so a relative logo
  // src can only ever render as a broken-image icon — which is what shipped.
  // Absolute or nothing: with no origin to build one, fall back to the wordmark,
  // which is a worse logo but a better email.
  const logoSrc = !brand.logoUrl
    ? null
    : /^https?:\/\//.test(brand.logoUrl)
      ? brand.logoUrl
      : o.origin
        ? `${o.origin.replace(/\/$/, "")}${brand.logoUrl}`
        : null
  const logo = logoSrc
    ? `<img src="${logoSrc}" alt="${brand.name}" height="28" style="display:block;border:0">`
    : `<span style="font:600 20px ${font};color:${primary}">${brand.name}</span>`

  const codeBlock = o.code
    ? `<tr><td style="padding:8px 0 4px">
         <div style="background:${surface};color:${ink};font:700 30px/1.2 ${font};letter-spacing:8px;text-align:center;padding:16px;border-radius:10px">${o.code}</div>
       </td></tr>`
    : ""

  const ctaBlock =
    o.ctaLabel && o.ctaUrl
      ? `<tr><td style="padding:12px 0 4px">
           <a href="${o.ctaUrl}" style="display:inline-block;background:${primary};color:#ffffff;font:600 15px ${font};text-decoration:none;padding:12px 22px;border-radius:10px">${esc(o.ctaLabel)}</a>
         </td></tr>`
      : ""

  const footnote = o.footnote
    ? `<tr><td style="padding:14px 0 0;font:400 13px/1.6 ${font};color:#8a8a8a">${esc(o.footnote)}</td></tr>`
    : ""

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:28px 28px 24px">
      <tr><td style="padding-bottom:16px">${logo}</td></tr>
      <tr><td style="font:600 20px/1.3 ${font};color:#1a1a1a;padding-bottom:6px">${esc(o.heading)}</td></tr>
      <tr><td style="font:400 15px/1.6 ${font};color:#555">${esc(o.intro)}</td></tr>
      ${codeBlock}
      ${ctaBlock}
      ${footnote}
      <tr><td style="padding-top:22px;border-top:1px solid #ededed;font:400 12px/1.6 ${font};color:#9a9a9a">
        ${brand.motto}<br>${brand.name}
      </td></tr>
    </table>
  </td></tr></table></body></html>`

  const text = [
    o.heading,
    "",
    o.intro,
    o.code ? `\nCode: ${o.code}` : "",
    o.ctaLabel && o.ctaUrl ? `\n${o.ctaLabel}: ${o.ctaUrl}` : "",
    o.footnote ? `\n${o.footnote}` : "",
    `\n— ${brand.name} · ${brand.motto}`,
  ]
    .filter((l) => l !== "")
    .join("\n")

  return { html, text }
}
