import React, { useState } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface IconButtonProps {
  name: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  size?: number;
  style?: ViewStyle;
  disabled?: boolean;
}

export default function IconButton({
  name,
  onPress,
  color = colors.navy,
  backgroundColor = colors.navyMist,
  borderColor = colors.borderStrong,
  size = 18,
  style,
  disabled,
}: IconButtonProps) {
  // Same fix, same reason as Button.tsx: backgroundColor on a Pressable's
  // own style doesn't reliably render here. Fill/border/size AND the
  // caller's `style` override all live on the inner View; the Pressable
  // carries only disabled/pressed opacity.
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      hitSlop={8}
      style={{ opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }}
    >
      <View
        style={[
          {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor,
            borderWidth: 1,
            borderColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <Feather name={name} size={size} color={color} />
      </View>
    </Pressable>
  );
}
