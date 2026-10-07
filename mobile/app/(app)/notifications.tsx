import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { NotificationsRepo } from '@/db/database';
import type { AppNotification, NotificationType } from '@/types';

const TYPE_ICON: Record<NotificationType, keyof typeof Feather.glyphMap> = {
  sos: 'phone-call', missing: 'search', contact: 'users', authority: 'shield', report: 'alert-triangle', system: 'info',
};

export default function NotificationsScreen() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const load = useCallback(() => setItems(NotificationsRepo.all()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function markRead(id: string) {
    NotificationsRepo.markRead(id);
    load();
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Notification Center" showBack right={
        items.length > 0 ? (
          <Pressable onPress={() => { NotificationsRepo.markAllRead(); load(); }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.green }}>Mark all read</Text>
          </Pressable>
        ) : undefined
      } />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {items.length === 0 ? (
          <EmptyState icon="bell-off" title="No notifications yet" subtitle="You'll see SOS alerts, missing person updates and contact changes here." />
        ) : (
          items.map((n) => (
            <Pressable key={n.id} onPress={() => markRead(n.id)}>
              <Card style={{ marginBottom: 8, flexDirection: 'row', gap: 12, backgroundColor: n.is_read ? colors.surface : colors.greenLight, borderColor: n.is_read ? colors.border : colors.green }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={TYPE_ICON[n.type]} size={16} color={colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: n.is_read ? 'DMSans_500Medium' : 'DMSans_700Bold', fontSize: 13, color: colors.text }}>{n.title}</Text>
                  {n.body ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>{n.body}</Text> : null}
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</Text>
                </View>
                {!n.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, marginTop: 4 }} />}
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
