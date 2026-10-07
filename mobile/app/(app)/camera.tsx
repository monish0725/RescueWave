import React, { useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';

/**
 * Phone camera AI module — Phase 1.
 *
 * This screen gives a real, working camera preview (permission handling,
 * live viewfinder, front/back toggle) so the UI, navigation and permission
 * flow are already in place. It intentionally does NOT run any detection on
 * the phone's own camera feed — that's still a later phase.
 *
 * This is separate from the registered-CCTV AI network (see My Cameras),
 * which IS implemented: a separate AI service does real fall/gesture/voice/
 * face-recognition detection against cameras you register with a stream
 * URL. When phone-camera detection is built, it plugs in here: grab frames
 * from this same `CameraView` ref and POST them to a detection endpoint
 * instead of the "Coming soon" panel below.
 */
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <Screen scroll={false}><TopBar title="Camera AI" showBack /></Screen>;

  if (!permission.granted) {
    return (
      <Screen scroll={false}>
        <TopBar title="Camera AI" showBack />
        <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="camera-off" size={40} color={colors.muted} />
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginTop: 12, textAlign: 'center' }}>Camera access needed</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, marginTop: 6, textAlign: 'center', marginBottom: 20 }}>
            RescueWave uses the camera for missing-person photos, and will run live emergency detection on your
            phone's own camera in a future update. Registered CCTV cameras already get AI detection separately.
          </Text>
          <Button label="Grant Camera Access" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Camera AI" showBack right={
        <IconButton name="refresh-cw" onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} color={colors.text} backgroundColor={colors.bg} />
      } />
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />
      </View>
      <Card style={{ margin: 16, backgroundColor: '#eef2ff', borderColor: '#c5cae9' }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Feather name="cpu" size={18} color="#283593" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: '#283593' }}>Live phone-camera detection: coming soon</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#283593', marginTop: 2 }}>
              This preview is ready to connect to fall/gesture detection running on your phone's own camera in a
              future update. Registered CCTV cameras already have this via the separate AI service — see My Cameras.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
