// Static fallback used when the version manifest can't be fetched (offline
// first-run, Modrinth/Mojang unreachable). Kept short and recent; the live
// list replaces it whenever the network works.
export const FALLBACK_MC_VERSIONS = [
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.18.2',
  '1.16.5',
  '1.8.9',
];

export function toVersionOptions(versions) {
  return (versions || []).map(v =>
    typeof v === 'string'
      ? { id: v, label: v, loaders: [] }
      : { id: v.id, label: v.label || v.id, loaders: v.loaders || [] }
  );
}
