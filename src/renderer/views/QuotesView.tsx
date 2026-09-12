import { calculateQuote } from "../../domain/calculations";
import { createLocalClient, snapshotLocalClient } from "../../domain/clients";
import { meta, type CashDocument } from "../../domain/model";
import { Analysis } from "@/components/Analysis";
import {
  Field,
  MoneyField,
  Option,
  SelectField,
} from "@/components/FormControls";
import { QuoteItemCard } from "@/components/QuoteItemCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuoteController } from "@/hooks/use-quote-controller";
import { dateIt, formReader } from "@/lib/format";
import type { AppState } from "../state";
import type { DeleteTarget } from "../types";

const promptRequired = (message: string, initial = ""): string | undefined =>
  window.prompt(message, initial)?.trim() || undefined;

export function QuotesView({
  doc,
  appState,
  activeQuoteId,
  setActiveQuoteId,
  requestDelete,
}: {
  doc: CashDocument;
  appState: AppState;
  activeQuoteId?: string;
  setActiveQuoteId: (id?: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const {
    quote,
    clientResults,
    newQuote,
    saveQuote,
    searchRemoteClients,
    insertTemplate,
    saveTemplate,
    performRefresh,
    performExport,
    itemActions,
  } = useQuoteController({
    doc,
    appState,
    activeQuoteId,
    setActiveQuoteId,
    requestDelete,
  });

  if (!quote)
    return (
      <div className="app-grid">
        <Card className="card full">
          <CardContent>
            <div className="actions">
              <Button onClick={newQuote}>Nuovo preventivo</Button>
            </div>
            <div className="list section-list">
              {doc.quotes.length ? (
                doc.quotes.map((entry) => (
                  <div className="row" key={entry.id}>
                    <div>
                      <div className="row-title">
                        {entry.items.map((item) => item.name).join(", ") ||
                          "Preventivo incompleto"}
                      </div>
                      <div className="row-detail">
                        {dateIt(entry.date)} ·{" "}
                        {entry.client?.displayName ?? "Nessun cliente"} ·{" "}
                        {entry.items.length} voci
                      </div>
                    </div>
                    <div className="row-actions">
                      <Button onClick={() => setActiveQuoteId(entry.id)}>
                        Apri
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          requestDelete({
                            kind: "quote",
                            id: entry.id,
                            label:
                              entry.items.map((item) => item.name).join(", ") ||
                              "Preventivo incompleto",
                          })
                        }
                      >
                        Elimina
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">Nessun preventivo</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );

  const hourly = quote.profileSnapshot?.hourlyTarget;
  const total = hourly ? calculateQuote(quote.items, hourly) : undefined;
  return (
    <>
      <div className="actions view-actions">
        <Button variant="secondary" onClick={() => setActiveQuoteId(undefined)}>
          ← Elenco
        </Button>
        <Button
          onClick={() => {
            const title = promptRequired("Nome della voce commerciale");
            if (title)
              appState.mutate((document) =>
                document.quotes
                  .find((candidate) => candidate.id === quote.id)!
                  .items.push({
                    ...meta(),
                    name: title,
                    subItems: [],
                    variantGroups: [],
                    variantSelections: [],
                  }),
              );
          }}
        >
          Aggiungi voce
        </Button>
        <Button
          variant="secondary"
          disabled={!doc.catalog.templates.length}
          onClick={() => void insertTemplate()}
        >
          Inserisci template
        </Button>
        <Button
          variant="ghost"
          disabled={!quote.items.length}
          onClick={saveTemplate}
        >
          Salva come template
        </Button>
        <Button variant="ghost" onClick={() => void performRefresh()}>
          Aggiorna valori correnti
        </Button>
        <Button
          disabled={!doc.settings.fic.enabled}
          onClick={() => void performExport()}
        >
          Anteprima ed esporta
        </Button>
      </div>
      <div className="split">
        <div className="stack">
          <Card className="card full">
            <CardHeader>
              <CardTitle>Dati preventivo</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="form-grid" onSubmit={saveQuote}>
                <Field
                  label="Data"
                  name="date"
                  value={quote.date}
                  type="date"
                />
                <SelectField
                  label="Profilo"
                  name="profileId"
                  value={quote.profileId ?? ""}
                >
                  <Option value="">Incompleto</Option>
                  {doc.profiles.map((profile) => (
                    <Option key={profile.id} value={profile.id}>
                      {profile.year}
                      {profile.confirmed ? "" : " · da confermare"}
                    </Option>
                  ))}
                </SelectField>
                <SelectField
                  label="Sede principale"
                  name="mainSiteId"
                  value={quote.mainSite?.sourceId ?? ""}
                >
                  <Option value="">Nessuna</Option>
                  {doc.sites.map((site) => (
                    <Option key={site.id} value={site.id}>
                      {site.name}
                    </Option>
                  ))}
                </SelectField>
                <MoneyField
                  label="Provvigione esterna"
                  name="commission"
                  value={quote.commission ?? ""}
                />
                <Button type="submit" className="full">
                  Aggiorna dati
                </Button>
              </form>
              {quote.client ? (
                <Alert className="section-list">
                  <AlertDescription>
                    Cliente: <strong>{quote.client.displayName}</strong> ·{" "}
                    {quote.client.source === "local"
                      ? "locale"
                      : "Fatture in Cloud"}{" "}
                    · P.IVA {quote.client.vatNumber ?? "—"}{" "}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        appState.mutate((document) => {
                          document.quotes.find(
                            (candidate) => candidate.id === quote.id,
                          )!.client = undefined;
                        })
                      }
                    >
                      Rimuovi
                    </Button>
                    {quote.client.source === "fatture_in_cloud" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const homonyms = doc.localClients.filter(
                            (client) =>
                              client.displayName.localeCompare(
                                quote.client!.displayName,
                                "it",
                                { sensitivity: "base" },
                              ) === 0,
                          );
                          if (
                            !window.confirm(
                              `Creare una copia locale indipendente di “${quote.client!.displayName}”?${homonyms.length ? `\nAttenzione: esistono ${homonyms.length} omonimi; non verranno uniti.` : ""}`,
                            )
                          )
                            return;
                          const created = createLocalClient(
                            quote.client!.displayName,
                            quote.client!.vatNumber,
                          );
                          if (!created.ok) appState.setError(created.error);
                          else
                            appState.mutate((document) =>
                              document.localClients.push(created.value),
                            );
                        }}
                      >
                        Copia come Cliente locale
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <form
                    className="actions section-list"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const client = doc.localClients.find(
                        (candidate) =>
                          candidate.id ===
                          formReader(event.currentTarget).get("localClientId"),
                      );
                      if (client)
                        appState.mutate((document) => {
                          document.quotes.find(
                            (candidate) => candidate.id === quote.id,
                          )!.client = snapshotLocalClient(client);
                        });
                    }}
                  >
                    <SelectField label="Cliente locale" name="localClientId">
                      <Option value="">Nessun cliente</Option>
                      {doc.localClients.map((client) => (
                        <Option key={client.id} value={client.id}>
                          {client.displayName}
                        </Option>
                      ))}
                    </SelectField>
                    <Button type="submit">Seleziona</Button>
                  </form>
                  {doc.settings.fic.enabled ? (
                    <>
                      <form
                        className="actions section-list"
                        onSubmit={(event) => void searchRemoteClients(event)}
                      >
                        <Field
                          label="Cerca cliente Fatture in Cloud"
                          name="query"
                        />
                        <Button type="submit">Cerca live</Button>
                      </form>
                      <div className="actions section-list">
                        {clientResults.map((client) => (
                          <Button
                            key={client.clientId}
                            variant="secondary"
                            onClick={() =>
                              appState.mutate((document) => {
                                document.quotes.find(
                                  (candidate) => candidate.id === quote.id,
                                )!.client = client;
                              })
                            }
                          >
                            {client.displayName} ·{" "}
                            {client.vatNumber ?? "P.IVA assente"}
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Alert className="section-list">
                      <AlertDescription>
                        Fatture in Cloud è disattivato. Il ciclo locale resta
                        disponibile.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {quote.items.length ? (
            quote.items.map((item) => (
              <QuoteItemCard
                key={item.id}
                item={item}
                hourly={hourly}
                doc={doc}
                actions={itemActions}
              />
            ))
          ) : (
            <div className="empty">Aggiungi almeno una voce commerciale.</div>
          )}
        </div>
        <aside className="stack">
          <Card className="card full">
            <CardHeader>
              <CardTitle>Analisi complessiva</CardTitle>
            </CardHeader>
            <CardContent>
              {total ? (
                <Analysis value={total} />
              ) : (
                <Alert>
                  <AlertDescription>
                    Associa un profilo calcolabile.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          <Card className="card full">
            <CardHeader>
              <CardTitle>Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="small muted">
                Profilo{" "}
                {quote.profileSnapshot
                  ? `${quote.profileSnapshot.year} rev. ${quote.profileSnapshot.revision}`
                  : "non associato"}
                <br />
                Revisione snapshot {quote.snapshotRevision}
                <br />
                {quote.snapshotUpdatedAt
                  ? `Aggiornato ${quote.snapshotUpdatedAt}`
                  : "Mai aggiornato"}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
