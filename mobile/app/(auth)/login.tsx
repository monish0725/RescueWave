import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme/colors';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import AuthHero from '@/components/AuthHero';
import { EMERGENCY_SERVICES_NUMBER } from '@/constants/emergency';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
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
          <AuthHero title="Welcome back" subtitle="Sign in to continue to your safety dashboard." compact />

          <Animated.View
            entering={FadeInUp.duration(420).springify().damping(18)}
            style={{ flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28, marginTop: -20 }}
          >
            <TextField label="Email" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextField label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />
            {error ? (
              <Animated.Text entering={FadeInDown.duration(200)} style={{ color: colors.crimson, fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 12 }}>
                {error}
              </Animated.Text>
            ) : null}
            <Button label="Log In" onPress={onSubmit} loading={loading} />
            <View style={{ marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: colors.crimsonMist }}>
              <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: colors.crimson }}>Emergency?</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.crimson, marginTop: 3, marginBottom: 10 }}>
                SOS dispatch needs a signed-in RescueWave account. You can call emergency services immediately without signing in.
              </Text>
              <Button
                label={`Call Emergency Services (${EMERGENCY_SERVICES_NUMBER})`}
                variant="danger"
                onPress={() => Linking.openURL(`tel:${EMERGENCY_SERVICES_NUMBER}`)}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 22, marginBottom: 28, gap: 4 }}>
              <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.muted }}>New to RescueWave?</Text>
              <Link href="/(auth)/register" asChild>
                <Pressable>
                  <Text style={{ fontFamily: 'DMSans_700Bold', color: colors.navy }}>Create an account</Text>
                </Pressable>
              </Link>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
