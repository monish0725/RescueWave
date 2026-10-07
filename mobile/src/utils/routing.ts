// In-app routing: OSRM (public routing engine, no API key) for the actual
// path, and Nominatim (OpenStreetMap) for destination search — both free,
// so "never leave the app" doesn't require a paid Google Maps/Directions
// subscription. The "Safety Score" is deliberately NOT a fabricated
// crime/AI risk number — RescueWave has no real data source for that. It's
// a transparent, real proxy: how close the route stays to police stations
// and hospitals, computed from actual OpenStreetMap data. Crowd level and
// street lighting are shown as "not available yet" rather than invented.

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteOption {
  id: string;
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  safetyScore: number | null; // 0-100, see computeRouteSafety. null = we couldn't check (network/API failure), NOT "checked and found nothing"
  nearbyInfraCount: number;
  safetyDataAvailable: boolean; // true only if the Overpass query actually succeeded — false means "unknown", not "zero"
  infraPoints?: RoutePoint[];
  litPointCount?: number;
  publicActivityCount?: number;
  supportPointCount?: number;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not search for that place. Check your connection.');
  const data = await res.json();
  return (data as any[]).map((r) => ({ label: r.display_name as string, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}

/** Real walking routes from OSRM's public demo routing server, requesting alternatives where the road network offers them. */
export async function fetchRoutes(origin: RoutePoint, destination: RoutePoint): Promise<RouteOption[]> {
  const url = `https://router.project-osrm.org/route/v1/foot/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?alternatives=true&overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not calculate a route. Check your connection and try again.');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No walking route found between these points.');

  return (data.routes as any[]).map((r, i) => ({
    id: `route-${i}`,
    coordinates: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng })),
    distanceMeters: r.distance,
    // Public OSRM demo profiles can return optimistic/non-walking durations
    // in some regions. For RescueWave's walking UI, derive time from a
    // realistic brisk walking speed (~4.8 km/h) instead of trusting it.
    durationSeconds: walkingDurationSeconds(r.distance),
    safetyScore: null, // filled in by computeRouteSafety — null until we actually know, never a fabricated default
    nearbyInfraCount: 0,
    safetyDataAvailable: false,
  }));
}

function walkingDurationSeconds(distanceMeters: number): number {
  const walkingMetersPerSecond = 1.33;
  return Math.max(60, Math.round(distanceMeters / walkingMetersPerSecond));
}

function sampleAlongRoute(coordinates: RoutePoint[], sampleCount = 6): RoutePoint[] {
  if (coordinates.length <= sampleCount) return coordinates;
  const step = Math.floor(coordinates.length / sampleCount);
  const samples: RoutePoint[] = [];
  for (let i = 0; i < coordinates.length; i += step) samples.push(coordinates[i]);
  return samples;
}

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Scores a route by how many sample points along it have a police station
 * or hospital within 1.5km, using one Overpass query over the route's
 * bounding box (real OSM data, one network call regardless of route
 * length). This is an infrastructure-proximity score, not a crime/risk
 * prediction — RescueWave has no data source for the latter.
 */
export async function computeRouteSafety(route: RouteOption): Promise<RouteOption> {
  const lats = route.coordinates.map((c) => c.lat);
  const lngs = route.coordinates.map((c) => c.lng);
  const pad = 0.01; // ~1km buffer around the route's bounding box
  const bbox = [Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad];

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"~"^(police|hospital|fire_station)$"](${bbox.join(',')});
      way["amenity"~"^(police|hospital|fire_station)$"](${bbox.join(',')});
      node["highway"="street_lamp"](${bbox.join(',')});
      way["lit"="yes"](${bbox.join(',')});
      node["amenity"~"^(restaurant|cafe|fast_food|pharmacy|clinic|fuel|bank|atm|bus_station)$"](${bbox.join(',')});
      node["shop"](${bbox.join(',')});
      node["public_transport"="station"](${bbox.join(',')});
    );
    out center;
  `;

  try {
    const res = await fetchOverpass(query);
    if (!res.ok) return { ...route, safetyScore: null, nearbyInfraCount: 0, safetyDataAvailable: false };
    const data = await res.json();
    const elements: any[] = data.elements ?? [];
    const toPoint = (e: any): RoutePoint | null => {
      if (e.lat && e.lon) return { lat: e.lat, lng: e.lon };
      if (e.center?.lat && e.center?.lon) return { lat: e.center.lat, lng: e.center.lon };
      return null;
    };
    const support = elements
      .filter((e) => ['police', 'hospital', 'fire_station'].includes(e.tags?.amenity))
      .map(toPoint)
      .filter(Boolean) as RoutePoint[];
    const lit = elements
      .filter((e) => e.tags?.highway === 'street_lamp' || e.tags?.lit === 'yes')
      .map(toPoint)
      .filter(Boolean) as RoutePoint[];
    const activity = elements
      .filter((e) => e.tags?.shop || e.tags?.public_transport === 'station' || ['restaurant', 'cafe', 'fast_food', 'pharmacy', 'clinic', 'fuel', 'bank', 'atm', 'bus_station'].includes(e.tags?.amenity))
      .map(toPoint)
      .filter(Boolean) as RoutePoint[];

    const samples = sampleAlongRoute(route.coordinates);
    let supportCovered = 0;
    let litCovered = 0;
    let activityCovered = 0;
    for (const s of samples) {
      if (support.some((p) => haversineMeters(s, p) <= 1500)) supportCovered += 1;
      if (lit.some((p) => haversineMeters(s, p) <= 250)) litCovered += 1;
      if (activity.some((p) => haversineMeters(s, p) <= 500)) activityCovered += 1;
    }
    const supportScore = supportCovered / samples.length;
    const litScore = litCovered / samples.length;
    const activityScore = activityCovered / samples.length;
    const score = Math.round((supportScore * 0.45 + litScore * 0.30 + activityScore * 0.25) * 100);
    // Overpass genuinely succeeded here, even if it found zero police/hospitals
    // nearby — that's a real (if low) score, not missing data, so it's safe
    // to mark this route's safety data as available.
    return {
      ...route,
      safetyScore: score,
      nearbyInfraCount: support.length,
      supportPointCount: support.length,
      litPointCount: lit.length,
      publicActivityCount: activity.length,
      infraPoints: support,
      safetyDataAvailable: true,
    };
  } catch {
    return { ...route, safetyScore: null, nearbyInfraCount: 0, safetyDataAvailable: false };
  }
}

async function fetchOverpass(query: string): Promise<Response> {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
  ];
  let last: Response | null = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      if (res.ok) return res;
      last = res;
    } catch {
      // Try the next public Overpass mirror before giving up.
    }
  }
  if (last) return last;
  throw new Error('Could not reach OpenStreetMap safety data.');
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}
