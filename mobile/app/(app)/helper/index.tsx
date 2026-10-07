import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { getMyHelperStatus, setHelperAvailability, pingHelperLocation } from '@/api/helpers';
import { getHelperAssignments, acceptAssignment, rejectAssignment } from '@/api/alerts';
import { getCurrentLocation } from '@/utils/location';
import type { AuthUser, HelperApplication, ServerAlert } from '@/types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  available: { label: 'Available', color: colors.teal },
  busy: { label: 'Busy', color: colors.amber },
  offline: { label: 'Offline', color: colors.muted },
};

export default function HelperHubScreen() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [application, setApplication] = useState<HelperApplication | null>(null);
  const [open, setOpen] = useState<ServerAlert[]>([]);
  const [assigned, setAssigned] = useState<ServerAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getMyHelperStatus();
      setProfile(status.profile);
      setApplication(status.application);
      if (status.profile.role === 'helper' && status.profile.helper_verified) {
        const a = await getHelperAssignments();
        setOpen(a.open);
        setAssigned(a.assigned);
      }
    } catch {
      // surfaced via empty state below
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isApprovedHelper = profile?.role === 'helper' && !!profile.helper_verified;

  // While this screen is open and the helper is Available, keep pinging an
  // approximate location every 60s so nearby-matching for new SOS alerts
  // stays accurate. This is separate from — and lighter than — the
  // continuous background tracking used specifically during an active
  // mission (see helper/mission/[id].tsx), which needs background
  // permission; this is foreground-only.
  useFocusEffect(
    useCallback(() => {
      if (!isApprovedHelper || profile?.helper_status !== 'available') return;
      const ping = async () => {
        try {
          const loc = await getCurrentLocation();
          await pingHelperLocation(loc.lat, loc.lng);
        } catch {
          // location unavailable this cycle — try again next interval
        }
      };
      ping();
      pingTimer.current = setInterval(ping, 60000);
      return () => {
        if (pingTimer.current) clearInterval(pingTimer.current);
      };
    }, [isApprovedHelper, profile?.helper_status])
  );

  async function changeStatus(status: 'available' | 'busy' | 'offline') {
    setStatusUpdating(true);
    try {
      if (status === 'available') {
        const loc = await getCurrentLocation();
        await pingHelperLocation(loc.lat, loc.lng);
      }
      await setHelperAvailability(status);
      await load();
      await refreshProfile();
    } catch (e: any) {
      Alert.alert('Could not update status', e.message ?? 'Please check your location permission and try again.');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onAccept(alertId: string) {
    try {
      await acceptAssignment(alertId);
      router.push(`/(app)/helper/mission/${alertId}`);
    } catch (e: any) {
      Alert.alert('Could not accept', e.message);
    }
  }

  async function onReject(alertId: string) {
    await rejectAssignment(alertId);
    load();
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <TopBar title="Helper Dashboard" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.navy} size="large" /></View>
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen scroll={false}>
        <TopBar title="Helper Dashboard" showBack />
        <EmptyState icon="users" title="You haven't applied yet" subtitle="Apply to become a Helper from your Profile." />
      </Screen>
    );
  }

  if (application.status === 'pending') {
    return (
      <Screen scroll={false}>
        <TopBar title="Helper Dashboard" showBack />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.amberMist, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Feather name="clock" size={32} color={colors.amber} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' }}>Application under review</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>
            Submitted {new Date(application.created_at).toLocaleDateString()}. Your Helper application is pending admin verification. You will become a verified Helper only after approval.
          </Text>
        </View>
      </Screen>
    );
  }

  if (application.status === 'rejected') {
    return (
      <Screen scroll={false}>
        <TopBar title="Helper Dashboard" showBack />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.crimsonMist, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Feather name="x-circle" size={32} color={colors.crimson} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' }}>Application not approved</Text>
          {application.admin_note ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>{application.admin_note}</Text> : null}
          <Pressable onPress={() => router.push('/(app)/helper-apply')} style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.navy }}>Apply again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  // Approved
  const skills: string[] = profile?.helper_skills ? JSON.parse(profile.helper_skills) : [];
  const currentMission = assigned[0];

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}>
      <TopBar title="Helper Dashboard" showBack />
      <View style={{ padding: 16, gap: 14 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="shield" size={14} color={colors.gold} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.goldText }}>VERIFIED HELPER</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_META[profile!.helper_status].color }} />
              <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text }}>{STATUS_META[profile!.helper_status].label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['available', 'busy', 'offline'] as const).map((s) => (
              <Pressable
                key={s}
                disabled={statusUpdating}
                onPress={() => changeStatus(s)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: profile!.helper_status === s ? colors.navy : colors.bg, borderWidth: 1, borderColor: profile!.helper_status === s ? colors.navy : colors.border }}
              >
                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: profile!.helper_status === s ? '#fff' : colors.textSoft, textTransform: 'capitalize' }}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: colors.text }}>{profile?.emergencies_attended ?? 0}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Emergencies Attended</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: colors.text }}>{profile?.people_helped ?? 0}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>People Helped</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {skills.map((s) => (
              <View key={s} style={{ backgroundColor: colors.navyMist, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: colors.navy, textTransform: 'capitalize' }}>{s.replace('_', ' ')}</Text>
              </View>
            ))}
          </View>
        </Card>

        {currentMission && (
          <Pressable onPress={() => router.push(`/(app)/helper/mission/${currentMission.id}`)}>
            <Card style={{ backgroundColor: colors.crimsonMist, borderColor: colors.crimson }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="navigation" size={20} color={colors.crimson} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.crimson }}>Active mission in progress</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.crimson, marginTop: 2 }}>{currentMission.address ?? 'Location shared'}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.crimson} />
              </View>
            </Card>
          </Pressable>
        )}

        <View>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginBottom: 10 }}>Nearby Open Alerts</Text>
          {open.length === 0 ? (
            <Card><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center' }}>No open SOS alerts nearby right now.</Text></Card>
          ) : (
            open.map((a) => (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.crimsonMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="phone-call" size={16} color={colors.crimson} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: colors.text }}>{a.description || 'Emergency SOS'}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      {a.address ?? 'Location shared'}{typeof a.distanceKm === 'number' ? ` · ${a.distanceKm.toFixed(1)} km away` : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable onPress={() => onAccept(a.id)} style={{ flex: 1, backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => onReject(a.id)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.muted }}>Reject</Text>
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}
