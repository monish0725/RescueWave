import React from 'react';
import { View, ViewProps } from 'react-native';
import { colors } from '@/theme/colors';

export default function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
