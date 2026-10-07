import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { getMyAuthorityStatus, pingAuthorityLocation } from '@/api/authorities';
import { getAuthorityAssignments, acceptAuthorityCase } from '@/api/alerts';
import { getCurrentLocation } from '@/utils/location';
import type { AuthUser, AuthorityApplication, ServerAlert } from '@/types';

const TYPE_LABEL: Record<string, string> = { police: 'Police', hospital: 'Hospital', fire: 'Fire Department' };
const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical', accident: 'Accident', harassment: 'Harassment', violence: 'Violence',
  fire: 'Fire', theft: 'Theft', suspicious_activity: 'Suspicious Activity', other: 'Other',
};

export default function AuthorityHubScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [application, setApplication] = useState<AuthorityApplication | null>(null);
  const [open, setOpen] = useState<ServerAlert[]>([]);
  const [assigned, setAssigned] = useState<ServerAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await getMyAuthorityStatus();
      setProfile(status.profile);
      setApplication(status.application);
      if (status.profile.role === 'authority' && status.profile.authority_verified) {
        const a = await getAuthorityAssignments();
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

  const isApprovedAuthority = profile?.role === 'authority' && !!profile.authority_verified;

  // Keep the station's location fresh while this screen is open, same
  // lightweight foreground-only pattern as the Helper Hub.
  useFocusEffect(
    useCallback(() => {
      if (!isApprovedAuthority) return;
      const ping = async () => {
        try {
          const loc = await getCurrentLocation();
          await pingAuthorityLocation(loc.lat, loc.lng);
        } catch {
          // try again next interval
        }
      };
      ping();
      pingTimer.current = setInterval(ping, 60000);
      return () => {
        if (pingTimer.current) clearInterval(pingTimer.current);
      };
    }, [isApprovedAuthority])
  );

  async function onAccept(alertId: string) {
    try {
      await acceptAuthorityCase(alertId);
      router.push(`/(app)/authority/case/${alertId}`);
    } catch (e: any) {
      Alert.alert('Could not accept case', e.message);
    }
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <TopBar title="Authority Dashboard" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.navy} size="large" /></View>
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen scroll={false}>
        <TopBar title="Authority Dashboard" showBack />
        <EmptyState icon="shield" title="Not registered yet" subtitle="Register your organization as a Police, Hospital or Fire Department from your Profile." />
      </Screen>
    );
  }

  if (application.status === 'pending') {
    return (
      <Screen scroll={false}>
        <TopBar title="Authority Dashboard" showBack />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.amberMist, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Feather name="clock" size={32} color={colors.amber} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' }}>Application under review</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>
            Submitted {new Date(application.created_at).toLocaleDateString()}. Authority application pending verification. You will get Authority access only after admin approval.
          </Text>
        </View>
      </Screen>
    );
  }

  if (application.status === 'rejected') {
    return (
      <Screen scroll={false}>
        <TopBar title="Authority Dashboard" showBack />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.crimsonMist, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Feather name="x-circle" size={32} color={colors.crimson} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' }}>Application not approved</Text>
          {application.admin_note ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>{application.admin_note}</Text> : null}
          <Pressable onPress={() => router.push('/(app)/authority-apply')} style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.navy }}>Apply again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const currentCase = assigned[0];

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}>
      <TopBar title="Authority Dashboard" showBack />
      <View style={{ padding: 16, gap: 14 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Feather name="shield" size={14} color={colors.gold} />
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.goldText }}>VERIFIED {TYPE_LABEL[profile!.authority_type ?? 'police'].toUpperCase()}</Text>
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: colors.text }}>{profile?.authority_org}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: colors.text }}>{profile?.cases_closed ?? 0}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Cases Closed</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: colors.text }}>{assigned.length}</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.muted }}>Active Cases</Text>
            </View>
          </View>
        </Card>

        {currentCase && (
          <Pressable onPress={() => router.push(`/(app)/authority/case/${currentCase.id}`)}>
            <Card style={{ backgroundColor: colors.crimsonMist, borderColor: colors.crimson }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="folder" size={20} color={colors.crimson} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.crimson }}>Active case in progress</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.crimson, marginTop: 2 }}>{currentCase.address ?? 'Location shared'}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.crimson} />
              </View>
            </Card>
          </Pressable>
        )}

        <View>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginBottom: 10 }}>Open Cases</Text>
          {open.length === 0 ? (
            <Card><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center' }}>No open cases matching your jurisdiction right now.</Text></Card>
          ) : (
            open.map((a) => (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: a.source === 'manual_sos' ? colors.crimsonMist : colors.amberMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={a.source === 'manual_sos' ? 'phone-call' : 'file-text'} size={16} color={a.source === 'manual_sos' ? colors.crimson : colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: colors.text }}>
                      {a.source === 'manual_sos' ? 'Emergency SOS' : CATEGORY_LABEL[a.category ?? 'other']}
                    </Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>{a.description || a.address || 'No description'}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {a.address ?? 'Location shared'}{typeof a.distanceKm === 'number' ? ` · ${a.distanceKm.toFixed(1)} km away` : ''}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => onAccept(a.id)} style={{ marginTop: 10, backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Accept Case</Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}
