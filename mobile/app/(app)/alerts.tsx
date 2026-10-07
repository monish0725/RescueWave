import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { AlertsRepo } from '@/db/database';
import type { AlertRecord } from '@/types';

const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical', accident: 'Accident', harassment: 'Harassment / Women Safety', fire: 'Fire', theft: 'Theft', other: 'Other',
};

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [tab, setTab] = useState<'nearby' | 'reports'>('nearby');

  const load = useCallback(() => setAlerts(AlertsRepo.all()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = alerts.filter((a) => (tab === 'reports' ? a.type === 'report' : a.type === 'sos' || a.server_alert_id));

  function resolve(id: string) {
    AlertsRepo.setStatus(id, 'resolved');
    load();
  }
  function remove(id: string) {
    Alert.alert('Delete alert?', 'This removes it from your history permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { AlertsRepo.remove(id); load(); } },
    ]);
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Alerts" right={
        <IconButton name="bell" onPress={() => router.push('/(app)/notifications')} color={colors.text} backgroundColor={colors.bg} />
      } />
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 }}>
        {([
          ['nearby', 'Nearby Alerts'],
          ['reports', 'My Reports'],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{ flex: 1 }}
          >
            <View style={{ minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: tab === key ? colors.navy : colors.border, backgroundColor: tab === key ? colors.navy : colors.surface }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: tab === key ? '#fff' : colors.muted }}>{label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {visible.length === 0 ? (
          <EmptyState icon="bell-off" title={tab === 'reports' ? 'No reports yet' : 'No nearby alerts'} subtitle={tab === 'reports' ? 'Incident reports you submit will appear here with their current local status.' : 'Synced emergency alerts relevant to you will appear here when available.'} />
        ) : (
          visible.map((a) => (
            <Pressable key={a.id} onPress={() => router.push({ pathname: '/(app)/alert/[id]', params: { id: a.server_alert_id ?? a.id } })}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: a.type === 'sos' ? '#ffebee' : '#fff8e1', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={a.type === 'sos' ? 'phone-call' : 'alert-triangle'} size={17} color={a.type === 'sos' ? colors.red : colors.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text, paddingRight: 8 }}>
                      {a.type === 'sos' ? 'Emergency SOS' : CATEGORY_LABEL[a.category ?? 'other']}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: a.status === 'active' ? '#ffebee' : colors.greenLight }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: a.status === 'active' ? colors.red : colors.greenDark, textTransform: 'uppercase' }}>{a.status}</Text>
                    </View>
                  </View>
                  {a.description ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>{a.description}</Text> : null}
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>
                    {a.address ?? 'No location captured'} · {new Date(a.created_at).toLocaleString()}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Badge label={a.server_alert_id ? 'Synced' : 'Local'} tone={a.server_alert_id ? 'teal' : 'muted'} />
                    <Badge label={a.status === 'active' ? 'SUBMITTED' : 'RESOLVED'} tone={a.status === 'active' ? 'amber' : 'teal'} />
                    <Badge label={severityFor(a)} tone={severityFor(a) === 'CRITICAL' || severityFor(a) === 'HIGH' ? 'red' : 'muted'} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                    {a.status === 'active' && (
                      <Pressable onPress={() => resolve(a.id)}>
                        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.green }}>Mark resolved</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => remove(a.id)}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.red }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Card>
            </Pressable>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

function severityFor(alert: AlertRecord): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (alert.type === 'sos') return 'CRITICAL';
  if (alert.category === 'medical' || alert.category === 'fire' || alert.category === 'accident') return 'HIGH';
  if (alert.category === 'harassment' || alert.category === 'suspicious_activity' || alert.category === 'violence') return 'MEDIUM';
  return 'LOW';
}

function Badge({ label, tone }: { label: string; tone: 'red' | 'amber' | 'teal' | 'muted' }) {
  const style = tone === 'red'
    ? { bg: colors.crimsonMist, fg: colors.crimson }
    : tone === 'amber'
      ? { bg: colors.amberMist, fg: colors.amberText }
      : tone === 'teal'
        ? { bg: colors.tealMist, fg: colors.tealText }
        : { bg: colors.bg, fg: colors.muted };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: style.bg }}>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: style.fg }}>{label}</Text>
    </View>
  );
}
