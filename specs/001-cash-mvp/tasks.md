# Tasks: Cash MVP

**Input**: Design documents from `/specs/001-cash-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by the constitution and success criteria. Tests precede their implementation.

## Phase 1: Setup

- [ ] T001 Initialize TypeScript/Electron package and scripts in package.json
- [ ] T002 [P] Configure TypeScript, Vitest, ESLint and ignore rules in tsconfig.json, vitest.config.ts, eslint.config.js and .gitignore
- [ ] T003 [P] Create separate main/preload/renderer bundle pipeline in scripts/build.mjs

## Phase 2: Foundational

- [ ] T004 Define domain entities and discriminated errors in src/domain/model.ts
- [ ] T005 [P] Define decimal precision helpers in src/domain/decimal.ts
- [ ] T006 Implement and export archive schemas in src/domain/schema.ts
- [ ] T007 [P] Define narrow renderer/native API contract in src/shared/ipc.ts
- [ ] T008 Implement hardened Electron window and preload bridge in src/native/main.ts and src/native/preload.ts

## Phase 3: User Story 1 - Annual target (P1)

**Independent Test**: Confirm a 2026 profile and verify fiscal/capacity/hourly values by hand.

- [ ] T009 [P] [US1] Add Italian workday and holiday tests in tests/unit/calendar.test.ts
- [ ] T010 [P] [US1] Add fiscal, target and capacity tests in tests/unit/profile.test.ts
- [ ] T011 [US1] Implement Italian calendar calculation in src/domain/calendar.ts
- [ ] T012 [US1] Implement fiscal, capacity and hourly-target calculations in src/domain/calculations.ts

## Phase 4: User Story 6 - Safe persistence (P1)

**Independent Test**: Create/save/backup and simulate all identity, revision and hash conflicts.

- [ ] T013 [P] [US6] Add atomic persistence and conflict tests in tests/integration/persistence.test.ts
- [ ] T014 [US6] Implement create/open/schema compatibility/fingerprint logic in src/native/persistence.ts
- [ ] T015 [US6] Implement serialized backup/temp/replace/recovery saves in src/native/persistence.ts
- [ ] T016 [US6] Wire archive dialogs, save states and external inspections in src/native/main.ts

## Phase 5: User Story 3 - Quote calculation (P1)

**Independent Test**: Reproduce Appendix A and verify every item and quote analysis output.

- [ ] T017 [P] [US3] Add item/travel/quote analysis tests in tests/unit/quote.test.ts
- [ ] T018 [US3] Implement vehicle, travel, item and aggregate calculations in src/domain/calculations.ts
- [ ] T019 [US3] Implement typed blockers and negative-yield/coherent-time handling in src/domain/calculations.ts

## Phase 6: User Story 2 - Reusable inputs (P2)

**Independent Test**: Copy catalog/template content and prove no source/copy propagation.

- [ ] T020 [P] [US2] Add independent-copy and deletion-reference tests in tests/unit/catalog.test.ts
- [ ] T021 [US2] Implement deep identity-renewing copies and template preview in src/domain/catalog.ts
- [ ] T022 [US2] Implement live-reference deletion guards in src/domain/catalog.ts

## Phase 7: User Story 4 - Variants (P2)

**Independent Test**: Change RAID while preserving firmware and ordinary sub-items.

- [ ] T023 [P] [US4] Add variant validation, atomic insertion and switch tests in tests/unit/variants.test.ts
- [ ] T024 [US4] Implement group validation, selection materialization and warning detection in src/domain/variants.ts
- [ ] T025 [US4] Implement group-owned replacement and manual-modification protection in src/domain/variants.ts

## Phase 8: User Story 5 - Snapshots and refresh (P2)

**Independent Test**: Prove source edits do not propagate and failed refresh changes nothing.

- [ ] T026 [P] [US5] Add snapshot and all-or-nothing refresh tests in tests/unit/refresh.test.ts
- [ ] T027 [US5] Implement profile/client/site/travel evidence snapshot creation in src/domain/refresh.ts
- [ ] T028 [US5] Implement staged current-value refresh with manual-time preservation in src/domain/refresh.ts

## Phase 9: User Story 7 - Official sources (P3)

**Independent Test**: Validate success/malformed/offline fixtures with no current-value cache.

- [ ] T029 [P] [US7] Add MIMIT/FOI/FIC adapter contract tests in tests/integration/integrations.test.ts
- [ ] T030 [P] [US7] Implement regional fuel normalizer/client in src/native/integrations/mimit.ts
- [ ] T031 [P] [US7] Implement FOI evidence/revaluation normalizer/client in src/native/integrations/foi.ts
- [ ] T032 [P] [US7] Implement Fatture in Cloud clients/products adapter in src/native/integrations/fatture-in-cloud.ts
- [ ] T033 [US7] Implement keytar token custody in src/native/credentials.ts and native handlers in src/native/main.ts

## Phase 10: User Story 8 - Deliberate export (P3)

**Independent Test**: Persist an attempt before one send and retain an uncertain outcome without retry.

- [ ] T034 [P] [US8] Add preview, grouping and export-attempt tests in tests/unit/export.test.ts
- [ ] T035 [US8] Implement preview/grouping/payload and attempt state in src/domain/export.ts
- [ ] T036 [US8] Implement one-shot export outcome classification in src/native/integrations/fatture-in-cloud.ts

## Phase 11: Desktop user experience

- [ ] T037 Create accessible application shell, navigation and save status in src/renderer/index.html and src/renderer/styles.css
- [ ] T038 Implement archive onboarding and state/autosave coordinator in src/renderer/state.ts
- [ ] T039 Implement profile, costs, vehicles, sites and catalog screens in src/renderer/app.ts
- [ ] T040 Implement quote editor, sub-items, variants and analysis screens in src/renderer/app.ts
- [ ] T041 Implement refresh, credentials, live data, preview/export and conflict flows in src/renderer/app.ts

## Phase 12: Polish and verification

- [ ] T042 Add user documentation for mirrored Drive sequencing, offline/live behavior and limitations in README.md
- [ ] T043 Add packaging configuration and Windows distributable metadata in package.json
- [ ] T044 Run typecheck, lint, tests and production build; resolve all failures
- [ ] T045 Validate quickstart and all 54 canonical acceptance criteria in specs/001-cash-mvp/acceptance.md

## Phase 13: Convergence to canonical v0.6

- [ ] T046 [P] Add schema-v1 fixtures and migration preview/backup/atomic-conversion tests, then implement schema v2 migration with FIC disabled by default
- [ ] T047 [P] Add fiscal phase, reduced-rate eligibility, ordinary-threshold applicability and live-preview tests, then implement the v0.6 profile lifecycle
- [ ] T048 [P] Add local-client VAT/search/copy/deletion-reference tests, then implement local client and discriminated client/site references
- [ ] T049 Update quote client snapshots and export preconditions so a local client requires an explicit confirmed same-company remote replacement
- [ ] T050 [P] Add disabled-zero-call, workstation-state, activation-cancel, disable and remove-link tests for Fatture in Cloud
- [ ] T051 Implement FIC token/company/scope/product activation services and narrow IPC with native active-state guards
- [ ] T052 Implement the atomic FIC activation wizard and four workstation states in the renderer
- [ ] T053 Implement local-client management and remote-to-local copy previews in the renderer
- [ ] T054 Update the profile renderer for annual lists, separate save/confirm actions, effective-rate preview and explicit year copying
- [ ] T055 Re-run Spec Kit analysis and document evidence for all 57 v0.6 acceptance criteria

## Dependencies & Execution Order

- Setup precedes Foundation; Foundation blocks all stories.
- US1 establishes the profile baseline used by US3 and US5.
- US6 supplies canonical persistence needed by the desktop flow and export attempt-before-send.
- US2 and US4 are independently testable after Foundation; US5 depends on US1 and US3 models.
- US7 is independent after Foundation; US8 depends on US6 and the FIC adapter from US7.
- Desktop UX integrates all completed story services; final verification follows UX.

## Parallel Opportunities

- T002/T003, T005/T007, and independent test files can be prepared concurrently.
- T030/T031/T032 target independent source adapters.
- After Foundation, US2 and US4 can proceed independently of persistence and quote calculations.

## Implementation Strategy

Deliver in risk order: pure target formulas, safe persistence, quote math, reusable modeling/variants,
snapshot refresh, live adapters/export, then the integrated desktop interface. Every checkpoint keeps
domain behavior executable through tests even before its screen is connected.
