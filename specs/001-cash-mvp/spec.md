# Feature Specification: Cash MVP

**Feature Branch**: `main`

**Created**: 2026-09-08

**Status**: Approved

**Input**: User description: "Procedi all'implementazione, tramite spec kit, seguendo la specifica."

**Canonical source**: `Cash_Specifica_Funzionale_v0.6.md`. Its invariants, formulas, validations,
data rules, flows, and 57 MVP acceptance criteria are normative and take precedence over this
workflow summary.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan the annual target (Priority: P1)

As a sole professional, I configure a confirmed annual economic/fiscal profile and recurring costs
so that Cash shows my fiscal estimate, client capacity, and average hourly value to generate.

**Why this priority**: This value is the baseline for every quotation calculation.

**Independent Test**: Create and confirm the 2026 preset, enter targets/costs/availability, and
verify the Italian calendar and all economic results against hand calculations.

**Acceptance Scenarios**:

1. **Given** a confirmed profile, **When** target or availability changes, **Then** every dependent
   indicator is recalculated immediately using the specified decimal rounding.
2. **Given** an unconfirmed or over-cessation-threshold profile, **When** fiscal results are requested,
   **Then** only those results are blocked and the cause is shown without fallback values.

---

### User Story 2 - Maintain reusable inputs (Priority: P2)

As a professional, I maintain local clients, costs, vehicles, sites, catalog sub-items, and multi-item templates so
that repeated quote setup is fast while every copy remains independent.

**Why this priority**: Reuse provides the main productivity benefit beyond a calculator.

**Independent Test**: Create and edit every reusable entity, insert copies into a template and quote,
and verify that no later edit propagates to previous copies.

**Acceptance Scenarios**:

1. **Given** reusable content, **When** it is inserted, **Then** the copy has independent identifiers.
2. **Given** a live template/configuration reference, **When** deletion is attempted, **Then** Cash
   blocks deletion and lists references, while quote snapshots do not block it.

---

### User Story 3 - Build and analyze a quote (Priority: P1)

As a professional, I create a quote with commercial items and internal time, expense, and travel
sub-items, select variants and prices, and compare item and whole-quote economics.

**Why this priority**: This is the core commercial decision workflow.

**Independent Test**: Reproduce Appendix A and verify time, travel, expenses, theoretical value,
yield, deviation, coherent maximum time, and totals.

**Acceptance Scenarios**:

1. **Given** complete inputs, **When** a sub-item changes, **Then** item and aggregate analyses update.
2. **Given** an incomplete item, **When** totals are requested, **Then** Cash names every blocker and
   never silently excludes the item.
3. **Given** chosen price below expenses, **When** yield is calculated, **Then** Cash shows negative
   yield and deficit and does not display a negative duration.

---

### User Story 4 - Configure variants safely (Priority: P2)

As a professional, I define independent variant groups whose options contribute their own sub-items
and change one option without disturbing unrelated work.

**Why this priority**: Variants prevent template proliferation while preserving transparent inputs.

**Independent Test**: Configure the firmware and RAID examples, select both, edit a generated item,
change RAID, and verify only RAID contributions are replaced after confirmation.

**Acceptance Scenarios**:

1. **Given** a group without a default, **When** a template is inserted, **Then** all missing choices
   are collected and validated before any quote mutation.
2. **Given** a manually modified generated item, **When** its option changes, **Then** Cash warns
   before replacement and leaves normal and other-group items untouched.

---

### User Story 5 - Preserve and refresh evidence (Priority: P2)

As a professional, I inspect the historical profile, site, fuel, travel, and inflation inputs used by
a quote and explicitly refresh applicable dynamic values as one transaction.

**Why this priority**: Historical reproducibility prevents silent changes to commercial decisions.

**Independent Test**: Change source data after saving, reopen unchanged, then refresh with mocked live
sources and verify all-or-nothing behavior and preservation of manual travel time.

**Acceptance Scenarios**:

1. **Given** a saved quote, **When** source data changes, **Then** it remains unchanged until refresh.
2. **Given** one missing origin/source, **When** refresh runs, **Then** no snapshot value changes and
   the precise failure is shown.

---

### User Story 6 - Save safely across workstations (Priority: P1)

As a professional, I select one JSON archive in mirrored Drive storage and trust Cash to save logical
edits atomically while detecting external changes.

**Why this priority**: The archive is the sole data source; corruption or lost updates are unacceptable.

**Independent Test**: Exercise create, save, backup, failure, hash/revision/document conflicts,
recovery copy, and newer-schema read-only behavior.

**Acceptance Scenarios**:

1. **Given** a clean archive, **When** an edit saves, **Then** a backup and atomic revision increment
   occur and the save state is visible.
2. **Given** a changed disk identity, revision, or hash, **When** save runs, **Then** overwrite is
   blocked and explicit recovery/reload choices are offered without merging.

---

### User Story 7 - Use official live data (Priority: P3)

As a professional, I acquire current MIMIT fuel data, ISTAT FOI evidence, and Fatture in Cloud data
through the native host while local work remains available offline.

**Why this priority**: Live data enriches decisions but is not required for offline local editing.

**Independent Test**: Run adapters against fixtures for success, malformed data, unavailable source,
and unsupported combinations; verify no cached substitute is returned.

**Acceptance Scenarios**:

1. **Given** an official supported response, **When** requested, **Then** normalized evidence and its
   source/acquisition metadata are returned and snapshotted.
2. **Given** offline or invalid data, **When** a live function runs, **Then** only that function is
   blocked with a source-specific error.

---

### User Story 8 - Export deliberately (Priority: P3)

