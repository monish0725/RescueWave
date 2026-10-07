import React from 'react';
import { ScrollView, View, ViewProps, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Set false only for screens that intentionally manage their own keyboard behavior (e.g. a screen with a map). */
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}

// Content always needs enough bottom padding to clear the persistent tab bar
// (64pt + bottom safe-area handled by the tab navigator itself) plus room so
// the last field/button in a form isn't flush against it.
const CONTENT_BOTTOM_PADDING = 48;

/** Shared page wrapper: safe-area + optional scroll + pull-to-refresh + keyboard avoidance, matching the app-wide bg color. */
export default function Screen({ scroll = true, refreshing, onRefresh, avoidKeyboard = true, children, style, ...rest }: ScreenProps) {
  if (!scroll) {
    // scroll=false screens (TopBar + their own inner ScrollView/list) still need
    // keyboard avoidance — the inner scroll view alone won't push content up.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {avoidKeyboard ? (
          <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} {...rest}>
            {children}
          </KeyboardAvoidingView>
        ) : (
          <View style={[{ flex: 1 }, style]} {...rest}>
            {children}
          </View>
        )}
      </SafeAreaView>
    );
  }

  const content = (
    <ScrollView
      style={[{ flex: 1 }, style]}
      contentContainerStyle={{ paddingBottom: CONTENT_BOTTOM_PADDING }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
