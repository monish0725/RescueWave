import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import SafetyScoreRing from '@/components/SafetyScoreRing';
import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { AlertsRepo, MissingRepo, ContactsRepo } from '@/db/database';
import { getCurrentLocation, CurrentLocation } from '@/utils/location';
import { computeSafetySnapshot } from '@/utils/safetyScore';
import { getActiveShareCount, stopAllLiveShares } from '@/utils/liveShare';
import type { AlertRecord, Contact } from '@/types';
import { EMERGENCY_SERVICES_NUMBER } from '@/constants/emergency';

const EMERGENCY_NUMBERS = [
  { label: 'All-in-one Emergency', number: EMERGENCY_SERVICES_NUMBER },
  { label: 'Ambulance', number: '108' },
  { label: 'Police', number: '100' },
  { label: 'Fire', number: '101' },
];

const NEARBY_SHORTCUTS: Array<{ icon: keyof typeof Feather.glyphMap; label: string; cat: string }> = [
  { icon: 'shield', label: 'Police', cat: 'police' },
  { icon: 'plus-square', label: 'Hospitals', cat: 'hospital' },
  { icon: 'alert-octagon', label: 'Fire', cat: 'fire_station' },
  { icon: 'camera', label: 'CCTV Coverage', cat: 'cctv' },
];

const QUICK_ACTIONS: Array<{ icon: keyof typeof Feather.glyphMap; label: string; bg: string; tint: string; href: string }> = [
  { icon: 'map', label: 'Safe Route', bg: colors.tealMist, tint: colors.teal, href: '/(app)/safe-route' },
  { icon: 'alert-triangle', label: 'Report Incident', bg: colors.amberMist, tint: colors.amber, href: '/(app)/report' },
  { icon: 'search', label: 'Missing Person', bg: colors.blueMist, tint: colors.blue, href: '/(app)/missing' },
  { icon: 'users', label: 'Nearby Help', bg: colors.navyMist, tint: colors.navy, href: '/(app)/routes' },
  { icon: 'camera', label: 'CCTV AI', bg: colors.navyMist, tint: colors.navy, href: '/(app)/cameras' },
  { icon: 'bell', label: 'Alerts', bg: colors.goldMist, tint: colors.gold, href: '/(app)/alerts' },
];

