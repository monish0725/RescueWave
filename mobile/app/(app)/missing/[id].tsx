import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { MissingRepo } from '@/db/database';
import { updateServerMissingPerson, createServerMissingPerson, getMissingPersonMatches, getServerMissingPerson, deleteServerMissingPerson, reviewMissingPersonMatch } from '@/api/missingPersons';
import type { MissingPersonMatch } from '@/api/missingPersons';
import { resolveMediaUrl, uploadEvidenceFile } from '@/api/uploads';
import { getCameraMonitoringStatus } from '@/api/cameras';
import type { CameraMonitoringStatus } from '@/api/cameras';
import { API_URL } from '@/api/client';
import type { MissingPerson } from '@/types';

const VALIDATION_MESSAGES: Record<string, string> = {
  undecodable: 'This photo could not be read by the AI service. Please upload a different image file.',
  no_face: "No face was detected in this photo, so it can't be used for AI camera matching. Please upload a clear photo showing the person's face.",
  multiple_faces: "Multiple faces were detected in this photo, so it can't be used for AI camera matching. Please upload a photo containing only this person.",
  face_too_small: "The face in this photo is too small to use reliably for AI camera matching. Please upload a closer, higher-resolution photo.",
  too_blurry: "This photo is too blurry to use reliably for AI camera matching. Please upload a sharper image.",
};

