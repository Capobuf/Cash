import { describe, expect, it } from 'vitest';
import { cloneReusableSubItem, cloneTemplate } from '../../src/domain/catalog';
import { meta, type ReusableSubItem, type Template } from '../../src/domain/model';

describe('copie indipendenti',()=>{
  it('rinnova tutte le identità senza propagare modifiche',()=>{const sub:ReusableSubItem={...meta(),kind:'time',description:'Gestione',minutes:30};const copy=cloneReusableSubItem(sub);copy.description='Altro';expect(copy.id).not.toBe(sub.id);expect(sub.description).toBe('Gestione');});
  it('rinnova template, voci, gruppi, opzioni e default',()=>{const option={...meta(),name:'Sì',subItems:[]};const group={...meta(),name:'Firmware',options:[option],defaultOptionId:option.id};const source:Template={...meta(),name:'Server',items:[{...meta(),name:'Config',subItems:[],variantGroups:[group]}]};const copy=cloneTemplate(source);expect(copy.id).not.toBe(source.id);expect(copy.items[0]!.variantGroups[0]!.defaultOptionId).toBe(copy.items[0]!.variantGroups[0]!.options[0]!.id);});
});
