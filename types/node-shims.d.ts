// The ONE set of ambient Node types for the workers. Every worker's tsconfig pins
// `types: ["@cloudflare/workers-types"]`, which deliberately shuts out @types/node —
// but the seam-guard tests read source straight off disk (node:fs / node:path) and the
// integration tests drive a REAL SQLite database (node:sqlite), because D1 IS SQLite and
// a stub would happily agree with a broken WHERE clause.
//
// This used to be ten near-copies under workers/*/test — seven different contents, each
// declaring the slice one suite happened to need, so adding an existsSync in one worker
// meant discovering the shim again in the next. This file is the union of all seven.
//
// It lives OUTSIDE shared/ on purpose: web/ and web-portal/ include ../shared/**/*.ts and
// carry the real @types/node, where `declare const __dirname` would collide with Node's
// own global. Only the eight worker tsconfigs name this path.

declare const __dirname: string

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
  export function readdirSync(path: string): string[]
  export function readdirSync(
    path: string,
    options: { withFileTypes: true }
  ): { name: string; isDirectory(): boolean }[]
  export function existsSync(path: string): boolean
}

declare module "node:path" {
  export function join(...parts: string[]): string
}

declare module "node:sqlite" {
  export type SqlValue = string | number | bigint | null | Uint8Array
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
  }
}