As a professional, I preview/group quote items and create a Fatture in Cloud document using validated
customer and Consulenza product data while preserving uncertain attempts.

**Why this priority**: Export removes duplicate entry but is not needed for core estimating.

**Independent Test**: Preview lines, persist before send, simulate success and uncertain failure, and
verify no automatic retry or unacknowledged duplicate occurs.

**Acceptance Scenarios**:

1. **Given** valid prerequisites, **When** export is confirmed, **Then** quantity-one commercial lines
   are sent without internal sub-items, expenses, or commission.
2. **Given** an uncertain transport outcome, **When** the call ends, **Then** the attempt remains to
   verify and later export requires an explicit warning.

---

### User Story 9 - Opt into Fatture in Cloud (Priority: P3)

As a professional, I keep the complete local workflow available by default and activate Fatture in
Cloud only through a verified, atomic wizard on each workstation.

**Independent Test**: Complete the local quote cycle with the module disabled, then activate with a
token, company, exact permissions and Consulenza product; cancel and failure preserve prior settings.

**Acceptance Scenarios**:

1. **Given** a new or migrated archive, **When** no activation was completed, **Then** no FIC request
   is made and local clients and quotes remain fully usable.
2. **Given** an active shared configuration without a usable local token, **When** the archive opens,
   **Then** the workstation reports that local configuration is required and blocks only live actions.
3. **Given** an active connection, **When** it is disabled or removed, **Then** disable preserves the
   token and shared references while removal deletes both without altering historical snapshots.

### Edge Cases

- Duplicate holidays, weekend holidays, Easter Monday, invalid recurring 29 February, and 4 October
  from 2026 are handled without double counting.
- Decimal half-up boundaries, zero divisors, unsupported fuel/unit combinations, missing site distance,
  absent travel speed, and chosen price below expenses produce the specified result or explicit error.
- Empty variant options are valid; empty groups, duplicate option names, and multiple defaults are not.
- Newer schemas open read-only; older schemas migrate only after confirmation and backup.
- Closing with unsaved data cannot silently discard changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cash MUST implement every invariant INV-001 through INV-013 and every MVP criterion 1
  through 57 in the canonical source.
- **FR-002**: Cash MUST provide all profile, tax, capacity, cost, vehicle, site, catalog, template,
  variant, quote, snapshot, refresh, commission, analysis, and export behavior described there.
- **FR-003**: Monetary/ratio calculations MUST use decimal arithmetic and specified precision; duration
  calculations MUST persist integer minutes.
- **FR-004**: Main item time MUST derive exclusively from time/travel sub-items; calculable items MUST
  have positive time.
- **FR-005**: Quotes MUST preserve independent snapshots; source edits/opening MUST NOT mutate them;
  refresh MUST be explicit and atomic.
- **FR-006**: The archive MUST be one versioned UTF-8 JSON document with immutable identity, increasing
  revision, UUID entities, timestamps, atomic save, previous-version backup, fingerprint conflicts,
  recovery copies, and explicit schema compatibility behavior.
- **FR-007**: Only narrow native commands may access file dialogs/storage, OS-protected credentials,
  and allowlisted HTTPS sources; no application server, local port, direct renderer API access, or
  generic native access is permitted.
- **FR-008**: Live-source errors MUST be explicit and MUST NOT return assumed/cached current values;
  unrelated local functions MUST remain available offline.
- **FR-009**: Export MUST validate first, persist its attempt before send, avoid automatic retry for
  uncertain results, and warn before any repeat.
- **FR-010**: Cash MUST remain single-user, contain no commercial state/workflow/numbering, and keep
  the final price editable and solely user-controlled.
- **FR-011**: Cash MUST maintain offline local clients, discriminate local and FIC client snapshots,
  block deletion on live Site references, and never merge or match clients automatically.
- **FR-012**: FIC MUST start disabled, make zero calls while disabled, and become active only after an
  atomic per-workstation wizard verifies token, company, minimum permissions and exact product.

### Key Entities *(include if feature involves data)*

- **Economic profile**: Annual target, fiscal parameters including activity phase and 5%/15% rates,
  applicability confirmations, availability, holidays and travel speed.
- **Local client**: Offline UUID, required display name and optional formally validated VAT number.
- **Business cost, Vehicle, Site**: Reusable planning inputs with immutable identity and timestamps.
- **Catalog sub-item, Template, Variant group/option**: Independent reusable estimating structures.
- **Quote, Quote item, Sub-item**: Commercial container, priced item, internal components and snapshots.
- **Export attempt**: Request evidence plus known-success, known-failure, or uncertain outcome.
- **Data archive**: Versioned aggregate root for all functional entities and non-secret settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 57 canonical MVP acceptance criteria pass automated or documented end-to-end checks.
- **SC-002**: Identical inputs reproduce identical cent/minute outputs across reopen and workstations.
- **SC-003**: Every simulated save interruption leaves the previous file readable and every simulated
  external conflict blocks overwrite.
- **SC-004**: A user can configure a baseline and create a two-item quote in under 10 minutes.
- **SC-005**: Every live-source failure test produces an explicit error with no silent fallback/retry.
- **SC-006**: The packaged Windows app requires no separately installed runtime, server, database,
  container, or open local port.

## Assumptions

- The v0.6 canonical specification is complete and has no blocking product decision.
- Official service payloads are isolated behind adapters and contract fixtures; upstream changes
  become explicit errors until supported.
- Drive for Desktop is user-managed in mirrored mode; Cash performs no Google OAuth/API calls.
- Italian UI and EUR are the MVP locale/currency; Windows is the packaged target.
