/* `process.env.NODE_ENV` is the standard dev-only guard for a vendored React
   library — Next and webpack replace it at build time. This repo has no
   @types/node (it is not a Node package), so the global needs declaring or
   every guard is a type error.

   Declared narrowly, and only what is actually read. If @types/node is ever
   added, that fuller declaration wins and this one is harmless. */
declare const process: { env: { NODE_ENV?: string } };
