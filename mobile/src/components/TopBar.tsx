import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import IconButton from './IconButton';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

/** Matches the app.html `.topnav`: logo/title on the left, optional action on the right. */
export default function TopBar({ title, showBack, right }: TopBarProps) {
  const router = useRouter();
  return (
    <View
      style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
        gap: 12,
      }}
    >
      {showBack && (
        <IconButton name="arrow-left" onPress={() => router.back()} color={colors.text} backgroundColor={colors.bg} />
      )}
      {!showBack && (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="shield" size={16} color="#fff" />
        </View>
      )}
      <Text style={{ flex: 1, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17, color: colors.text }}>{title}</Text>
      {right}
    </View>
  );
}
