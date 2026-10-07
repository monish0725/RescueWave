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
import { applyToBeHelper } from '@/api/helpers';
import { isValidEmail, isValidPhone } from '@/utils/validation';
import type { HelperSkill } from '@/types';

const SKILLS: Array<{ key: HelperSkill; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'first_aid', label: 'First Aid', icon: 'heart' },
  { key: 'medical', label: 'Medical', icon: 'activity' },
  { key: 'security', label: 'Security', icon: 'shield' },
  { key: 'general_volunteer', label: 'General Volunteer', icon: 'users' },
];

export default function HelperApplyScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [address, setAddress] = useState('');
  const [skills, setSkills] = useState<HelperSkill[]>([]);
  const [availability, setAvailability] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string; email?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function toggleSkill(skill: HelperSkill) {
    setSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));
  }

  async function submit() {
    setError(null);
    const errs: typeof fieldErrors = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required.';
    if (!phone.trim()) errs.phone = 'Phone number is required.';
    else if (!isValidPhone(phone)) errs.phone = 'Enter a valid phone number.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!isValidEmail(email)) errs.email = 'Enter a valid email address.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }
    if (skills.length === 0) {
      setError('Select at least one skill.');
      return;
    }
    setSubmitting(true);
    try {
      await applyToBeHelper({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim() || undefined,
        skills,
        availability: availability.trim() || undefined,
        emergency_contact_name: ecName.trim() || undefined,
        emergency_contact_phone: ecPhone.trim() || undefined,
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
            An admin will review your details. You'll see your status update here and in your Profile once it's been reviewed.
          </Text>
          <Button label="Back to Profile" onPress={() => router.replace('/(app)/profile')} style={{ width: '100%' }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Become a Helper" showBack />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ backgroundColor: colors.navyMist, borderColor: colors.navy, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.navy, lineHeight: 18 }}>
            Helpers are verified community members who can be dispatched to nearby SOS alerts. Fill this in, and an
            admin will review it before your Helper account is activated.
          </Text>
        </Card>

        <TextField label="Full name *" value={fullName} onChangeText={(v) => { setFullName(v); if (fieldErrors.fullName) setFieldErrors((f) => ({ ...f, fullName: undefined })); }} error={fieldErrors.fullName} />
        <TextField label="Phone number *" keyboardType="phone-pad" value={phone} onChangeText={(v) => { setPhone(v); if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined })); }} error={fieldErrors.phone} />
        <TextField label="Email *" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(v) => { setEmail(v); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }} error={fieldErrors.email} />
        <TextField label="Address" placeholder="Where you're usually based" value={address} onChangeText={setAddress} />

        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 8 }}>Skills *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {SKILLS.map((s) => {
            const active = skills.includes(s.key);
            return (
              <Pressable
                key={s.key}
                onPress={() => toggleSkill(s.key)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: active ? colors.navy : colors.border, backgroundColor: active ? colors.navy : colors.surface }}>
                  <Feather name={s.icon} size={13} color={active ? '#fff' : colors.muted} />
                  <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: active ? '#fff' : colors.text }}>{s.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <TextField label="Availability" placeholder="e.g. Weekday evenings, weekends" value={availability} onChangeText={setAvailability} />
        <TextField label="Emergency contact name (optional)" value={ecName} onChangeText={setEcName} />
        <TextField label="Emergency contact phone (optional)" keyboardType="phone-pad" value={ecPhone} onChangeText={setEcPhone} />

        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: colors.faint, marginBottom: 16 }}>
          Applications are reviewed manually by an admin — there's no automated ID or document verification yet, so
          review may take some time. You'll see your status update here and in your Profile once it's been reviewed.
        </Text>

        {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
        <Button label="Submit Application" onPress={submit} loading={submitting} />
      </ScrollView>
    </Screen>
  );
}
