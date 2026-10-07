import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { SettingsRepo } from '@/db/database';
import { getMyHelperStatus } from '@/api/helpers';
import { getMyAuthorityStatus } from '@/api/authorities';
import type { HelperApplication, AuthorityApplication, AuthUser } from '@/types';

export default function ProfileScreen() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [bloodGroup, setBloodGroup] = useState(user?.blood_group ?? '');
  const [medicalInfo, setMedicalInfo] = useState(user?.medical_info ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(SettingsRepo.get('profile_avatar_uri'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helperApp, setHelperApp] = useState<HelperApplication | null | undefined>(undefined); // undefined = loading
  const [authorityApp, setAuthorityApp] = useState<AuthorityApplication | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      getMyHelperStatus()
        .then((s) => setHelperApp(s.application))
        .catch(() => setHelperApp(null));
      getMyAuthorityStatus()
        .then((s) => setAuthorityApp(s.application))
        .catch(() => setAuthorityApp(null));
    }, [])
  );

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required to set a profile photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) {
      SettingsRepo.set('profile_avatar_uri', result.assets[0].uri);
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim(), blood_group: bloodGroup.trim(), medical_info: medicalInfo.trim() });
      setEditing(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ backgroundColor: colors.greenDark, paddingTop: 24, paddingBottom: 28, alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Pressable onPress={pickAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)' }} />
          ) : (
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, color: '#fff' }}>{(user?.name ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.greenDark, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#fff', marginTop: 12 }}>{user?.name}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{user?.email}</Text>
      </View>

      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text }}>Personal & Medical Info</Text>
          <Pressable onPress={() => setEditing((v) => !v)}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.green }}>{editing ? 'Cancel' : 'Edit'}</Text>
          </Pressable>
        </View>

        <Card style={{ marginBottom: 16 }}>
          {editing ? (
            <>
              <TextField label="Full name" value={name} onChangeText={setName} />
              <TextField label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              <TextField label="Blood group" placeholder="e.g. O+" value={bloodGroup} onChangeText={setBloodGroup} />
              <TextField label="Medical information" placeholder="Allergies, conditions, medications…" value={medicalInfo} onChangeText={setMedicalInfo} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
              {error ? <Text style={{ color: colors.red, fontSize: 12, marginBottom: 10, fontFamily: 'DMSans_400Regular' }}>{error}</Text> : null}
              <Button label="Save Changes" onPress={save} loading={saving} />
            </>
          ) : (
            <>
              <ProfileRow label="Phone" value={user?.phone || 'Not set'} />
              <ProfileRow label="Blood Group" value={user?.blood_group || 'Not set'} />
              <ProfileRow label="Medical Info" value={user?.medical_info || 'Not set'} last />
            </>
          )}
        </Card>

        <HelperStatusCard application={helperApp} user={user} onPress={() => router.push(helperApp ? '/(app)/helper' : '/(app)/helper-apply')} />
        <AuthorityStatusCard application={authorityApp} user={user} onPress={() => router.push(authorityApp ? '/(app)/authority' : '/(app)/authority-apply')} />

        <MenuSection title="Safety">
          <MenuRow icon="file-text" label="My Reports" onPress={() => router.push('/(app)/alerts')} />
          <MenuRow icon="users" label="Emergency Contacts" onPress={() => router.push('/(app)/contacts')} />
          <MenuRow icon="radio" label="Share Live Location" onPress={() => router.push('/(app)/contacts')} />
          <MenuRow icon="search" label="My Missing Person Reports" onPress={() => router.push('/(app)/missing')} />
        </MenuSection>

        <MenuSection title="Response Roles">
          <MenuRow icon="shield" label="My Helper Application" onPress={() => router.push(helperApp ? '/(app)/helper' : '/(app)/helper-apply')} />
          <MenuRow icon="briefcase" label="My Authority Application" onPress={() => router.push(authorityApp ? '/(app)/authority' : '/(app)/authority-apply')} />
        </MenuSection>

        <MenuSection title="App">
          <MenuRow icon="camera" label="My CCTV Cameras" onPress={() => router.push('/(app)/cameras')} />
          <MenuRow icon="bell" label="Notification Center" onPress={() => router.push('/(app)/notifications')} />
          <MenuRow icon="settings" label="App Settings" onPress={() => router.push('/(app)/settings')} />
          <MenuRow icon="help-circle" label="Help & Support" onPress={() => router.push('/(app)/help')} />
          <MenuRow icon="info" label="About RescueWave" onPress={() => router.push('/(app)/about')} />
        </MenuSection>
      </View>
    </Screen>
  );
}

