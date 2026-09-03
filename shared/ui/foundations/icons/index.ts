/* One named React export per icon, plus the shared types.
 *
 * 1512 glyphs from the Phosphor pack (MIT), under Phosphor's own
 * names — the folder IS the contract. No alias table, no separate required-
 * names list: whatever lands in foundations/icons/ as <Name>.svg is what
 * this module exports as <Name>, spelled exactly the same.
 */
export { createIcon, ICON_SIZES } from "./icon-base";
export type { IconProps, IconSize, IconComponent } from "./icon-base";
export * from "./icons.generated";
