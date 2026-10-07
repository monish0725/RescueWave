import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { MissingRepo } from '@/db/database';
import { getMyServerMissingPersons } from '@/api/missingPersons';
import type { MissingPerson } from '@/types';

export default function MissingListScreen() {
  const router = useRouter();
  const [people, setPeople] = useState<MissingPerson[]>([]);
  const [filter, setFilter] = useState<'all' | 'missing' | 'found'>('all');

  const load = useCallback(async () => {
    // The local copy keeps the screen useful offline. When online, the server
    // is authoritative for admin actions such as closing a case as found.
    try {
      const serverPeople = await getMyServerMissingPersons();
      const localByServerId = new Map(MissingRepo.all().filter((p) => p.server_id).map((p) => [p.server_id!, p]));
      for (const serverPerson of serverPeople) {
        const local = localByServerId.get(serverPerson.id);
        if (local && local.status !== serverPerson.status) {
          MissingRepo.update(local.id, { status: serverPerson.status });
        }
      }
    } catch {
      // Offline or unavailable backend: show the last known local state.
    }
    setPeople(MissingRepo.all());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = people.filter((p) => filter === 'all' || p.status === filter);

  return (
    <Screen scroll={false}>
      <TopBar title="Missing Persons" showBack right={
        <IconButton name="plus" onPress={() => router.push('/(app)/missing/add')} />
      } />
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 }}>
        {(['all', 'missing', 'found'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: filter === f ? colors.green : colors.border, backgroundColor: filter === f ? colors.green : colors.surface }}
          >
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: filter === f ? '#fff' : colors.muted, textTransform: 'capitalize' }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {visible.length === 0 ? (
          <EmptyState icon="search" title="No missing person records" subtitle="Reports you add will appear here, ready to be tracked, edited or marked found." />
        ) : (
          visible.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/(app)/missing/${p.id}` as any)}>
              <Card style={{ marginBottom: 10, flexDirection: 'row', gap: 12 }}>
                {p.photo_uri ? (
                  <Image source={{ uri: p.photo_uri }} style={{ width: 52, height: 52, borderRadius: 12 }} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="user" size={22} color={colors.greenDark} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text }}>{p.name}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: p.status === 'missing' ? '#ffebee' : colors.greenLight }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: p.status === 'missing' ? colors.red : colors.greenDark, textTransform: 'uppercase' }}>{p.status}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {[p.age ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ') || 'No demographic details'}
                  </Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 3 }} numberOfLines={1}>
                    Last seen: {p.last_seen_location || 'Unknown'}{p.last_seen_date ? ` · ${p.last_seen_date}` : ''}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
