import * as Location from 'expo-location';
import type { NearbyPlace } from '@/types';

export interface CurrentLocation {
  lat: number;
  lng: number;
  address: string; // human readable, from on-device reverse geocoding
}

export async function ensureLocationPermission(): Promise<boolean> {
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.status === 'granted') return true;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.status === 'granted';
}

export async function getCurrentLocation(): Promise<CurrentLocation> {
  const granted = await ensureLocationPermission();
  if (!granted) throw new Error('Location permission denied. Enable it in your phone settings to use this feature.');

  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const { latitude: lat, longitude: lng } = pos.coords;

  let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results[0];
    if (r) {
      address = [r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(', ');
    }
  } catch {
    // reverse geocoding can fail (no network / no geocoder on device) — the
    // raw lat/lng fallback above still gives the alert real location data.
  }
  return { lat, lng, address };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OVERPASS_TAG: Record<NearbyPlace['kind'], string> = {
  hospital: 'amenity=hospital',
  police: 'amenity=police',
  fire_station: 'amenity=fire_station',
};

/**
 * Real nearby-place lookup via the OpenStreetMap Overpass API — free, no API
 * key required (unlike Google Places, which needs billing enabled). Returns
 * actual mapped hospitals / police stations / fire stations around the given
 * coordinates, sorted by distance.
 */
export async function findNearby(kind: NearbyPlace['kind'], lat: number, lng: number, radiusMeters = 6000): Promise<NearbyPlace[]> {
  const query = `
    [out:json][timeout:15];
    node[${OVERPASS_TAG[kind]}](around:${radiusMeters},${lat},${lng});
    out body ${25};
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) throw new Error('Could not reach the map data service. Check your internet connection.');
  const data = await res.json();
  const elements: any[] = data.elements ?? [];

  return elements
    .filter((el) => el.lat && el.lon)
    .map((el) => {
      const tags = el.tags ?? {};
      const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean);
      return {
        id: String(el.id),
        name: tags.name || (kind === 'hospital' ? 'Hospital' : kind === 'police' ? 'Police Station' : 'Fire Station'),
        kind,
        lat: el.lat,
        lng: el.lon,
        distanceKm: haversineKm(lat, lng, el.lat, el.lon),
        address: addressParts.length ? addressParts.join(', ') : null,
        phone: tags.phone || tags['contact:phone'] || null,
      } as NearbyPlace;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function googleMapsDirectionsUrl(lat: number, lng: number, label?: string) {
  const dest = `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${label ? `&destination_place_id=${encodeURIComponent(label)}` : ''}`;
}
