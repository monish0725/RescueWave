import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';
import { findNearby, getCurrentLocation, CurrentLocation } from '@/utils/location';
import { getNearbyCctvCoverage } from '@/api/cameras';
import type { NearbyCctvCoverage, NearbyPlace } from '@/types';

type NearbyCategory = NearbyPlace['kind'] | 'cctv';

const CATEGORIES: Array<{ key: NearbyCategory; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'hospital', label: 'Hospitals', icon: 'plus-square' },
  { key: 'police', label: 'Police', icon: 'shield' },
  { key: 'fire_station', label: 'Fire Stations', icon: 'alert-octagon' },
  { key: 'cctv', label: 'CCTV', icon: 'camera' },
];

export default function NearbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cat?: string }>();
  const initialCategory = (['hospital', 'police', 'fire_station', 'cctv'] as const).includes(params.cat as any)
    ? (params.cat as NearbyCategory)
    : 'hospital';
  const [category, setCategory] = useState<NearbyCategory>(initialCategory);
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [coverage, setCoverage] = useState<NearbyCctvCoverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (kind: NearbyCategory) => {
    setLoading(true);
    setError(null);
    try {
      let loc = location;
      if (!loc) {
        loc = await getCurrentLocation();
        setLocation(loc);
      }
      if (kind === 'cctv') {
        setPlaces([]);
        setCoverage(await getNearbyCctvCoverage(loc.lat, loc.lng));
      } else {
        setCoverage(null);
        const results = await findNearby(kind, loc.lat, loc.lng);
        setPlaces(results);
      }
    } catch (e: any) {
      setError(kind === 'cctv'
        ? e.message ?? 'CCTV coverage requires a connection to retrieve current camera availability.'
        : e.message ?? 'Could not load nearby places.');
      setPlaces([]);
      setCoverage(null);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <Screen scroll={false}>
      <TopBar title="Nearby Help" right={
        <Pressable onPress={() => router.push('/(app)/safe-route')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} hitSlop={8}>
          <Feather name="navigation" size={16} color={colors.navy} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.navy }}>Safe Route</Text>
        </Pressable>
      } />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingBottom: 8 }}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={{ flexBasis: '48%', flexGrow: 1 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: category === c.key ? colors.green : colors.border,
                backgroundColor: category === c.key ? colors.green : colors.surface,
              }}
            >
              <Feather name={c.icon} size={14} color={category === c.key ? '#fff' : colors.muted} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: category === c.key ? '#fff' : colors.muted }}>{c.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {location && (
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, paddingHorizontal: 16, paddingBottom: 8 }}>
          Searching within ~6 km of {location.address}
        </Text>
      )}

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.green} size="large" />
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, marginTop: 12 }}>Finding nearby places…</Text>
          </View>
        ) : error ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.red }}>{error}</Text>
            <Pressable onPress={() => load(category)} style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.green }}>Retry</Text>
            </Pressable>
          </Card>
        ) : category === 'cctv' ? (
          <CctvCoverageSummary coverage={coverage} />
        ) : places.length === 0 ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center' }}>
              No {CATEGORIES.find((c) => c.key === category)?.label.toLowerCase()} found nearby in the map data. Try again in a different area.
            </Text>
          </Card>
        ) : (
          places.map((p) => (
            <Card key={p.id} style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text }}>{p.name}</Text>
              {p.address ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>{p.address}</Text> : null}
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.green, marginTop: 4 }}>{p.distanceKm.toFixed(1)} km away</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(p.lat), lng: String(p.lng), label: p.name } })}
                  style={{ flex: 1 }}
                >
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenLight, borderRadius: 10, paddingVertical: 9 }}>
                    <Feather name="navigation" size={14} color={colors.greenDark} />
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.greenDark }}>Navigate</Text>
                  </View>
                </Pressable>
                {p.phone ? (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${p.phone}`)}
                    style={{ flex: 1 }}
                  >
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: 10, paddingVertical: 9 }}>
                      <Feather name="phone" size={14} color="#fff" />
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Call</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function CctvCoverageSummary({ coverage }: { coverage: NearbyCctvCoverage | null }) {
  if (!coverage || coverage.cameras.length === 0) {
    return (
      <Card style={{ marginTop: 12 }}>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Feather name="camera-off" size={24} color={colors.muted} />
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginTop: 8 }}>CCTV Coverage</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 }}>
            No RescueWave cameras are currently registered nearby.
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 4 }}>
            Registered cameras may be added by authorized organizations or camera owners.
          </Text>
        </View>
      </Card>
    );
  }

  const offlineCount = coverage.cameras.filter((camera) => camera.status === 'offline').length;
  const registeredOnly = coverage.cameras.length - coverage.aiAvailableCount - offlineCount;
  return (
    <>
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="camera" size={20} color={colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text }}>CCTV Coverage</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {coverage.registeredCount} camera{coverage.registeredCount === 1 ? '' : 's'} nearby within ~{coverage.radiusKm} km
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <CoveragePill label="AI available" count={coverage.aiAvailableCount} color={colors.tealText} bg={colors.tealMist} />
          <CoveragePill label="Registered" count={registeredOnly} color={colors.amberText} bg={colors.amberMist} />
          <CoveragePill label="Offline" count={offlineCount} color={colors.muted} bg={colors.bg} />
        </View>
        {coverage.aiAvailableCount === 0 ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.amberText, marginTop: 10 }}>
            Registered cameras are nearby, but AI monitoring is currently unavailable.
          </Text>
        ) : (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.tealText, marginTop: 10 }}>
            Nearby AI camera coverage is available. Live feeds remain restricted.
          </Text>
        )}
      </Card>

      {coverage.cameras.slice(0, 4).map((camera) => (
        <Card key={camera.id} style={{ marginTop: 10 }}>
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.text }}>{camera.code}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>{camera.address || 'Approximate nearby coverage point'}</Text>
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: statusColor(camera.status, camera.ai_available), marginTop: 4 }}>
            {camera.distanceKm.toFixed(1)} km away · {statusLabel(camera.status, camera.ai_available)}
          </Text>
        </Card>
      ))}
    </>
  );
}

function CoveragePill({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={{ flex: 1, minHeight: 52, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color }}>{count}</Text>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 9, color, textAlign: 'center' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function statusLabel(status: NearbyCctvCoverage['cameras'][number]['status'], aiAvailable: boolean) {
  if (status === 'offline') return 'Offline';
  if (aiAvailable) return 'Active · AI monitoring available';
  return 'Registered · AI unavailable';
}

function statusColor(status: NearbyCctvCoverage['cameras'][number]['status'], aiAvailable: boolean) {
  if (status === 'offline') return colors.muted;
  return aiAvailable ? colors.tealText : colors.amberText;
}
