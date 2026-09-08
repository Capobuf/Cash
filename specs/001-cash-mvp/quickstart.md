# Quickstart: Cash MVP validation

## Prerequisites

- Windows with Node.js 24+ and npm for development.
- No runtime server, database, container, or external service is needed for local scenarios.

## Run checks

```powershell
npm install
npm run typecheck
npm test
npm run build
npm start
```

`npm start` loads the built renderer from disk and must not open a listening port.

## End-to-end validation

1. Create `Cash.data.json`; verify UUID, schema 2, revision 1, FIC disabled and no backup yet.
2. Configure/confirm 2026 profile, targets, cost and availability; verify section 4-7 formulas.
3. Create a vehicle and two sites; reproduce Appendix A including automatic/manual travel.
4. Set prices and verify item/quote theoretical value, yield, deviation and coherent time.
5. Change firmware/RAID options and verify group isolation plus modification warning.
6. Save and inspect backup/revision; externally change the same-revision file and verify blocking.
7. Modify sources, reopen unchanged, then explicitly refresh and verify atomic behavior.
8. Create/search/edit/delete local clients, copy a remote snapshot explicitly, and verify Site deletion guards.
9. Exercise FIC disabled state and activation/cancel/disable/remove flows on two workstation states.
10. Exercise export fixtures; verify explicit remote selection, preview/grouping, attempt-before-send,
   uncertain outcome and repeat warning.
11. Disconnect networking; local editing still works and every live action fails explicitly.
12. Open a schema-1 fixture; inspect migration preview, confirm, then verify backup and atomic schema 2.

The 57 criteria in `Cash_Specifica_Funzionale_v0.6.md` define the full expected behavior.