export default function MissingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<MissingPerson | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<MissingPerson>>({});
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null); // null = "use existing photo, unchanged"
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingServer, setSavingServer] = useState(false);
  const [matches, setMatches] = useState<MissingPersonMatch[] | null>(null); // null = loading/not applicable
  const [reviewingMatchId, setReviewingMatchId] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ status: string | null; reason: string | null } | null>(null);
  const [monitoring, setMonitoring] = useState<CameraMonitoringStatus | null | 'error'>(null); // null = loading, 'error' = fetch failed

  const load = useCallback(() => {
    const p = MissingRepo.get(id);
    setPerson(p);
    if (p) setForm(p);
    setEditPhotoUri(null);
    if (p?.server_id) {
      getMissingPersonMatches(p.server_id)
        .then(setMatches)
        .catch(() => setMatches([]));
      getServerMissingPerson(p.server_id)
        .then((sp) => {
          setValidation({ status: sp.face_validation_status, reason: sp.face_validation_reason });
          if (sp.status !== p.status) {
            MissingRepo.update(p.id, { status: sp.status });
            setPerson((current) => current ? { ...current, status: sp.status } : current);
          }
        })
        .catch(() => setValidation(null)); // fetch failure — just don't show the banner, don't guess
      getCameraMonitoringStatus()
        .then(setMonitoring)
        .catch(() => setMonitoring('error'));
    } else {
      setMatches(null);
      setValidation(null);
      setMonitoring(null);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickEditPhoto(fromCamera: boolean) {
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
    if (!result.canceled && result.assets[0]) setEditPhotoUri(result.assets[0].uri);
  }

  if (!person) {
    return (
      <Screen scroll={false}>
        <TopBar title="Missing Person" showBack />
        <View style={{ padding: 24 }}><Text style={{ fontFamily: 'DMSans_400Regular', color: colors.muted }}>Record not found.</Text></View>
      </Screen>
    );
  }

  async function saveEdits() {
    let photoUri = person!.photo_uri;
    let photoUrlForServer: string | undefined;

    if (editPhotoUri) {
      setUploadingPhoto(true);
      try {
        photoUrlForServer = await uploadEvidenceFile(editPhotoUri, 'image');
        photoUri = editPhotoUri;
      } catch {
        Alert.alert('Photo upload failed', "Your other changes were still saved, but the new photo wasn't. Please try changing it again.");
      } finally {
        setUploadingPhoto(false);
      }
    }

    const merged = {
      name: form.name ?? person!.name,
      age: form.age !== undefined ? (form.age === null ? null : Number(form.age)) : person!.age,
      gender: form.gender ?? person!.gender,
      description: form.description ?? person!.description,
      last_seen_location: form.last_seen_location ?? person!.last_seen_location,
      last_seen_date: form.last_seen_date ?? person!.last_seen_date,
      contact_phone: form.contact_phone ?? person!.contact_phone,
    };

    // Save the local copy first — this device's own record always reflects
    // what was just typed, whether or not the server update below succeeds.
    MissingRepo.update(person!.id, { ...merged, photo_uri: photoUri });

    // Every editable field syncs to the server, not just the photo — and we
    // now AWAIT that request before telling the person editing is done.
    // Previously this was fire-and-forget: `setEditing(false)` ran
    // immediately, so the screen reported success even when the server
    // update was still in flight or had failed outright.
    //
    // Field values are passed through as-is (including explicit `null`
    // for a cleared field) rather than coalesced to `undefined` — the
    // backend's PATCH handler now distinguishes "field omitted" from
    // "field explicitly cleared" by key presence, so an intentional null
    // has to actually reach it as null, not get silently dropped here.
    setSavingServer(true);
    try {
      if (person!.server_id) {
        await updateServerMissingPerson(person!.server_id, {
          name: merged.name,
          age: merged.age,
          gender: merged.gender,
          description: merged.description,
          last_seen_location: merged.last_seen_location,
          last_seen_date: merged.last_seen_date,
          contact_phone: merged.contact_phone,
          ...(photoUrlForServer ? { photo_url: photoUrlForServer } : {}),
        });
      } else {
        // This record never made it to the server in the first place
        // (e.g. it was created offline). Editing it is the only retry
        // path available, so attempt the original creation here instead
        // of silently accepting a local-only edit and leaving the person
        // no way to actually get the record onto the server.
        const photo_url = photoUrlForServer ?? (photoUri ? await uploadEvidenceFile(photoUri, 'image').catch(() => undefined) : undefined);
        const result = await createServerMissingPerson({
          name: merged.name,
          age: merged.age ?? undefined,
          gender: merged.gender ?? undefined,
          description: merged.description ?? undefined,
          last_seen_location: merged.last_seen_location ?? undefined,
          last_seen_date: merged.last_seen_date ?? undefined,
          contact_phone: merged.contact_phone ?? undefined,
          photo_url,
        });
        MissingRepo.setServerId(person!.id, result.missingPerson.id);
      }
    } catch {
      setSavingServer(false);
      Alert.alert(
        'Saved on this device only',
        "Your changes were saved here, but the server update failed — they won't be visible elsewhere (police, AI matching) until that succeeds. Stay in edit mode and tap Save Changes again once you have a connection.",
      );
      return; // stay in edit mode so "Save Changes" can be retried without re-typing anything
    }
    setSavingServer(false);

    setEditing(false);
    setEditPhotoUri(null);
    load();
  }

  async function reviewMatch(match: MissingPersonMatch, status: 'confirmed_sighting' | 'rejected') {
    if (!person?.server_id) return;
    setReviewingMatchId(match.id);
    try {
      const updated = await reviewMissingPersonMatch(person.server_id, match.id, status);
      setMatches((prev) => prev ? prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)) : prev);
      if (status === 'confirmed_sighting') {
        MissingRepo.update(person.id, { status: 'found' });
        setPerson((prev) => prev ? { ...prev, status: 'found' } : prev);
        Alert.alert('Case marked found', `${person.name} has been marked found. AI camera matching will stop for this record.`);
      }
    } catch (err) {
      Alert.alert('Could not review sighting', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setReviewingMatchId(null);
    }
  }

  function toggleFound() {
    const newStatus = person!.status === 'missing' ? 'found' : 'missing';
    const applyChange = () => {
      MissingRepo.update(person!.id, { status: newStatus });
      if (person!.server_id) updateServerMissingPerson(person!.server_id, { status: newStatus }).catch(() => {});
      load();
    };

    if (newStatus === 'found') {
      Alert.alert('Mark as found?', `This marks ${person!.name} as found and closes the case. AI camera matching will stop for this record.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as Found', onPress: applyChange },
      ]);
    } else {
      Alert.alert('Mark as missing again?', `This reopens the case for ${person!.name} and resumes AI camera matching.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as Missing', onPress: applyChange },
      ]);
    }
  }

  function remove() {
    Alert.alert('Delete this record?', 'This permanently removes the missing person report.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const serverId = person!.server_id;
          MissingRepo.remove(person!.id);
          router.replace('/(app)/missing');
          // Local record is gone either way (that's what the person asked for and
          // sees immediately) -- but if this record was ever synced to the server,
          // it's still visible there (police/authority dashboards) and the AI
          // camera pipeline is still actively matching against it, so the server
          // copy needs removing too. Only warn if that part fails.
          if (serverId) {
            try {
              await deleteServerMissingPerson(serverId);
            } catch {
              Alert.alert(
                'Removed from this device only',
                "This record was deleted here, but it wasn't removed from the server -- it may still be visible to authorities and matched by AI cameras. Try again when you have a connection."
              );
            }
          }
        },
      },
    ]);
  }

  return (
    <Screen scroll={false}>
      <TopBar title={editing ? 'Edit Record' : person.name} showBack right={
        <IconButton name={editing ? 'x' : 'edit-2'} onPress={() => setEditing((v) => !v)} color={colors.text} backgroundColor={colors.bg} />
      } />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Pressable
            disabled={!editing}
            onPress={() => Alert.alert('Change photo', undefined, [
              { text: 'Take Photo', onPress: () => pickEditPhoto(true) },
              { text: 'Choose from Gallery', onPress: () => pickEditPhoto(false) },
              { text: 'Cancel', style: 'cancel' },
            ])}
          >
            {editPhotoUri || person.photo_uri ? (
              <Image source={{ uri: editPhotoUri ?? person.photo_uri! }} style={{ width: 110, height: 110, borderRadius: 55 }} />
            ) : (
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="user" size={40} color={colors.greenDark} />
              </View>
            )}
            {editing && (
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                <Feather name="camera" size={14} color="#fff" />
              </View>
            )}
          </Pressable>
          {editing && (
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 6 }}>
              {uploadingPhoto ? 'Checking photo…' : editPhotoUri ? 'New photo selected — will be checked by the AI service after saving' : 'Tap the photo to change it'}
            </Text>
          )}
          <View style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: person.status === 'missing' ? '#ffebee' : colors.greenLight }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: person.status === 'missing' ? colors.red : colors.greenDark, textTransform: 'uppercase' }}>{person.status}</Text>
          </View>
        </View>

        {editing ? (
          <>
            <TextField label="Full name" value={form.name ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><TextField label="Age" keyboardType="number-pad" value={form.age != null ? String(form.age) : ''} onChangeText={(v) => setForm((f) => ({ ...f, age: v ? Number(v) : null }))} /></View>
              <View style={{ flex: 1 }}><TextField label="Gender" value={form.gender ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, gender: v }))} /></View>
            </View>
            <TextField label="Description" value={form.description ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: 'top' }} />
            <TextField label="Last seen location" value={form.last_seen_location ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, last_seen_location: v }))} />
            <TextField label="Last seen date" value={form.last_seen_date ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, last_seen_date: v }))} />
            <TextField label="Contact number" keyboardType="phone-pad" value={form.contact_phone ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, contact_phone: v }))} />
            <Button label="Save Changes" onPress={saveEdits} loading={uploadingPhoto || savingServer} />
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 12 }}>
              <DetailRow label="Age / Gender" value={[person.age ? `${person.age} yrs` : null, person.gender].filter(Boolean).join(' · ') || '—'} />
              <DetailRow label="Description" value={person.description || '—'} />
              <DetailRow label="Last seen location" value={person.last_seen_location || '—'} />
              <DetailRow label="Last seen date" value={person.last_seen_date || '—'} />
              <DetailRow label="Search radius" value={person.search_radius_km ? `${person.search_radius_km} km` : '—'} last />
            </Card>

            {person.photo_uri && person.server_id && validation?.status === 'rejected' && (
              <Card style={{ marginBottom: 12, backgroundColor: '#fff3e0', borderColor: colors.amber ?? '#F59E0B', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Feather name="alert-triangle" size={16} color="#e65100" style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: '#e65100' }}>Photo not usable for AI camera matching</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: '#e65100', marginTop: 2 }}>
                    {(validation.reason && VALIDATION_MESSAGES[validation.reason]) || 'The AI service could not use this photo. Please try a different one.'}
                  </Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: '#e65100', marginTop: 4, opacity: 0.8 }}>
                    The case itself is still active and visible — this only affects automatic CCTV matching, which stays off until a usable photo is provided. Tap the edit icon above, then tap the photo, to upload a different one.
                  </Text>
                </View>
              </Card>
            )}

            {person.photo_uri && person.server_id && validation?.status === null && (
              <Card style={{ marginBottom: 12, backgroundColor: colors.bg, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Feather name="clock" size={16} color={colors.muted} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: colors.textSoft }}>Checking photo</Text>
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    The AI service reviews new reference photos on its next pass — this usually takes a few minutes.
                  </Text>
                </View>
              </Card>
            )}

            {person.photo_uri && person.server_id && (
              <AiMonitoringCard
                validationOk={validation?.status === 'ok'}
                monitoring={monitoring}
                sightingCount={matches?.length ?? null}
              />
            )}

            {person.photo_uri && (
              <MatchTimelineCard
                hasServerRecord={!!person.server_id}
                matches={matches}
                personName={person.name}
                reviewingMatchId={reviewingMatchId}
                onReview={reviewMatch}
                onNavigate={(match) => router.push({
                  pathname: '/(app)/safe-route',
                  params: {
                    lat: String(match.camera_lat),
                    lng: String(match.camera_lng),
                    label: match.camera_name || match.camera_address || 'Camera sighting',
                  },
                })}
              />
            )}

            {person.contact_phone ? (
              <Button label={`Call Contact ${person.contact_phone}`} onPress={() => Linking.openURL(`tel:${person.contact_phone}`)} icon={<Feather name="phone" size={16} color="#fff" />} style={{ marginBottom: 10 }} />
            ) : null}
            <Button label={person.status === 'missing' ? 'Mark as Found' : 'Mark as Missing'} variant="outline" onPress={toggleFound} style={{ marginBottom: 10 }} />
            <Button label="Delete Record" variant="danger" onPress={remove} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function MatchTimelineCard({
  hasServerRecord,
  matches,
  personName,
  reviewingMatchId,
  onReview,
  onNavigate,
}: {
  hasServerRecord: boolean;
  matches: MissingPersonMatch[] | null;
  personName: string;
  reviewingMatchId: string | null;
  onReview: (match: MissingPersonMatch, status: 'confirmed_sighting' | 'rejected') => void;
  onNavigate: (match: MissingPersonMatch) => void;
}) {
  const apiUrl = API_URL || '';

  if (!hasServerRecord) {
    return (
      <Card style={{ marginBottom: 12, backgroundColor: colors.navyMist, borderColor: colors.navy, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Feather name="cpu" size={16} color={colors.navy} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: colors.navy }}>Not synced to server</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.navy, marginTop: 2 }}>
            This record only exists on this device. It does not sync automatically — camera matching and police visibility need the record to be submitted successfully while you're online.
          </Text>
        </View>
      </Card>
    );
  }

  if (matches === null || matches.length === 0) {
    return null; // still loading, or nothing to show yet — AiMonitoringCard above already covers the "why" honestly
  }

  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Feather name="camera" size={15} color={colors.gold} />
        <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.text }}>
          {matches.length} camera {matches.length === 1 ? 'match' : 'matches'}
        </Text>
      </View>
      {matches.map((m, i) => (
        <View key={m.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
          {m.snapshot_url ? (
            <Image source={{ uri: resolveMediaUrl(apiUrl, m.snapshot_url) }} style={{ width: 52, height: 52, borderRadius: 8 }} />
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="camera" size={18} color={colors.navy} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11, color: colors.goldText, textTransform: 'uppercase', letterSpacing: 0.3 }}>Potential Missing-Person Match</Text>
            <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text, marginTop: 2 }}>{m.camera_name || 'Unnamed camera'}</Text>
            {m.camera_address ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>{m.camera_address}</Text> : null}
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted, marginTop: 2 }}>
              {new Date(m.matched_at).toLocaleString()} · {Math.round((m.final_confidence ?? m.confidence) * 100)}% final confidence
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.faint, marginTop: 1 }}>
              ArcFace {Math.round(m.confidence * 100)}%
              {m.local_feature_score != null ? ` · Local ${Math.round(m.local_feature_score * 100)}%` : ''}
              {m.ssim_score != null ? ` · SSIM ${Math.round(m.ssim_score * 100)}%` : ''}
              {m.face_detection_score != null ? ` · ${Math.round(m.face_detection_score * 100)}% detection confidence` : ''}
            </Text>
            {(() => {
              const badge = verificationBadge(m.verification_status);
              return (
                <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: badge.bg }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 9, color: badge.color, textTransform: 'uppercase' }}>{badge.label}</Text>
                </View>
              );
            })()}
            {m.verification_status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Button
                  label="Confirm sighting"
                  onPress={() => onReview(m, 'confirmed_sighting')}
                  loading={reviewingMatchId === m.id}
                  style={{ flexGrow: 1, minWidth: 128, paddingVertical: 8, borderRadius: 10 }}
                />
                <Button
                  label="Not this person"
                  variant="outline"
                  onPress={() => onReview(m, 'rejected')}
                  disabled={reviewingMatchId === m.id}
                  style={{ flexGrow: 1, minWidth: 128, paddingVertical: 8, borderRadius: 10 }}
                />
              </View>
            ) : null}
            {m.camera_lat != null && m.camera_lng != null ? (
              <Pressable onPress={() => onNavigate(m)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Feather name="navigation" size={12} color="#fff" />
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>Route to sighting</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.faint, marginTop: 8 }}>
        AI camera matching uses InsightFace facial embeddings to identify potential sightings — treat each one as a
        lead to verify, not a confirmed sighting of {personName}.
      </Text>
    </Card>
  );
}

