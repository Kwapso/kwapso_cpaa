/* ENTRY. scripts/build-screen-builder.mjs bundles this file and writes one
 * standalone index.html beside it: the catalogue as a JSON script tag, the
 * kit's compiled CSS (tokens, motion, Tailwind, fonts inlined) as a style
 * tag, and this bundle. The page runs from file:// with no server. */
import { createRoot } from "react-dom/client"

import { Builder } from "./builder/builder"
import type { Catalogue } from "./builder/types"

const catalogue = JSON.parse(document.getElementById("catalogue")!.textContent!) as Catalogue
const css = document.getElementById("kit-css")!.textContent ?? ""
document.title = `kwapso screen builder · kit ${catalogue.kit.tag}`
createRoot(document.getElementById("app")!).render(<Builder catalogue={catalogue} css={css} />)
