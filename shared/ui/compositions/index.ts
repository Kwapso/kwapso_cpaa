/* ============================================================================
   compositions/ — the whole tier, one door in.

   The client, 2026-08-24: "everything currently compositions/xyz is
   compositions (and then sections inside of it)." This file is that sentence
   in code. Four folders, four barrels, and this one over the top of them so
   an application can import a composition by name without knowing which of
   the four it is filed under.

     templates/  the SHAPE of a screen, with nothing product-specific in it.
                 MainScreen, DetailScreen, the shell, the rail, and the eleven
                 others. This is what the kit ships instead of one file per
                 collection.
     screens/    the eighteen finished pages the client named as exceptions —
                 home, settings, the external doors, and four more.
     overlays/   what opens OVER a screen rather than replacing it.
     states/     the same screen with nothing in it, plus the one register
                 every template shares.

   Re-exports only. No component, no constant and no type is declared here, so
   importing this file can never change what anything does.

   IMPORTING THE FOLDER DIRECTLY IS ALSO SUPPORTED and is the cheaper import:
   `compositions/templates` pulls in the templates alone, where this barrel
   pulls in all four. Prefer the folder in application code; this file exists
   so that a name whose folder you do not remember is still findable.

   ONE NAME COLLIDES, AND IT IS A REAL FINDING, NOT A BARREL PROBLEM.
   `IMPORT_STEPS` is exported by BOTH `templates/import-flow` and
   `overlays/import`, because import is written three times in this
   repository — `overlays/import.tsx` (861 lines), `templates/import-flow.tsx`
   (421) and `structures/import-wizard/`, all the same five steps. Building
   this barrel is what made it visible: `tsc` refuses a duplicate re-export
   rather than silently picking one, which is the behaviour we want.

   Until the client says which of the three survives, the TEMPLATE'S
   `IMPORT_STEPS` is the one this barrel exports, explicitly, below. Reach
   `overlays/import`'s own copy by importing `compositions/overlays` directly.
   Neither file was changed to resolve this.
   ========================================================================= */

export * from "./templates";
export * from "./screens";
export * from "./overlays";
export * from "./states";

/* The explicit winner of the one ambiguity — see the header. An explicit
   named re-export beats a star, so this line and not the order above is what
   decides it. */
export { IMPORT_STEPS } from "./templates";
