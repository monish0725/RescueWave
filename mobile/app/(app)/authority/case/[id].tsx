import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { getAlertDetail, updateAuthorityCaseStatus } from '@/api/alerts';
import { startLiveShare, stopLiveShare } from '@/utils/liveShare';
import { getCurrentLocation } from '@/utils/location';
import type { AuthorityCaseStatus, ServerAlert, ServerAlertEvent } from '@/types';

const STEPS: { key: AuthorityCaseStatus; label: string }[] = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'en_route', label: 'En Route' },
  { key: 'on_scene', label: 'On Scene' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'closed', label: 'Closed' },
];

export default function AuthorityCaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [alert, setAlert] = useState<ServerAlert | null>(null);
  const [events, setEvents] = useState<ServerAlertEvent[]>([]);
  const [reporter, setReporter] = useState<{ name: string; phone: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getAlertDetail(id);
      setAlert(data.alert);
      setEvents(data.events);
      setReporter(data.reporter ? { name: data.reporter.name, phone: data.reporter.phone } : null);
    } catch (e: any) {
      Alert.alert('Could not load case', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const authorityEvents = events.filter((e) => e.actor_role === 'authority');
  const latestStatus = (authorityEvents[authorityEvents.length - 1]?.status as AuthorityCaseStatus) ?? 'accepted';
  const latestIndex = Math.max(0, STEPS.findIndex((s) => s.key === latestStatus));

  async function advance(status: AuthorityCaseStatus) {
    setUpdating(true);
    try {
      const loc = await getCurrentLocation().catch(() => null);
      const updated = await updateAuthorityCaseStatus(id, status, loc ? { lat: loc.lat, lng: loc.lng } : undefined);
      setAlert(updated);
      await load();
      if (status === 'closed' && shareToken) {
        await stopLiveShare(shareToken);
        setShareToken(null);
      }
    } catch (e: any) {
      Alert.alert('Could not update status', e.message);
    } finally {
      setUpdating(false);
    }
  }

  async function toggleShare() {
    setShareBusy(true);
    try {
      if (shareToken) {
        await stopLiveShare(shareToken);
        setShareToken(null);
      } else {
        const share = await startLiveShare('authority_case', { alertId: id, label: reporter?.name });
        setShareToken(share.share_token);
      }
    } catch (e: any) {
      Alert.alert('Live location sharing', e.message);
    } finally {
      setShareBusy(false);
    }
  }

  if (loading || !alert) {
    return (
      <Screen scroll={false}>
        <TopBar title="Case Details" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.navy} size="large" /></View>
      </Screen>
    );
  }

  const nextStep = STEPS[latestIndex + 1];

  return (
    <Screen scroll={false}>
      <TopBar title="Case Details" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Card style={{ marginBottom: 14 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text }}>{alert.description || (alert.source === 'manual_sos' ? 'Emergency SOS' : 'Incident Report')}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, marginTop: 4 }}>{alert.address ?? 'Location shared'}</Text>
          {reporter ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {reporter.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${reporter.phone}`)} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 10 }}>
                  <Feather name="phone" size={14} color="#fff" />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Call {reporter.name.split(' ')[0]}</Text>
                </Pressable>
              ) : null}
              {alert.lat && alert.lng ? (
                <Pressable onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(alert.lat), lng: String(alert.lng), label: alert.address || 'Emergency location' } })} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10 }}>
                  <Feather name="navigation" size={14} color={colors.text} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.text }}>Navigate</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {alert.photo_url || alert.video_url || alert.voice_url ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {alert.photo_url ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Feather name="camera" size={12} color={colors.muted} /><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>Photo</Text></View> : null}
              {alert.video_url ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Feather name="film" size={12} color={colors.muted} /><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>Video</Text></View> : null}
              {alert.voice_url ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Feather name="mic" size={12} color={colors.muted} /><Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>Voice note</Text></View> : null}
            </View>
          ) : null}
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 14 }}>Case Status</Text>
          {STEPS.map((s, i) => {
            const done = i <= latestIndex;
            return (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i === STEPS.length - 1 ? 0 : 14 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? colors.teal : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  {done && <Feather name="check" size={13} color="#fff" />}
                </View>
                <Text style={{ fontFamily: done ? 'DMSans_700Bold' : 'DMSans_400Regular', fontSize: 13, color: done ? colors.text : colors.faint }}>{s.label}</Text>
              </View>
            );
          })}
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.text }}>Share live location</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {shareToken ? 'Sharing — visible to the reporter.' : 'Let the reporter see your unit approaching.'}
              </Text>
            </View>
            <Button label={shareToken ? 'Stop' : 'Start'} variant={shareToken ? 'danger' : 'primary'} onPress={toggleShare} loading={shareBusy} style={{ paddingHorizontal: 18, paddingVertical: 10 }} />
          </View>
        </Card>

        {latestStatus !== 'closed' && nextStep && (
          <Button label={`Mark as ${nextStep.label}`} onPress={() => advance(nextStep.key)} loading={updating} style={{ marginBottom: 10 }} />
        )}
        {latestStatus === 'closed' && (
          <Card style={{ backgroundColor: colors.tealMist, borderColor: colors.teal, alignItems: 'center' }}>
            <Feather name="check-circle" size={22} color={colors.teal} />
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.tealText, marginTop: 6 }}>Case closed</Text>
          </Card>
        )}
        {latestStatus !== 'closed' && (
          <Button label="Close Case" variant="outline" onPress={() => advance('closed')} loading={updating} />
        )}
      </ScrollView>
    </Screen>
  );
}
