import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme/colors';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import AuthHero from '@/components/AuthHero';
import { EMERGENCY_SERVICES_NUMBER } from '@/constants/emergency';

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, phone.trim() || undefined);
      router.replace('/(app)/home');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View>
            <AuthHero title="Join RescueWave" subtitle="Create your account to unlock SOS, safety tools and community protection." compact />
            <Pressable onPress={() => router.back()} style={{ position: 'absolute', top: 8, left: 20, padding: 6 }} hitSlop={10}>
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
          </View>

          <Animated.View
            entering={FadeInDown.duration(420).springify().damping(18)}
            style={{ flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28, marginTop: -20 }}
          >
            <TextField label="Full name" placeholder="Jane Doe" value={name} onChangeText={setName} />
            <TextField label="Email" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextField label="Phone (optional)" placeholder="+91 98765 43210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextField label="Password" placeholder="At least 6 characters" secureTextEntry value={password} onChangeText={setPassword} />
            <TextField label="Confirm password" placeholder="Re-enter password" secureTextEntry value={confirm} onChangeText={setConfirm} />
            {error ? <Text style={{ color: colors.crimson, fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
            <Button label="Create Account" onPress={onSubmit} loading={loading} />
            <View style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: colors.crimsonMist }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.crimson }}>Emergency?</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.crimson, marginTop: 3, marginBottom: 10 }}>
                You can call emergency services now. Create an account when you are safe to use RescueWave SOS dispatch.
              </Text>
              <Button
                label={`Call Emergency Services (${EMERGENCY_SERVICES_NUMBER})`}
                variant="danger"
                onPress={() => Linking.openURL(`tel:${EMERGENCY_SERVICES_NUMBER}`)}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 22, marginBottom: 28, gap: 4 }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.muted }}>Already have an account?</Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.navy }}>Log in</Text>
                </Pressable>
              </Link>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
