// Minimal ambient types for the Node built-ins the seam guard test reads source
// off disk with (this project's restricted `types` set excludes @types/node).
// Just the slice publish-seam.test.ts uses.
declare const __dirname: string
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
  export function readdirSync(path: string): string[]
}
declare module "node:path" {
  export function join(...parts: string[]): string
}
// The token test runs the REAL migrations against a REAL SQLite database — the
// fixes it guards ARE the SQL, so a stub would agree with a broken one. Just the
// slice tokens.test.ts uses.
declare module "node:sqlite" {
  export type SqlValue = string | number | bigint | null | Uint8Array
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      get(...params: SqlValue[]): unknown
      all(...params: SqlValue[]): unknown[]
      run(...params: SqlValue[]): { changes: number | bigint }
    }
  }
}
