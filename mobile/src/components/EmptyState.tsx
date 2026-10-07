import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

export default function EmptyState({ icon = 'inbox', title, subtitle }: { icon?: keyof typeof Feather.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Feather name={icon} size={26} color={colors.green} />
      </View>
      <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
}
