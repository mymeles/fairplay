import { timingSafeEqual } from 'node:crypto';

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

// Haversine — accurate enough for the venue-radius check we care about
// (typical party venues are 10–500m). Coords assumed WGS-84 lat/lng.
export const haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

// True iff the guest's GPS pin is within the venue radius after subtracting
// their device-reported accuracy as a confidence cushion. Negative slack is
// clamped at zero — we don't want a 1km accuracy claim to push a faraway
// guest inside the radius.
export const isWithinVenueRadius = (
  guest: { lat: number; lng: number; accuracyMeters: number },
  venue: { lat: number; lng: number; radiusMeters: number },
): { withinRadius: boolean; distanceMeters: number } => {
  const distanceMeters = haversineMeters(guest, venue);
  const slack = Math.max(0, guest.accuracyMeters);
  return {
    distanceMeters,
    withinRadius: distanceMeters - slack <= venue.radiusMeters,
  };
};

// Constant-time equality so a timing oracle can't be used to learn the
// venue Wi-Fi hash one byte at a time. Both sides are sha256-shaped strings
// in our usage but we still defensively length-check first.
export const wifiHashMatches = (
  guestHash: string | null | undefined,
  venueHash: string | null | undefined,
): boolean => {
  if (!guestHash || !venueHash) return false;
  if (guestHash.length !== venueHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(guestHash), Buffer.from(venueHash));
  } catch {
    return false;
  }
};

// "Low risk" stays deliberately conservative for M5 — a sha-shaped fingerprint
// is enough to count as a non-zero device signal. Reputation/blocklist arrives
// in M16 (Moderation and Abuse Protection).
const DEVICE_HASH_PATTERN = /^[A-Fa-f0-9]{32,128}$/;

export const isLowRiskDevice = (deviceHash: string | null | undefined): boolean => {
  if (!deviceHash) return false;
  return DEVICE_HASH_PATTERN.test(deviceHash);
};
