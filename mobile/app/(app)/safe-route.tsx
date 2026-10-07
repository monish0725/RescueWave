import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, Linking } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';
import { getCurrentLocation, CurrentLocation } from '@/utils/location';
import {
  geocodeAddress,
  fetchRoutes,
  computeRouteSafety,
  formatDistance,
  formatDuration,
  RouteOption,
  GeocodeResult,
} from '@/utils/routing';

export default function SafeRouteScreen() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();
  const mapRef = useRef<MapView>(null);
  const [origin, setOrigin] = useState<CurrentLocation | null>(null);
  const [originLoading, setOriginLoading] = useState(true);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationResults, setDestinationResults] = useState<GeocodeResult[]>([]);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrigin = useCallback(async () => {
    setOriginLoading(true);
    try {
      setOrigin(await getCurrentLocation());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOriginLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadOrigin();
  }, [loadOrigin]);

  React.useEffect(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const label = params.label ? String(params.label) : 'Selected destination';
    setDestination({ lat, lng, label });
    setDestinationQuery(label);
  }, [params.lat, params.lng, params.label]);

  async function searchDestination() {
    if (!destinationQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const results = await geocodeAddress(destinationQuery.trim());
      setDestinationResults(results);
      if (results.length === 0) setError('No matching places found.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  function pickDestination(result: GeocodeResult) {
    setDestination(result);
    setDestinationResults([]);
    setDestinationQuery(result.label);
  }

  async function findRoutes() {
    if (!origin || !destination) return;
    setLoadingRoutes(true);
    setError(null);
    setRoutes([]);
    try {
      const raw = await fetchRoutes({ lat: origin.lat, lng: origin.lng }, { lat: destination.lat, lng: destination.lng });
      const scored = await Promise.all(raw.map((r) => computeRouteSafety(r)));
      // Only rank by safety score among routes that actually have real safety
      // data — routes with unavailable data keep their original OSRM order
      // rather than being sorted to the bottom (or top) by a fabricated 0.
      scored.sort((a, b) => {
        if (a.safetyDataAvailable && b.safetyDataAvailable) return (b.safetyScore ?? 0) - (a.safetyScore ?? 0);
        if (a.safetyDataAvailable) return -1;
        if (b.safetyDataAvailable) return 1;
        return 0;
      });
      setRoutes(scored);
      setSelectedRouteId(scored[0]?.id ?? null);

      if (mapRef.current && scored[0]) {
        mapRef.current.fitToCoordinates(
          scored[0].coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng })),
          { edgePadding: { top: 60, right: 60, bottom: 260, left: 60 }, animated: true }
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingRoutes(false);
    }
  }

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const routesWithSafetyData = routes.filter((r) => r.safetyDataAvailable);
  const bestScore = routesWithSafetyData.length ? Math.max(...routesWithSafetyData.map((r) => r.safetyScore ?? 0)) : null;
  const shortest = routes.length ? routes.reduce((a, b) => (a.distanceMeters < b.distanceMeters ? a : b)) : null;
  const fastest = routes.length ? routes.reduce((a, b) => (a.durationSeconds < b.durationSeconds ? a : b)) : null;

  function labelFor(route: RouteOption): string {
    // Never call a route "Safest" (or anything implying we know it's the
    // safest) unless we actually have real safety data to back that up.
    if (!route.safetyDataAvailable) {
      if (routes.length === 1) return 'Recommended Route';
      return shortest?.id === route.id ? 'Shortest Available Route' : 'Alternative Route';
    }
    if (routes.length === 1) return 'Recommended Route';
    const tags: string[] = [];
    if (bestScore !== null && route.safetyScore === bestScore) tags.push('Safest');
    if (shortest?.id === route.id) tags.push('Shortest');
    if (fastest?.id === route.id) tags.push('Fastest');
    return tags.length ? tags.join(' · ') : 'Alternative Route';
  }

  function routeKind(route: RouteOption): 'safest' | 'fastest' | 'shortest' {
    if (route.safetyDataAvailable && bestScore !== null && route.safetyScore === bestScore) return 'safest';
    if (fastest?.id === route.id) return 'fastest';
    return 'shortest';
  }

  function routeStatus(route: RouteOption): string {
    if (!route.safetyDataAvailable) return 'Safety data unavailable';
    if ((route.safetyScore ?? 0) >= 60) return 'Safety information available';
    if ((route.safetyScore ?? 0) >= 30) return 'Limited safety data';
    return 'Elevated route risk';
  }

  function startNavigation() {
    if (!destination) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=walking`);
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Safe Route" showBack />

      <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="crosshair" size={14} color={colors.teal} />
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.textSoft, flex: 1 }} numberOfLines={1}>
            {originLoading ? 'Getting your location…' : origin?.address ?? 'Location unavailable'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="map-pin" size={14} color={colors.crimson} />
          <TextInput
            placeholder="Search a destination…"
            placeholderTextColor={colors.muted}
            value={destinationQuery}
            onChangeText={(t) => { setDestinationQuery(t); setDestination(null); }}
            onSubmitEditing={searchDestination}
            style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.text, paddingVertical: 4 }}
          />
          <Pressable
            onPress={searchDestination}
            disabled={searching}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.navyMist,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {searching ? <ActivityIndicator size="small" color={colors.navy} /> : <Feather name="search" size={16} color={colors.navy} />}
          </Pressable>
        </View>

        {destinationResults.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
            {destinationResults.map((r, i) => (
              <Pressable key={i} onPress={() => pickDestination(r)} style={{ paddingVertical: 6 }}>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.textSoft }} numberOfLines={1}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {destination && (
          <Pressable
            onPress={findRoutes}
            disabled={loadingRoutes || !origin}
            style={{ backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
          >
            {loadingRoutes ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="navigation" size={14} color="#fff" />}
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>{loadingRoutes ? 'Calculating routes…' : 'Find Safe Route'}</Text>
          </Pressable>
        )}
        {error ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.crimson }}>{error}</Text> : null}
      </View>

      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={{ flex: 1 }}
          initialRegion={origin ? { latitude: origin.lat, longitude: origin.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}
        >
          {origin && <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title="You" pinColor={colors.teal} />}
          {destination && <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.label} pinColor={colors.crimson} />}

          {routes.map((r) => (
            <Polyline
              key={r.id}
              coordinates={r.coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
              strokeColor={r.id === selectedRouteId ? colors.navy : 'rgba(15,30,77,0.25)'}
              strokeWidth={r.id === selectedRouteId ? 5 : 3}
              tappable
              onPress={() => setSelectedRouteId(r.id)}
            />
          ))}

          {selectedRoute?.infraPoints?.map((p, i) => (
            <Marker key={i} coordinate={{ latitude: p.lat, longitude: p.lng }} pinColor={colors.gold} opacity={0.85}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.gold, borderWidth: 2, borderColor: '#fff' }} />
            </Marker>
          ))}
        </MapView>

        {selectedRoute && (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 126 }}>
            <Card style={{ borderColor: colors.borderStrong, backgroundColor: colors.surface }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {(['safest', 'fastest', 'shortest'] as const).map((kind) => {
                  const target = kind === 'safest'
                    ? routesWithSafetyData.find((r) => r.safetyScore === bestScore)
                    : kind === 'fastest'
                      ? fastest
                      : shortest;
                  const active = routeKind(selectedRoute) === kind;
                  return (
                    <Pressable
                      key={kind}
                      onPress={() => target && setSelectedRouteId(target.id)}
                      disabled={!target}
                      style={{
                        flex: 1,
                        minHeight: 36,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.navy : colors.bg,
                        opacity: target ? 1 : 0.45,
                      }}
                    >
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: active ? '#fff' : colors.text, textTransform: 'uppercase' }}>{kind}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Metric label="Time" value={formatDuration(selectedRoute.durationSeconds)} />
                <Metric label="Distance" value={formatDistance(selectedRoute.distanceMeters)} />
                <Metric label="Safety" value={selectedRoute.safetyDataAvailable ? `${selectedRoute.safetyScore}` : '—'} />
              </View>

              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.text, marginTop: 12 }}>Why this route?</Text>
              <View style={{ marginTop: 8, gap: 7 }}>
                <Factor icon="shield" label="Support zones" status={selectedRoute.safetyDataAvailable ? `${selectedRoute.supportPointCount ?? selectedRoute.nearbyInfraCount} police/hospital/fire point${(selectedRoute.supportPointCount ?? selectedRoute.nearbyInfraCount) === 1 ? '' : 's'}` : 'OpenStreetMap unavailable'} />
                <Factor icon="sun" label="Lighting" status={selectedRoute.safetyDataAvailable ? `${selectedRoute.litPointCount ?? 0} mapped lit road/streetlight point${(selectedRoute.litPointCount ?? 0) === 1 ? '' : 's'}` : 'OpenStreetMap unavailable'} />
                <Factor icon="users" label="Public activity" status={selectedRoute.safetyDataAvailable ? `${selectedRoute.publicActivityCount ?? 0} mapped public place${(selectedRoute.publicActivityCount ?? 0) === 1 ? '' : 's'}` : 'OpenStreetMap unavailable'} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Text style={{ flex: 1, fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: selectedRoute.safetyDataAvailable ? colors.tealText : colors.muted }}>
                  {routeStatus(selectedRoute)}
                </Text>
                <Pressable
                  onPress={startNavigation}
                  style={{ minHeight: 40, borderRadius: 10, paddingHorizontal: 14, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Start Navigation</Text>
                  <Feather name="external-link" size={13} color="#fff" />
                </Pressable>
              </View>
            </Card>
          </View>
        )}

        {routes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ position: 'absolute', bottom: 12, left: 0, right: 0 }}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
          >
            {routes.map((r) => (
              <Pressable key={r.id} onPress={() => setSelectedRouteId(r.id)}>
                <Card style={{ width: 210, borderColor: r.id === selectedRouteId ? colors.navy : colors.border, borderWidth: r.id === selectedRouteId ? 2 : 1, backgroundColor: colors.surface }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.navy, textTransform: 'uppercase' }} numberOfLines={1}>{labelFor(r)}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    <View>
                      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, color: colors.text }} numberOfLines={1}>{formatDistance(r.distanceMeters)}</Text>
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Distance</Text>
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, color: colors.text }} numberOfLines={1}>{formatDuration(r.durationSeconds)}</Text>
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Walk time</Text>
                    </View>
                    <View>
                      <Text
                        style={{
                          fontFamily: 'SpaceGrotesk_700Bold',
                          fontSize: 14,
                          color: !r.safetyDataAvailable ? colors.faint : (r.safetyScore ?? 0) >= 60 ? colors.tealText : (r.safetyScore ?? 0) >= 30 ? colors.amberText : colors.crimson,
                        }}
                      >
                        {r.safetyDataAvailable ? r.safetyScore : '—'}
                      </Text>
                      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Safety</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 9, color: colors.faint, marginTop: 6 }} numberOfLines={2}>
                    {r.safetyDataAvailable
                      ? `${r.nearbyInfraCount} support · ${r.litPointCount ?? 0} lighting · ${r.publicActivityCount ?? 0} public places`
                      : 'Safety data unavailable for this route right now — only routing info shown'}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.text }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function Factor({ icon, label, status }: { icon: keyof typeof Feather.glyphMap; label: string; status: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Feather name={icon} size={14} color={colors.navy} />
      <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.text }}>{label}</Text>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: status.includes('unavailable') ? colors.faint : colors.tealText, maxWidth: '52%', textAlign: 'right' }}>{status}</Text>
    </View>
  );
}
