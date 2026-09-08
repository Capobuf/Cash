# Data Model: Cash MVP

All persisted entities contain immutable UUID `id`, ISO UTC `createdAt`, and `updatedAt`. Decimal
values are strings with `.` separators; money has at most two input decimals, fuel up to three,
distance one, consumption two, and percentages four. Durations and occurrences are integers.

## Archive aggregate

`CashDocument` contains `schemaVersion`, immutable `documentId`, positive `revision`, timestamps,
shared settings, profiles, local clients, costs, vehicles, sites, catalog and quotes. It never
contains credentials or live remote-customer caches. `schemaVersion=2` is read/write; schema 1 is
migrated only after preview, confirmation and backup; newer is header-only read-only.

## EconomicProfile

- Identity and `year`, plus its own positive `revision` and `confirmed` flag.
- Target: `revenueTarget`, `specificAnnualExpenses`.
- Fiscal: `atecoCode`, `profitabilityCoefficient`, `contributionRate`, `contributionCeiling`, activity
  phase, reduced and ordinary substitute-tax rates, eligibility/applicability confirmations, and
  ordinary and cessation thresholds.
- Capacity: hours/day, vacation/unplanned days, client-time percentage, local holidays, travel speed.
- Derived on demand: forfait income, contribution/tax bases, contributions, tax, fiscal net,
  annual business costs, available income, theoretical/available workdays/hours and hourly target.
- A unique profile exists per year. Fiscal output needs confirmation and is blocked above cessation.

## LocalClient, BusinessCost, Vehicle and Site

`LocalClient` has an immutable Cash UUID, required display name and optional formally valid Italian
VAT number. Copy from a remote snapshot creates a preview and a fresh UUID after explicit confirmation;
it creates no live link or automatic merge. Deletion is blocked by live Site references, not snapshots.

`BusinessCost` has category, description and non-negative monthly EUR amount. `Vehicle` has name,
supported fuel, derived MIMIT mode, consumption value/unit, positive annual km, and non-negative annual
insurance/tax/maintenance. Current vehicle cost is evidence-dependent and is snapshotted, not stored as
a silent reusable cache. `Site` has name, address, optional minimal FIC client reference and optional
non-negative one-way km.

## Catalog and templates

`CatalogSubItem` is Time, Expense or reusable Travel. Reusable Travel retains round-trip, occurrences,
time mode and manual minutes when applicable, but no site, vehicle or automatic derived value.
`Template` owns one or more `TemplateItem`. Each item has a name, optional price reference/period,
ordinary sub-items, and zero or more `VariantGroup`s. A group has a non-empty unique name, at least one
uniquely named option and zero/one default. Every option owns zero or more sub-item definitions.

Copies from catalog to template to quote receive new IDs and retain no live source relationship.

## Quote aggregate

`Quote` has date, optional discriminated local/FIC client and site snapshots, exactly one optional economic profile reference plus
snapshot, one or more `QuoteItem`s, optional non-negative commission, snapshot revision/timestamp and
export attempts. It has no commercial status, validity, acceptance or Cash numbering.

`QuoteItem` has name, ordinary/generated `QuoteSubItem`s, variant selections, optional historical
reference plus FOI evidence, optional chosen price, and derived analysis. A `QuoteSubItem` is:

- Time: description and positive integer minutes.
- Expense: description and non-negative amount.
- Travel: source site/vehicle IDs, site/address/distance snapshot, round trip, positive occurrences,
  automatic/manual time mode, optional positive manual minutes per occurrence, vehicle/fuel evidence,
  derived total minutes and total cost.

Generated sub-items record owner group/option IDs and whether manually modified. A variant change may
remove only records owned by that group and warns if any is manually modified.

## Evidence

`FuelEvidence` contains fuel, official mode, territory, non-motorway network, price/unit, official data
date and acquisition timestamp. `FoiEvidence` contains start/end periods, raw indices, bases, official
link coefficients, comparable values, result and acquisition timestamp. `ProfileSnapshot` contains
profile ID/year/revision and every input/derived baseline used by quote calculations.

## ExportAttempt

Contains UUID, company ID, created time, exact lines, payload SHA-256, result (`pending`, `success`,
`rejected`, `uncertain`), optional remote document ID and diagnostic. `pending` is persisted before the
single network request. This is evidence, not quote status.

## Validation and transitions

- New archive: absent -> schema 1, new document UUID, revision 1.
- New archive: absent -> schema 2, FIC disabled, new document UUID, revision 1.
- Schema 1 migration: preview -> confirmation -> backup -> atomic conversion; FIC becomes disabled,
  non-secret references are retained, remote snapshots remain remote, and local clients start empty.
- Save: loaded token -> full validation -> revision +1 -> backup/temp/replace/reread -> new token.
- Conflict: any document/revision/hash mismatch -> write-blocked until explicit user action.
- Quote refresh: clone -> resolve all same-origin/current/live inputs -> validate entire clone -> replace
  snapshot as one mutation; any error discards the clone.
- Template insertion: resolve every missing variant/site/vehicle choice -> validate all -> append all;
  cancellation/error leaves the quote unchanged.
- Export: validate/preview -> persist pending attempt -> one send -> persist definite/uncertain outcome.
