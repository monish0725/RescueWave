import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/colors';

interface Props {
  score: number; // 0-100
  size?: number;
  label: string;
}

export default function SafetyScoreRing({ score, size = 72, label }: Props) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = c - (score / 100) * c;
  const tint = score >= 80 ? colors.teal : score >= 50 ? colors.amber : colors.crimson;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={progress}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: '#fff' }}>{score}</Text>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>{label}</Text>
    </View>
  );
}
