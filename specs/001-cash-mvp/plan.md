# Implementation Plan: Cash MVP

**Branch**: `001-cash-mvp` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-cash-mvp/spec.md`

## Summary

Build the complete v0.6 single-user Windows quotation assistant as a packaged Electron desktop app.
A dependency-free HTML/CSS/TypeScript renderer owns presentation only; pure TypeScript domain modules
implement decimal calculations, validation, snapshots, templates, variants and refresh. A hardened
Electron preload exposes narrow IPC for atomic JSON persistence, OS-protected credentials, and
allowlisted official HTTPS integrations. No HTMX, framework, server, database, or port is in runtime.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 for development

**Primary Dependencies**: Electron, decimal.js, Zod, keytar; esbuild for local-file bundling

**Storage**: One user-selected UTF-8 JSON file; local settings only for non-functional preferences;
OS credential vault for the Fatture in Cloud token

**Testing**: Vitest unit/integration suites and temporary-directory filesystem tests

**Target Platform**: Windows 10/11 x64 desktop package

**Project Type**: Desktop application with native main/preload and local renderer bundles

**Performance Goals**: Recalculate 100 items under 100 ms; validate/save a 10 MB archive under 1 s

**Constraints**: Offline local editing; no HTTP server/port; context isolation; no Node in renderer;
decimal money; serialized saves; no silent fallback, merge, restore, or network retry

**Scale/Scope**: One active user/archive, hundreds of quotes/templates, thousands of sub-items

## Constitution Check

*GATE: Passed before research and after design.*

- Verifiable calculations: pure services, Decimal values, explicit results/errors, formula tests.
- No fallback: live adapters never use cache; missing/invalid data stays a blocking typed error.
- Historical snapshots: clone-on-insert and quote snapshots are explicit schema concepts.
- Native-local boundary: context-isolated Electron IPC allowlist; renderer uses bundled local files.
- Persistence safety: atomic replace, backup, header/hash concurrency token and failure tests.
- Product boundaries: no auth, ERP state, server, database, routing service, or HTMX introduced.
- Optional integration: FIC starts disabled and is guarded natively; activation is atomic and
  verifies the local token, selected company, minimum scopes and exact Consulenza product.
- Offline customer ownership: local clients live in the archive; remote clients are snapshots only.

## Project Structure

### Documentation (this feature)

```text
specs/001-cash-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/native-ipc.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── model.ts
│   ├── decimal.ts
│   ├── calendar.ts
│   ├── calculations.ts
│   ├── variants.ts
│   ├── catalog.ts
│   ├── refresh.ts
│   └── schema.ts
├── native/
│   ├── main.ts
│   ├── preload.ts
│   ├── persistence.ts
│   ├── credentials.ts
│   └── integrations/{fatture-in-cloud,foi,mimit}.ts
├── renderer/{index.html,app.ts,state.ts,styles.css}
└── shared/ipc.ts
tests/{unit,integration,fixtures}/
scripts/build.mjs
```

**Structure Decision**: One TypeScript project preserves a hard boundary between pure domain logic,
native capabilities, and the renderer. Main and preload are separately bundled so the renderer never
inherits Node capabilities.

## Complexity Tracking

No constitution violations require justification.
