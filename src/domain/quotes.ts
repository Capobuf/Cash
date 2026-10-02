import { meta, type CashDocument, type Quote } from './model';
import { snapshotProfile } from './refresh';
import { localDate } from './calendar';

export function createQuote(document: CashDocument): Quote {
  const date = localDate();
  const profile = document.profiles.find(
    (entry) => entry.confirmed && entry.year === Number(date.slice(0, 4)),
  );
  const snapshot = profile
    ? snapshotProfile(profile, document.businessCosts)
    : undefined;
  return {
    ...meta(),
    date,
    ...(snapshot?.ok
      ? { profileId: snapshot.value.sourceId, profileSnapshot: snapshot.value }
      : {}),
    items: [],
    snapshotRevision: 0,
    exportAttempts: [],
  };
}
