/* ============================================================================
   The states — tier 3.

   WHAT A STATE IS
   Not an error page. A state is the SAME screen, drawn when the thing it
   exists to show is not there: a collection with nothing in it, a search that
   matched nothing, a record made one second ago, rows that have been put
   away. The frame never goes away — only the rows are replaced.

   NEW FOLDER, 2026-08-24. Four of these were filed as `screens/`, which made
   them look like places a person navigates to; `states.tsx` was filed as a
   `shape`, which hid that it is the one register every other template shows.

   THE FIVE
     EmptyCollectionScreen · empty-collection.tsx  Nobody has added anything
                             yet. Carries the one mango create.
     NoResultsScreen       · no-results.tsx        There ARE records; a filter
                             excluded all of them. Carries a way to clear it.
                             Collapsing this into the one above is the
                             commonest way an application lies to its reader.
     NewEmptyRecordScreen  · new-empty-record.tsx  A record that exists and has
                             nothing in it, every panel saying what it is
                             waiting for. The DetailScreen's empty state — the
                             exact twin of empty-collection.
     ArchiveScreen         · archive.tsx           The rows that were put away.
                             SEE THE NOTE BELOW.
     ShapeStateBody        · states.tsx            Loading / empty / error, the
                             one treatment every template imports so that no
                             template invents a register of its own.

   ARCHIVE IS HERE AND IT IS NOT SETTLED
   27.5's one sentence is "A tab on the collection, never a screen in the
   rail", and the placement index recommended deleting the file on the
   strength of it. The agreed target structure names `archive` under states/,
   so it is filed here rather than deleted — a deletion is not something to
   take on an inference. It is a state of a collection, which is why states/
   is the right folder for it if it survives at all.

   TWO STATE-SHAPED SCREENS ARE NOT HERE, because they are not empty
   collections: `not-found` (the rail is still drawn, so you are still inside
   the app — a main screen with nothing in it) is a SCREEN, and
   `access-denied` (the screen still renders behind, blurred) is an OVERLAY.

   TYPES ARE EXPORTED WITH `export type`, because `verbatimModuleSyntax` is on.
   No `"use client"`: a barrel is not a component.
   ========================================================================= */

/* The register every template shares. Listed first because the other four
   import it. */
export {
  ShapeStateBody,
  SHAPE_HEADING_SIZE,
  SHAPE_SHELL,
  SHAPE_STATE_COPY,
  shapeCopy,
  shapeStateTone,
} from "./states";
export type {
  ScreenDensity,
  ShapeName,
  ShapeState,
  ShapeStateBodyProps,
  ShapeStateCopy,
} from "./states";

/* empty-collection — nothing here yet. */
export { EmptyCollectionScreen } from "./empty-collection";
export type {
  EmptyCollectionDoor,
  EmptyCollectionLabels,
  EmptyCollectionScreenProps,
  EmptyFigure,
  EmptyTab,
} from "./empty-collection";

/* no-results — your filter matched nothing. */
export { NoResultsScreen } from "./no-results";
export type { NoResultsLabels, NoResultsScreenProps, NoResultsTab } from "./no-results";

/* new-empty-record — a record one second old. */
export {
  NEW_RECORD_CREATION_LOG,
  NEW_RECORD_EMPTY_PANELS,
  NewEmptyRecordScreen,
} from "./new-empty-record";
export type {
  EmptyRecordPanel,
  NewEmptyRecordLabels,
  NewEmptyRecordScreenProps,
} from "./new-empty-record";

/* archive — the rows that were put away. */
export { ArchiveScreen } from "./archive";
export type { ArchiveLabels, ArchiveRow, ArchiveScreenProps, ArchiveTab } from "./archive";
