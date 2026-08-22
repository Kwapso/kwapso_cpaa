// TWO FRONT DOORS, ONE PRODUCT — the things that must be the same on both.
//
// A second front door (web-portal) shipped as a near-copy of the first, and the
// copying went further than anyone meant it to: the security-header file, the
// PWA identity, the PostCSS pipeline and a library override all existed twice,
// byte for byte, owned by nobody. Two copies of a rule is not redundancy; it is
// a rule that is only true until someone changes one of them.
//
// Everything shared now lives in ONE place — shared/web/ for the seams, and the
// _headers file, which cannot move because each static export needs its own copy
// in public/. This suite is what makes "identical" a fact rather than a hope: it
// reads both doors off disk and fails the moment they disagree.
//
// It deliberately checks CONTENT as well as sameness. "Both files are identical"
// is satisfied by two empty files, and the file it is guarding is the one that
// says DENY to being iframed.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8")

const AGENCY = "web"
const PORTAL = "web-portal"

describe("the security headers are one file, served twice", () => {
  it("both doors ship a byte-identical public/_headers", () => {
    expect(
      read(PORTAL, "public", "_headers"),
      "web-portal/public/_headers has drifted from web/public/_headers — a header change must be made to BOTH doors or neither"
    ).toBe(read(AGENCY, "public", "_headers"))
  })

  // Sameness alone is worthless if what they agree on is nothing. These three are
  // the reason the file exists.
  it("…and what they agree on is the actual hardening", () => {
    for (const app of [AGENCY, PORTAL]) {
      const src = read(app, "public", "_headers")
      expect(src, `${app}: clickjacking guard`).toContain("X-Frame-Options: DENY")
      expect(src, `${app}: MIME-sniffing guard`).toContain("X-Content-Type-Options: nosniff")
      expect(src, `${app}: referrer policy`).toContain(
        "Referrer-Policy: strict-origin-when-cross-origin"
      )
      // The blanket rule must come first, so every response is covered — a header
      // block scoped to a path only hardens that path.
      expect(src.indexOf("/*\n"), `${app}: the security block must apply to /*`).toBeGreaterThan(-1)
    }
  })
})

describe("the product's identity is declared once", () => {
  // A rebrand used to touch two layouts and two manifests, and half-succeeded the
  // first time one was missed.
  it("both layouts take metadata + viewport from shared/web/pwa", () => {
    for (const app of [AGENCY, PORTAL]) {
      const src = read(app, "app", "layout.tsx")
      expect(src, `${app}/app/layout.tsx must import the shared PWA identity`).toContain(
        "@shared/web/pwa"
      )
      expect(src, `${app}: metadata must BE the shared object, not a second copy`).toContain(
        "export const metadata = appMetadata"
      )
      expect(src, `${app}: viewport must BE the shared object, not a second copy`).toContain(
        "export const viewport = appViewport"
      )
    }
  })

  it("both manifests return the shared manifest body", () => {
    for (const app of [AGENCY, PORTAL]) {
      const src = read(app, "app", "manifest.ts")
      expect(src, `${app}/app/manifest.ts must return appManifest()`).toContain("appManifest()")
      // Static export or the gateway serves nothing at /manifest.webmanifest.
      expect(src, `${app}: the manifest must stay statically emitted`).toContain(
        'export const dynamic = "force-static"'
      )
    }
  })

  it("both doors build through the shared PostCSS pipeline", () => {
    for (const app of [AGENCY, PORTAL])
      expect(
        read(app, "postcss.config.mjs"),
        `${app}/postcss.config.mjs must re-export the shared pipeline, not restate it`
      ).toContain("shared/web/postcss.config.mjs")
  })

  // An override BOTH doors need belongs in ONE file, or the day the default
  // changes underneath it there are two lines to remember to delete.
  //
  // The reason for overriding at all has weakened, and the check has not: the
  // library used to be a separate repo, so an override was the only honest way
  // to change a default. It is vendored in `shared/ui/` now, so the first
  // question is whether the default itself should change. What survives is this
  // rule — whatever a door does not fix at the source, it must not restate.
  it("neither door restates a library override the other also carries", () => {
    for (const app of [AGENCY, PORTAL]) {
      const css = read(app, "app", "globals.css")
      expect(css, `${app}: shared library overrides live in shared/web/library-overrides.css`).toContain(
        "shared/web/library-overrides.css"
      )
      expect(
        /^\.glass\s*\{/m.test(css),
        `${app}/app/globals.css redeclares .glass — put a shared override in shared/web/library-overrides.css`
      ).toBe(false)
    }
  })
})
