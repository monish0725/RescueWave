import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { getMyCameras, updateCamera, deleteCamera } from '@/api/cameras';
import type { Camera } from '@/types';

export default function CamerasScreen() {
  const router = useRouter();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setCameras(await getMyCameras());
    } catch {
      // empty state covers this
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggleStatus(cam: Camera) {
    try {
      await updateCamera(cam.id, { status: cam.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (e: any) {
      Alert.alert('Could not update camera', e.message);
    }
  }

  function remove(cam: Camera) {
    Alert.alert('Remove this camera?', `This permanently removes "${cam.name}" from the registry.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteCamera(cam.id); load(); } },
    ]);
  }

  return (
    <Screen scroll={false}>
      <TopBar title="My CCTV Cameras" showBack right={
        <IconButton name="plus" onPress={() => router.push('/(app)/camera-register')} />
      } />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.navy} size="large" /></View>
      ) : (
        <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} contentContainerStyle={{ paddingBottom: 24 }}>
          {cameras.length === 0 ? (
            <EmptyState icon="camera" title="No cameras registered" subtitle="Register a camera you own so it's part of RescueWave's AI safety network." />
          ) : (
            cameras.map((cam) => (
              <Card key={cam.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="camera" size={18} color={colors.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text }}>{cam.name}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 2 }}>{cam.address || 'No address set'}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 2, textTransform: 'capitalize' }}>{cam.placement}{cam.direction ? ` · ${cam.direction}` : ''}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: cam.status === 'active' ? colors.tealMist : colors.bg, height: 22 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 10, color: cam.status === 'active' ? colors.tealText : colors.muted, textTransform: 'uppercase' }}>{cam.status}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Feather name="cpu" size={12} color={aiStatusFor(cam).color} />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: aiStatusFor(cam).color }}>{aiStatusFor(cam).label}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable onPress={() => toggleStatus(cam)} style={{ flex: 1 }}>
                    <View style={{ backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>{cam.status === 'active' ? 'Deactivate' : 'Reactivate'}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => remove(cam)} style={{ flex: 1 }}>
                    <View style={{ backgroundColor: colors.crimsonMist, borderWidth: 1, borderColor: colors.crimson, borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.crimson }}>Remove</Text>
                    </View>
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

// The heartbeat interval in ai-service/main.py is 30s — "recently" here is
// generous (2 min) to allow for a poll cycle or brief hiccup without
// flipping to "stale" on every tiny gap.
function aiStatusFor(cam: Camera): { label: string; color: string } {
  if (!cam.stream_url) return { label: 'AI network: no stream configured', color: colors.muted };
  if (!cam.ai_last_seen_at) return { label: 'AI network: stream set, not yet connected', color: colors.muted };
  const ageMs = Date.now() - new Date(cam.ai_last_seen_at).getTime();
  if (ageMs < 2 * 60 * 1000) {
    return { label: `AI actively monitoring · last frame ${new Date(cam.ai_last_seen_at).toLocaleTimeString()}`, color: colors.tealText };
  }
  return { label: `AI service offline · last seen ${new Date(cam.ai_last_seen_at).toLocaleString()}`, color: colors.amberText };
}