function HelperStatusCard({ application, user, onPress }: { application: HelperApplication | null | undefined; user: AuthUser | null; onPress: () => void }) {
  if (application === undefined) {
    return (
      <Card style={{ marginBottom: 12, alignItems: 'center', paddingVertical: 18 }}>
        <ActivityIndicator size="small" color={colors.navy} />
      </Card>
    );
  }

  let icon: keyof typeof Feather.glyphMap = 'shield';
  let title = 'Become a Helper';
  let subtitle = 'Apply to respond to nearby emergencies in your community.';
  let bg = colors.navyMist;
  let tint = colors.navy;

  if (application?.status === 'pending') {
    icon = 'clock';
    title = 'Helper Application Pending';
    subtitle = 'An admin is reviewing your application.';
    bg = colors.amberMist;
    tint = colors.amberText;
  } else if (application?.status === 'rejected') {
    icon = 'x-circle';
    title = 'Helper Application Not Approved';
    subtitle = 'Tap to view details or re-apply.';
    bg = colors.crimsonMist;
    tint = colors.crimson;
  } else if (application?.status === 'approved' && user?.role === 'helper' && !!user.helper_verified) {
    icon = 'shield';
    title = 'Verified Helper';
    subtitle = 'Manage your availability and respond to nearby SOS alerts.';
    bg = colors.tealMist;
    tint = colors.tealText;
  } else if (application?.status === 'approved') {
    icon = 'clock';
    title = 'Helper Approval Syncing';
    subtitle = 'Your approval is recorded. Refresh profile if privileges are not active yet.';
    bg = colors.amberMist;
    tint = colors.amberText;
  }

  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 12, backgroundColor: bg, borderColor: tint, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Feather name={icon} size={20} color={tint} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: tint }}>{title}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: tint, marginTop: 2 }}>{subtitle}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={tint} />
      </Card>
    </Pressable>
  );
}

function AuthorityStatusCard({ application, user, onPress }: { application: AuthorityApplication | null | undefined; user: AuthUser | null; onPress: () => void }) {
  if (application === undefined) {
    return (
      <Card style={{ marginBottom: 12, alignItems: 'center', paddingVertical: 18 }}>
        <ActivityIndicator size="small" color={colors.navy} />
      </Card>
    );
  }

  let icon: keyof typeof Feather.glyphMap = 'shield';
  let title = 'Register as Authority';
  let subtitle = 'For Police, Hospitals and Fire Departments to respond to nearby alerts.';
  let bg = colors.navyMist;
  let tint = colors.navy;

  if (application?.status === 'pending') {
    icon = 'clock';
    title = 'Authority Application Pending';
    subtitle = 'An admin is reviewing your organization\u2019s details.';
    bg = colors.amberMist;
    tint = colors.amberText;
  } else if (application?.status === 'rejected') {
    icon = 'x-circle';
    title = 'Authority Application Not Approved';
    subtitle = 'Tap to view details or re-apply.';
    bg = colors.crimsonMist;
    tint = colors.crimson;
  } else if (application?.status === 'approved' && user?.role === 'authority' && !!user.authority_verified) {
    icon = 'shield';
    title = 'Verified Authority';
    subtitle = 'Manage cases assigned to your organization.';
    bg = colors.tealMist;
    tint = colors.tealText;
  } else if (application?.status === 'approved') {
    icon = 'clock';
    title = 'Authority Approval Syncing';
    subtitle = 'Your approval is recorded. Refresh profile if privileges are not active yet.';
    bg = colors.amberMist;
    tint = colors.amberText;
  }

  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 12, backgroundColor: bg, borderColor: tint, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Feather name={icon} size={20} color={tint} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: tint }}>{title}</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: tint, marginTop: 2 }}>{subtitle}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={tint} />
      </Card>
    </Pressable>
  );
}

function ProfileRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text, maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Feather name={icon} size={18} color={colors.text} />
        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.text, flex: 1 }}>{label}</Text>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 10 }}>
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}
