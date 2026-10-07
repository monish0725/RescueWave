import '../global.css';
import React, { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts as useIconFonts } from 'expo-font';
import { Feather, AntDesign } from '@expo/vector-icons';
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts as useDMSans, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { AuthProvider } from '@/context/AuthContext';
import { initDatabase } from '@/db/database';
import SplashView from '@/components/SplashView';
import '@/utils/liveShareTask'; // registers the background location task (side-effect import)

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [fontsLoaded1] = useSpaceGrotesk({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  const [fontsLoaded2] = useDMSans({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  // Icon glyphs (Feather/AntDesign, used everywhere in the app) are font
  // files themselves — @expo/vector-icons normally auto-registers them,
  // but that auto-registration can silently no-op on some Expo Go/SDK
  // combinations, rendering blank space instead of a glyph with no error
  // anywhere. Loading them explicitly, the same way the text fonts above
  // already are, is the documented fix and means the app simply won't
  // render until the icon fonts are actually ready, instead of racing.
  const [iconFontsLoaded] = useIconFonts({ ...Feather.font, ...AntDesign.font });

  useEffect(() => {
    try {
      initDatabase();
      setDbReady(true);
    } catch (e) {
      console.error('Failed to initialize local database', e);
      setDbReady(true); // don't hard-block the app; screens surface their own errors
    }
  }, []);

  const ready = dbReady && fontsLoaded1 && fontsLoaded2 && iconFontsLoaded;

  const onLayout = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (dbReady) onLayout();
  }, [dbReady, onLayout]);

  if (!ready) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
        <SplashView />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
