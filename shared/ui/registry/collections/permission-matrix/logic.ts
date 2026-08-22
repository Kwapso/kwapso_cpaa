// PermissionMatrix — the pure logic + types, kept JSX-free so it can be unit
// tested in isolation (same split as lib/collection.ts). The component in
// permission-matrix.tsx imports and re-exports everything here, so apps still
// import from a single place.

import { type BaseConfig, defaultBaseConfig } from "../../../lib/config"

/** A single editable right inside a module. */
export type Right = "read" | "create" | "edit" | "delete"

/** The on/off state of all four rights for one module. */
export type RightSet = {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

/** The whole matrix value: one RightSet per module key. A module that is absent
 * from this map is treated as all-off (see `rightsFor`). */
export type PermissionMatrixValue = Record<string, RightSet>

/** Every field is required on purpose — see ARCHITECTURE.md "Configuration". */
export interface PermissionMatrixConfig extends BaseConfig {
  /** The rows. `key` is the app's module id; `label` is what's shown. */
  modules: { key: string; label: string }[]
  /** "edit" = toggleable · "read" = view-only (disabled) · "locked" =
   *  view-only AND every cell forced ON (the un-editable Admin role). */
  mode: "edit" | "read" | "locked"
  /** When true, turning ON any of Create/Edit/Delete forces Read ON and locks
   *  Read on (you can't have write without read). Default true. */
  autoFlipRead: boolean
  /** "card" = the rounded, bordered surface (default); "none" = flat, no
   *  border/background. When "none", the sticky module column fills with
   *  `bg-background` (instead of `bg-card`) so scrolled cells stay opaque. */
  surface: "card" | "none"
}

export const defaultPermissionMatrixConfig: PermissionMatrixConfig = {
  ...defaultBaseConfig,
  modules: [],
  mode: "edit",
  autoFlipRead: true,
  surface: "card",
}

/** All-off — the state of a module that has never been touched. */
export const emptyRights: RightSet = {
  read: false,
  create: false,
  edit: false,
  delete: false,
}

/** The columns, in fixed display order. The three write rights are listed in
 * `WRITE_RIGHTS` so the auto-flip-read logic has one source of truth. */
export const RIGHTS: { key: Right; label: string }[] = [
  { key: "read", label: "Read" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
]
export const WRITE_RIGHTS: Right[] = ["create", "edit", "delete"]

/** The rights for one module, defaulting to all-off when the module is missing
 * from the value (so a config-only module addition never crashes). */
export function rightsFor(
  value: PermissionMatrixValue,
  moduleKey: string
): RightSet {
  return value[moduleKey] ?? { ...emptyRights }
}

/** PURE helper (also unit-tested): return the NEXT value after flipping one
 * cell. Applies the auto-flip-read rule:
 *   • turning ON a write (create/edit/delete) forces Read ON;
 *   • turning Read OFF while any write is still ON is a no-op (Read is required).
 * Never mutates the input — returns a fresh value object. */
export function applyToggle(
  value: PermissionMatrixValue,
  moduleKey: string,
  right: Right,
  on: boolean,
  autoFlipRead: boolean
): PermissionMatrixValue {
  const current = rightsFor(value, moduleKey)

  // You can't drop Read while a write still depends on it — leave it as-is.
  if (autoFlipRead && right === "read" && !on) {
    const hasWrite = WRITE_RIGHTS.some((w) => current[w])
    if (hasWrite) return value
  }

  const next: RightSet = { ...current, [right]: on }

  // Turning on any write right pulls Read on with it.
  if (autoFlipRead && on && WRITE_RIGHTS.includes(right)) {
    next.read = true
  }

  return { ...value, [moduleKey]: next }
}

/** How one cell should render, derived from config + value. `lockedOn` means
 * Read is forced on by a write (edit mode only) — the cell shows a lock hint and
 * cannot be turned off. `disabled` means no toggle will fire. */
export interface CellState {
  checked: boolean
  disabled: boolean
  lockedOn: boolean
}

export function cellState(
  config: PermissionMatrixConfig,
  value: PermissionMatrixValue,
  moduleKey: string,
  right: Right
): CellState {
  const rights = rightsFor(value, moduleKey)

  // The locked Admin role: everything on, nothing editable.
  if (config.mode === "locked") {
    return { checked: true, disabled: true, lockedOn: false }
  }
  // View-only: show the real state, but no toggle ever fires.
  if (config.mode === "read") {
    return { checked: rights[right], disabled: true, lockedOn: false }
  }
  // Editable: Read locks on while any write is on (when autoFlipRead is set).
  const hasWrite = WRITE_RIGHTS.some((w) => rights[w])
  const readLock = config.autoFlipRead && right === "read" && hasWrite
  return {
    checked: right === "read" ? rights.read || readLock : rights[right],
    disabled: readLock,
    lockedOn: readLock,
  }
}
