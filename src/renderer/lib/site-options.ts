import type { FicClientSnapshot, Site } from '../../domain/model';
import { siteMatchesClient } from '../../domain/locations';

export function siteOptions(
  sites: Site[],
  client?: FicClientSnapshot,
  mainSite = false,
) {
  return sites
    .filter((site) => !mainSite || siteMatchesClient(site, client))
    .map((site) => {
      const current = Boolean(site.client && siteMatchesClient(site, client));
      const group = current
        ? 'Sedi del Cliente selezionato'
        : site.client
          ? 'Sedi di altri Clienti'
          : 'Altre sedi senza Cliente';
      const owner = site.client
        ? `${current ? 'Cliente corrente' : 'Cliente'}: ${site.client.displayName}`
        : 'Senza Cliente';
      return {
        value: site.id,
        label: [site.name, site.address, owner].filter(Boolean).join(' · '),
        group,
      };
    })
    .sort((a, b) => {
      const rank = (group: string) =>
        group === 'Sedi del Cliente selezionato'
          ? 0
          : group === 'Altre sedi senza Cliente'
            ? 2
            : 1;
      return rank(a.group) - rank(b.group);
    });
}
