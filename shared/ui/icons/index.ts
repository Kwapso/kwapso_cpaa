/* One named React export per icon, plus the shared types.
 *
 * 93 commission names + 3 additive (ChevronDown, ChevronUp, Star).
 * Artwork is placeholder; names, API and sizes are final.
 */
export { createIcon, ICON_SIZES } from "./icon-base";
export type { IconProps, IconSize, IconComponent } from "./icon-base";
export * from "./icons.generated";