// Admin review state for a match — never rendered as "AI confirmed": even
// 'confirmed_sighting' is a human reviewer's call on the evidence the AI
// surfaced, not the AI itself claiming certainty.
function verificationBadge(status: MissingPersonMatch['verification_status']): { label: string; color: string; bg: string } {
  switch (status) {
    case 'confirmed_sighting':
      return { label: 'Confirmed by reviewer', color: colors.teal, bg: colors.tealMist };
    case 'verified':
      return { label: 'Reviewed — plausible', color: colors.teal, bg: colors.tealMist };
    case 'rejected':
      return { label: 'Reviewed — not a match', color: colors.muted, bg: colors.bg };
    case 'pending':
    default:
      return { label: 'Requires verification', color: colors.amber, bg: colors.amberMist };
  }
}

function AiMonitoringCard({
  validationOk,
  monitoring,
  sightingCount,
}: {
  validationOk: boolean;
  monitoring: CameraMonitoringStatus | null | 'error';
  sightingCount: number | null;
}) {
  if (monitoring === null) return null; // still loading
  if (monitoring === 'error') {
    return (
      <Card style={{ marginBottom: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Feather name="cpu" size={16} color={colors.muted} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.muted }}>
          Couldn't check AI monitoring status right now.
        </Text>
      </Card>
    );
  }

  const active = monitoring.activeCameraCount > 0;
  const count = sightingCount ?? 0;

  return (
    <Card style={{ marginBottom: 12, backgroundColor: active ? colors.navyMist : colors.bg, borderColor: active ? colors.navy : colors.border, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Feather name="cpu" size={16} color={active ? colors.navy : colors.muted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: active ? colors.navy : colors.textSoft }}>
          {active ? `AI monitoring active — ${monitoring.activeCameraCount} camera${monitoring.activeCameraCount === 1 ? '' : 's'} scanning` : 'AI monitoring is not currently active'}
        </Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: active ? colors.navy : colors.muted, marginTop: 2 }}>
          {active
            ? `${count} potential sighting${count === 1 ? '' : 's'} so far${validationOk ? '' : ' (photo still needs to pass AI review before it can be matched)'}.`
            : "No registered camera currently has the AI service actively running against it, so no automatic scanning is happening right now — this doesn't mean the app is broken, just that no live feed is connected."}
        </Text>
        {active && monitoring.lastHeartbeatAt ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: colors.faint, marginTop: 4 }}>
            Last scan heartbeat: {new Date(monitoring.lastHeartbeatAt + 'Z').toLocaleString()}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.text, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
