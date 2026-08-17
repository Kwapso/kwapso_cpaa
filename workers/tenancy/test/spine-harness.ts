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
  // A SECOND company of the victim's, with the same person on both — the
  // switcher's reason to exist, and the one-at-a-time proof.
  victimSecond: "A_VICTIM_SECOND",
  victimSecondLink: "L_VICTIM_SECOND",
  // A contact who hangs UNDER the company rather than being linked to it: the
  // owner's own example (a person inside Company A, who sees Company A's world).
  contactUser: "U_CONTACT",
  // A real client: a platform account with NO team_members row. Staff are not
  // clients and clients are not staff — the grant door now refuses to blur them,
  // so the fixtures have to be able to tell them apart.
  clientUser: "U_CLIENT",
  clientPerson: "A_CLIENT_PERSON",
  victimContact: "A_VICTIM_CONTACT",
  contactPortal: "P_CONTACT",
  // A support ticket the VICTIM raised, and the staff member who answered it.
  // The activity feed reads history by (table, id) — so a ticket id is a handle
  // on another client's support history, one table along from the account rows.
  victimTicket: "H_VICTIM",
  // The victim's PROCESS MAP — an app, a way of working inside it, its baseline
  // version, one step with a real duration, and a comment on the conversation.
  // Seeded here rather than in the leak suite because the fixture IS the proof: a
  // burglar can only be caught stealing something that exists, and a map is worth
  // stealing — it names how a client's own people work, and what we changed.
  victimApp: "AP_VICTIM",
  victimProcess: "PR_VICTIM",
  victimVersion: "PV_VICTIM",
  victimStep: "PS_VICTIM",
  victimComment: "PC_VICTIM",
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
  IDS.victimSecond,
  IDS.victimSecondLink,
  IDS.victimContact,
  IDS.contactPortal,
  IDS.clientPerson,
  IDS.victimTicket,
  IDS.victimApp,
  IDS.victimProcess,
  IDS.victimVersion,
  IDS.victimStep,
  IDS.victimComment,
] as const

/** A fresh team database: the real migrations, the real seed, then the two
 * worlds. Returns the handle; the caller points d1Impl at it. */
