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
  team: { term: "Team", def: "Your shared workspace, the people and data you work on together." },
  member: { term: "Member", def: "A person on your team." },
  role: { term: "Role", def: "What a member is allowed to see and do." },
  permission: { term: "Access right", def: "A single thing a role can do: read, create, edit, or delete." },
  invite: { term: "Invite", def: "An email asking someone to join your team in a role you choose." },
  revoke: { term: "Revoke", def: "Cancel an invite before it's accepted." },
  // ONE VERB FOR SWITCHING A RECORD OFF (R6, decided 2026-08-19). The word
  // "retired" used to sit inside this definition, and three screens had taken it
  // out again as a button of its own — a rate card and a staff profile both said
  // Retire / Restore for the very thing this entry names, and staff-panel.tsx
  // put Retire and Archive on one screen for two records that behave alike. Both
  // doors write an `active` flag and both rows stay on screen greyed, which is
  // this word, not Archive's. So the word is gone from the definition too: a
  // term the app is not allowed to say should not survive as prose here.
  deactivate: { term: "Activate / deactivate", def: "Turn a record on or off without deleting it. Off, it stops being offered, and its history and access survive." },
  account: { term: "Account", def: "A company or a person you work with, both live in the same list." },
  // THE OTHER HALF OF `account`, WHICH HAD NO ENTRY (R6, decided 2026-08-19).
  // It is a tab on Accounts with its own server count, the account detail's
  // eyebrow, a tab on a contact, and the whole of the client portal's nav
  // ("My company") — a first-class word carrying a first-class distinction
  // (`accountType: "entity"` vs `"individual"`), and it was being spoken on four
  // screens with nothing saying what it meant.
  company: { term: "Company", def: "An account that is a business rather than a person." },
  parentAccount: { term: "Parent account", def: "The account this one sits under, like a business under its holding company." },
  contact: { term: "Contact", def: "A person linked to an account. The same person can be a contact of more than one." },
  referenceCode: { term: "Reference", def: "A short code you give an account so it's easy to say out loud. It's a label, not its identity." },
  portalAccess: { term: "Portal access", def: "A login that lets someone at an account see their own work here. Take it away and their records stay." },
  archive: { term: "Archive", def: "Put a record away without losing it, it stops showing in the everyday lists, and nothing is deleted." },
  ticket: { term: "Ticket", def: "Something someone has asked us for, a question, a problem, a change. It lives in Tickets until it's sorted." },
  helpThread: { term: "Conversation", def: "The back-and-forth messages on a ticket." },
  // THE WORK ENGINE'S FOUR NOUNS, and the words around them. Ported from SCOPE
  // ch.02 rather than invented (Law R6): a ticket is what an account ASKS for, a
  // story is what WE DO about it, a to-do is what we are waiting on THEM for, and
  // a task is our own admin. Keeping those four apart in the words is what keeps
  // them apart on the screens.
  story: { term: "Story", def: "One piece of work we do. It carries who's doing it and by when, and lives in a sprint." },
  todo: { term: "To-do", def: "Something we're waiting on a client for. It sits in their portal with a due date." },
  task: { term: "Task", def: "Our own internal admin, something for us, not for an account's delivery." },
  sprint: { term: "Sprint", def: "A block of delivery work sold to one account, with a start, an end and a price." },
  app: { term: "App", def: "A system we build for an account, the thing with its own address. One goal can need two." },
  workLog: { term: "Work log", def: "One row of time: who, what they worked on, and how long, in whole seconds." },
  timer: { term: "Timer", def: "A work log still running. Start it in one click; it waits in the header until you stop it." },
  triage: { term: "Triage", def: "The first read of a new ticket. Answer it, or split it into stories." },
  engagementType: { term: "Engagement type", def: "A label on time saying how it was sold: blueprint, sprint, support or hourly." },
  recordReference: { term: "Reference number", def: "The short number on a ticket, story or sprint. BERG-T0412, so anyone can say which one they mean." },
  stakeholder: { term: "Stakeholder", def: "Someone kept in the loop on a ticket, the person who raised it, your admins, and anyone mentioned." },
  dropdownValues: { term: "Dropdown values", def: "The options behind your team's dropdowns, like Ticket types and Sprint types." },
  importCsv: { term: "Import", def: "Bring rows in from a spreadsheet (CSV) instead of typing them one by one." },
  exportCsv: { term: "Export", def: "Download what you can see as a spreadsheet (CSV) file." },
  sampleFile: { term: "Sample file", def: "A downloadable example that shows what a good import file looks like." },
  assistant: { term: "Assistant", def: "Your in-app helper, it can find things, explain them, and make changes for you." },
  // WHAT THE ASSISTANT COSTS, IN ONE WORD (R6, decided 2026-08-19). The app said
  // "assistant requests" and "assistant allowance" two lines apart in the same
  // paragraph, "assistant credits" in the header badge, and "AI quota" in the
  // prompt handed to an outside tool — four names for one number, and no entry
  // for any of them. Underneath there are genuinely TWO POTS (a free daily count
  // in `agent_usage`, a balance an admin tops up in `agent_credits`), but they
  // hold the SAME unit, and `AgentQuota.remaining` already adds them together to
  // answer the only question a person asks: can I ask it something? So the UNIT
  // gets the word, and the two pots are said as plain adjectives on that one word
  // ("free credits left today", "an admin can add more") rather than earning a
  // second term somebody has to keep apart. The usage view is the one screen that
  // splits them, because that is the screen whose whole job is the split.
  assistantCredit: { term: "Credit", def: "One request to the assistant. Your team gets a batch free each day, and an admin can add more to the balance." },
  knowledgeBase: { term: "Knowledge base", def: "Everything the assistant is allowed to read, in one place, you can add to it, correct it, and take things out." },
  source: { term: "Source", def: "One piece of material in the knowledge base: a note you wrote, or something the app keeps in step for you." },
  compartment: { term: "Compartment", def: "The slice of the knowledge base a question is answered from, one client's world, or the agency's own." },
  citation: { term: "Citation", def: "The source an answer came from. Every answer names its own; an answer with no source isn't one." },
  activity: { term: "Activity", def: "A history of what changed on a record, and who changed it." },
  overview: { term: "Overview", def: "The key facts about a record at a glance." },
  status: { term: "Status", def: "Where a record sits in its lifecycle, a ticket runs new to resolved; an account is a prospect, a client, or a past client." },
  // ONE WORD FOR WHAT SORT OF THING A RECORD IS (R6, decided 2026-08-19). A
  // ticket said Type, a sprint and a story said Kind, a deliverable said Kind
  // and a brand asset said Category — four words for one field, on screens a
  // person walks between in a morning. The dropdown groups behind three of the
  // four were already seeded "Ticket type" / "Sprint type" / "Story type", so
  // the app's own data had settled this before its copy did. The word is Type.
  //
  // WHAT DID NOT CHANGE, and why: the GROUP STRINGS ("Sprint type", "Deliverable
  // kind", "Brand asset category") are values in `selectable_data.type` in every
  // team database, and renaming one orphans its rows from the values filed under
  // it. Same ruling as CLAUDE.md's `help`/Tickets: the human-facing word moves,
  // the identifier stays. "Kind of work" also stays — a rate is priced per
  // CATEGORY OF LABOUR, which is a different thing from a record's type, and it
  // is `rateCard`'s own wording below.
  recordType: { term: "Type", def: "What sort of thing a record is. Most types are your team's own list, so you can add one we haven't thought of." },

  // PROCESS MAPS, VERSIONS AND THE MONEY (SCOPE ch.02 — ported, never invented).
  // The chain is App → Process → Step, and it is what every savings figure is
  // drilled through. `app` is the one word this build shares with the work-engine
  // lane (.plans/BUILD-1 §9 ports it too); the definition below is that lane's,
  // word for word, so a merge keeps one line rather than choosing between two.
  process: { term: "Process", def: "A way of working inside an app, the steps someone takes to get one job done." },
  step: { term: "Step", def: "One part of a process. It carries how long it takes and how often it runs." },
  processVersion: { term: "Version", def: "A process as it was at one moment. Version 1 is how they worked before us; each later one is what we changed it to." },
  baseline: { term: "Baseline", def: "Version 1 of a process, how the work was done before we touched anything. Every saving is measured from it." },
  savings: { term: "Saving", def: "Time a step no longer takes: the baseline minus the latest version, times how often it runs." },
  regression: { term: "Regression", def: "A step that now takes longer than the baseline. We show it, and we say why." },
  agreedEstimate: { term: "Agreed estimate", def: "A time we agreed with you rather than measured. The estimates are agreed; the subtraction is arithmetic." },
  rateCard: { term: "Rate card", def: "What an account is charged per hour, by kind of work." },
  internalRate: { term: "Internal rate", def: "What an hour of our own work costs us. Ours alone, it never leaves the agency." },
  margin: { term: "Margin", def: "What is left of revenue after our own time and tool costs. Ours alone, never shown to a client." },
  toolCost: { term: "Tool cost", def: "What an app costs us to keep running each month, hosting and the services behind it." },
  priceVisibility: { term: "Price visibility", def: "The switch on an account that decides whether they see what they bought. Value is shown either way." },
  // WHAT WE HAND OVER on an app. ONE word now, not two: the KIND entry that used
  // to sit here was the very fault it was written to prevent — it worried that
  // "somebody writes 'category' on one screen and 'type' on the next", and by
  // then a brand asset already said Category and a ticket already said Type. So
  // the concept moved up to `recordType`, and the deliverable keeps its own noun.
  deliverable: { term: "Deliverable", def: "Something we handed over on an app: a handover doc, an API reference, a recorded walkthrough, an SOP." },

  // THE AGENCY'S OWN HOUSEKEEPING — the words for the three modules that describe
  // how we run ourselves. Every definition here says, or implies, the same thing
  // the code says at every door: this is ours, and a client never sees it.
  brandAsset: { term: "Brand asset", def: "One piece of our own brand material: a logo, a deck, a template." },
  meetingPurpose: { term: "Meeting purpose", def: "Why we meet, and the department it belongs to." },
  meeting: { term: "Meeting", def: "A conversation we had or are about to have, with what we meant to cover and what was decided." },
  agenda: { term: "Agenda", def: "What we mean to cover in a meeting, written before it." },
  meetingNotes: { term: "Meeting notes", def: "What was said and decided in a meeting, written after it. Ours alone, a client never reads them." },
  department: { term: "Department", def: "The part of the agency a person or a meeting belongs to." },
  staffProfile: { term: "Staff profile", def: "What a colleague is like and how they work best. The team can read it; a client never can." },
  certificate: { term: "Certificate", def: "A qualification someone on the team holds, who issued it, and when it lapses." },

  // GOOGLE, CONNECTED ONE PERSON AT A TIME. Every word here carries the same
  // sentence, because it is the decision the whole module is shaped around: the
  // account is YOURS, the folders and spaces are ones YOU named, and the
  // assistant sees exactly what you see and not one thing more. "Shelf" is the
  // word for the question the answer key said we must answer at the moment
  // somebody shares a folder — who will be able to read this?
  googleConnection: { term: "Google connection", def: "Your own link to one Google service. You connect your account; nobody uses anyone else's." },
  sharedFolder: { term: "Shared folder", def: "A Drive folder you named for kwapso. Nothing outside the folders you name is ever read." },
  sharedSpace: { term: "Shared space", def: "A Google Chat space you named for kwapso. Nothing outside the spaces you name is ever read." },
  shelf: { term: "Shelf", def: "Who may read something you shared: private means you alone, team means anyone whose role can read it." },
  knownContact: { term: "Known contact", def: "An email address on one of your accounts. Mail is only read when it is to or from one of them." },
  gmailDraft: { term: "Draft", def: "A reply written for you and left in your Gmail drafts. It is not sent until you say so." },
} as const satisfies Record<string, GlossaryEntry>

