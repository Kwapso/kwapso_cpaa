/* The kit imports its logos and photography as modules. The front doors type
 * those through Next's own global image types (web/next-env.d.ts); this tool
 * bundles with esbuild, whose `dataurl` loader hands back a string, and the
 * kit's `assetUrl()` accepts either shape. Same reference, one typing. */
/// <reference types="next/image-types/global" />
