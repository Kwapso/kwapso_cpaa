# The Glide catalogue — the legacy data, and how to get it

Kwapso ran on two Glide apps before this one. Their data still matters: it is the
real history that the new app has to carry forward. This folder is where the
route back to that data is kept.

**The catalogue was collected by hand and must never be collected again.** Glide
does not offer a list of table ids — the owner opened each table in the editor and
copied its API snippet out one at a time. `catalog.json` is the result: every
table in both apps, with its id, keyed by a plain English name.

## The one thing worth knowing

Both apps read **the same tables**. Every table the client portal exposes has an
identical table id in the agency app. The portal was never a second dataset — it
was one dataset with a filter over it, decided per signed-in contact.

That is the same shape as the account fence in this codebase
(`shared/workers/account-scope.ts`), which is a good sign: the model the agency
already runs on is the model we built, so the migration is a mapping exercise and
not a rethink.

## Getting the rows

The catalogue holds ids, not data. Rows need an API token, which Glide issues on
the Business plan and above.

```bash
source ~/.config/kwapso/keys.env && node scripts/glide-pull.mjs
```

The script follows every continuation token to the end of every table and writes
one JSON file per table into `glide/data/`, plus a `_summary.json` listing the row
and column counts. `glide/data/` is git-ignored — it is customer data, and it does
not belong in the repository.

To look at a single table while working:

```bash
source ~/.config/kwapso/keys.env && node scripts/glide-pull.mjs customers
```

## What to expect in the rows

Glide column ids are opaque — five random characters, not names. `milestones` is
the one table whose mapping the owner supplied, and it shows the shape:
`date` is stored as `j4PZ2`, `description` as `EAyh4`. Every other table will need
the same treatment: pull the rows, read a handful, and write the mapping down.

That mapping work is the **field reconciliation**, and it is deliberately a set of
decisions put to the owner rather than a silent migration. Where a Glide field has
no home in the customer spine, the answer is either a new column with a reason or
a field we consciously drop — never a guess.

## What is not migrating

`roles` (agency app). The base has its own permission matrix, and it is the spine
of the whole product. Importing Glide's roles would mean carrying a second, weaker
model alongside it.
