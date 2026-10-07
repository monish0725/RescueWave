import React from 'react';
import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

const rescueWaveLogo = require('../../assets/brand/rescuewave-logo.png');

interface AuthHeroProps {
  title: string;
  subtitle: string;
  compact?: boolean;
}

/**
 * The RescueWave artwork belongs at the start of the signed-out journey so
 * people see the actual product identity before the login form.
 */
export default function AuthHero({ title, subtitle, compact }: AuthHeroProps) {
  const h = compact ? 276 : 318;
  return (
    <LinearGradient colors={[colors.navy, colors.navyDeep]} style={{ height: h, paddingHorizontal: 24, paddingTop: 16, alignItems: 'center' }}>
      <View style={{ width: compact ? 168 : 204, height: compact ? 168 : 204, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={rescueWaveLogo} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </View>
      <View style={{ width: '100%', marginTop: 12 }}>
        <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 25, color: '#fff', textAlign: 'center' }}>{title}</Text>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 5, textAlign: 'center' }}>{subtitle}</Text>
      </View>
    </LinearGradient>
  );
}
