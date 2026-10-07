import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { MissingRepo } from '@/db/database';
import { notify } from '@/utils/notifications';
import { getCurrentLocation } from '@/utils/location';
import { uploadEvidenceFile } from '@/api/uploads';
import { createServerMissingPerson } from '@/api/missingPersons';

export default function AddMissingPersonScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [description, setDescription] = useState('');
  const [lastSeenLocation, setLastSeenLocation] = useState('');
  const [lastSeenCoords, setLastSeenCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingNow, setLocatingNow] = useState(false);
  const [lastSeenDate, setLastSeenDate] = useState('');
  const [searchRadius, setSearchRadius] = useState('5');
  const [contactPhone, setContactPhone] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Camera access is required to take a photo.' : 'Photo library access is required to choose a photo.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function useCurrentLocationForLastSeen() {
    setLocatingNow(true);
    try {
      const loc = await getCurrentLocation();
      setLastSeenCoords({ lat: loc.lat, lng: loc.lng });
      if (!lastSeenLocation.trim()) setLastSeenLocation(loc.address);
    } catch (e: any) {
      Alert.alert('Could not get location', e.message);
    } finally {
      setLocatingNow(false);
    }
  }

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!photoUri) { setError('Please upload one clear photo of the missing person. This photo is required for AI CCTV matching.'); return; }
    setError(null);
    setSaving(true);
    try {
      const radiusKm = searchRadius.trim() ? Number(searchRadius.trim()) : null;
      const localRecord = MissingRepo.create({
        name: name.trim(),
        age: age.trim() ? Number(age.trim()) : null,
        gender: gender.trim() || null,
        description: description.trim() || null,
        last_seen_location: lastSeenLocation.trim() || null,
        last_seen_lat: lastSeenCoords?.lat ?? null,
        last_seen_lng: lastSeenCoords?.lng ?? null,
        last_seen_date: lastSeenDate.trim() || null,
        search_radius_km: radiusKm,
        contact_phone: contactPhone.trim() || null,
        photo_uri: photoUri,
      });
      await notify('Missing person report added', `${name.trim()} was added to your missing person records.`, 'missing');

      // Sync to the backend so it's visible beyond this device (nearby
      // Police are notified, and it's the record the separate AI CCTV
      // service checks camera streams against — see face_embedding_status).
      try {
        const photo_url = photoUri ? await uploadEvidenceFile(photoUri, 'image') : undefined;
        const result = await createServerMissingPerson({
          name: name.trim(),
          age: age.trim() ? Number(age.trim()) : undefined,
          gender: gender.trim() || undefined,
          description: description.trim() || undefined,
          last_seen_location: lastSeenLocation.trim() || undefined,
          last_seen_lat: lastSeenCoords?.lat,
          last_seen_lng: lastSeenCoords?.lng,
          last_seen_date: lastSeenDate.trim() || undefined,
          search_radius_km: radiusKm ?? undefined,
          contact_phone: contactPhone.trim() || undefined,
          photo_url,
        });
        MissingRepo.setServerId(localRecord.id, result.missingPerson.id);
      } catch {
        // No background sync queue exists — if this fails, the record stays
        // local-only until the person manually retries (e.g. by editing and
        // saving it again once they have a connection). Say so plainly
        // instead of implying it'll resolve itself.
        Alert.alert(
          'Saved on this device only',
          "This report couldn't reach the RescueWave server, so Police and the AI CCTV matching service can't see it yet. It will NOT sync automatically — open it from your Missing Persons list and save it again once you have a connection.",
        );
      }

      router.replace('/(app)/missing');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll={false} avoidKeyboard={false}>
      <TopBar title="Add Missing Person" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={12}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
          <Pressable onPress={() => Alert.alert('Add photo', undefined, [
            { text: 'Take Photo', onPress: () => pickPhoto(true) },
            { text: 'Choose from Gallery', onPress: () => pickPhoto(false) },
            { text: 'Cancel', style: 'cancel' },
          ])}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
                <Feather name="camera" size={26} color={colors.navy} />
              </View>
            )}
          </Pressable>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 8 }}>Tap to add a photo (required)</Text>
          {photoUri ? (
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.faint, marginTop: 4, textAlign: 'center', maxWidth: 260 }}>
              Used by the AI CCTV service to search active registered camera streams for possible sightings.
            </Text>
          ) : null}
        </View>

        <TextField label="Full name" placeholder="Person's name" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><TextField label="Age" placeholder="e.g. 34" keyboardType="number-pad" value={age} onChangeText={setAge} /></View>
          <View style={{ flex: 1 }}><TextField label="Gender" placeholder="e.g. Female" value={gender} onChangeText={setGender} /></View>
        </View>
        <TextField label="Description" placeholder="Height, build, clothing, identifying marks…" value={description} onChangeText={setDescription} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: 'top' }} />

        <TextField label="Last seen location" placeholder="Where were they last seen?" value={lastSeenLocation} onChangeText={setLastSeenLocation} />
        <Pressable onPress={useCurrentLocationForLastSeen} disabled={locatingNow} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -10, marginBottom: 16 }}>
          <Feather name="map-pin" size={13} color={colors.navy} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.navy }}>
            {locatingNow ? 'Getting location…' : lastSeenCoords ? 'Location captured ✓' : 'Use my current location'}
          </Text>
        </Pressable>

        <TextField label="Last seen date" placeholder="e.g. 12 July 2026" value={lastSeenDate} onChangeText={setLastSeenDate} />
        <TextField label="Search radius (km)" placeholder="5" keyboardType="decimal-pad" value={searchRadius} onChangeText={setSearchRadius} />
        <TextField label="Contact number" placeholder="Number for people to report sightings" keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} />

        {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
          <Button label="Save Missing Person Report" onPress={submit} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
