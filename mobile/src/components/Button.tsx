import React, { useState } from 'react';
import { Pressable, View, Text, ActivityIndicator, ViewStyle, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export default function Button({ label, onPress, variant = 'primary', loading, disabled, style, icon }: ButtonProps) {
  // `backgroundColor` set directly on a Pressable's own `style` doesn't
  // reliably render in this app — verified against the one control that
  // DOES render correctly everywhere, the red SOS tab button in
  // app/(app)/_layout.tsx, which puts its backgroundColor on a plain
  // <View> nested INSIDE a Pressable that carries no fill of its own.
  // (Likely cause: jsxImportSource is 'nativewind' — babel.config.js —
  // so every core RN component is routed through NativeWind's cssInterop,
  // and Pressable is a composite component, not a host component like
  // View; its style interception apparently doesn't forward
  // backgroundColor the same way.)
  //
  // Matching that structure: the Pressable itself carries only
  // press/disabled opacity — no caller style — and the inner View carries
  // the fill, border, padding AND the caller's `style` override (so
  // per-call-site overrides like a compact `paddingVertical` still land
  // on the box they're meant to resize, exactly as when this was one
  // element). RN's layout engine sizes a shrink-wrapped parent to include
  // its child's margin box, so margin/width overrides on the inner View
  // still produce the same spacing/sizing the caller expects.
  const [pressed, setPressed] = useState(false);

  const bg = variant === 'primary' ? colors.green : variant === 'danger' ? colors.red : 'transparent';
  const border = variant === 'outline' ? colors.border : bg;
  const textColor = variant === 'outline' ? colors.text : '#fff';
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const {
    width,
    minWidth,
    maxWidth,
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    marginHorizontal,
    marginVertical,
    alignSelf,
    flex,
    flexGrow,
    flexShrink,
    ...buttonStyle
  } = flatStyle;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled || loading}
      style={[
        {
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width,
          minWidth,
          maxWidth,
          margin,
          marginTop,
          marginRight,
          marginBottom,
          marginLeft,
          marginHorizontal,
          marginVertical,
          alignSelf,
          flex,
          flexGrow,
          flexShrink,
        },
      ]}
    >
      <View
        style={[
          {
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: border,
            borderRadius: 12,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
          },
          buttonStyle,
        ]}
      >
        {loading ? <ActivityIndicator color={textColor} /> : (
          <>
            {icon}
            <Text
              style={{
                color: textColor,
                fontFamily: 'SpaceGrotesk_600SemiBold',
                fontSize: 15,
                textAlign: 'center',
                flexShrink: 1,
              }}
              numberOfLines={2}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}
