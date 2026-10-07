import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { getAlertDetail, cancelServerAlert } from '@/api/alerts';
import { AlertsRepo } from '@/db/database';
import type { AlertRecord, AssignedHelperInfo, AssignedAuthorityInfo, ServerAlert, ServerAlertEvent } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  open: 'Waiting for a Helper',
  accepted: 'Helper accepted',
  on_the_way: 'Helper on the way',
  arrived: 'Helper arrived',
  assisting: 'Helper assisting',
  assigned: 'Helper assigned',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function ReporterAlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [alert, setAlert] = useState<ServerAlert | null>(null);
  const [localAlert, setLocalAlert] = useState<AlertRecord | null>(null);
  const [events, setEvents] = useState<ServerAlertEvent[]>([]);
  const [helper, setHelper] = useState<AssignedHelperInfo | null>(null);
  const [authority, setAuthority] = useState<AssignedAuthorityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLocalAlert(AlertsRepo.get(id) ?? null);
    try {
      const data = await getAlertDetail(id);
      setAlert(data.alert);
      setEvents(data.events);
      setHelper(data.helper);
      setAuthority(data.authority);
    } catch {
      setAlert(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onCancel() {
    Alert.alert('Cancel this SOS?', 'This tells your Helper and RescueWave the emergency is over.', [
      { text: 'Keep it active', style: 'cancel' },
      {
        text: 'Cancel SOS', style: 'destructive', onPress: async () => {
          setCancelling(true);
          try {
            await cancelServerAlert(id);
            await load();
          } catch (e: any) {
            Alert.alert('Could not cancel', e.message);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <TopBar title="Alert Status" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.navy} size="large" /></View>
      </Screen>
    );
  }

  if (!alert && localAlert) {
    return (
      <Screen scroll={false}>
        <TopBar title={localAlert.type === 'report' ? 'Report Status' : 'SOS Status'} showBack />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Card style={{ marginBottom: 14, backgroundColor: localAlert.type === 'sos' ? colors.crimsonMist : colors.amberMist, borderColor: localAlert.type === 'sos' ? colors.crimson : colors.amber }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.text }}>{localAlert.type === 'report' ? 'Incident Reported' : 'SOS Alert'}</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 4 }}>{localAlert.address ?? 'No location captured'}</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>Created {new Date(localAlert.created_at).toLocaleString()}</Text>
          </Card>
          <Card style={{ marginBottom: 14 }}>
            <DetailLine label="What happened" value={localAlert.description ?? (localAlert.type === 'sos' ? 'Emergency SOS' : 'Incident report')} />
            <DetailLine label="Severity" value={localAlert.type === 'sos' ? 'CRITICAL' : severityForLocal(localAlert)} />
            <DetailLine label="Verification" value={localAlert.server_alert_id ? 'Synced to RescueWave server' : 'Saved on this device'} />
            <DetailLine label="Status" value={localAlert.status === 'active' ? 'SUBMITTED' : 'RESOLVED'} last />
          </Card>
          {localAlert.lat && localAlert.lng ? (
            <Button
              label="Find Safer Route"
              onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(localAlert.lat), lng: String(localAlert.lng), label: localAlert.address ?? 'Alert location' } })}
            />
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  if (!alert) {
    return (
      <Screen scroll={false}>
        <TopBar title="Alert Status" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, textAlign: 'center' }}>This alert is not available on this device.</Text>
        </View>
      </Screen>
    );
  }

  const latestEvent = events[events.length - 1];
  const statusText = STATUS_LABEL[latestEvent?.status ?? alert.status] ?? alert.status;

  return (
    <Screen scroll={false}>
      <TopBar title={alert.source === 'citizen_report' ? 'Report Status' : 'SOS Status'} showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <Card style={{ marginBottom: 14, backgroundColor: alert.status === 'completed' ? colors.tealMist : alert.status === 'cancelled' ? colors.bg : colors.crimsonMist, borderColor: alert.status === 'completed' ? colors.teal : alert.status === 'cancelled' ? colors.border : colors.crimson }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.text }}>{statusText}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 4 }}>{alert.address ?? 'Location shared'}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>Raised {new Date(alert.created_at).toLocaleString()}</Text>
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <DetailLine label="What happened" value={alert.description ?? (alert.source === 'manual_sos' ? 'Emergency SOS' : 'Incident report')} />
          <DetailLine label="Severity" value={(alert.severity ?? (alert.source === 'manual_sos' ? 'critical' : 'low')).toUpperCase()} />
          <DetailLine label="Verification" value={alert.report_status.replace(/_/g, ' ').toUpperCase()} />
          <DetailLine label="Distance" value={typeof alert.distanceKm === 'number' ? `${alert.distanceKm.toFixed(1)} km away` : 'Distance unavailable'} last />
        </Card>

        {helper && (
          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 10 }}>Your Helper</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: colors.navy }}>{helper.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: colors.text }}>{helper.name}</Text>
                {helper.helper_location_updated_at ? (
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>Location updated {new Date(helper.helper_location_updated_at).toLocaleTimeString()}</Text>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {helper.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${helper.phone}`)} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 10 }}>
                  <Feather name="phone" size={14} color="#fff" />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Call Helper</Text>
                </Pressable>
              ) : null}
              {helper.helper_lat && helper.helper_lng ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(helper.helper_lat), lng: String(helper.helper_lng), label: helper.name } })}
                  style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10 }}
                >
                  <Feather name="map-pin" size={14} color={colors.text} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.text }}>View on Map</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        )}

        {authority && (
          <Card style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 10 }}>Assigned Authority</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goldMist, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="shield" size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: colors.text }}>{authority.authority_org || authority.name}</Text>
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, textTransform: 'capitalize' }}>{authority.authority_type}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {authority.phone ? (
                <Pressable onPress={() => Linking.openURL(`tel:${authority.phone}`)} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 10 }}>
                  <Feather name="phone" size={14} color="#fff" />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Call</Text>
                </Pressable>
              ) : null}
              {authority.authority_lat && authority.authority_lng ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(authority.authority_lat), lng: String(authority.authority_lng), label: authority.authority_org || authority.name } })}
                  style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10 }}
                >
                  <Feather name="map-pin" size={14} color={colors.text} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.text }}>View on Map</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        )}

        <Card style={{ marginBottom: 14 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 12 }}>Timeline</Text>
          {events.map((e, i) => (
            <View key={e.id} style={{ flexDirection: 'row', gap: 10, marginBottom: i === events.length - 1 ? 0 : 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.navy, marginTop: 5 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text, textTransform: 'capitalize' }}>{e.status.replace(/_/g, ' ')}</Text>
                {e.note ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 1 }}>{e.note}</Text> : null}
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.faint, marginTop: 1 }}>{new Date(e.created_at).toLocaleTimeString()}</Text>
              </View>
            </View>
          ))}
        </Card>

        {!['completed', 'cancelled'].includes(alert.status) && (
          <Button label="Cancel SOS" variant="danger" onPress={onCancel} loading={cancelling} />
        )}
        {alert.lat && alert.lng ? (
          <Button
            label="Find Safer Route"
            variant="outline"
            onPress={() => router.push({ pathname: '/(app)/safe-route', params: { lat: String(alert.lat), lng: String(alert.lng), label: alert.address ?? 'Alert location' } })}
            style={{ marginTop: 10 }}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function severityForLocal(alert: AlertRecord): string {
  if (alert.category === 'medical' || alert.category === 'fire' || alert.category === 'accident') return 'HIGH';
  if (alert.category === 'harassment' || alert.category === 'suspicious_activity' || alert.category === 'violence') return 'MEDIUM';
  return 'LOW';
}

function DetailLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
