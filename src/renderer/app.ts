import { calculateItem, calculateProfile, calculateQuote, calculateTravel, calculateVehicleCost } from '../domain/calculations';
import { applyVariantSelections, changeVariant } from '../domain/variants';
import { refreshQuote, snapshotProfile } from '../domain/refresh';
import { createFiscalPreset2026, meta, nowIso, type CashDocument, type EconomicProfile, type ExportAttempt,
  type Quote, type QuoteItem, type ReusableSubItem, type SiteSnapshot, type Vehicle } from '../domain/model';
import { state } from './state';

type View = 'dashboard' | 'quotes' | 'resources' | 'catalog' | 'settings';
let view: View = 'dashboard';
let activeQuoteId: string | undefined;
const root = document.querySelector<HTMLDivElement>('#app')!;

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
const eur = (value?: string): string => value === undefined ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value));
const hours = (minutes?: number): string => minutes === undefined ? '—' : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const field = (label: string, name: string, value: unknown, type = 'text', extra = '') => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}></label>`;
const statusClass = (): string => state.status === 'Salvato' ? '' : state.status.includes('Errore') || state.status.includes('Conflitto') ? 'bad' : 'warn';
const documentNow = (): CashDocument | undefined => state.document;
const selectedQuote = (): Quote | undefined => documentNow()?.quotes.find(quote => quote.id === activeQuoteId);
const profileFor = (quote?: Quote): EconomicProfile | undefined => documentNow()?.profiles.find(profile => profile.id === quote?.profileId);
const siteSnapshot = (id: string): SiteSnapshot | undefined => { const site = documentNow()?.sites.find(value => value.id === id); return site ? { sourceId: site.id, name: site.name, address: site.address, ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}) } : undefined; };

function nav(): string {
  const entries: Array<[View, string]> = [['dashboard', 'Panoramica'], ['quotes', 'Preventivi'], ['resources', 'Risorse'], ['catalog', 'Catalogo'], ['settings', 'Impostazioni']];
  return `<aside class="sidebar"><div class="brand">Cash<small>preventivi verificabili</small></div><nav class="nav">${entries.map(([key, label]) => `<button data-view="${key}" class="${view === key ? 'active' : ''}">${label}</button>`).join('')}</nav><p class="hint">Un solo file JSON è la fonte canonica. Prima di cambiare postazione attendi sempre “Salvato” e la sincronizzazione di Google Drive.</p></aside>`;
}

function errorBox(): string {
  return state.error ? `<div class="notice error"><strong>${esc(state.error.message)}</strong>${state.error.action ? `<div>${esc(state.error.action)}</div>` : ''}${state.error.details?.length ? `<div class="small">${state.error.details.map(esc).join('<br>')}</div>` : ''}<button class="ghost" data-action="dismiss-error">Chiudi</button></div>` : '';
}

function topbar(): string {
  return `<header class="topbar"><div><h1>${({ dashboard: 'Panoramica', quotes: 'Preventivi', resources: 'Risorse', catalog: 'Catalogo', settings: 'Impostazioni' })[view]}</h1><div class="small muted">${esc(state.session?.path ?? '')}</div></div><div class="actions"><span class="status ${statusClass()}">${esc(state.status)}</span><button class="secondary" data-action="open">Apri</button><button class="ghost" data-action="recovery">Copia di recupero</button><button data-action="save" ${state.status === 'Salvato' ? 'disabled' : ''}>Salva ora</button></div></header>`;
}

function dashboard(doc: CashDocument): string {
  const profile = doc.profiles[0];
  const analysis = profile ? calculateProfile(profile, doc.businessCosts) : undefined;
  const values = analysis?.ok ? analysis.value : undefined;
  return `<div class="grid">
    <section class="card"><div class="muted small">Valore medio da generare</div><div class="metric">${values ? `${eur(values.hourlyTarget)}/h` : '—'}</div><div class="small muted">Non è una tariffa obbligatoria.</div></section>
    <section class="card"><div class="muted small">Netto fiscale stimato</div><div class="metric">${eur(values?.fiscalNet)}</div><div class="small muted">Stima interna, non fiscale/contabile.</div></section>
    <section class="card"><div class="muted small">Disponibile stimato</div><div class="metric">${eur(values?.availableIncome)}</div><div class="small muted">Dopo costi aziendali e spese specifiche.</div></section>
    ${!profile ? `<section class="card full empty"><h2>Configura il profilo 2026</h2><p>Parti dal preset previsto dalla specifica e conferma i parametri.</p><button data-action="add-preset">Crea preset 2026</button></section>` : `
    <section class="card wide"><h2>Profilo economico ${profile.year}</h2>${!profile.confirmed ? '<div class="notice">Il profilo fiscale deve essere confermato prima della proiezione.</div>' : ''}
      <form data-form="profile" class="form-grid">
        ${field('Fatturato obiettivo', 'revenueTarget', profile.revenueTarget, 'number', 'min="0" step="0.01" required')}
        ${field('Spese specifiche annue', 'specificAnnualExpenses', profile.specificAnnualExpenses, 'number', 'min="0" step="0.01" required')}
        ${field('Ore lavorative/giorno', 'hoursPerDay', profile.capacity.hoursPerDay, 'number', 'min="0.01" max="24" step="0.01" required')}
        ${field('Tempo dedicabile (%)', 'clientTimePercentage', profile.capacity.clientTimePercentage, 'number', 'min="0.0001" max="100" step="0.0001" required')}
        ${field('Ferie (giorni)', 'vacationDays', profile.capacity.vacationDays, 'number', 'min="0" step="1" required')}
        ${field('Malattia / imprevisti', 'unplannedDays', profile.capacity.unplannedDays, 'number', 'min="0" step="1" required')}
        ${field('Velocità media trasferta (km/h)', 'travelSpeedKmh', profile.capacity.travelSpeedKmh ?? '', 'number', 'min="0.1" step="0.1"')}
        ${field('ATECO', 'atecoCode', profile.fiscal.atecoCode, 'text', 'required')}
        <label class="full"><span><input name="confirmed" type="checkbox" ${profile.confirmed ? 'checked' : ''}> Confermo i parametri fiscali per l’anno ${profile.year}</span></label>
        <div class="full actions"><button>Salva profilo</button></div>
      </form></section>
    <section class="card"><h2>Capacità</h2><div class="list"><div class="row"><span>Giorni teorici</span><strong>${values?.theoreticalWorkdays ?? '—'}</strong></div><div class="row"><span>Giorni disponibili</span><strong>${values?.availableDays ?? '—'}</strong></div><div class="row"><span>Ore clienti</span><strong>${values ? (values.availableClientMinutes / 60).toFixed(1) : '—'}</strong></div><div class="row"><span>Costi annui</span><strong>${eur(values?.annualBusinessCosts)}</strong></div></div>${analysis && !analysis.ok ? `<div class="notice error">${esc(analysis.error.message)}</div>` : ''}</section>`}
    <section class="card full"><h2>Preventivi recenti</h2>${doc.quotes.length ? `<div class="list">${doc.quotes.slice(-5).reverse().map(q => `<div class="row"><div><div class="row-title">${esc(q.items.map(i => i.name).join(', ') || 'Preventivo incompleto')}</div><div class="row-detail">${esc(q.date)} · ${q.items.length} voci</div></div><button data-open-quote="${q.id}">Apri</button></div>`).join('')}</div>` : '<div class="empty">Nessun preventivo. Creane uno dalla sezione Preventivi.</div>'}</section>
  </div>`;
}

function resources(doc: CashDocument): string {
  return `<div class="grid"><section class="card"><h2>Costi aziendali</h2><form data-form="cost" class="form-grid">${field('Categoria','category','')}${field('Descrizione','description','')}${field('Importo mensile','monthlyAmount','0.00','number','min="0" step="0.01"')}<button class="full">Aggiungi</button></form></section>
  <section class="card"><h2>Veicoli</h2><form data-form="vehicle" class="form-grid">${field('Nome','name','')}${`<label>Carburante<select name="fuel"><option>Benzina</option><option>Gasolio</option><option>GPL</option><option>Metano</option></select></label>`}${field('Consumo /100 km','consumption','6.00','number','min="0.01" step="0.01"')}${field('Km annui','annualKm','10000','number','min="1" step="0.1"')}${field('Assicurazione annua','annualInsurance','0.00','number','min="0" step="0.01"')}${field('Bollo annuo','annualTax','0.00','number','min="0" step="0.01"')}${field('Manutenzione annua','annualMaintenance','0.00','number','min="0" step="0.01"')}<button class="full">Aggiungi</button></form></section>
  <section class="card"><h2>Sedi</h2><form data-form="site" class="form-grid">${field('Nome','name','')}${field('Indirizzo','address','')}${field('Km sola andata','oneWayKm','','number','min="0" step="0.1"')}<button class="full">Aggiungi</button></form></section>
  <section class="card full"><div class="split"><div><h2>Costi</h2>${listRows(doc.businessCosts.map(x => ({ id:x.id,title:`${x.category} · ${x.description}`,detail:`${eur(x.monthlyAmount)}/mese`,kind:'cost' })) )}</div><div><h2>Veicoli</h2>${listRows(doc.vehicles.map(x => ({id:x.id,title:x.name,detail:`${x.fuel} · ${x.consumption} ${x.consumptionUnit}`,kind:'vehicle'})))}</div><div><h2>Sedi</h2>${listRows(doc.sites.map(x => ({id:x.id,title:x.name,detail:`${x.address}${x.oneWayKm !== undefined ? ` · ${x.oneWayKm} km` : ''}`,kind:'site'})))}</div></div></section></div>`;
}

function listRows(rows: Array<{id:string;title:string;detail:string;kind:string}>): string {
  return rows.length ? `<div class="list">${rows.map(row => `<div class="row"><div class="row-main"><div class="row-title">${esc(row.title)}</div><div class="row-detail">${esc(row.detail)}</div></div><button class="danger" data-delete="${row.kind}:${row.id}">Elimina</button></div>`).join('')}</div>` : '<div class="empty">Nessun elemento</div>';
}

function catalog(doc: CashDocument): string {
  return `<div class="grid"><section class="card"><h2>Nuova sottovoce</h2><form data-form="catalog" class="form-grid"><label>Tipo<select name="kind"><option value="time">Tempo</option><option value="expense">Spesa</option></select></label>${field('Descrizione','description','')}${field('Minuti / importo','value','30','number','min="0" step="0.01"')}<button class="full">Aggiungi</button></form></section><section class="card wide"><h2>Sottovoci riutilizzabili</h2>${listRows(doc.catalog.subItems.map(x => ({id:x.id,title:x.description,detail:x.kind === 'time' ? `${x.minutes} min` : x.kind === 'expense' ? eur(x.amount) : 'Trasferta riutilizzabile',kind:'catalog'})))}</section><section class="card full"><h2>Template</h2>${doc.catalog.templates.length ? `<div class="list">${doc.catalog.templates.map(t => `<div class="row"><div><div class="row-title">${esc(t.name)}</div><div class="row-detail">${t.items.length} voci · copia indipendente</div></div><span class="pill">Template</span></div>`).join('')}</div>` : '<div class="empty">Salva una o più voci da un preventivo per creare un nuovo template.</div>'}</section></div>`;
}

function quoteList(doc: CashDocument): string {
  return `<div class="grid"><section class="card full"><div class="actions"><button data-action="new-quote">Nuovo preventivo</button></div><div class="list" style="margin-top:1rem">${doc.quotes.length ? doc.quotes.map(q => `<div class="row"><div><div class="row-title">${esc(q.items.map(i => i.name).join(', ') || 'Preventivo incompleto')}</div><div class="row-detail">${q.date} · ${q.client?.displayName ?? 'Nessun cliente'} · ${q.items.length} voci</div></div><div class="row-actions"><button data-open-quote="${q.id}">Apri</button><button class="danger" data-delete="quote:${q.id}">Elimina</button></div></div>`).join('') : '<div class="empty">Nessun preventivo</div>'}</div></section></div>`;
}

function quotes(doc: CashDocument): string {
  const quote = selectedQuote();
  if (!quote) return quoteList(doc);
  const hourly = quote.profileSnapshot?.hourlyTarget;
  const total = hourly ? calculateQuote(quote.items, hourly) : undefined;
  return `<div class="actions" style="margin-bottom:1rem"><button class="secondary" data-action="back-quotes">← Elenco</button><button data-action="add-item">Aggiungi voce</button><button class="ghost" data-action="save-template" ${quote.items.length ? '' : 'disabled'}>Salva come template</button><button class="ghost" data-action="refresh-quote">Aggiorna valori correnti</button><button data-action="export-quote">Anteprima ed esporta</button></div>
  <div class="split"><div class="stack"><section class="card full"><h2>Dati preventivo</h2><form data-form="quote" class="form-grid">${field('Data','date',quote.date,'date')}
    <label>Profilo<select name="profileId"><option value="">Incompleto</option>${doc.profiles.map(p => `<option value="${p.id}" ${quote.profileId===p.id?'selected':''}>${p.year}${p.confirmed?'':' · da confermare'}</option>`).join('')}</select></label>
    <label>Sede principale<select name="mainSiteId"><option value="">Nessuna</option>${doc.sites.map(s=>`<option value="${s.id}" ${quote.mainSite?.sourceId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
    ${field('Provvigione esterna','commission',quote.commission??'','number','min="0" step="0.01"')}<button class="full">Aggiorna dati</button></form>
    ${quote.client ? `<div class="notice">Cliente: <strong>${esc(quote.client.displayName)}</strong> · P.IVA ${esc(quote.client.vatNumber)}</div>` : `<form data-form="client-search" class="actions">${field('Cerca cliente Fatture in Cloud','query','')}<button>Cerca</button></form><div id="client-results"></div>`}</section>
    ${quote.items.map(item => quoteItemCard(item, hourly, doc)).join('') || '<div class="empty">Aggiungi almeno una voce commerciale.</div>'}</div>
    <aside class="stack"><section class="card full"><h2>Analisi complessiva</h2>${total ? analysisHtml(total) : '<div class="notice">Associa un profilo calcolabile.</div>'}</section><section class="card full"><h3>Snapshot</h3><div class="small muted">Profilo ${quote.profileSnapshot ? `${quote.profileSnapshot.year} rev. ${quote.profileSnapshot.revision}` : 'non associato'}<br>Revisione snapshot ${quote.snapshotRevision}<br>${quote.snapshotUpdatedAt ? `Aggiornato ${esc(quote.snapshotUpdatedAt)}` : 'Mai aggiornato'}</div></section></aside></div>`;
}

function analysisHtml(a: ReturnType<typeof calculateItem>): string {
  return `<div class="analysis"><div><span class="small muted">Tempo</span><strong>${hours(a.minutes)}</strong></div><div><span class="small muted">Spese</span><strong>${eur(a.expenses)}</strong></div><div><span class="small muted">Teorico</span><strong>${eur(a.theoreticalValue)}</strong></div><div><span class="small muted">Resa</span><strong>${a.yieldPerHour ? `${eur(a.yieldPerHour)}/h` : '—'}</strong></div><div><span class="small muted">Scostamento</span><strong>${a.deviationPercent ? `${a.deviationPercent}%` : '—'}</strong></div><div><span class="small muted">Tempo coerente</span><strong>${hours(a.coherentMinutes)}</strong></div></div>${a.deficit ? `<div class="notice error">Disavanzo: ${eur(a.deficit)}</div>` : ''}${a.blockers.length ? `<div class="notice">${a.blockers.map(esc).join('<br>')}</div>` : ''}`;
}

function quoteItemCard(item: QuoteItem, hourly: string | undefined, doc: CashDocument): string {
  const analysis = hourly ? calculateItem(item, hourly) : undefined;
  return `<section class="card full item"><div class="row"><div><h2>${esc(item.name)}</h2><span class="pill">${item.subItems.length} sottovoci</span></div><div class="row-actions"><button class="danger" data-delete="item:${item.id}">Elimina</button></div></div>
    <form data-form="item-price" data-id="${item.id}" class="form-grid" style="margin-top:.8rem">${field('Prezzo scelto','chosenPrice',item.chosenPrice??'','number','min="0" step="0.01"')}${field('Prezzo di riferimento','referenceAmount',item.referencePrice?.amount??'','number','min="0" step="0.01"')}${field('Mese riferimento','referencePeriod',item.referencePrice?.period??'','month')}<button>Aggiorna prezzi</button></form>
    <div class="list" style="margin-top:.8rem">${item.subItems.map(sub => `<div class="row"><div><div class="row-title">${esc(sub.description)}</div><div class="row-detail">${sub.kind==='time'?`${sub.minutes} min`:sub.kind==='expense'?eur(sub.amount):`${sub.totalDistanceKm} km · ${hours(sub.totalMinutes)} · ${eur(sub.totalCost)}`}${sub.variantOwner?' · variante':''}</div></div><button class="danger" data-delete="sub:${item.id}:${sub.id}">×</button></div>`).join('') || '<div class="empty">La voce richiede tempo positivo per essere calcolabile.</div>'}</div>
    ${item.variantGroups.map(group => `<label style="margin-top:.8rem">${esc(group.name)}<select data-variant="${item.id}:${group.id}">${group.options.map(option => `<option value="${option.id}" ${item.variantSelections.some(s=>s.groupId===group.id&&s.optionId===option.id)?'selected':''}>${esc(option.name)}</option>`).join('')}</select></label>`).join('')}
    <div class="tabs" style="margin-top:.8rem"><button class="secondary" data-action="add-time" data-id="${item.id}">+ Tempo</button><button class="secondary" data-action="add-expense" data-id="${item.id}">+ Spesa</button><button class="secondary" data-action="add-travel" data-id="${item.id}">+ Trasferta</button><button class="secondary" data-action="add-catalog" data-id="${item.id}" ${doc.catalog.subItems.length?'':'disabled'}>+ Dal catalogo</button><button class="secondary" data-action="add-variant" data-id="${item.id}">+ Variante</button></div>${analysis ? analysisHtml(analysis) : ''}</section>`;
}

function settings(doc: CashDocument): string {
  return `<div class="grid"><section class="card wide"><h2>Integrazioni condivise</h2><form data-form="settings" class="form-grid">${field('Regione / provincia MIMIT','fuelTerritory',doc.settings.fuelTerritory??'')}${field('ID azienda Fatture in Cloud','ficCompanyId',doc.settings.ficCompanyId??'')}${field('ID prodotto Consulenza','ficConsultingProductId',doc.settings.ficConsultingProductId??'')}<button class="full">Salva impostazioni</button></form></section><section class="card"><h2>Credenziale locale</h2><p class="small muted">Il token resta nel Gestore credenziali di Windows e non entra mai nel file Drive.</p><form data-form="token">${field('Token Fatture in Cloud','token','','password','autocomplete="off"')}<div class="actions" style="margin-top:.8rem"><button>Salva token</button><button type="button" class="danger" data-action="delete-token">Rimuovi</button></div></form></section><section class="card full notice"><strong>Uso su più postazioni</strong><br>Chiudi Cash solo quando compare “Salvato”, attendi la sincronizzazione Drive sulla prima postazione e poi sulla seconda. L’uso simultaneo non è supportato.</section></div>`;
}

function render(): void {
  const doc = documentNow();
  if (!doc) { root.innerHTML = `<main class="onboarding"><section class="welcome"><span class="pill">Client desktop locale</span><h1>Preventivi con una base verificabile.</h1><p>Cash mette insieme obiettivo economico, tempo, trasferte e spese. Il prezzo finale resta sempre una tua decisione.</p>${errorBox()}<div class="actions"><button data-action="create">Crea archivio</button><button class="secondary" data-action="open">Apri archivio</button></div><p class="small">Per l’uso con Google Drive scegli una cartella “Il mio Drive” in modalità Duplica file.</p></section></main>`; return; }
  const body = view === 'dashboard' ? dashboard(doc) : view === 'quotes' ? quotes(doc) : view === 'resources' ? resources(doc) : view === 'catalog' ? catalog(doc) : settings(doc);
  root.innerHTML = `<div class="shell">${nav()}<main class="main">${topbar()}${errorBox()}${body}</main></div>`;
}

function mutateEntityList(kind: string, id: string): void {
  state.mutate(doc => {
    if (kind === 'cost') doc.businessCosts = doc.businessCosts.filter(x=>x.id!==id);
    else if (kind === 'vehicle') doc.vehicles = doc.vehicles.filter(x=>x.id!==id);
    else if (kind === 'site') doc.sites = doc.sites.filter(x=>x.id!==id);
    else if (kind === 'catalog') doc.catalog.subItems = doc.catalog.subItems.filter(x=>x.id!==id);
    else if (kind === 'quote') { doc.quotes = doc.quotes.filter(x=>x.id!==id); if(activeQuoteId===id)activeQuoteId=undefined; }
    else if (kind === 'item') { const q=selectedQuote(); if(q){ const target=doc.quotes.find(x=>x.id===q.id)!; target.items=target.items.filter(x=>x.id!==id); } }
  });
}

const promptRequired = (message: string, initial = ''): string | undefined => { const value = window.prompt(message, initial)?.trim(); return value || undefined; };

async function action(name: string, id?: string): Promise<void> {
  const doc = documentNow();
  if (name==='create') return state.create(); if(name==='open') return state.open(); if(name==='save') return state.save(); if(name==='recovery') return state.recovery();
  if(name==='dismiss-error') return state.clearError();
  if(!doc) return;
  if(name==='add-preset') state.mutate(d=>d.profiles.push(createFiscalPreset2026()));
  else if(name==='new-quote') { const profile=doc.profiles.find(p=>p.confirmed); let snap; if(profile){const value=snapshotProfile(profile,doc.businessCosts);if(value.ok)snap=value.value;} const q:Quote={...meta(),date:new Date().toISOString().slice(0,10),...(profile?{profileId:profile.id}:{}),...(snap?{profileSnapshot:snap}:{}),items:[],snapshotRevision:0,exportAttempts:[]};state.mutate(d=>d.quotes.push(q));activeQuoteId=q.id; }
  else if(name==='back-quotes'){activeQuoteId=undefined;render();}
  else if(name==='add-item'){const title=promptRequired('Nome della voce commerciale');if(title){const item:QuoteItem={...meta(),name:title,subItems:[],variantGroups:[],variantSelections:[]};state.mutate(d=>d.quotes.find(q=>q.id===activeQuoteId)!.items.push(item));}}
  else if((name==='add-time'||name==='add-expense')&&id){const desc=promptRequired('Descrizione');const value=promptRequired(name==='add-time'?'Durata in minuti':'Importo in euro',name==='add-time'?'30':'0.00');if(desc&&value){state.mutate(d=>{const item=d.quotes.find(q=>q.id===activeQuoteId)!.items.find(i=>i.id===id)!;item.subItems.push(name==='add-time'?{...meta(),kind:'time',description:desc,minutes:Number(value)}:{...meta(),kind:'expense',description:desc,amount:Number(value).toFixed(2)});});}}
  else if(name==='add-catalog'&&id){const choices=doc.catalog.subItems.map((x,i)=>`${i+1}. ${x.description}`).join('\n');const raw=promptRequired(`Scegli il numero:\n${choices}`);const source=raw?doc.catalog.subItems[Number(raw)-1]:undefined;if(source){state.mutate(d=>{const item=d.quotes.find(q=>q.id===activeQuoteId)!.items.find(i=>i.id===id)!;if(source.kind==='time')item.subItems.push({...meta(),kind:'time',description:source.description,minutes:source.minutes});else if(source.kind==='expense')item.subItems.push({...meta(),kind:'expense',description:source.description,amount:source.amount});});}}
  else if(name==='add-travel'&&id) await addTravel(id);
  else if(name==='add-variant'&&id) addVariant(id);
  else if(name==='save-template') saveTemplate();
  else if(name==='refresh-quote') await performRefresh();
  else if(name==='export-quote') await performExport();
  else if(name==='delete-token') {await window.cash.credentials.deleteFicToken();}
}

async function addTravel(itemId:string):Promise<void>{
  const doc=documentNow()!, quote=selectedQuote()!, profile=profileFor(quote);
  if(!doc.settings.fuelTerritory){window.alert('Configura prima la regione MIMIT.');return;} if(!doc.sites.length||!doc.vehicles.length){window.alert('Configura almeno una Sede e un veicolo.');return;}
  const site=doc.sites[Number(promptRequired(`Sede:\n${doc.sites.map((x,i)=>`${i+1}. ${x.name}`).join('\n')}`))-1]; const vehicle=doc.vehicles[Number(promptRequired(`Veicolo:\n${doc.vehicles.map((x,i)=>`${i+1}. ${x.name}`).join('\n')}`))-1];
  if(!site||!vehicle)return; const description=promptRequired('Descrizione trasferta',`Trasferta ${site.name}`);if(!description)return;
  const occurrences=Number(promptRequired('Occorrenze previste','1')); const roundTrip=window.confirm('Andata e ritorno?'); const manual=promptRequired('Minuti manuali per occorrenza (lascia vuoto per automatico)','');
  const fuel=await window.cash.mimit.latestFuelPrice({territory:doc.settings.fuelTerritory,fuel:vehicle.fuel});if(!fuel.ok){state.error=fuel.error;render();return;}const cost=calculateVehicleCost(vehicle,fuel.value);if(!cost.ok){state.error=cost.error;render();return;}
  const travel=calculateTravel({oneWayKm:site.oneWayKm,roundTrip,occurrences,vehicleCostPerKm:cost.value.costPerKm,...(manual?{manualMinutesPerOccurrence:Number(manual)}:{speedKmh:profile?.capacity.travelSpeedKmh})});if(!travel.ok){state.error=travel.error;render();return;}
  state.mutate(d=>d.quotes.find(q=>q.id===quote.id)!.items.find(i=>i.id===itemId)!.subItems.push({...meta(),kind:'travel',description,site:{sourceId:site.id,name:site.name,address:site.address,...(site.oneWayKm!==undefined?{oneWayKm:site.oneWayKm}:{})},vehicleId:vehicle.id,roundTrip,occurrences,timeMode:manual?'manual':'automatic',...(manual?{manualMinutesPerOccurrence:Number(manual)}:{}),...travel.value,vehicleCostPerKm:cost.value.costPerKm,fuelEvidence:fuel.value}));
}

function addVariant(itemId:string):void{const name=promptRequired('Nome gruppo variante');const raw=promptRequired('Opzioni, una per riga: Nome:minuti (0 = nessuna sottovoce)','Nessuna:0\nStandard:30');if(!name||!raw)return;const options=raw.split(/\r?\n/).map(line=>{const [title,minutesRaw]=line.split(':');const minutes=Number(minutesRaw);return{...meta(),name:title!.trim(),subItems:minutes>0?[{kind:'time' as const,description:`${name} · ${title!.trim()}`,minutes}]:[]};});const group={...meta(),name,options,defaultOptionId:options[0]?.id};state.mutate(d=>{const item=d.quotes.find(q=>q.id===activeQuoteId)!.items.find(i=>i.id===itemId)!;item.variantGroups.push(group);const applied=applyVariantSelections(item,{[group.id]:group.defaultOptionId!},{materializeTravel:()=>({ok:false,error:{code:'MISSING_DATA',message:'Configurare la trasferta nel preventivo.'}})});if(applied.ok)Object.assign(item,applied.value);});}

function saveTemplate():void{const quote=selectedQuote();const name=promptRequired('Nome del nuovo template');if(!quote||!name)return;state.mutate(d=>d.catalog.templates.push({...meta(),name,items:quote.items.map(item=>({...meta(),name:item.name,...(item.referencePrice?{referencePrice:{amount:item.referencePrice.amount,period:item.referencePrice.period}}:{}),subItems:item.subItems.filter(s=>!s.variantOwner).map(s=>s.kind==='time'?{...meta(),kind:'time',description:s.description,minutes:s.minutes}:s.kind==='expense'?{...meta(),kind:'expense',description:s.description,amount:s.amount}:{...meta(),kind:'travel',description:s.description,roundTrip:s.roundTrip,occurrences:s.occurrences,timeMode:s.timeMode,...(s.manualMinutesPerOccurrence?{manualMinutesPerOccurrence:s.manualMinutesPerOccurrence}:{})}) as ReusableSubItem[],variantGroups:structuredClone(item.variantGroups)}))}));}

async function performRefresh():Promise<void>{const doc=documentNow()!,quote=selectedQuote();if(!quote)return;const result=await refreshQuote(quote,{profileById:id=>doc.profiles.find(x=>x.id===id),costs:doc.businessCosts,siteById:id=>doc.sites.find(x=>x.id===id),vehicleById:id=>doc.vehicles.find(x=>x.id===id),fuel:vehicle=>doc.settings.fuelTerritory?window.cash.mimit.latestFuelPrice({territory:doc.settings.fuelTerritory,fuel:vehicle.fuel}):Promise.resolve({ok:false,error:{code:'MISSING_DATA',field:'fuelTerritory',message:'Regione MIMIT non configurata.'}}),foi:(amount,period)=>window.cash.istat.revalue({amount,fromPeriod:period})});if(!result.ok){state.error=result.error;render();return;}state.mutate(d=>{const index=d.quotes.findIndex(x=>x.id===quote.id);d.quotes[index]=result.value;});}

async function hashLines(value:unknown):Promise<string>{const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function performExport():Promise<void>{const doc=documentNow()!,quote=selectedQuote();if(!quote)return;if(!quote.client||!doc.settings.ficCompanyId||!doc.settings.ficConsultingProductId||quote.items.some(i=>i.chosenPrice===undefined)){window.alert('Servono cliente, azienda, prodotto Consulenza e prezzo scelto per ogni voce.');return;}if(quote.exportAttempts.some(a=>['pending','success','uncertain'].includes(a.outcome))&&!window.confirm('Preventivo già esportato o da verificare. Continuare?'))return;const product=await window.cash.fic.verifyProduct({companyId:doc.settings.ficCompanyId,productId:doc.settings.ficConsultingProductId});if(!product.ok){state.error=product.error;render();return;}const lines=quote.items.map(i=>({itemIds:[i.id],description:i.name,amount:i.chosenPrice!,quantity:1 as const}));if(!window.confirm(lines.map(l=>`${l.description}: ${eur(l.amount)}`).join('\n')))return;const attempt:ExportAttempt={...meta(),companyId:doc.settings.ficCompanyId,lines,payloadHash:await hashLines({companyId:doc.settings.ficCompanyId,lines}),outcome:'pending'};state.mutate(d=>d.quotes.find(q=>q.id===quote.id)!.exportAttempts.push(attempt));await state.save();if(state.status!=='Salvato')return;const sent=await window.cash.fic.exportQuote({companyId:doc.settings.ficCompanyId,clientId:quote.client.clientId,productId:doc.settings.ficConsultingProductId,lines,attemptId:attempt.id});state.mutate(d=>{const a=d.quotes.find(q=>q.id===quote.id)!.exportAttempts.find(x=>x.id===attempt.id)!;if(sent.ok){a.outcome=sent.value.outcome;if(sent.value.remoteDocumentId)a.remoteDocumentId=sent.value.remoteDocumentId;if(sent.value.diagnostic)a.diagnostic=sent.value.diagnostic;}else{a.outcome='uncertain';a.diagnostic=sent.error.message;}});}

root.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-view],[data-action],[data-open-quote],[data-delete]');if(!target)return;if(target.dataset.view){view=target.dataset.view as View;activeQuoteId=undefined;render();}else if(target.dataset.openQuote){activeQuoteId=target.dataset.openQuote;view='quotes';render();}else if(target.dataset.delete){const [kind,id]=target.dataset.delete.split(':');if(kind&&id&&window.confirm('Eliminare questo elemento?'))mutateEntityList(kind,id);}else if(target.dataset.action)void action(target.dataset.action,target.dataset.id);});

root.addEventListener('change',event=>{const target=event.target as HTMLSelectElement;if(!target.dataset.variant)return;const [itemId,groupId]=target.dataset.variant.split(':');const quote=selectedQuote();const item=quote?.items.find(i=>i.id===itemId);if(!item||!groupId)return;const warnings=item.subItems.some(s=>s.variantOwner?.groupId===groupId&&s.manuallyModified);const result=changeVariant(item,groupId,target.value,!warnings||window.confirm('Le modifiche manuali alle sottovoci della variante verranno perse. Continuare?'),{materializeTravel:()=>({ok:false,error:{code:'MISSING_DATA',message:'La variante Trasferta richiede configurazione contestuale.'}})});if(result.ok)state.mutate(d=>Object.assign(d.quotes.find(q=>q.id===quote!.id)!.items.find(i=>i.id===item.id)!,result.value));else{state.error=result.error;render();}});

root.addEventListener('submit',event=>{event.preventDefault();const form=event.target as HTMLFormElement;const data=new FormData(form);const get=(name:string)=>String(data.get(name)??'').trim();const doc=documentNow();if(!doc)return;const kind=form.dataset.form;
  if(kind==='profile')state.mutate(d=>{const p=d.profiles[0]!;p.revenueTarget=get('revenueTarget');p.specificAnnualExpenses=get('specificAnnualExpenses');p.capacity.hoursPerDay=get('hoursPerDay');p.capacity.clientTimePercentage=get('clientTimePercentage');p.capacity.vacationDays=Number(get('vacationDays'));p.capacity.unplannedDays=Number(get('unplannedDays'));p.capacity.travelSpeedKmh=get('travelSpeedKmh')||undefined;p.fiscal.atecoCode=get('atecoCode');p.confirmed=data.get('confirmed')==='on';p.revision+=1;p.updatedAt=nowIso();});
  else if(kind==='cost')state.mutate(d=>d.businessCosts.push({...meta(),category:get('category'),description:get('description'),monthlyAmount:Number(get('monthlyAmount')).toFixed(2)}));
  else if(kind==='vehicle')state.mutate(d=>d.vehicles.push({...meta(),name:get('name'),fuel:get('fuel') as Vehicle['fuel'],consumption:get('consumption'),consumptionUnit:get('fuel')==='Metano'?'kg/100km':'l/100km',annualKm:get('annualKm'),annualInsurance:Number(get('annualInsurance')).toFixed(2),annualTax:Number(get('annualTax')).toFixed(2),annualMaintenance:Number(get('annualMaintenance')).toFixed(2)}));
  else if(kind==='site')state.mutate(d=>d.sites.push({...meta(),name:get('name'),address:get('address'),...(get('oneWayKm')?{oneWayKm:Number(get('oneWayKm')).toFixed(1)}:{})}));
  else if(kind==='catalog')state.mutate(d=>d.catalog.subItems.push(get('kind')==='time'?{...meta(),kind:'time',description:get('description'),minutes:Number(get('value'))}:{...meta(),kind:'expense',description:get('description'),amount:Number(get('value')).toFixed(2)}));
  else if(kind==='settings')state.mutate(d=>{d.settings={
    ...(get('fuelTerritory')?{fuelTerritory:get('fuelTerritory')}:{}),
    ...(get('ficCompanyId')?{ficCompanyId:get('ficCompanyId')}:{}),
    ...(get('ficConsultingProductId')?{ficConsultingProductId:get('ficConsultingProductId')}:{})
  };});
  else if(kind==='token')void window.cash.credentials.setFicToken(get('token')).then(result=>{if(!result.ok){state.error=result.error;render();}else form.reset();});
  else if(kind==='quote'){const quote=selectedQuote()!;const profile=doc.profiles.find(p=>p.id===get('profileId'));const snap=profile?snapshotProfile(profile,doc.businessCosts):undefined;state.mutate(d=>{const q=d.quotes.find(x=>x.id===quote.id)!;q.date=get('date');q.commission=get('commission')?Number(get('commission')).toFixed(2):undefined;q.profileId=profile?.id;q.profileSnapshot=snap?.ok?snap.value:undefined;q.mainSite=get('mainSiteId')?siteSnapshot(get('mainSiteId')):undefined;});}
  else if(kind==='item-price'){const quote=selectedQuote()!;state.mutate(d=>{const item=d.quotes.find(q=>q.id===quote.id)!.items.find(i=>i.id===form.dataset.id)!;item.chosenPrice=get('chosenPrice')?Number(get('chosenPrice')).toFixed(2):undefined;item.referencePrice=get('referenceAmount')&&get('referencePeriod')?{amount:Number(get('referenceAmount')).toFixed(2),period:get('referencePeriod')}:undefined;});}
  else if(kind==='client-search')void window.cash.fic.searchClients({companyId:doc.settings.ficCompanyId??'',query:get('query')}).then(result=>{if(!result.ok){state.error=result.error;render();return;}const container=document.querySelector('#client-results')!;container.innerHTML=result.value.map(c=>`<button class="secondary" data-client='${esc(JSON.stringify(c))}'>${esc(c.displayName)} · ${esc(c.vatNumber)}</button>`).join(' ');container.querySelectorAll<HTMLButtonElement>('[data-client]').forEach(button=>button.onclick=()=>{const client=JSON.parse(button.dataset.client!);state.mutate(d=>{d.quotes.find(q=>q.id===activeQuoteId)!.client=client;});});});
});

state.subscribe(render);
render();
void state.initialize();
