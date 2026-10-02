import { meta, type CashDocument, type Quote } from './model';
import { snapshotProfile } from './refresh';
import { localDate } from './calendar';

export function createQuote(document: CashDocument): Quote {
  const profile = [...document.profiles]
    .sort((a, b) => b.year - a.year)
    .find((entry) => entry.confirmed);
  const snapshot = profile
    ? snapshotProfile(profile, document.businessCosts)
    : undefined;
  return {
    ...meta(),
    date: localDate(),
    ...(profile ? { profileId: profile.id } : {}),
    ...(snapshot?.ok ? { profileSnapshot: snapshot.value } : {}),
    items: [],
    snapshotRevision: 0,
    exportAttempts: [],
  };
}
