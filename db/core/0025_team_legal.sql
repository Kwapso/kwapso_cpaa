-- THE AGENCY'S OWN DETAILS — the four facts a business owner reaches for and
-- had nowhere to keep.
--
-- "As a business owner you use this all the time" is the whole justification:
-- the registered company name, the address that goes on a contract, the
-- registration and tax numbers, and the number somebody rings. They were being
-- copied out of an accountant's email every time an invoice, a data-processing
-- agreement or a client's supplier form asked for them.
--
-- ON THE TEAM ROW, and that is the decision worth writing down. The obvious
-- alternative was a settings table with a key and a value, and it is worse in
-- the one way that matters here: these four facts are ABOUT the team, they are
-- read on the same screen as the team's name and logo, and a key-value store
-- would make "the company's legal name" a string somebody spells two ways in
-- two places. One row, four columns, one read.
--
-- WHY NOT `name`. The team's `name` is what the app calls itself in the rail and
-- on a heading, and it is often the short one. `legal_name` is what appears on
-- an invoice. Merging them would force one of the two to be wrong, and it is
-- always the one on the contract.
--
-- `legal_numbers` is deliberately ONE free-text column rather than a company
-- number, a VAT number and a tax number as three. Which numbers a business has
-- is a fact about its country, not about this app: an Austrian GmbH carries a
-- Firmenbuchnummer and a UID, a Spanish SL carries a CIF, and a sole trader may
-- carry neither. Three columns would be two empty ones for most of the world and
-- a fourth column requested within the month. It is a small block of text people
-- paste, and it is treated as such.
--
-- All four nullable: a team that has never opened the screen is not broken, and
-- NOT NULL here would make the first team creation fail on a question nobody had
-- been asked yet.
ALTER TABLE teams ADD COLUMN legal_name TEXT;
ALTER TABLE teams ADD COLUMN legal_address TEXT;
ALTER TABLE teams ADD COLUMN legal_numbers TEXT;
ALTER TABLE teams ADD COLUMN phone TEXT;
