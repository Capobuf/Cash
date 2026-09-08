# Research: Cash MVP

## Desktop runtime

**Decision**: Electron with context isolation, sandboxed renderer, disabled Node integration, and a
small preload API.

**Rationale**: Electron packages the runtime on Windows, loads static local assets without a server,
supports atomic filesystem operations/native dialogs, and keeps HTTPS calls outside the renderer.

**Alternatives considered**: Tauri needs the absent Rust toolchain; browser-only cannot meet file,
credential and CORS rules; a local HTTP service is prohibited.

## Renderer and HTMX

**Decision**: Framework-free TypeScript with semantic HTML and event delegation; no HTMX.

**Rationale**: There are no server-generated fragments and criterion 54 excludes HTMX. Typed local
state and IPC provide similar simplicity without a server or hidden file requests.

**Alternatives considered**: HTMX conflicts with the MVP; React adds unnecessary runtime abstraction.

## Arithmetic and validation

**Decision**: `decimal.js` with half-up cent/six-decimal helpers, integer-minute rules, and Zod schemas
at disk, IPC and network boundaries.

**Rationale**: Binary floating point cannot guarantee cent totals; runtime validation prevents
malformed archives or source payloads from entering domain state.

**Alternatives considered**: Integer cents do not cover ratios/fuel precision; ad-hoc checks are less auditable.

## Credentials and live data

**Decision**: `keytar` stores the Fatture in Cloud token. Main-process adapters use fixed hostname
allowlists, timeouts, validated normalizers, injected fetch for tests, and no current-data cache.

**Rationale**: Windows Credential Manager protects the token. Adapter isolation turns upstream format
changes into explicit source errors and keeps historical snapshots stable.

**Alternatives considered**: Config files violate the spec; renderer fetch violates CORS/security;
proxy services and cache-as-current violate explicit constraints.

## Persistence

**Decision**: Queue saves; retain SHA-256 of loaded bytes; verify document ID/revision/hash; copy the
prior file; write, flush and validate a same-directory temp; atomically replace and reread.

**Rationale**: This directly implements section 25 and detects Drive-synchronized conflicts.

**Alternatives considered**: Direct writes may truncate; timestamps are insufficient; automatic
merge/restore violates the canonical conflict policy.
