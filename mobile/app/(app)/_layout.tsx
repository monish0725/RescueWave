import React, { useEffect, useState } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { SosUiProvider, useSosUi } from '@/context/SosUiContext';
import { colors } from '@/theme/colors';
import { registerForPushNotifications } from '@/utils/pushRegistration';

// Maps a push notification's `data.type` (set by the backend — see
// backend/src/routes/alerts.js) to where tapping it should take the person.
// Keeps notification routing in one place instead of scattered per-screen.
function routeForNotification(data: Record<string, any> | undefined): string | null {
  if (!data?.type) return null;
  switch (data.type) {
    case 'sos_nearby':
      return '/(app)/helper';
    case 'sos_nearby_authority':
    case 'report_nearby':
      return '/(app)/authority';
    case 'helper_assigned':
    case 'helper_status':
    case 'authority_assigned':
    case 'authority_status':
      return data.alertId ? `/(app)/alert/${data.alertId}` : null;
    case 'missing_match':
    case 'missing_found':
      return data.missingPersonId ? `/(app)/missing/${data.missingPersonId}` : '/(app)/missing';
    default:
      return null;
  }
}

function SosTabButton() {
  const router = useRouter();
  const { sosTabLocked } = useSosUi();
  return (
    <Pressable
      onPress={() => {
        if (sosTabLocked) return; // an SOS is already being confirmed/sent/was just sent — don't let this trigger another one
        router.push('/(app)/sos');
      }}
      disabled={sosTabLocked}
      accessibilityState={{ disabled: sosTabLocked }}
      style={{ top: -14, alignItems: 'center', justifyContent: 'center', opacity: sosTabLocked ? 0.35 : 1 }}
      hitSlop={10}
    >
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: colors.red,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: 'rgba(211,47,47,0.25)',
          shadowColor: colors.red,
          shadowOpacity: 0.4,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Feather name="phone-call" size={22} color="#fff" />
      </View>
    </Pressable>
  );
}

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) registerForPushNotifications();
  }, [user?.id]);

  // Tapping a notification (foreground, background, or from a cold start)
  // should take the person straight to the relevant screen — a Helper
  // tapping "Emergency nearby" lands on the assignments list, a reporter
  // tapping "Helper update" lands on that alert's status page.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      const Notifications = require('expo-notifications');
      sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const target = routeForNotification(response.notification.request.content.data as Record<string, any>);
        if (target) router.push(target as any);
      });
    } catch (err) {
      console.warn('Notification routing disabled in this runtime:', (err as Error)?.message);
    }
    return () => sub?.remove();
  }, [router]);

  if (isLoading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <SosUiProvider>
      <AppTabs />
    </SosUiProvider>
  );
}

function AppTabs() {
  // The bottom tab bar sits on the iPhone home-indicator safe area, so its
  // height/bottom padding has to include insets.bottom — a fixed height
  // crowds the labels against (or under) the home indicator on notched/
  // Dynamic Island devices.
  const insets = useSafeAreaInsets();
  const tabBarBasePadding = 8;
  const tabBarContentHeight = 56;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: tabBarContentHeight + tabBarBasePadding + insets.bottom,
          paddingBottom: tabBarBasePadding + insets.bottom,
          paddingTop: 6,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'DMSans_500Medium' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="routes" options={{ title: 'Nearby', tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size} color={color} /> }} />
      <Tabs.Screen
        name="sos"
        options={{
          title: 'SOS',
          tabBarButton: () => <SosTabButton />,
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
          },
        })}
      />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color, size }) => <Feather name="bell" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />

      {/* Screens reachable from Home / Profile but not shown as tabs */}
      <Tabs.Screen name="report" options={{ href: null }} />
      <Tabs.Screen name="contacts" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="about" options={{ href: null }} />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="camera" options={{ href: null }} />
      <Tabs.Screen name="medical" options={{ href: null }} />
      <Tabs.Screen name="missing/index" options={{ href: null }} />
      <Tabs.Screen name="missing/add" options={{ href: null }} />
      <Tabs.Screen name="missing/[id]" options={{ href: null }} />
      <Tabs.Screen name="helper-apply" options={{ href: null }} />
      <Tabs.Screen name="helper/index" options={{ href: null }} />
      <Tabs.Screen name="helper/mission/[id]" options={{ href: null }} />
      <Tabs.Screen name="authority-apply" options={{ href: null }} />
      <Tabs.Screen name="authority/index" options={{ href: null }} />
      <Tabs.Screen name="authority/case/[id]" options={{ href: null }} />
      <Tabs.Screen name="alert/[id]" options={{ href: null }} />
      <Tabs.Screen name="camera-register" options={{ href: null }} />
      <Tabs.Screen name="cameras" options={{ href: null }} />
      <Tabs.Screen name="cctv-coverage" options={{ href: null }} />
      <Tabs.Screen name="safe-route" options={{ href: null }} />
    </Tabs>
  );
}
