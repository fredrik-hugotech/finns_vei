// How a trip is made. Stored as-is in bike_trips.mode; anything unknown
// (older clients, tampered input) counts as 'sykkel', as it always has.
export const TRIP_MODES = ['sykkel', 'sparkesykkel', 'gange'];

export function normalizeMode(mode) {
  return mode === 'gange' || mode === 'sparkesykkel' ? mode : 'sykkel';
}

export const MODE_ICON = { sykkel: 'bike', sparkesykkel: 'scooter', gange: 'walk' };
export const MODE_LABEL = { sykkel: 'Sykle', sparkesykkel: 'Sparkesykkel', gange: 'Gå' };
// "Syklet 2,1 km" / "Sparkesykkel 2,1 km" / "Gikk 2,1 km" in trip lists.
export const MODE_PAST = { sykkel: 'Syklet', sparkesykkel: 'Sparkesykkel', gange: 'Gikk' };
