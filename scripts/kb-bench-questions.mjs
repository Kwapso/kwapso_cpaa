// THE QUESTION SET the bench measures against, and the answer key beside it.
//
// AUTHORED OFF THE MATERIAL, not off the pipeline. Every `cites` names a source
// that is really in the staging base and really contains the answer, and every
// `refuse` names something the agency demonstrably has nothing on — checked by
// reading the rows, not by asking the retriever and writing down what it said.
// A key derived from the retriever's own output measures nothing.
//
// THREE KINDS OF CLAIM, because retrieval fails in three different ways:
//
//   cites   FINDING. One of these strings appears in a cited title.
//   refuse  HONESTY (R23). A question about something that never happened must
//           come back as "we have nothing on that". A confident answer here is
//           worse than no answer at all, and it is the failure a relevance floor
//           exists to prevent.
//   spread  USEFULNESS. Six passages that are one thing said six ways is not a
//           six-passage answer. `spread` is the number of DISTINCT subjects the
//           citations must cover once the calendar envelopes ("Invitation:",
//           "Notes:") are stripped back to the meeting they are about.
//
// A question may carry more than one; all of them must hold for it to pass.
//
// ── AND A SECOND KEY, FOR THE HALF A PERSON READS (--compose) ───────────────
//
// The three above grade RETRIEVAL. `--compose` grades the ANSWER, against the
// three things the owner actually named when he called the answers poor:
// "beating around the bush, unnecessary references to files that were not
// important, and the big juicy files it should have touched, it didn't".
//
//   lead   BEATING AROUND THE BUSH. At least one of these must appear in the
//          answer's FIRST SENTENCE. Authored off the material — these are things
//          the meeting or the document actually says, so a first sentence
//          carrying one of them is a first sentence that answered, and a first
//          sentence carrying none is a preamble however fluent it reads.
//   topic  FILES THAT WERE NOT IMPORTANT. A cited title must contain one of
//          these to have earned its place. Defaults to `cites` where a question
//          does not need a wider set.
//
// The third thing he named — the big juicy file it should have touched — needs
// no key at all, and that is the point: a passage whose whole text is its own
// title and a date cannot have earned a citation slot for ANY question, so the
// bench detects it from the material rather than from a list (see `hollow` in
// kb-bench.mjs). It had to be measured that way because a title key cannot see
// it: an empty placeholder for a meeting and the 92-chunk transcript of that
// meeting have exactly the same title.
export const QUESTIONS = [
  // ── FINDING WHAT IS THERE ────────────────────────────────────────────────
  {
    q: "What did we agree in the week recap?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Week recap"],
    // TWO RECAPS, BOTH VALID, and the key said so and then only listed one.
    //
    // The base holds a 96-chunk transcript from 14 August AND one from 21 August.
    // Either is a correct answer, and every token here came from the 14th — so
    // once the writer was given dates and began preferring the more RECENT
    // meeting, a good answer about the 21st scored wrong. The key was measuring
    // which meeting the model picked rather than whether it answered.
    //
    // 14 Aug: team horsepower and specialisation, project status, AI workflows.
    // 21 Aug: restructuring project lifecycles and roles, Haiku cutting costs.
    lead: [
      "horsepower", "specialis", "specializ", "workflow", "Aurora", "Alexander", "client deliver",
      "lifecycle", "Haiku", "restructur", "cost",
    ],
    topic: ["Week recap"],
  },
  {
    q: "What came out of the Team Assembly?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Team Assembly"],
    // From the 19 August transcript: a recurring monthly remote assembly, with
    // the organising rotated between people.
    lead: ["monthly", "bonding", "rotat", "remote", "culture"],
    topic: ["Team Assembly"],
  },
  {
    q: "What was the feedback on Kwapso CPAA?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Kwapso CPAA"],
    // From the 19 August transcript: the UI Kit, spacing and components, the
    // standardised timer, a template-based structure.
    lead: ["UI Kit", "spacing", "timer", "template", "component", "workflow"],
    topic: ["Kwapso CPAA", "Feedback"],
  },
  {
    q: "What was discussed on the HOGO sync?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["HOGO", "Hogo"],
    lead: ["HOGO", "Hogo", "import", "website", "blog", "workflow", "data"],
    topic: ["HOGO", "Hogo", "Requirements"],
  },
  {
    q: "What is the process for taking on a new insurance client?",
    cites: ["insurance client"],
    // The process map's own first steps, in its own words.
    lead: ["document", "email", "Confia", "details", "step"],
    topic: ["insurance client"],
  },
  {
    q: "How do we record a damage case?",
    cites: ["damage", "Schaden"],
    lead: ["phone", "policy", "report", "Confia", "step", "write"],
    topic: ["damage", "Schaden"],
  },
  {
    q: "What happens when a vehicle is handed to a new driver?",
    cites: ["vehicle", "driver"],
    lead: ["spreadsheet", "handover", "paper", "Ontime", "row", "step"],
    topic: ["vehicle", "driver", "Ontime"],
  },
  {
    q: "How are vouchers issued to a pharmacy?",
    cites: ["voucher", "pharmacy"],
    lead: ["request", "email", "entitled", "issue", "record", "FluClinic"],
    topic: ["voucher", "pharmacy"],
  },
  {
    q: "What was covered in the FluClinic sprint sync?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["FluClinic", "Flu clinic"],
    lead: ["sprint", "task", "Stripe", "FluClinic", "phase", "test"],
    topic: ["FluClinic", "Flu clinic"],
  },
  {
    q: "What did the strategy session with kwapso cover?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Strategy Session"],
    lead: ["strategy", "kwapso", "client", "plan", "grow", "product"],
    topic: ["Strategy Session"],
  },

  // ── AN EXACT REFERENCE, INSIDE A LONG QUESTION ───────────────────────────
  //
  // The pair matters more than either question. "task 3144" always answered,
  // because a two-word question embeds to essentially the embedding of "3144".
  // The same reference inside a sentence a person would actually say was cited to
  // three FluClinic meetings and missed the task — so the fuller and more
  // courteous the question, the worse the answer.
  //
  // It was blamed on the proportional term floor and that was wrong twice over:
  // the floor's bypass was already there, and it was switched off for this exact
  // reference by a rarity cap somebody guessed at (20 chunks; 3144 is in 56).
  // With the cap measured, the word arm finds the chunk — and then loses it, ten
  // to one, to a fusion weight set for ordinary questions. Both had to move. See
  // EXACT_TERM_MAX_CHUNKS and EXACT_WEIGHT in knowledge.ts.
  {
    q: "Could somebody remind me where things currently stand with task 3144, and whether anybody has replied about it since last week?",
    // NO `cites`, AND THAT IS THE CORRECTION. A title key is the wrong instrument
    // for a reference: the sources that actually discuss ticket 3144 are the
    // FluClinic Stripe-webhook meetings, their notes and the chat where Chilavert
    // asks about it, and not one of those carries the number in its title. The
    // only titles that do are the calendar envelopes — "Invitation: FluClinic :
    // Task 3144 @ Tue Aug 25" — whose bodies are the same words again with a time
    // on them. So a title key was scoring this question PASS for citing the two
    // sources that say least about it, and FAIL the moment retrieval started
    // finding the material. `lead` is the honest test: the passages must contain
    // the reference itself.
    lead: ["3144"],
    topic: ["3144", "FluClinic", "Stripe", "webhook"],
  },
  {
    q: "task 3144",
    lead: ["3144"],
    topic: ["3144", "FluClinic", "Stripe", "webhook"],
  },

  // ── SAYING NOTHING, WHEN THERE IS NOTHING ────────────────────────────────
  // R23. Each of these names something the base genuinely does not hold: no
  // security review was ever run, nobody has written about parental leave, and
  // the capital of France is the standing example of a question whose words all
  // appear somewhere and never together.
  { q: "What did the external penetration test report conclude about our authentication?", refuse: true },
  { q: "What is our parental leave policy and how much notice does it need?", refuse: true },
  { q: "What is the capital of France?", refuse: true },
  { q: "What were the findings of the ISO 27001 certification audit we completed?", refuse: true },

  // ── ONE THING SAID FIVE WAYS ─────────────────────────────────────────────
  // The measured failure that fix 5 is about. A recurring meeting arrives as the
  // meeting itself, its Gemini notes in Drive, the calendar event and the
  // invitation and notes emails — five titles, one subject — and an answer built
  // from six of them has told the reader one thing.
  {
    q: "Summarise the week recap meeting",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Week recap"],
    spread: 2,
    // Both recaps — see the note on the earlier week-recap question.
    lead: [
      "horsepower", "specialis", "specializ", "workflow", "Aurora", "Alexander", "client deliver",
      "lifecycle", "Haiku", "restructur", "cost",
    ],
    topic: ["Week recap"],
  },
  {
    q: "What happened at the Team Assembly meeting in August?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Team Assembly"],
    spread: 2,
    lead: ["monthly", "bonding", "rotat", "remote", "culture"],
    topic: ["Team Assembly"],
  },

  // ── QUESTIONS THAT CROSS SOURCES ─────────────────────────────────────────
  { q: "What is the plan for importing HOGO's existing data?", cites: ["HOGO", "Hogo", "Import"],
    lead: ["import", "data", "HOGO", "Hogo", "file", "structure"],
    topic: ["HOGO", "Hogo", "Import", "import"],
  },
  {
    q: "What has been agreed with Assecuranz about their file import?",
    // A conversation somebody had, so it has speakers to name (see `attributes`).
    conversation: true,
    cites: ["Assecuranz"],
    lead: ["import", "folder", "file", "Marco", "hold", "feedback", "Assecuranz"],
    topic: ["Assecuranz"],
  },
]
