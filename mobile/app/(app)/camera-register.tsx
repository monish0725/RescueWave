import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { registerCamera } from '@/api/cameras';
import { getCurrentLocation } from '@/utils/location';

const TERMS_TEXT = `By registering a camera with RescueWave, you confirm that:

1. You own or have authorization to register this camera and its location.
2. The information you provide (location, placement, coverage) is accurate to the best of your knowledge.
3. Registering a camera by itself only stores its details in the RescueWave registry — no footage is accessed.
4. If you separately provide a live stream URL (in "Advanced"), you are enabling the separate, self-hosted RescueWave AI CCTV service to read frames from that specific feed for missing-person face matching and SOS gesture/voice detection — providing that URL IS the opt-in, and there is no additional consent step beyond it.
5. Leaving the stream URL blank keeps this camera registration-only: no feed is ever read, no AI processing occurs.
6. You can deactivate or delete this registration at any time from "My Cameras" in your profile.`;

export default function CameraRegisterScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [placement, setPlacement] = useState<'indoor' | 'outdoor'>('outdoor');
  const [direction, setDirection] = useState('');
  const [coverageNotes, setCoverageNotes] = useState('');
  const [coverageRadius, setCoverageRadius] = useState('20');
  const [ownerName, setOwnerName] = useState(user?.name ?? '');
  const [ownerPhone, setOwnerPhone] = useState(user?.phone ?? '');
  const [streamUrl, setStreamUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function captureLocation() {
    setLocating(true);
    try {
      const loc = await getCurrentLocation();
      setCoords({ lat: loc.lat, lng: loc.lng });
      if (!address.trim()) setAddress(loc.address);
    } catch (e: any) {
      Alert.alert('Could not get location', e.message);
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim()) { setError('Camera name is required.'); return; }
    if (!termsAccepted) { setError('You must accept the Terms & Conditions to register a camera.'); return; }
    setSubmitting(true);
    try {
      await registerCamera({
        name: name.trim(),
        address: address.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        placement,
        direction: direction.trim() || undefined,
        coverage_notes: coverageNotes.trim() || undefined,
        coverage_radius_m: coverageRadius.trim() ? Number(coverageRadius.trim()) : undefined,
        owner_name: ownerName.trim() || undefined,
        owner_phone: ownerPhone.trim() || undefined,
        terms_accepted: true,
        stream_url: streamUrl.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    const streamConfigured = !!streamUrl.trim();
    return (
      <Screen scroll={false}>
        <TopBar title="Camera Registered" showBack />
        <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Feather name="check-circle" size={40} color={colors.teal} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center' }}>Camera registered</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>
            {streamConfigured
              ? "It's saved to the registry with a live stream configured. Once the separate AI service connects to that stream, its live status will show on My Cameras."
              : "It's saved to the RescueWave camera registry, registration-only — no live stream was set, so no footage is ever accessed."}
          </Text>
          <Button label="View My Cameras" onPress={() => router.replace('/(app)/cameras')} style={{ width: '100%' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Register CCTV Camera" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: colors.navyMist, borderColor: colors.navy, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.navy, lineHeight: 18 }}>
            Register a camera you own so it's part of RescueWave's AI safety network. On its own, this only stores
            registration details — no footage is accessed. AI processing only starts if you separately add a live
            stream URL below and run the AI service against it yourself.
          </Text>
        </Card>

        <TextField label="Camera name" placeholder="e.g. Front Gate Camera" value={name} onChangeText={setName} />
        <TextField label="Address" placeholder="Where is this camera located?" value={address} onChangeText={setAddress} />
        <Pressable onPress={captureLocation} disabled={locating} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -10, marginBottom: 16 }}>
          <Feather name="map-pin" size={13} color={colors.navy} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.navy }}>
            {locating ? 'Getting location…' : coords ? 'Location captured ✓' : 'Use my current location'}
          </Text>
        </Pressable>

        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 8 }}>Placement</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {(['outdoor', 'indoor'] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPlacement(p)}
              style={{ flex: 1 }}
            >
              <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: placement === p ? colors.navy : colors.border, backgroundColor: placement === p ? colors.navy : colors.surface }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: placement === p ? '#fff' : colors.text, textTransform: 'capitalize' }}>{p}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <TextField label="Direction / facing" placeholder="e.g. Facing the street, north-east" value={direction} onChangeText={setDirection} />
        <TextField label="Coverage notes" placeholder="What does the camera see?" value={coverageNotes} onChangeText={setCoverageNotes} multiline numberOfLines={3} style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <TextField label="Approx. coverage radius (meters)" keyboardType="number-pad" value={coverageRadius} onChangeText={setCoverageRadius} />
        <TextField label="Owner name" value={ownerName} onChangeText={setOwnerName} />
        <TextField label="Owner phone" keyboardType="phone-pad" value={ownerPhone} onChangeText={setOwnerPhone} />

        <Pressable onPress={() => setShowAdvanced((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: showAdvanced ? 12 : 20 }}>
          <Feather name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.muted }}>Advanced (optional)</Text>
        </Pressable>
        {showAdvanced && (
          <View style={{ marginBottom: 8 }}>
            <TextField
              label="Live stream URL"
              placeholder="rtsp://... or webcam:0 for a local test"
              autoCapitalize="none"
              value={streamUrl}
              onChangeText={setStreamUrl}
            />
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.faint, marginTop: -10, marginBottom: 16 }}>
              Leave blank unless you're running the separate AI CCTV service against a real feed — most registrations
              don't set this. It's what that service reads frames from; RescueWave itself never accesses it.
            </Text>
          </View>
        )}

        <Pressable onPress={() => setTermsModalOpen(true)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
          <Pressable onPress={() => setTermsAccepted((v) => !v)} style={{ marginTop: 1 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.navy, backgroundColor: termsAccepted ? colors.navy : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {termsAccepted && <Feather name="check" size={14} color="#fff" />}
            </View>
          </Pressable>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.text, flex: 1 }}>
            I accept the <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.navy }}>Terms & Conditions</Text> for camera registration.
          </Text>
        </Pressable>

        {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
        <Button label="Register Camera" onPress={submit} loading={submitting} />
      </ScrollView>

      <Modal visible={termsModalOpen} animationType="slide" transparent onRequestClose={() => setTermsModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '75%' }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17, color: colors.text, marginBottom: 12 }}>Terms & Conditions</Text>
            <ScrollView style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.textSoft, lineHeight: 20 }}>{TERMS_TEXT}</Text>
            </ScrollView>
            <Button label="I Accept" onPress={() => { setTermsAccepted(true); setTermsModalOpen(false); }} />
            <Button label="Close" variant="outline" onPress={() => setTermsModalOpen(false)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
