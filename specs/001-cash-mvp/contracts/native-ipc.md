# Native IPC Contract

All methods are exposed as `window.cash` by the isolated preload. Results use
`{ ok: true, value } | { ok: false, error: { code, message, field?, source?, action? } }`.
No generic IPC sender, path/filesystem API, credential value, or fetch API reaches the renderer.

## Archive

- `archive.create()` opens a save dialog and returns `{ path, document, token, readOnly:false }`.
- `archive.open()` validates the selected JSON. A newer schema returns header metadata read-only;
  schema 1 returns a migration preview and requires explicit confirmation before backup/atomic write.
- `archive.save(document, token)` performs serialized, conflict-checked atomic persistence.
- `archive.saveRecovery(document)` writes an independent document ID at revision 1.
- `archive.restoreBackup(path, token)` requires native confirmation, preserves dated copies of both
  current and backup files, restores atomically, and assigns a new document identity.
- `archive.inspect()` returns current identity/revision/fingerprint without mutation.

## Credentials

- `credentials.hasFicToken()` returns a boolean.
- The renderer cannot set, read, or delete the token directly. `fic.completeActivation(...)` and
  `fic.removeLink(...)` coordinate credential and archive changes natively with rollback.

## Official data

- `mimit.latestFuelPrice({ territory, fuel })` returns normalized fuel evidence or source error.
- `istat.revalue({ amount, fromPeriod })` returns FOI evidence/result or source error.
- `fic.searchClients({ companyId, query })` returns current client summaries.
- `fic.verifyToken(token)` verifies the manual token and returns companies and granted scopes without
  exposing the token again; `fic.listCompanies()` is available only during the activation wizard.
- `fic.verifyProduct({ companyId, productId })` returns a verified product summary.
- `fic.completeActivation({ token, companyId, productId, path, document, concurrencyToken })` verifies
  the staged configuration, then commits credential and archive state atomically with rollback.
- `fic.removeLink({ path, document, concurrencyToken })` removes shared configuration and the local
  credential atomically with rollback, leaving historical snapshots/evidence untouched.
- `fic.exportQuote({ companyId, payload, attemptId })` performs exactly one request and returns
  success, rejected, or uncertain; it never retries.

Every FIC handler also receives the shared integration state and rejects before network access unless
the module is active. Wizard verification uses a staged token and does not mutate credentials or the
archive until final confirmation succeeds.

## Window lifecycle

- `app.onExternalChange(listener)` publishes disk conflict/reload-required events.
- `app.onCloseRequested(listener)` requests renderer confirmation for unsaved changes.
- `app.resolveClose(choice)` accepts only retry, recovery, discard, or cancel.
