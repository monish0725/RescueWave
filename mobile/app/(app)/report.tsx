import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import VoiceRecorderField from '@/components/VoiceRecorderField';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { AlertsRepo } from '@/db/database';
import { getCurrentLocation } from '@/utils/location';
import { notify } from '@/utils/notifications';
import { createServerAlert } from '@/api/alerts';
import { uploadEvidenceFile } from '@/api/uploads';
import type { AlertCategory } from '@/types';

const CATEGORIES: Array<{ key: AlertCategory; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'theft', label: 'Theft', icon: 'lock' },
  { key: 'harassment', label: 'Harassment', icon: 'user-x' },
  { key: 'accident', label: 'Accident', icon: 'alert-triangle' },
  { key: 'violence', label: 'Violence', icon: 'shield-off' },
  { key: 'fire', label: 'Fire', icon: 'alert-octagon' },
  { key: 'medical', label: 'Medical Emergency', icon: 'heart' },
  { key: 'suspicious_activity', label: 'Suspicious Activity', icon: 'eye' },
  { key: 'other', label: 'Other', icon: 'more-horizontal' },
];

type Stage = 'form' | 'submitting' | 'done';
type Step = 1 | 2 | 3 | 4;

export default function ReportScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<AlertCategory>('theft');
  const [description, setDescription] = useState('');
  const [includeLocation, setIncludeLocation] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('form');
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [dispatchNote, setDispatchNote] = useState<string | null>(null);
  const [submittedAlertId, setSubmittedAlertId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  async function pickPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const useCamera = await new Promise<boolean | null>((resolve) => {
      Alert.alert('Add photo evidence', undefined, [
        { text: 'Take Photo', onPress: () => resolve(true) },
        { text: 'Choose from Gallery', onPress: () => resolve(false) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    });
    if (useCamera === null) return;
    if (useCamera && !perm.granted) {
      Alert.alert('Camera permission needed');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function pickVideo() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.6, videoMaxDuration: 60 });
    if (!result.canceled && result.assets[0]) setVideoUri(result.assets[0].uri);
  }

  async function submit() {
    if (!description.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setError(null);
    setStage('submitting');
    try {
      const loc = includeLocation ? await getCurrentLocation().catch(() => null) : null;

      // Save locally first — this is the actual "My Reports" record and it
      // exists even if we're offline.
      const localAlert = AlertsRepo.create({
        type: 'report',
        category,
        description: description.trim(),
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        address: loc?.address ?? null,
        photo_uri: photoUri,
        video_uri: videoUri,
        voice_uri: voiceUri,
      });
      setSubmittedAlertId(localAlert.id);
      setSubmittedAt(localAlert.created_at);
      await notify('Incident reported', `${CATEGORIES.find((c) => c.key === category)?.label} report saved to your Alert History.`, 'report');

      // Then sync to the backend (uploading any attached evidence) so it's
      // visible to Authorities and the future Admin Dashboard. This needs
      // connectivity — if it fails, the local record above still stands.
      try {
        const [photo_url, video_url, voice_url] = await Promise.all([
          photoUri ? uploadEvidenceFile(photoUri, 'image') : Promise.resolve(undefined),
          videoUri ? uploadEvidenceFile(videoUri, 'video') : Promise.resolve(undefined),
          voiceUri ? uploadEvidenceFile(voiceUri, 'audio') : Promise.resolve(undefined),
        ]);
        const result = await createServerAlert({
          source: 'citizen_report',
          category,
          description: description.trim(),
          lat: loc?.lat,
          lng: loc?.lng,
          address: loc?.address,
          photo_url,
          video_url,
          voice_url,
        });
        AlertsRepo.setServerAlertId(localAlert.id, result.alert.id);
        setDispatchNote(
          result.authoritiesNotified > 0
            ? `Sent to ${result.authoritiesNotified} nearby ${category === 'medical' ? 'hospital' : category === 'fire' ? 'fire department' : 'police'} contact${result.authoritiesNotified === 1 ? '' : 's'}.`
            : 'Saved to your report history. No matching Authority is registered nearby yet.'
        );
      } catch {
        setDispatchNote("Couldn't reach the server to notify Authorities (check your connection) — your report is safely saved locally.");
      }

      setStage('done');
    } catch (e: any) {
      setError(e.message ?? 'Could not save the report.');
      setStage('form');
    }
  }

  if (stage === 'done') {
    return (
      <Screen scroll={false}>
        <TopBar title="Report Submitted" showBack />
        <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Feather name="check-circle" size={40} color={colors.teal} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center' }}>Report saved</Text>
          {dispatchNote ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>{dispatchNote}</Text> : null}
          <Card style={{ width: '100%', marginBottom: 18 }}>
            <ProfileLine label="Report ID" value={submittedAlertId ?? 'Local record'} />
            <ProfileLine label="Incident type" value={CATEGORIES.find((c) => c.key === category)?.label ?? 'Incident'} />
            <ProfileLine label="Time" value={submittedAt ? new Date(submittedAt).toLocaleString() : new Date().toLocaleString()} />
            <ProfileLine label="Status" value="SUBMITTED" last />
          </Card>
          <Button label="View My Reports" onPress={() => router.replace('/(app)/alerts')} style={{ width: '100%' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Report Incident" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <StepHeader step={step} />
        {step === 1 && (
          <>
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 8 }}>What kind of incident?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={{
                    width: '48%',
                    minHeight: 82,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: category === c.key ? colors.navy : colors.border,
                    backgroundColor: category === c.key ? colors.navy : colors.surface,
                  }}
                >
                  <Feather name={c.icon} size={20} color={category === c.key ? '#fff' : colors.navy} />
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: category === c.key ? '#fff' : colors.text, textAlign: 'center' }}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <Button label="Continue" onPress={() => setStep(2)} />
          </>
        )}

        {step === 2 && (
          <>
            <TextField
              label="Description"
              placeholder="Describe what's happening..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 8 }}>Evidence (optional)</Text>
            <View style={{ gap: 10, marginBottom: 18 }}>
              {photoUri ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Image source={{ uri: photoUri }} style={{ width: 56, height: 56, borderRadius: 10 }} />
                  <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text }}>Photo attached</Text>
                  <IconButton name="trash-2" onPress={() => setPhotoUri(null)} color={colors.crimson} backgroundColor={colors.crimsonMist} size={16} />
                </View>
              ) : (
                <EvidenceButton icon="camera" label="Add a photo" onPress={pickPhoto} />
              )}

              {videoUri ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}><Feather name="film" size={15} color={colors.navy} /></View>
                  <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text }}>Video attached</Text>
                  <IconButton name="trash-2" onPress={() => setVideoUri(null)} color={colors.crimson} backgroundColor={colors.crimsonMist} size={16} />
                </View>
              ) : (
                <EvidenceButton icon="film" label="Add a video" onPress={pickVideo} />
              )}

              <VoiceRecorderField uri={voiceUri} onChange={setVoiceUri} />
            </View>
            <Button label="Continue" onPress={() => description.trim() ? setStep(3) : setError('Please describe what happened.')} />
            <BackStep onPress={() => setStep(1)} />
          </>
        )}

        {step === 3 && (
          <>
            <Pressable onPress={() => setIncludeLocation((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.navy, backgroundColor: includeLocation ? colors.navy : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {includeLocation && <Feather name="check" size={14} color="#fff" />}
              </View>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.text }}>Attach my current location</Text>
            </Pressable>
            <Card style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: colors.text }}>Location confirmation</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 4 }}>
                {includeLocation ? 'RescueWave will capture your current location during submission.' : 'This report will be saved without location data.'}
              </Text>
            </Card>
            <Button label="Review Report" onPress={() => setStep(4)} />
            <BackStep onPress={() => setStep(2)} />
          </>
        )}

        {step === 4 && (
          <>
            <Card style={{ marginBottom: 16 }}>
              <ProfileLine label="Type" value={CATEGORIES.find((c) => c.key === category)?.label ?? 'Incident'} />
              <ProfileLine label="Location" value={includeLocation ? 'Current location on submit' : 'Not attached'} />
              <ProfileLine label="Evidence" value={[photoUri && 'Photo', videoUri && 'Video', voiceUri && 'Voice'].filter(Boolean).join(', ') || 'None'} />
              <ProfileLine label="Status after submit" value="SUBMITTED" last />
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.textSoft, marginTop: 10 }}>{description.trim()}</Text>
            </Card>
            {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
            <Button label="Submit Report" onPress={submit} loading={stage === 'submitting'} />
            <BackStep onPress={() => setStep(3)} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function StepHeader({ step }: { step: Step }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {[1, 2, 3, 4].map((n) => <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= step ? colors.navy : colors.borderStrong }} />)}
      </View>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.navy, textTransform: 'uppercase' }}>Step {step} of 4</Text>
    </View>
  );
}

function EvidenceButton({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}><Feather name={icon} size={15} color={colors.navy} /></View>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function BackStep({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.muted }}>Back</Text>
    </Pressable>
  );
}

function ProfileLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}
