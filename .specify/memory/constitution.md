<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles: Explicit Data and No Fallback (local clients and opt-in live integrations);
  Native-Local Security Boundary (disabled integration performs no service calls)
- Added principles: Optional Integrations and Offline Completeness
- Modified sections: Product Boundaries (canonical v0.6)
- Added sections: none
- Removed sections: none
- Follow-up TODOs: none
-->
# Cash Constitution

## Core Principles

### I. Verifiable Calculations
Every economic result MUST be reproducible from explicit persisted inputs. Monetary arithmetic MUST
use decimal semantics and the rounding rules in the canonical functional specification. Derived
totals MUST equal the sum of the components shown to the user. Automated tests MUST cover formulas,
rounding boundaries, invalid divisors, and aggregate calculations.

### II. Explicit Data and No Fallback
When a required value or live source is missing, Cash MUST report an actionable error and MUST NOT
substitute a cached, assumed, previous, or alternate value. User-selected defaults, explicit manual
overrides, and persisted historical snapshots are valid inputs, not fallbacks.
Remote customers MUST remain snapshots unless the user explicitly creates an independent local
customer; Cash MUST NOT merge or match local and remote customers automatically.

### III. Historical Snapshots
Quotes, catalog entries, and templates MUST be independent copies. Existing quotes MUST retain the
economic profile, customer, site, travel, fuel, inflation, variants, and prices used to build them.
Only an explicit atomic refresh may replace the dynamic values allowed by the specification.

### IV. Native-Local Security Boundary
Cash MUST run as a Windows desktop client with an embedded native host and an HTML/CSS/JavaScript
interface. It MUST NOT start an HTTP server or open a local port. Renderer code MUST have no generic
filesystem, credential, or network access; narrowly scoped native commands MUST mediate those
capabilities. Secrets MUST remain local and encrypted through operating-system facilities.
When a shared integration is disabled, native live-operation handlers MUST reject the request before
credential lookup or network access.

### V. Atomic Persistence and Conflict Safety
The selected UTF-8 JSON file is the sole canonical data source. Saves MUST be serialized, validated,
backed up, written through a same-directory temporary file, and atomically replaced. Document ID,
revision, and SHA-256 fingerprint MUST be checked before every write. Conflicts MUST block writes;
Cash MUST never merge, overwrite, or restore automatically.

### VI. Optional Integrations and Offline Completeness
The complete local quotation workflow MUST work with Fatture in Cloud disabled and without any token,
company, or product. Fatture in Cloud MUST start disabled in new and migrated archives and become
active only after an explicit, successful, atomic verification of token, company, minimum permissions,
and the exact Consulenza product. Cancellation or failure MUST preserve the prior configuration.
Disabling MUST preserve non-secret shared configuration and the local token; removing the link MUST
delete both while leaving historical snapshots and export evidence unchanged.

## Product Boundaries

The canonical product scope is `Cash_Specifica_Funzionale_v0.6.md`. Cash is a single-user quotation
assistant, not an ERP, accounting system, CRM, project manager, time tracker, inventory system, or
sales workflow. The final commercial price always remains the user's decision. Live network access
is limited to official ISTAT, MIMIT, and Fatture in Cloud endpoints. Google Drive is used only as a
filesystem synchronizer in mirrored mode.

## Delivery Quality Gates

Each implementation slice MUST have unit tests for domain behavior and integration tests for native
contracts or persistence boundaries. Type checking, linting, unit tests, production build, and the
Spec Kit quickstart scenarios MUST pass before a task is marked complete. Any deliberate deviation
from the canonical specification MUST be documented in the implementation plan before coding.

## Governance

This constitution governs implementation decisions and is subordinate only to explicit user
instructions. Amendments require a documented Sync Impact Report, semantic-version change, and
review of affected specifications, plans, tasks, tests, and migration behavior. Pull-request or
release review MUST verify compliance with every principle. Unjustified violations block release.

**Version**: 1.1.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-08
