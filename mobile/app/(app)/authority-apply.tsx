import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { applyAsAuthority } from '@/api/authorities';
import { getCurrentLocation } from '@/utils/location';
import { isValidEmail, isValidPhone } from '@/utils/validation';
import type { AuthorityType } from '@/types';

const TYPES: Array<{ key: AuthorityType; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'police', label: 'Police', icon: 'shield' },
  { key: 'hospital', label: 'Hospital', icon: 'plus-square' },
  { key: 'fire', label: 'Fire Department', icon: 'alert-octagon' },
];

export default function AuthorityApplyScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [authorityType, setAuthorityType] = useState<AuthorityType>('police');
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [address, setAddress] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ orgName?: string; contactName?: string; phone?: string; email?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setError(null);
    const errs: typeof fieldErrors = {};
    if (!orgName.trim()) errs.orgName = 'Organization name is required.';
    if (!contactName.trim()) errs.contactName = 'Contact person is required.';
    if (!phone.trim()) errs.phone = 'Phone number is required.';
    else if (!isValidPhone(phone)) errs.phone = 'Enter a valid phone number.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }
    setSubmitting(true);
    try {
      const loc = await getCurrentLocation().catch(() => null);
      await applyAsAuthority({
        authority_type: authorityType,
        org_name: orgName.trim(),
        contact_name: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim() || undefined,
        lat: loc?.lat,
        lng: loc?.lng,
        license_or_badge_id: licenseId.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Screen scroll={false}>
        <TopBar title="Application Submitted" showBack />
        <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Feather name="check-circle" size={40} color={colors.teal} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center' }}>Application submitted</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>
            An admin will review your organization's details before activating this Authority account.
          </Text>
          <Button label="Back to Profile" onPress={() => router.replace('/(app)/profile')} style={{ width: '100%' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Register as Authority" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: colors.navyMist, borderColor: colors.navy, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.navy, lineHeight: 18 }}>
            For Police, Hospitals and Fire Departments who want to receive and respond to nearby SOS alerts and
            citizen reports through RescueWave. An admin reviews every application before activation.
          </Text>
        </Card>

        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 8 }}>Organization type *</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {TYPES.map((t) => {
            const active = authorityType === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setAuthorityType(t.key)}
                style={{ flex: 1 }}
              >
                <View style={{ alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: active ? colors.navy : colors.border, backgroundColor: active ? colors.navy : colors.surface }}>
                  <Feather name={t.icon} size={18} color={active ? '#fff' : colors.muted} />
                  <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 11, color: active ? '#fff' : colors.text }}>{t.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <TextField label="Organization name *" placeholder="e.g. MG Road Police Station" value={orgName} onChangeText={(v) => { setOrgName(v); if (fieldErrors.orgName) setFieldErrors((f) => ({ ...f, orgName: undefined })); }} error={fieldErrors.orgName} />
        <TextField label="Contact person *" value={contactName} onChangeText={(v) => { setContactName(v); if (fieldErrors.contactName) setFieldErrors((f) => ({ ...f, contactName: undefined })); }} error={fieldErrors.contactName} />
        <TextField label="Phone number *" keyboardType="phone-pad" value={phone} onChangeText={(v) => { setPhone(v); if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined })); }} error={fieldErrors.phone} />
        <TextField label="Email *" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(v) => { setEmail(v); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }} error={fieldErrors.email} />
        <TextField label="Address / jurisdiction" value={address} onChangeText={setAddress} />
        <TextField label="Badge / license ID (optional)" value={licenseId} onChangeText={setLicenseId} />

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.faint, marginBottom: 16 }}>
          Applications are reviewed manually by an admin — there's no automated government ID verification yet, so
          review may take some time. Your current location is captured as this organization's station location.
        </Text>

        {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
        <Button label="Submit Application" onPress={submit} loading={submitting} />
      </ScrollView>
    </Screen>
  );
}
