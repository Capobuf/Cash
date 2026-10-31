import type { FicClientSnapshot, Site } from '../../domain/model';
import { siteMatchesClient } from '../../domain/locations';

export function siteOptions(sites: Site[], client?: FicClientSnapshot) {
  return sites
    .filter((site) => siteMatchesClient(site, client))
    .map((site) => {
      const group = site.client
        ? 'Sedi del Cliente selezionato'
        : 'Altre sedi senza Cliente';
      const owner = site.client
        ? `Cliente corrente: ${site.client.displayName}`
        : 'Senza Cliente';
      return {
        value: site.id,
        label: [site.name, site.address, owner].filter(Boolean).join(' · '),
        group,
      };
    })
    .sort((a, b) => {
      const rank = (group: string) =>
        group === 'Sedi del Cliente selezionato' ? 0 : 1;
      return rank(a.group) - rank(b.group);
    });
}
