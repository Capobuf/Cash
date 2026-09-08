# Acceptance evidence: Cash MVP v0.6

Validation date: 2026-09-08. Canonical source: `Cash_Specifica_Funzionale_v0.6.md`.

## Automated and executable checks

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test -- --run`: 15 files, 54 tests, pass.
- Performance: 100-item recalculation 18 ms; validation/save of an archive >=10 MB 108 ms on the validation workstation (targets: <100 ms and <1 s).
- `npm run build`: pass; local renderer/main/preload bundles contain no HTMX or Node import in the renderer.
- `npm run package:win`: pass; NSIS installer and unpacked Windows x64 application generated.
- Packaged `Cash.exe` smoke test: four Electron processes remained alive after 5 seconds, opened zero listening TCP ports, and were then stopped by the test; final installer size 234,001,755 bytes.
- Live read-only source checks: MIMIT regional CSV returned HTTP 200 with the expected 2026-09-08 header/columns; the ISTAT SDMX endpoint returned HTTP 200. FIC payload and permissions are checked against official API V2 documentation and deterministic fixtures; no real quote was created.

## Canonical criteria 1-57

| # | Status | Evidence |
|---:|:---:|---|
| 1 | PASS | Live profile preview and dashboard metrics in `renderer/app.ts`; fiscal/target assertions in `profile.test.ts`. |
| 2 | PASS | Annual v2 profile lifecycle, preset 2026, 5%/15%, confirmations and blockers in `model.ts`, `profiles.ts`, `calculations.ts`, `profile.test.ts`. |
| 3 | PASS | Cost create/edit/delete UI and monthly-to-annual Decimal calculation. |
| 4 | PASS | Italian calendar, Easter Monday, 4 October from 2026, local holidays and de-duplication in `calendar.ts` and `calendar.test.ts`. |
| 5 | PASS | Explicit `profileId` plus snapshot; date mismatch requires confirmation and never auto-switches profile. |
| 6 | PASS | Fuel/mode/territory adapter, daily reference date, vehicle cost and UI evidence in `mimit.ts`, `calculations.ts`, integration/quote tests. |
| 7 | PASS | Reusable Site CRUD with name, address, optional client and one-way km. |
| 8 | PASS | Travel stores one Site snapshot only; no departure/destination model. |
| 9 | PASS | Travel/template insertion proposes the quote main Site and permits another selection. |
| 10 | PASS | A/R × occurrences × one-way distance calculation covered in `quote.test.ts`. |
| 11 | PASS | Configurable mean speed and positive integer manual override per occurrence. |
| 12 | PASS | Travel distance × six-decimal vehicle cost/km, rounded to visible cents. |
| 13 | PASS | No routing, maps, traffic, geolocation dependency or endpoint. |
| 14 | PASS | Quote client is optional or a discriminated local/FIC independent snapshot; UI supports all three paths. |
| 15 | PASS | Main Site snapshot is independently stored on the quote. |
| 16 | PASS | Catalog supports reusable Time, Expense and Travel defaults plus edit/delete. |
| 17 | PASS | Multi-item templates include ordinary sub-items and user variant groups/options. |
| 18 | PASS | Manual quote item and manual/catalog Time, Expense and Travel insertion. |
| 19 | PASS | Explicit “Salva nel catalogo” creates a new identity. |
| 20 | PASS | Explicit multi-select preview saves one or more quote items as a new template. |
| 21 | PASS | Deep-copy identity tests in `catalog.test.ts`; source/copy propagation is absent. |
| 22 | PASS | User-created groups support zero/one default; zero default forces explicit initial selection; validated by `variants.test.ts`. |
| 23 | PASS | Each option accepts zero or more Time/Expense/Travel definitions and generated records carry group/option ownership. |
| 24 | PASS | Multiple simultaneous groups materialize and sum; covered by `variants.test.ts`. |
| 25 | PASS | Group-local replacement and manual-change warning/confirmation covered by `variants.test.ts`. |
| 26 | PASS | Main items have no duration field; time is derived only from sub-items. |
| 27 | PASS | Item calculation reports a typed blocker unless at least one sub-item produces positive time. |
| 28 | PASS | Item minutes, expenses, time value and theoretical value are Decimal-tested. |
| 29 | PASS | Aggregate totals are withheld when any item is incomplete and blocking item names are shown; `quote.test.ts`. |
| 30 | PASS | FOI without tobacco stores periods, raw indices, bases, official links, result/acquisition time and is visible in UI. |
| 31 | PASS | Chosen price is freely editable and never overwritten by theory/FOI. |
| 32 | PASS | Yield, deviation and floored coherent minutes (including deficit behavior) are tested. |
| 33 | PASS | Non-negative commission is stored outside items and excluded from analysis/export. |
| 34 | PASS | Profile/client/site/travel/fuel/FOI values are quote snapshots; reopening/source edits do not mutate them. |
| 35 | PASS | Explicit atomic refresh stages profile rate, Site distances, automatic travel time, vehicle cost and FOI. |
| 36 | PASS | Manual travel minutes remain unchanged during refresh; `refresh.test.ts`. |
| 37 | PASS | Refresh works on a clone and returns no mutation on any missing/invalid source; `refresh.test.ts`. |
| 38 | PASS | Active same-company FIC guard, explicit local-to-remote selection, preview/grouping, exact Consulenza/current VAT, `items_list`, descriptions and qty 1; export/integration tests. |
| 39 | PASS | Typed missing/source errors; no current-data cache, alternate source or automatic retry. |
| 40 | PASS | Hardened Electron host + isolated HTML/CSS/TypeScript renderer; no login/server/database/proxy/port. Packaged smoke passed. |
| 41 | PASS | Quote model has no status or Cash numbering; exported quotes remain editable. |
| 42 | PASS | Zod-validated UTF-8 schema v2 archive contains all functional data/local clients and excludes credentials/remote-client cache. |
| 43 | PASS | Every state mutation schedules serialized autosave; in-flight mutation race is covered by `state.test.ts`; native write validates temp and increments revision. |
| 44 | PASS | Previous valid file is copied before replace; restore is never automatic and preserves dated copies. |
| 45 | PASS | ID/revision/SHA-256 mismatches block writes; recovery copy receives a new identity; persistence tests. |
| 46 | PASS | Save status is always in the top bar; close/open replacement paths require save/recovery/discard/cancel. |
| 47 | PASS | Mirrored Google Drive sequential workflow and sync wait are shown in UI and documented in `README.md`. |
| 48 | PASS | Token is only in keytar/Windows Credential Manager, is per-workstation, unreadable by renderer, and retained on disable. |
| 49 | PASS | SHA-256 pending attempt is saved before one request; uncertain result is retained without retry; repeat warning is mandatory. |
| 50 | PASS | Quote-to-template always creates a new previewed copy; reusable Travel strips Site/vehicle/dynamic fields and retains manual minutes only. |
| 51 | PASS | Decimal.js and v2 schema enforce 2/3/1/2/4/6-decimal rules; half-up/floor formulas and visible-component sums are tested. |
| 52 | PASS | Newer schema is header-only/read-only; schema 1 requires preview + native confirmation + backup + atomic v2 migration. |
| 53 | PASS | All local screens/actions work without network; only MIMIT/ISTAT and active FIC commands cross the native allowlist. |
| 54 | PASS | No HTMX dependency, source reference or runtime fetch; renderer is bundled locally. |
| 55 | PASS | New/migrated archive starts with FIC disabled; domain, renderer and persistence tests complete the local workflow without credentials. |
| 56 | PASS | Four workstation states, staged wizard, atomic activation/reconfiguration, disable-preserve and atomic remove-with-rollback; `integration-state.test.ts` and `fic-link.test.ts`. |
| 57 | PASS | Local client create/search/edit/delete, optional formal VAT validation, explicit remote copy/homonym warning, Site deletion guard and snapshot independence; `clients.test.ts`. |

## Final Spec Kit analysis

- Requirements inventory: 12 functional requirements + 6 measurable outcomes.
- Task inventory: 56 dependency-ordered tasks.
- Coverage: 18/18 requirements/outcomes mapped to one or more tasks (100%).
- Critical/high inconsistencies: 0. Ambiguities/placeholders: 0. Constitution conflicts: 0.
- The additional performance goals originate in `plan.md` and are covered by T056 and executable performance tests.
