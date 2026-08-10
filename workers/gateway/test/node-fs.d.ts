// Minimal ambient types for the Node built-ins the closed-door test reads source
// off disk with (this project's restricted `types` set excludes @types/node).
// Just the slice portal-door.test.ts uses — the same shape the other workers'
// seam guards carry.
declare const __dirname: string
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string
}
declare module "node:path" {
  export function join(...parts: string[]): string
}
