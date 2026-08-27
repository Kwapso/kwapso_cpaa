/* ============================================================================
   The overlays — tier 3.

   WHAT AN OVERLAY IS
   Something that opens OVER a screen rather than replacing it. The screen the
   reader was on is still there underneath, still scrolled where they left it,
   and closing the overlay puts them back on it. Every one of these portals
   its surface to `document.body` and takes the page's scroll and its focus
   while it is open.

   NEW FOLDER, 2026-08-24. These files were spread across `screens/` and
   `shapes/` and nothing in the tree said which of them replaced a page and
   which of them covered one. Four came from `screens/` because they always
   were dialogs and drawers; three more were filed here by the placement
   index; `assistant` came from `shapes/` because it is a launcher and a
   floating panel, not a screen anybody navigates to.

   THE EIGHT
     AccessDeniedScreen   · access-denied.tsx    Dialog. The screen they asked
                            for still renders behind it, blurred and scrimmed
                            — which is what makes it an overlay and not a page.
     Assistant            · assistant.tsx        The floating tenant, the
                            docked thread, typed result blocks and the
                            confirmation panel. Not modal (kit ruling 31).
     BulkEditScreen       · bulk-edit.tsx        Sheet.
     ExportScreen         · export.tsx           Dialog.
     FilterBuilderScreen  · filter-builder.tsx   Sheet.
     ImportProposalScreen · import-proposal.tsx  Dialog. What the system
                            proposes to do with the file, for a person to
                            approve.
     ImportScreen         · import.tsx           The five steps of bringing a
                            file in. SEE THE NOTE BELOW.
     QuickView            · quick-view.tsx       Sheet. A peek at a record
                            that never becomes the page.

   IMPORT EXISTS THREE TIMES AND THAT IS NOT RESOLVED HERE
   `overlays/import.tsx` (861 lines), `templates/import-flow.tsx` (421) and
   `structures/import-wizard/` are the same five steps written three times.
   The placement index recommended folding the first into the second; the
   agreed target structure names `import` under overlays, so it is filed here
   and all three survive. Whichever two should die is a client decision and
   deleting the largest of them is not a filing job. Recorded so it is not
   invisible.

   TWO THINGS THAT BEHAVE LIKE OVERLAYS AND ARE NOT HERE
   `copilot-overlay` is a STRUCTURE — it is the assistant's body, a collection
   of messages. The slide-in itself is `FormScreen surface="panel"`, a
   TEMPLATE, because every create and every edit in both doors renders through
   it.

   TYPES ARE EXPORTED WITH `export type`, because `verbatimModuleSyntax` is on.
   No `"use client"`: a barrel is not a component.
   ========================================================================= */

/* access-denied — it exists and you may not see it. */
export { AccessDeniedScreen } from "./access-denied";
export type {
  AccessDeniedDoor,
  AccessDeniedLabels,
  AccessDeniedScreenProps,
  AccessGrantor,
} from "./access-denied";

/* assistant — the launcher, the panel, and the ring round the control it
   just drove. */
export {
  Assistant,
  AssistantConfirmation,
  AssistantResult,
  AssistantThread,
} from "./assistant";
export type {
  AssistantConfirmationProps,
  AssistantMessage,
  AssistantProps,
  AssistantResultBlock,
  AssistantResultProps,
  AssistantTableColumn,
  AssistantTableRow,
  AssistantThreadMessage,
  AssistantThreadProps,
} from "./assistant";

/* bulk-edit — one change, applied to everything ticked. */
export { BulkEditScreen } from "./bulk-edit";
export type {
  BulkEditLabels,
  BulkEditScreenProps,
  BulkField,
  BulkFieldOption,
  BulkRecord,
} from "./bulk-edit";

/* delete-confirmation — the one composition that is a modal (27.4), and the
   softer archive dialog it points at (27.5). Built 2026-08-26: the client's
   fidelity re-audit found neither dialog existed anywhere in the build. */
export {
  ArchiveConfirmationDialog,
  DeleteConfirmationDialog,
} from "./delete-confirmation";
export type {
  ArchiveConfirmationDialogProps,
  ArchiveConfirmationLabels,
  DeleteConfirmationDialogProps,
  DeleteConfirmationLabels,
} from "./delete-confirmation";

/* export — what leaves, and in what shape. */
export { ExportScreen, defaultColumnIds } from "./export";
export type {
  ExportColumn,
  ExportDoor,
  ExportFormat,
  ExportLabels,
  ExportScope,
  ExportScreenProps,
} from "./export";

/* filter-builder — what the question actually was. */
export { FilterBuilderScreen } from "./filter-builder";
export type {
  FilterBuilderLabels,
  FilterBuilderScreenProps,
  FilterCondition,
  FilterOption,
} from "./filter-builder";

/* import-proposal — a field for every column, with a confidence, for a
   person to approve. */
export { ImportProposalScreen, NEEDS_YOU_BELOW, PROPOSAL_STEPS } from "./import-proposal";
export type {
  ImportProposalLabels,
  ImportProposalScreenProps,
  ProposalFieldOption,
  ProposalStep,
  ProposedMapping,
} from "./import-proposal";

/* import — upload, map, review, run, read what failed. `IMPORT_STEPS` is
   also exported by `templates/import-flow`; see the note in the header. */
export { IMPORT_STEPS, ImportScreen, NOT_IMPORTED } from "./import";
export type {
  ImportColumnMapping,
  ImportFailure,
  ImportFieldOption,
  ImportLabels,
  ImportScreenProps,
  ImportStep,
} from "./import";

/* quick-view — a peek that never becomes the page. */
export { QUICK_VIEW_ASK_LIMIT, QuickView, cutAsk } from "./quick-view";
export type { QuickViewFact, QuickViewLabels, QuickViewProps } from "./quick-view";
