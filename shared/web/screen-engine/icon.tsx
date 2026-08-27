// ONE COMPONENT FOR AN ICON NAMED BY DATA.
//
// Six components used to draw these with lucide's runtime `DynamicIcon`, which
// takes a kebab-case name and lazily fetches that glyph from the lucide
// package. That was the right shape for the problem — a recipe carries a name,
// not a component — and the wrong dependency: it meant the app shipped a
// second icon pack whose only job was to serve names the kit had not drawn.
//
// The kit draws 1,383 now, so the name resolves against the kit and nothing
// else. There is no fallback on purpose. A fallback is what let thirty-seven
// lucide names keep rendering lucide art beside Iconoir art under a green
// build; an unknown name renders NOTHING here, and the census in
// web/test/icon-vocabulary.test.ts turns the build red before anybody sees it.

import * as React from "react"

import { ICON_MAP } from "./icon-map"
import { kitExportName, type IconName } from "./icon-names"

export type { IconName }

export interface IconProps {
  /** The app's kebab-case name for the glyph — `"warning-triangle"`,
   * `"life-buoy"`. Aliased to the kit's spelling by `kitExportName`. */
  name: IconName
  className?: string
  size?: number
}

/** The kit's component for a name, or null. Null rather than a stand-in: a
 * missing glyph is a build failure waiting in the census, not a shrug.
 *
 * The lookup goes through the GENERATED map rather than the kit's namespace,
 * and that is a bundle-size decision with a number behind it. `import * as
 * KitIcons` indexed by a runtime string pins all 1,383 exports — the bundler
 * cannot know which key is coming — and the first build after the Iconoir swap
 * shipped a 1.0 MB chunk to draw about eighty glyphs. `icon-map.ts` names the
 * fifty-six the app actually asks for, statically, so the rest are dropped.
 * scripts/icon-map.mjs regenerates it; the census keeps it honest. */
export function iconComponent(name: string): React.ComponentType<{ size?: number; className?: string }> | null {
  return ICON_MAP[kitExportName(name)] ?? null
}

export function Icon({ name, className, size }: IconProps) {
  const Glyph = iconComponent(name)
  if (!Glyph) return null
  return <Glyph className={className} size={size} aria-hidden />
}
