import type { BreakdownKey, CurrencyBreakdowns } from '@/lib/dashboard-data';

export const breakdownKeys: BreakdownKey[] = [
  'sources',
  'subSources',
  'configurations',
  'territories',
  'tracks',
  'artists',
  'releases',
  'labels',
];

export function createEmptyCurrencyBreakdowns(): CurrencyBreakdowns {
  return {
    artists: [],
    configurations: [],
    labels: [],
    releases: [],
    sources: [],
    subSources: [],
    territories: [],
    tracks: [],
  };
}

export function dimensionToBreakdownKey(
  dimension: string,
): BreakdownKey | null {
  const normalized = dimension.trim().toLowerCase();
  if (normalized === 'channel' || normalized === 'source') return 'sources';
  if (normalized === 'sub_source') return 'subSources';
  if (normalized === 'configuration') return 'configurations';
  if (normalized === 'territory') return 'territories';
  if (normalized === 'track') return 'tracks';
  if (normalized === 'artist') return 'artists';
  if (normalized === 'release') return 'releases';
  if (normalized === 'label') return 'labels';

  return null;
}

export function breakdownKeyToDimension(key: BreakdownKey) {
  const dimensions: Record<BreakdownKey, string> = {
    artists: 'artist',
    configurations: 'configuration',
    labels: 'label',
    releases: 'release',
    sources: 'source',
    subSources: 'sub_source',
    territories: 'territory',
    tracks: 'track',
  };

  return dimensions[key];
}
