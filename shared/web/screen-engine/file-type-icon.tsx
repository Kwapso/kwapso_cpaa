// A FILE'S EXTENSION → THE KIT'S GLYPH FOR THAT TYPE.
//
// NEW, 2026-09-03. Every attachment list in the app drew the same paperclip
// for every file, whatever it was, because no extension-to-icon table
// existed — a screenshot, a PDF contract and a spreadsheet all looked
// identical in the list. The Phosphor swap approved three real file-type
// marks alongside the icon-for-icon rename (`file-pdf`, `file-xls`,
// `file-zip`), so this is the one seam that reads an attachment's name and
// picks the right one. Anything else — or no extension at all — keeps the
// plain paperclip, which stays the correct mark for "an attached file" in
// general (an upload button, a kind still unknown).
//
// This is new behaviour, not a rename: nothing broke without it, the kit
// simply had no gap to fill until Phosphor's file-type set made filling it
// worth the one small table.

import * as React from "react"

import { FilePdf, FileXls, FileZip, Paperclip } from "@shared/ui/foundations/icons"

type IconComponent = React.ComponentType<{ size?: number; className?: string }>

/** xlsx is the modern extension for the same "spreadsheet" concept `file-xls`
 * draws; grouping it here is a naming decision, not a second glyph. */
const EXTENSION_ICON: Record<string, IconComponent> = {
  pdf: FilePdf,
  xls: FileXls,
  xlsx: FileXls,
  zip: FileZip,
}

/** `name` is the attachment's own filename/label — whatever a screen already
 * shows beside the icon. No extension, or one the table above does not name,
 * draws the plain paperclip. */
export function fileTypeIcon(name: string | null | undefined): IconComponent {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? ""
  return EXTENSION_ICON[ext] ?? Paperclip
}
