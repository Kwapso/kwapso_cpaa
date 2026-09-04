/* The shapes the builder reads. `Catalogue` is EXACTLY what
 * scripts/build-kit-catalogue.mjs writes — nothing here is typed by hand that
 * the generator does not emit, and web/test/kit-catalogue.test.ts holds the
 * two in step. */

export type Option = { name: string; classes: string | null; note: string | null }
export type Group = { name: string; options: Option[] }
export type CvaSite = {
  file: string
  name: string | null
  line: number
  base: string | null
  groups: Group[]
  defaults: Record<string, unknown>
  compound: { when: Record<string, unknown>; classes: string | null }[]
  unresolved: { what: string; source: string }[]
  usedBy: string[]
}
export type TypedProp = { name: string; optional: boolean; kind: "enum" | "boolean"; values?: string[]; note: string | null }
export type TypedProps = { file: string; type: string; variantsFrom: string[]; props: TypedProp[] }
export type Part = {
  name: string
  kind: "component" | "hook"
  files: string[]
  exports: { name: string; file: string }[]
  cva: CvaSite[]
  typedProps: TypedProps[]
  description: string | null
}
export type Composition = { group: string; name: string; file: string; exports: string[] }
export type Catalogue = {
  kit: { repo: string; tag: string; sha: string; syncedAt: string }
  generatedAt: string
  counts: Record<string, number>
  components: Part[]
  compositions: Composition[]
  manifestDrift: { component: string; kind: string; group?: string; manifest?: string[]; source?: string[]; detail?: string }[]
  unresolved: { component: string; cva: string; what: string; source: string }[]
}

/* What a person builds. `values` is keyed by the kit EXPORT the props belong
 * to (a part can hold several — typography has Headline, Text and Hint), then
 * by prop name. `sandbox` holds the controls that are NOT kit options and are
 * saved under that word so nobody reads them as one. */
export type PartValues = Record<string, Record<string, unknown>>
export type PlacedPart = { id: string; part: string; values: PartValues; sandbox: { background?: string } }
export type Screen = { name: string; parts: PlacedPart[] }
export type Device = "desktop" | "phone" | "both"
export type Theme = "light" | "dark"
