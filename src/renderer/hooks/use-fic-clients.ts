import { useCallback, useEffect, useRef, useState } from 'react';
import type { FicClientSnapshot } from '../../domain/model';
import type { AppState } from '../state';

export function useFicClients({
  companyId,
  enabled,
  contextKey,
  appState,
}: {
  companyId?: string;
  enabled: boolean;
  contextKey: string;
  appState: AppState;
}) {
  const [results, setResults] = useState<FicClientSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [nextPage, setNextPage] = useState<number>();
  const request = useRef(0);
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const pagination = useRef<
    { query: string; nextPage?: number; contextKey: string } | undefined
  >(undefined);

  useEffect(() => {
    request.current++;
    pagination.current = undefined;
    setResults([]);
    setNextPage(undefined);
    setLoaded(false);
    setLoading(false);
    return () => {
      request.current++;
    };
  }, [contextKey, enabled]);

  const load = useCallback(
    async (query: string, page = 1) => {
      if (!enabled || !companyId) return;
      const id = ++request.current;
      const archiveContext = appState.archiveContext;
      const path = appState.session?.path;
      const documentId = appState.document?.documentId;
      const isCurrent = () =>
        id === request.current &&
        currentContext.current === contextKey &&
        appState.archiveContext === archiveContext &&
        appState.session?.path === path &&
        appState.document?.documentId === documentId &&
        (!appState.document ||
          (appState.document.settings.fic.enabled &&
            appState.document.settings.fic.company?.id === companyId));
      setLoading(true);
      if (page === 1) {
        setResults([]);
        setNextPage(undefined);
        pagination.current = undefined;
        setLoaded(false);
      }
      try {
        const result = await window.cash.fic.searchClients({
          companyId,
          query,
          page,
        });
        if (!isCurrent()) return;
        setLoaded(true);
        if (!result.ok) {
          appState.setError(result.error);
          return;
        }
        setResults((previous) => {
          const clients = new Map(
            (page === 1 ? [] : previous).map((client) => [
              client.clientId,
              client,
            ]),
          );
          for (const client of result.value.clients)
            clients.set(client.clientId, client);
          return [...clients.values()];
        });
        pagination.current = {
          query,
          nextPage: result.value.nextPage,
          contextKey,
        };
        setNextPage(result.value.nextPage);
      } catch {
        if (isCurrent())
          appState.setError({
            code: 'SOURCE_UNAVAILABLE',
            source: 'FattureInCloud',
            message: 'Caricamento clienti non riuscito. Ripeti la ricerca.',
          });
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [appState, companyId, contextKey, enabled],
  );

  const loadMore = async () => {
    const saved = pagination.current;
    if (!loading && saved?.nextPage && saved.contextKey === contextKey)
      await load(saved.query, saved.nextPage);
  };
  return { results, loading, loaded, nextPage, search: load, loadMore };
}
