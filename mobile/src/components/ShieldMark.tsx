import React from 'react';
import { Image, View } from 'react-native';
import { colors } from '@/theme/colors';

const rescueWaveLogo = require('../../assets/brand/rescuewave-mark.png');

interface ShieldMarkProps {
  size?: number;
  variant?: 'gradient' | 'flat' | 'outline';
  color?: string;
}

export default function ShieldMark({ size = 64, variant = 'gradient' }: ShieldMarkProps) {
  const framed = variant !== 'outline';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(10, size * 0.22),
        overflow: 'hidden',
        backgroundColor: framed ? '#fff' : 'transparent',
        borderWidth: framed ? 1 : 0,
        borderColor: framed ? 'rgba(255,255,255,0.26)' : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.navyDeep,
        shadowOpacity: framed ? 0.18 : 0,
        shadowRadius: framed ? 10 : 0,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Image
        source={rescueWaveLogo}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
        }}
      />
    </View>
  );
}