const SAFETY_TIPS = [
  'Share your live trip details with a trusted contact before heading out alone, especially at night.',
  'Keep your phone charged above 20% when travelling — a dead battery means no SOS.',
  'Save at least 2 emergency contacts so RescueWave always has someone to reach.',
  'Walk on well-lit, populated routes where possible, even if slightly longer.',
];

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState<AlertRecord[]>([]);
  const [topContacts, setTopContacts] = useState<Contact[]>([]);
  const [counts, setCounts] = useState({ contacts: 0, missing: 0, activeAlerts: 0, resolvedAlerts: 0 });
  const [activeShares, setActiveShares] = useState(0);
  const [stoppingShares, setStoppingShares] = useState(false);
  const [tipIndex] = useState(() => Math.floor(Math.random() * SAFETY_TIPS.length));

  const refreshLocalData = useCallback(() => {
    const allAlerts = AlertsRepo.all();
    setRecentAlerts(allAlerts.slice(0, 3));
    setTopContacts(ContactsRepo.all().slice(0, 3));
    setActiveShares(getActiveShareCount());
    setCounts({
      contacts: ContactsRepo.all().length,
      missing: MissingRepo.all().filter((m) => m.status === 'missing').length,
      activeAlerts: AlertsRepo.countActive(),
      resolvedAlerts: allAlerts.filter((a) => a.status === 'resolved').length,
    });
  }, []);

  const loadLocation = useCallback(async () => {
    setLocLoading(true);
    setLocError(null);
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
    } catch (e: any) {
      setLocError(e.message);
    } finally {
      setLocLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refreshLocalData(); }, [refreshLocalData]));
  useFocusEffect(useCallback(() => { if (!location) loadLocation(); }, [location, loadLocation]));

  const snapshot = useMemo(() => computeSafetySnapshot(user, !!location), [user, location]);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <Screen>
      <LinearGradient colors={[colors.navy, colors.navyDeep]} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Welcome back,</Text>
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: '#fff', marginTop: 2 }}>{firstName}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => router.push('/(app)/notifications')}
              hitSlop={10}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.20)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="bell" size={19} color="#fff" />
                {counts.activeAlerts > 0 || counts.missing > 0 ? (
                  <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />
                ) : null}
              </View>
            </Pressable>
            <SafetyScoreRing score={snapshot.score} label={snapshot.label} />
          </View>
        </View>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: 14, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="map-pin" size={14} color={colors.gold} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your location</Text>
          </View>
          {locLoading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          ) : locError ? (
            <>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{locError}</Text>
              <Pressable onPress={loadLocation}><Text style={{ color: colors.gold, fontFamily: 'DMSans_700Bold', fontSize: 13, marginTop: 6 }}>Try again</Text></Pressable>
            </>
          ) : (
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: '#fff', marginTop: 6 }}>{location?.address}</Text>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/(app)/sos')}
        >
          <View style={{ marginTop: 14, backgroundColor: colors.crimson, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: colors.crimson, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
            <Feather name="phone-call" size={20} color="#fff" />
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: '#fff', letterSpacing: 0.3 }}>QUICK SOS</Text>
          </View>
        </Pressable>
      </LinearGradient>

      <View style={{ padding: 20, gap: 16 }}>
        <Card style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: snapshot.areaStatus === 'SAFE' ? colors.tealMist : snapshot.areaStatus === 'SAFETY DATA LIMITED' ? colors.navyMist : colors.amberMist, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={snapshot.areaStatus === 'SAFE' ? 'shield' : 'alert-triangle'} size={21} color={snapshot.areaStatus === 'SAFE' ? colors.teal : snapshot.areaStatus === 'SAFETY DATA LIMITED' ? colors.navy : colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current safety status</Text>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: colors.text, marginTop: 2 }}>{snapshot.areaStatus}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 3 }}>{snapshot.statusReason}</Text>
            </View>
          </View>
        </Card>

        <Pressable onPress={() => router.push('/(app)/safe-route')}>
          <Card style={{ backgroundColor: colors.tealMist, borderColor: colors.teal, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="navigation" size={22} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: colors.tealText }}>Find a safer route</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.tealText, marginTop: 2 }}>Compare route options using real routing and available support-zone data.</Text>
            </View>
            <Feather name="arrow-right" size={18} color={colors.teal} />
          </Card>
        </Pressable>

        {activeShares > 0 && (
          <Pressable
            onPress={() => {
              setStoppingShares(true);
              stopAllLiveShares().finally(() => { setStoppingShares(false); refreshLocalData(); });
            }}
            disabled={stoppingShares}
          >
            <Card style={{ backgroundColor: colors.crimsonMist, borderColor: colors.crimson, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {stoppingShares ? <ActivityIndicator size="small" color={colors.crimson} /> : <Feather name="radio" size={18} color={colors.crimson} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.crimson }}>
                  Sharing live location ({activeShares} active)
                </Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.crimson, marginTop: 2 }}>Tap to stop all sharing</Text>
              </View>
            </Card>
          </Pressable>
        )}

        {/* Nearby shortcuts */}
        <View>
          <SectionTitle title="Nearby Help" actionLabel="See all" onAction={() => router.push('/(app)/routes')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {NEARBY_SHORTCUTS.map((n) => (
              <Pressable
                key={n.cat}
                onPress={() => router.push({ pathname: '/(app)/routes', params: { cat: n.cat } })}
                style={{ width: '48%' }}
              >
                <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={n.icon} size={17} color={colors.navy} />
                  </View>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: colors.textSoft }}>{n.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View>
          <SectionTitle title="Quick Actions" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            {QUICK_ACTIONS.map((q) => (
              <Pressable
                key={q.label}
                onPress={() => router.push(q.href as any)}
                style={{ width: '31.5%' }}
              >
                <View style={{ minHeight: 92, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: q.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={q.icon} size={20} color={q.tint} />
                  </View>
                  <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, lineHeight: 14, color: colors.muted, textAlign: 'center' }} numberOfLines={2}>{q.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Emergency contacts */}
        <View>
          <SectionTitle title="Emergency Contacts" actionLabel="Manage" onAction={() => router.push('/(app)/contacts')} />
          {topContacts.length === 0 ? (
            <Card>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: 10 }}>No emergency contacts saved yet.</Text>
              <Pressable onPress={() => router.push('/(app)/contacts')} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="user-plus" size={14} color={colors.navy} />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.navy }}>Add a contact</Text>
              </Pressable>
            </Card>
          ) : (
            <Card style={{ gap: 2 }}>
              {topContacts.map((c, i) => (
                <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: colors.navy }}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: colors.text }}>{c.name}</Text>
                    {c.relation ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>{c.relation}</Text> : null}
                  </View>
                  <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} style={{ padding: 6 }}>
                    <Feather name="phone" size={16} color={colors.teal} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Emergency dashboard summary */}
        <View>
          <SectionTitle title="Emergency Statistics" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatBlock value={counts.activeAlerts} label="Active Alerts" tint={counts.activeAlerts > 0 ? colors.crimson : colors.text} />
            <StatBlock value={counts.resolvedAlerts} label="Resolved" tint={colors.tealText} />
            <StatBlock value={counts.contacts} label="Contacts" tint={colors.text} />
            <StatBlock value={counts.missing} label="Missing Cases" tint={counts.missing > 0 ? colors.amberText : colors.text} />
          </View>
        </View>

        {/* Recent activity */}
        <View>
          <SectionTitle title="Recent Alerts" actionLabel="See all" onAction={() => router.push('/(app)/alerts')} />
          {recentAlerts.length === 0 ? (
            <Card><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center' }}>No alerts raised yet. Your SOS and incident reports will show up here.</Text></Card>
          ) : (
            recentAlerts.map((a, i) => (
              <Animated.View key={a.id} entering={FadeInDown.delay(i * 60).duration(320)}>
                <Card style={{ marginBottom: 8, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: a.type === 'sos' ? colors.crimsonMist : colors.amberMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={a.type === 'sos' ? 'phone-call' : 'alert-triangle'} size={16} color={a.type === 'sos' ? colors.crimson : colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: colors.text }}>{a.type === 'sos' ? 'SOS Alert' : `Report: ${a.category ?? 'Incident'}`}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{a.address ?? 'Location unavailable'}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>{new Date(a.created_at).toLocaleString()} · {a.status}</Text>
                  </View>
                </Card>
              </Animated.View>
            ))
          )}
        </View>

        {/* Missing person summary */}
        {counts.missing > 0 && (
          <Pressable onPress={() => router.push('/(app)/missing')}>
            <Card style={{ backgroundColor: colors.blueMist, borderColor: colors.blue, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Feather name="search" size={20} color={colors.blue} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.blue }}>{counts.missing} active missing person {counts.missing === 1 ? 'report' : 'reports'}</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.blue, marginTop: 2 }}>Tap to view your reports and updates.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.blue} />
            </Card>
          </Pressable>
        )}

        {/* Emergency numbers */}
        <View>
          <SectionTitle title="Emergency Numbers" />
          <Card>
            {EMERGENCY_NUMBERS.map((n, i) => (
              <Pressable
                key={n.number}
                onPress={() => Linking.openURL(`tel:${n.number}`)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
              >
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text }}>{n.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navyMist, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
                  <Feather name="phone" size={12} color={colors.navy} />
                  <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: colors.navy }}>{n.number}</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </View>

        {/* Safety tip */}
        <Card style={{ backgroundColor: colors.goldMist, borderColor: colors.gold }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Feather name="info" size={18} color="#8a6d1e" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: '#8a6d1e' }}>Safety Update</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#8a6d1e', marginTop: 2 }}>{SAFETY_TIPS[tipIndex]}</Text>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function SectionTitle({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text }}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction}><Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.navy }}>{actionLabel}</Text></Pressable>
      ) : null}
    </View>
  );
}

function StatBlock({ value, label, tint }: { value: number; label: string; tint: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: tint }}>{value}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 9, color: colors.muted, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}