export function buildSpineDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:")

  // The GLOBAL core tables the gating seam reads natively.
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT, current_team_id TEXT, updated_at TEXT, deactivated_at TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, logo_url TEXT, database_id TEXT, db_status TEXT NOT NULL DEFAULT 'ready', created_at TEXT, creator_name TEXT, creator_email TEXT, updated_at TEXT, deactivated_at TEXT, legal_name TEXT, legal_address TEXT, legal_numbers TEXT, phone TEXT);
    CREATE TABLE team_members (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, role_id TEXT, created_at TEXT, deactivated_at TEXT);
    INSERT INTO teams (id, name, database_id, created_at, creator_name, creator_email)
      VALUES ('${IDS.team}', 'Kwapso', 'db_team', '2026-01-01', 'Staff', 'staff@kwapso.app');
    INSERT INTO users (id, email, first_name, current_team_id) VALUES
      ('${IDS.staffUser}', 'staff@kwapso.app', 'Staff', '${IDS.team}'),
      ('${IDS.burglarUser}', 'burglar@delaval.example', 'Burglar', '${IDS.team}'),
      ('${IDS.victimUser}', 'marta@bergman.example', 'Marta', '${IDS.team}'),
      ('${IDS.contactUser}', 'luis@bergman.example', 'Luis', '${IDS.team}'),
      ('${IDS.clientUser}', 'nadia@bergman.example', 'Nadia', NULL);
    INSERT INTO team_members (id, team_id, user_id, role_id, created_at) VALUES
      ('m1', '${IDS.team}', '${IDS.staffUser}', '${IDS.adminRole}', '2026-01-01'),
      ('m2', '${IDS.team}', '${IDS.burglarUser}', '${IDS.clientRole}', '2026-01-01'),
      ('m3', '${IDS.team}', '${IDS.victimUser}', '${IDS.clientRole}', '2026-01-01'),
      ('m4', '${IDS.team}', '${IDS.contactUser}', '${IDS.clientRole}', '2026-01-01');
  `)

  // The team database: every migration, in order, exactly as the runner rolls them.
  for (const m of TEAM_MIGRATIONS) db.exec(m.sql)
  db.exec(buildTeamSeed({ id: IDS.staffUser, email: "staff@kwapso.app", name: "Staff" }, "2026-01-01").script)

  // Two roles that both hold EVERY right on the spine. That is the point of the
  // burglar: their role is not what stops them, so if they get through, the
  // fence itself is broken.
  // `help` is in the set on purpose: a client login MUST hold help:read to use
  // their own support screen, and that right is what carries them past the
  // activity door's module gate. Without it the help burglary below would be
  // refused by the gate and pass while the fence was wide open — a green test
  // asserting the wrong thing.
  // `todos` is the one module on this list a REAL Client role is meant to hold:
  // a to-do is aimed at the client and they complete it themselves. So the
  // burglar holding it is not a worst case at all — it is the ordinary case, and
  // what stops them reading Bergman's homework is the account fence rather than
  // a refusal.
  // `contacts` is on the list for the burglar's sake, most of all: the address
  // book is now its own module, and a burglar refused by their ROLE would prove
  // nothing about whether the FENCE holds. Holding it is the worst case, which
  // is what this harness is for.
  // `work` is here for exactly that reason and no other. No real Client role
  // would ever hold it — every work-engine door refuses a portal caller outright
  // — which is precisely why the burglar must: a refusal proved against a caller
  // whose ROLE already stopped them proves nothing about the door.
  const grantAll = (roleId: string) =>
    db.exec(`
      INSERT INTO member_roles (id, title, is_default, created_at) VALUES ('${roleId}', '${roleId}', 0, '2026-01-01');
      INSERT INTO role_permissions (id, role_id, module, can_read, can_create, can_edit, can_delete)
      SELECT '${roleId}_' || m.module, '${roleId}', m.module, 1, 1, 1, 1
        FROM (SELECT 'accounts' AS module UNION ALL SELECT 'contacts'
              UNION ALL SELECT 'portal_users'
              UNION ALL SELECT 'team_members' UNION ALL SELECT 'member_roles'
              UNION ALL SELECT 'help' UNION ALL SELECT 'processes'
              UNION ALL SELECT 'work' UNION ALL SELECT 'todos') m;`)
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
  account(IDS.victimSecond, "entity", "Bergman Marine", null)
  // Hangs UNDER the company instead of being linked to it — the contact rows a
  // company's record carries.
  account(IDS.victimContact, "individual", "Luis Vera", IDS.victimAccount)
  account(IDS.burglarAccount, "entity", "Delaval Group", null)
  account(IDS.burglarPerson, "individual", "Diego Sanz", null)
  db.exec(
    `INSERT INTO accounts (id, account_type, name, email, created_at, creator_id)
     VALUES ('${IDS.clientPerson}', 'individual', 'Nadia Ruiz', 'nadia@bergman.example', '2026-01-01', '${IDS.staffUser}');`
  )

  db.exec(`
    INSERT INTO account_links (id, account_id, person_account_id, relationship, created_at, creator_id) VALUES
      ('${IDS.victimLink}', '${IDS.victimAccount}', '${IDS.victimPerson}', 'Operations', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.victimSecondLink}', '${IDS.victimSecond}', '${IDS.victimPerson}', 'Operations', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.burglarLink}', '${IDS.burglarAccount}', '${IDS.burglarPerson}', 'Owner', '2026-01-01', '${IDS.staffUser}');
    INSERT INTO portal_users (id, account_id, user_id, created_at, creator_id) VALUES
      ('${IDS.victimPortal}', '${IDS.victimPerson}', '${IDS.victimUser}', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.contactPortal}', '${IDS.victimContact}', '${IDS.contactUser}', '2026-01-01', '${IDS.staffUser}'),
      ('${IDS.burglarPortal}', '${IDS.burglarPerson}', '${IDS.burglarUser}', '2026-01-01', '${IDS.staffUser}');
  `)

  // A SUPPORT TICKET of the victim's — the table the fence did not reach. It is
  // seeded here rather than in the leak suite because the fixture IS the proof:
  // a burglar can only be caught stealing something that exists.
  //
  // It carries the ACCOUNT Marta raised it for (Bergman S.A.), because that is
  // what a ticket carries since the owner ruled that a contact sees their
  // company's questions. Her colleague Luis, whose record hangs under the same
  // company, must be able to see it; Diego at Delaval must not.
  db.exec(
    `INSERT INTO help (id, description, status, resolved, account_id, created_at, creator_id, creator_email, creator_name)
     VALUES ('${IDS.victimTicket}', 'Bergman S.A. cannot see the March invoice run', 'new', 0, '${IDS.victimAccount}', '2026-02-05', '${IDS.victimUser}', 'marta@bergman.example', 'Marta Ruiz');`
  )

  // THE VICTIM'S PROCESS MAP. Every row carries the account, because that is what
  // the fence reads — and the names are the client's own, so a leak is caught by
  // the "not Bergman" assertion as well as by id.
  db.exec(`
    INSERT INTO apps (id, account_id, name, url, stage, tool_cost_cents_per_month, created_at, creator_id)
      VALUES ('${IDS.victimApp}', '${IDS.victimAccount}', 'Bergman dispatch', 'https://dispatch.example', 'live', 42000, '2026-02-01', '${IDS.staffUser}');
    INSERT INTO processes (id, app_id, account_id, name, description, created_at, creator_id)
      VALUES ('${IDS.victimProcess}', '${IDS.victimApp}', '${IDS.victimAccount}', 'Bergman invoice approval', 'How Bergman approves a supplier invoice', '2026-02-01', '${IDS.staffUser}');
    INSERT INTO process_versions (id, process_id, account_id, version_no, label, created_at, creator_id)
      VALUES ('${IDS.victimVersion}', '${IDS.victimProcess}', '${IDS.victimAccount}', 1, 'How it worked before', '2026-02-01', '${IDS.staffUser}');
    INSERT INTO process_steps (id, process_id, version_id, account_id, step_key, name, position, seconds_per_run, runs_per_month, created_at, creator_id)
      VALUES ('${IDS.victimStep}', '${IDS.victimProcess}', '${IDS.victimVersion}', '${IDS.victimAccount}', 'SK_VICTIM', 'Check it against the order', 0, 2400, 20, '2026-02-01', '${IDS.staffUser}');
    INSERT INTO process_comments (id, process_id, account_id, body, is_staff, created_at, creator_id, creator_name)
      VALUES ('${IDS.victimComment}', '${IDS.victimProcess}', '${IDS.victimAccount}', 'Bergman asked whether the check can be skipped for repeat suppliers', 0, '2026-02-02', '${IDS.victimUser}', 'Marta Ruiz');
  `)

  // REAL HISTORY on the victim's world. Without it the activity burglaries pass
  // trivially — there is nothing to steal, so an unfenced feed and a fenced one
  // both answer "nothing". A green test that proves nothing is worse than none.
  db.exec(`
    INSERT INTO activity (id, type, description, related_table, related_row_id, created_at, creator_id, creator_email, creator_name) VALUES
      ('ACT_V1', 'Account edited', 'Staff changed Bergman S.A. phone to +34 600 111 222', 'accounts', '${IDS.victimAccount}', '2026-02-01', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_V2', 'Contact added', 'Staff added Marta Ruiz (marta@bergman.example) to Bergman S.A.', 'account_links', '${IDS.victimLink}', '2026-02-02', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_V3', 'Portal access granted', 'Staff gave portal access on Bergman S.A.', 'portal_users', '${IDS.victimPortal}', '2026-02-03', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_B1', 'Account edited', 'Staff changed Delaval Group address', 'accounts', '${IDS.burglarAccount}', '2026-02-04', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_H1', 'Help ticket raised', 'Marta Ruiz raised a support ticket — Bergman S.A. cannot see the March invoice run', 'help', '${IDS.victimTicket}', '2026-02-05', '${IDS.victimUser}', 'marta@bergman.example', 'Marta Ruiz'),
      ('ACT_H2', 'Help ticket edited', 'Staff edited a support ticket — Description from "Bergman S.A. cannot see the March invoice" to "Bergman S.A. cannot see the March invoice run"', 'help', '${IDS.victimTicket}', '2026-02-06', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_U1', 'Member role changed', 'Staff moved Nadia Ruiz to Admin', 'users', '${IDS.staffUser}', '2026-02-07', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff'),
      ('ACT_R1', 'Role permissions changed', 'Staff gave ${IDS.adminRole} delete on accounts', 'member_roles', '${IDS.adminRole}', '2026-02-08', '${IDS.staffUser}', 'staff@kwapso.app', 'Staff');
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
