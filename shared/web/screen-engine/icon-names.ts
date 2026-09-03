// THE APP'S ICON VOCABULARY, AND HOW IT REACHES THE KIT'S GLYPHS.
//
// An icon in this app is often DATA rather than an import: a tab carries a
// name (`TAB_ICONS`), a nav page carries one (`CONCEPT_ICON`, `NAV`), a screen
// recipe carries one. That is deliberate — a recipe is serialisable and a
// component is not — but it means the name has to survive a change of icon
// pack, and a name is exactly the thing a change of pack breaks.
//
// NO ALIAS TABLE ANY MORE, by direct client ruling, 2026-09-03, verbatim:
// "i want you to use the names from phosphor, we are changing kit, so i
// don't want to keep translating — i want to be able to go on the website
// from phosphor and give you the name there," and, on the cleanup: "any
// previous icon that's on the repo or wherever, kill it … clean any previous
// icon anywhere." The kit's art is the Phosphor pack now
// (`shared/ui/foundations/icons/ATTRIBUTION.md`), under Phosphor's own
// names, and every kebab-case name this app stores IS one of those names —
// there is nothing left to translate.
//
// There used to be a bridging table here, `ICON_ALIASES`, for the pack
// before this one (first lucide → the kit's original 96, then the kit →
// Iconoir): thirty-eight names the kit spelled differently, or an honest
// approximation where it drew no equivalent at all. Both of those problems
// were a property of THOSE packs — Iconoir's own spellings, Iconoir's own
// gaps — and neither survives the swap to Phosphor, whose 1,512 glyphs cover
// every concept this app names and whose names are the ones written into
// `CONCEPT_ICON`, `TAB_ICONS`, `KNOWLEDGE_KIND_ICON` and every recipe's own
// `icon:` field directly. A table that translates nothing is not a smaller
// table, it is a shim with no job — deleted rather than emptied.
//
// If a name this app wants to draw is ever missing from the kit again, THAT
// is the thing to fix — upstream, in the design kit repo — never a line
// added back here.

/** kebab-case → the kit's PascalCase export name.
 *
 * `house` → `House`, `chat-teardrop-dots` → `ChatTeardropDots`. The same
 * transform the kit's own generator uses, so a name that resolves here names
 * a real export there. */
export function pascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.replace(/^([0-9]*)([a-z])/, (_, digits, c: string) => digits + c.toUpperCase()))
    .join("")
}

/** The app's name for an icon → the kit's export name. No translation left:
 * a name this app stores IS a name on phosphor.dev, PascalCased. */
export function kitExportName(name: string): string {
  return pascalCase(name)
}

/** A name this app uses for an icon. Kept as a string alias rather than a union
 * of 1,512 spellings: the check that matters is that a name RESOLVES, and that
 * is a census off the disk (web/test/icon-vocabulary.test.ts) which also reaches
 * the names sitting in recipe data, where a type cannot follow. */
export type IconName = string
