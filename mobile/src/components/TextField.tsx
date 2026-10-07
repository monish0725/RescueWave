import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { colors } from '@/theme/colors';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function TextField({ label, error, style, ...rest }: TextFieldProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.muted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[
          {
            borderWidth: 1,
            borderColor: error ? colors.red : colors.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            fontFamily: 'DMSans_400Regular',
            color: colors.text,
            backgroundColor: colors.surface,
          },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={{ color: colors.red, fontSize: 12, marginTop: 4, fontFamily: 'DMSans_400Regular' }}>{error}</Text> : null}
    </View>
  );
}
