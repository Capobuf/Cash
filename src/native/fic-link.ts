import { createBlankProfile, err, type CashDocument, type FicTaxProfileSnapshot, type Result } from '../domain/model';
import { removeFicLink } from '../domain/integration';
import type { ArchiveSession, ConcurrencyToken } from './persistence';

export interface FicLinkServices {
  verify(token:string,companyId:string,productId:string):Promise<Result<{company:{id:string;name:string};product:{id:string;name:string};taxProfile:FicTaxProfileSnapshot}>>;
  hasToken():Promise<Result<boolean>>;
  readToken():Promise<Result<string>>;
  writeToken(token:string):Promise<Result<void>>;
  deleteToken():Promise<Result<void>>;
  save(path:string,document:CashDocument,token:ConcurrencyToken):Promise<Result<ArchiveSession>>;
}

function applyAuthoritativeTaxProfile(document:CashDocument,taxProfile:FicTaxProfileSnapshot):void{
  const acquired=new Date(taxProfile.acquiredAt);const year=Number.isNaN(acquired.valueOf())?new Date().getFullYear():acquired.getFullYear();
  const index=document.profiles.findIndex(profile=>profile.year===year);const existing=index>=0?document.profiles[index]:undefined;
  const profile=existing?structuredClone(existing):createBlankProfile(year);
  if(taxProfile.profitCoefficient!==undefined)profile.fiscal.profitabilityCoefficient=taxProfile.profitCoefficient;
  if(taxProfile.contributionsPercentage!==undefined)profile.fiscal.contributionRate=taxProfile.contributionsPercentage;
  const regime=taxProfile.regime?.trim().toLocaleLowerCase('it');
  if(regime==='forfettario_5'){
    profile.fiscal.activityPhase='reduced_eligible';profile.fiscal.reducedSubstituteTaxRate='5';profile.fiscal.ordinarySubstituteTaxRate='15';
    profile.fiscal.reducedEligibilityConfirmed=true;profile.fiscal.ordinaryApplicabilityConfirmed=true;
  }else if(regime?.startsWith('forfettario')){
    profile.fiscal.activityPhase='ordinary';profile.fiscal.reducedSubstituteTaxRate='5';profile.fiscal.ordinarySubstituteTaxRate='15';
    profile.fiscal.reducedEligibilityConfirmed=false;profile.fiscal.ordinaryApplicabilityConfirmed=true;
  }
  profile.confirmed=existing?.confirmed??false;profile.updatedAt=taxProfile.acquiredAt;if(existing)profile.revision=existing.revision+1;
  if(index>=0)document.profiles[index]=profile;else document.profiles.push(profile);
}

async function previousToken(services:FicLinkServices):Promise<Result<string|undefined>>{
  const presence=await services.hasToken();if(!presence.ok)return presence;if(!presence.value)return{ok:true,value:undefined};return services.readToken();
}

export async function commitFicActivation(input:{token:string;companyId:string;productId:string;path:string;document:CashDocument;concurrencyToken:ConcurrencyToken},services:FicLinkServices):Promise<Result<ArchiveSession>>{
  const verified=await services.verify(input.token,input.companyId,input.productId);if(!verified.ok)return verified;
  const prior=await previousToken(services);if(!prior.ok)return prior;
  const stored=await services.writeToken(input.token);if(!stored.ok)return stored;
  const next=structuredClone(input.document);next.settings.fic={enabled:true,company:verified.value.company,product:verified.value.product,taxProfile:verified.value.taxProfile,lastVerification:{at:new Date().toISOString(),result:'success'}};
  applyAuthoritativeTaxProfile(next,verified.value.taxProfile);
  const saved=await services.save(input.path,next,input.concurrencyToken);if(saved.ok)return saved;
  const rollback=prior.value===undefined?await services.deleteToken():await services.writeToken(prior.value);
  return rollback.ok?saved:err({code:'CREDENTIALS',source:'credentials',message:'Attivazione non completata e ripristino della credenziale precedente non riuscito.',details:[saved.error.message,rollback.error.message]});
}

export async function removeFicLinkAtomically(input:{path:string;document:CashDocument;concurrencyToken:ConcurrencyToken},services:FicLinkServices):Promise<Result<ArchiveSession>>{
  const prior=await previousToken(services);if(!prior.ok)return prior;
  const removed=await services.deleteToken();if(!removed.ok)return removed;
  const next=structuredClone(input.document);next.settings=removeFicLink(next.settings);
  const saved=await services.save(input.path,next,input.concurrencyToken);if(saved.ok)return saved;
  if(prior.value===undefined)return saved;
  const rollback=await services.writeToken(prior.value);
  return rollback.ok?saved:err({code:'CREDENTIALS',source:'credentials',message:'Rimozione non completata e ripristino della credenziale non riuscito.',details:[saved.error.message,rollback.error.message]});
}
