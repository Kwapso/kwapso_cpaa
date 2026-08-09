// The D1 REST door, backed by a real SQLite handle — the ONE transport the spine
// tests swap out. Deliberately import-free (only a type): a vi.mock factory that
// reaches for anything which itself imports the mocked module deadlocks the whole
// run, so this file must stay a leaf.

import type { DatabaseSync } from "node:sqlite"

export type Row = Record<string, unknown>

/** Mirrors the two functions the workers actually call through the door. */
export function d1Impl(get: () => DatabaseSync) {
  return {
    d1Query: async (
      _cfg: unknown,
      _databaseId: string,
      sql: string,
      params: (string | number | null)[] = []
    ): Promise<Row[]> => get().prepare(sql).all(...(params as [])) as Row[],
    d1ExecScript: async (_cfg: unknown, _databaseId: string, script: string): Promise<void> => {
      get().exec(script)
    },
  }
}
