// THE KWAPSO DICTIONARY — one canonical term per product concept, each with a
// plain, brief definition (correct word, explained simply, never over-explained).
// Audience: 45–55yo managers who want things simple. The whole app speaks THESE
// words; copy should never invent a synonym for a concept that's already here.
// Enforced well-formed by web/test/rules.test.ts (R6: glossary-wellformed).

export interface GlossaryEntry {
  term: string
  /** one line, ≤140 chars — clear enough for a five-year-old, but the right word. */
  def: string
}

export const GLOSSARY = {
  team: { term: "Team", def: "Your shared workspace — the people and data you work on together." },
  member: { term: "Member", def: "A person on your team." },
  role: { term: "Role", def: "What a member is allowed to see and do." },
  permission: { term: "Access right", def: "A single thing a role can do: read, create, edit, or delete." },
  invite: { term: "Invite", def: "An email asking someone to join your team in a role you choose." },
  revoke: { term: "Revoke", def: "Cancel an invite before it's accepted." },
  deactivate: { term: "Activate / deactivate", def: "Turn a record on or off without deleting it — it's retired, not removed, so its history and access survive." },
  account: { term: "Account", def: "A company or a person you work with — both live in the same list." },
  parentAccount: { term: "Parent account", def: "The account this one sits under, like a business under its holding company." },
  contact: { term: "Contact", def: "A person linked to an account. The same person can be a contact of more than one." },
  referenceCode: { term: "Reference", def: "A short code you give an account so it's easy to say out loud. It's a label, not its identity." },
  portalAccess: { term: "Portal access", def: "A login that lets someone at an account see their own work here. Take it away and their records stay." },
  archive: { term: "Archive", def: "Put a record away without losing it — it stops showing in the everyday lists, and nothing is deleted." },
  ticket: { term: "Ticket", def: "Something someone has asked us for — a question, a problem, a change. It lives in Tickets until it's sorted." },
  helpThread: { term: "Conversation", def: "The back-and-forth messages on a ticket." },
  // THE WORK ENGINE'S FOUR NOUNS, and the words around them. Ported from SCOPE
  // ch.02 rather than invented (Law R6): a ticket is what an account ASKS for, a
  // story is what WE DO about it, a to-do is what we are waiting on THEM for, and
  // a task is our own admin. Keeping those four apart in the words is what keeps
  // them apart on the screens.
  story: { term: "Story", def: "One piece of work we do. It carries who's doing it and by when, and lives in a sprint." },
  todo: { term: "To-do", def: "Something we're waiting on a client for. It sits in their portal with a due date." },
  task: { term: "Task", def: "Our own internal admin — something for us, not for an account's delivery." },
  sprint: { term: "Sprint", def: "A block of delivery work sold to one account, with a start, an end and a price." },
  app: { term: "App", def: "A system we build for an account — the thing with its own address. One goal can need two." },
  workLog: { term: "Work log", def: "One row of time: who, what they worked on, and how long, in whole seconds." },
  timer: { term: "Timer", def: "A work log still running. Start it in one click; it waits in the header until you stop it." },
  triage: { term: "Triage", def: "The first read of a new ticket — answer it, or split it into stories." },
  engagementType: { term: "Engagement type", def: "A label on time saying how it was sold: blueprint, sprint, support or hourly." },
  recordReference: { term: "Reference number", def: "The short number on a ticket, story or sprint — BERG-T0412 — so anyone can say which one they mean." },
  stakeholder: { term: "Stakeholder", def: "Someone kept in the loop on a ticket — the person who raised it, your admins, and anyone mentioned." },
  learning: { term: "Learning", def: "Your team's how-to articles, read right here in the app." },
  article: { term: "Article", def: "One how-to in Learning." },
  category: { term: "Category", def: "A label that groups your learning articles." },
  progress: { term: "Done", def: "Whether you've personally finished a learning article." },
  dropdownValues: { term: "Dropdown values", def: "The options behind your team's dropdowns — like Ticket types and Learning categories." },
  importCsv: { term: "Import", def: "Bring rows in from a spreadsheet (CSV) instead of typing them one by one." },
  exportCsv: { term: "Export", def: "Download what you can see as a spreadsheet (CSV) file." },
  sampleFile: { term: "Sample file", def: "A downloadable example that shows what a good import file looks like." },
  assistant: { term: "Assistant", def: "Your in-app helper — it can find things, explain them, and make changes for you." },
  knowledgeBase: { term: "Knowledge base", def: "Everything the assistant is allowed to read, in one place — you can add to it, correct it, and take things out." },
  source: { term: "Source", def: "One piece of material in the knowledge base: a note you wrote, or something the app keeps in step for you." },
  compartment: { term: "Compartment", def: "The slice of the knowledge base a question is answered from — one client's world, or the agency's own." },
  citation: { term: "Citation", def: "The source an answer came from. Every answer names its own; an answer with no source isn't one." },
  activity: { term: "Activity", def: "A history of what changed on a record, and who changed it." },
  overview: { term: "Overview", def: "The key facts about a record at a glance." },
  status: { term: "Status", def: "Where a record sits in its lifecycle — a ticket is open or resolved; an account is a prospect, a client, or a past client." },
} as const satisfies Record<string, GlossaryEntry>

