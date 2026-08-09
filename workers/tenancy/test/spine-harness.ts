// A REAL team database for the customer-spine tests. D1 *is* SQLite, so running
// the actual TEAM_MIGRATIONS into node:sqlite exercises the real schema — the
// CHECK constraints, the partial unique indexes, the recursive cycle guard — with
// no Cloudflare infra and no extra dependency.
//
// Everything here is deliberately REAL except the two transports: the D1 REST
// door (pointed at this in-memory database) and the auth/realtime service
// bindings. The gating, the guard corridor, the SQL and the route handlers are
// the shipped code, so a test that passes here is a statement about production.

import { DatabaseSync } from "node:sqlite"

import { buildTeamSeed, TEAM_MIGRATIONS } from "../src/team-schema"
import type { Row } from "./d1-sqlite"

/** A D1Database-shaped adapter over the same handle (the GLOBAL core binding). */
export function makeCoreBinding(get: () => DatabaseSync) {
  const wrap = (sql: string, args: unknown[]) => ({
    first: async () => get().prepare(sql).get(...(args as [])) ?? null,
    all: async () => ({ results: get().prepare(sql).all(...(args as [])) }),
    run: async () => ({ meta: { changes: Number(get().prepare(sql).run(...(args as [])).changes) } }),
  })
  return {
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => wrap(sql, args), ...wrap(sql, []) }),
  } as never
}

/** The ids the spine tests share. Two worlds that must never see each other:
 * VICTIM (an entity, its person, its contact link, its login) and BURGLAR (an
 * entity of their own, with a live portal grant that pins them to it). */
export const IDS = {
  team: "T",
  staffUser: "U_STAFF",
  burglarUser: "U_BURGLAR",
  victimUser: "U_VICTIM",
  adminRole: "R_ADMIN",
  clientRole: "R_CLIENT",
  victimAccount: "A_VICTIM",
  victimChild: "A_VICTIM_CHILD",
  victimPerson: "A_VICTIM_PERSON",
  victimLink: "L_VICTIM",
  victimPortal: "P_VICTIM",
  burglarAccount: "A_BURGLAR",
  burglarPerson: "A_BURGLAR_PERSON",
  burglarLink: "L_BURGLAR",
  burglarPortal: "P_BURGLAR",
} as const

/** Every id that belongs to the victim's world. A burglar's response must not
 * contain ANY of them — that single rule is what every leak assertion reduces to. */
export const VICTIM_IDS = [
  IDS.victimAccount,
  IDS.victimChild,
  IDS.victimPerson,
  IDS.victimLink,
  IDS.victimPortal,
] as const

/** A fresh team database: the real migrations, the real seed, then the two
 * worlds. Returns the handle; the caller points d1Impl at it. */
export function buildSpineDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:")

  // The GLOBAL core tables the gating seam reads natively.
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT, current_team_id TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, database_id TEXT, db_status TEXT NOT NULL DEFAULT 'ready', deactivated_at TEXT);
    CREATE TABLE team_members (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, role_id TEXT, created_at TEXT, deactivated_at TEXT);
    INSERT INTO teams (id, name, database_id) VALUES ('${IDS.team}', 'Kwapso', 'db_team');
    INSERT INTO users (id, email, first_name, current_team_id) VALUES
      ('${IDS.staffUser}', 'staff@kwapso.app', 'Staff', '${IDS.team}'),
      ('${IDS.burglarUser}', 'burglar@delaval.example', 'Burglar', '${IDS.team}'),
      ('${IDS.victimUser}', 'marta@bergman.example', 'Marta', '${IDS.team}');
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES
      ('m1', '${IDS.team}', '${IDS.staffUser}', '${IDS.adminRole}', '2026-01-01'),
      ('m2', '${IDS.team}', '${IDS.burglarUser}', '${IDS.clientRole}', '2026-01-01'),
      ('m3', '${IDS.team}', '${IDS.victimUser}', '${IDS.clientRole}', '2026-01-01');
  `)

  // The team database: every migration, in order, exactly as the runner rolls them.
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)
  db.exec(buildTeamSeed({ id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }, "2026-01-01").script)

  // Two roles that both hold EVERY right on the spine. That is the point of the
  // burglar: their role is not what stops them, so if they get through, the
  // fence itself is broken.
  const grantAll = (roleId: string) =>
    db.exec(`
      INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('${roleId}', '${roleId}', 0, '2026-01-01');
      INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
      SELECT '${roleId}_' || m.module, '${roleId}', m.module, 1, 1, 1, 1
        FROM (SELECT 'accounts' AS module UNION ALL SELECT 'portal_users'
              UNION ALL SELECT 'team_members' UNION ALL SELECT 'member_roles') m;`)
  grantAll(IDS.adminRole)
  grantAll(IDS.clientRole)

  const account = (id: string, type: string, name: string, parent: string | null) =>
    db.exec(
      `INSERT INTO accounts (id, account_type, parent_account_id, name, created_at, creator_id)
       VALUES ('${id}', '${type}', ${parent ? `'${parent}'` : "NULL"}, '${name}', '2026-01-01', '${IDS.staffUser}');`
    )

  account(IDS.victimAccount, "entity", "Bergman S.A.", null)
  account(IDS.victimChild, "entity", "Bergman Workshop", IDS.victimAccount)
  account(IDS.victimPerson, "individual", "Marta Ruiz", null)
  account(IDS.burglarAccount, "entity", "Delaval Group", null)
  account(IDS.burglarPerson, "individual", "Diego Sanz", null)

  db.exec(`
    INSERT INTO account_links (id, account_id, person_account_id, relationship, created_at, creator_id) VALUES
      ('${IDS.victimLink}', '${IDS.victimAccount}', '${IDS.victimPerson}', 'Operations', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.burglarLink}', '${IDS.burglarAccount}', '${IDS.burglarPerson}', 'Owner', '2026-01-01', '${IDS.staffUser}');
    INSERT INTO portal_users (id, account_id, user_id, created_at, creator_id) VALUES
      ('${IDS.victimPortal}', '${IDS.victimPerson}', '${IDS.victimUser}', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.burglarPortal}', '${IDS.burglarPerson}', '${IDS.burglarUser}', '2026-01-01', '${IDS.staffUser}');
  `)

  return db
}

/** A worker Env whose transports are stubs and whose databases are real. */
export function makeEnv(get: () => DatabaseSync, userId: string): never {
  const user = () => get().prepare("SELECT * FROM users WHERE id = ?").get(userId) as Row
  return {
    DB: makeCoreBinding(get),
    CF_ACCOUNT_ID: "acct",
    CF_D1_TOKEN: "token",
    AUTH: {
      fetch: async () =>
        new Response(
          JSON.stringify({
            user: {
              id: userId,
              email: user().email,
              firstName: user().first_name,
              lastName: null,
              imageUrl: null,
              onboardingComplete: true,
              currentTeamId: IDS.team,
            },
          })
        ),
    },
    REALTIME: { fetch: async () => new Response("{}") },
  } as never
}

/** A JSON request at a route — the same shape the gateway forwards. */
export function req(route: string, body?: unknown, query = ""): Request {
  const [method, path] = route.split(" ")
  return new Request(`https://tenancy${path}${query}`, {
    method,
    headers: { Cookie: "session=x", "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  })
}
