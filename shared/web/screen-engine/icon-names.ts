// THE APP'S ICON VOCABULARY, AND HOW IT REACHES THE KIT'S GLYPHS.
//
// An icon in this app is often DATA rather than an import: a tab carries a
// name (`TAB_ICONS`), a nav page carries one (`CONCEPT_ICON`, `NAV`), a screen
// recipe carries one. That is deliberate — a recipe is serialisable and a
// component is not — but it means the name has to survive a change of icon
// pack, and a name is exactly the thing a change of pack breaks.
//
// It broke on 2026-08-27. The kit's art became the Iconoir pack, which spells
// things its own way: a left chevron is `nav-arrow-left`, a group of people is
// `group`, a warning is `warning-triangle`. Sixty-two lucide names were stored
// across the two front doors and thirty-seven of them exist in Iconoir under a
// different spelling or not at all. Until this file existed they fell through
// `kitIcon`'s fallback to lucide's runtime `DynamicIcon` and kept drawing
// lucide art — beside Iconoir art, on the same screen, with a green build.
// That is the whole reason this file is data and not a rule in a function:
// every substitution is one reviewable line.
//
// A name absent from this table is one the kit already spells the same way
// (twenty-five of the sixty-two: `archive`, `calendar`, `check`, `home`,
// `settings`, `timer`, `wrench` …). Adding a line for those would be dead
// weight that silently diverges from the glyph it shadows, so `iconNameTest`
// in web/test/icon-vocabulary.test.ts fails on one.

/** The kit spells it differently, or does not draw it under this name.
 *
 * `~` marks an APPROXIMATION: the kit draws no equivalent distinction, so the
 * nearest honest glyph is used and the difference is visible on screen. They
 * are listed here rather than discovered later. */
export const ICON_ALIASES: Record<string, string> = {
  "alert-triangle": "warning-triangle",
  "arrows-left-right": "arrow-separate",
  banknote: "cash",
  blocks: "box", //                     ~ modules; no blocks glyph
  "building-2": "building",
  "calendar-clock": "calendar", //      ~ meetings; no calendar-clock
  "calendar-days": "calendar-plus", //  ~ no calendar-days
  "calendar-range": "calendar-arrow-down", // ~ sprints; no calendar-range
  "circle-check": "check-circle",
  "circle-off": "prohibition",
  "columns-2": "view-columns2",
  contact: "profile-circle",
  "file-text": "page-edit",
  history: "clock-rotate-right",
  "id-card": "user-square", //          ~ staff; no id-card
  inbox: "mail-in",
  info: "info-circle",
  "key-round": "key",
  layers: "sea-waves", //               waves — the app's own word for the concept
  "layout-dashboard": "dashboard",
  "library-big": "book-stack",
  "life-buoy": "lifebelt",
  "list-checks": "task-list",
  "list-filter": "filter-list",
  "list-todo": "task-list",
  "message-square": "chat-bubble",
  "messages-square": "chat-bubble-empty",
  "notebook-pen": "notes",
  paperclip: "attachment",
  route: "path-arrow",
  "scroll-text": "page", //             ~ details; no scroll glyph
  "shield-half": "shield",
  tickets: "lifebelt",
  "user-cog": "settings-profiles",
  "user-round": "user",
  users: "group",
  "users-round": "group",
  workflow: "network",
}

/** kebab-case → the kit's PascalCase export name.
 *
 * `nav-arrow-left` → `NavArrowLeft`, `airplane-helix-45deg` →
 * `AirplaneHelix45Deg`. The same transform the kit's own generator uses, so a
 * name that resolves here names a real export there. */
export function pascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.replace(/^([0-9]*)([a-z])/, (_, digits, c: string) => digits + c.toUpperCase()))
    .join("")
}

/** The app's name for an icon → the kit's export name. Aliases first, then the
 * name as written, because the twenty-five that already agree need no line. */
export function kitExportName(name: string): string {
  return pascalCase(ICON_ALIASES[name] ?? name)
}

/** A name this app uses for an icon. Kept as a string alias rather than a union
 * of 1,383 spellings: the check that matters is that a name RESOLVES, and that
 * is a census off the disk (web/test/icon-vocabulary.test.ts) which also reaches
 * the names sitting in recipe data, where a type cannot follow. */
export type IconName = string
