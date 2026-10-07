import React from 'react';
import { View, Text, ScrollView, Linking, Pressable, Image } from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';

const rescueWaveLogo = require('../../assets/brand/rescuewave-mark.png');

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <Screen scroll={false}>
      <TopBar title="About RescueWave" showBack />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 132, height: 132, borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' }}>
            <Image source={rescueWaveLogo} resizeMode="contain" style={{ width: 132, height: 132 }} />
          </View>
          <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text }}>RescueWave</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, marginTop: 2 }}>Version {version}</Text>
        </View>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 6 }}>A Smarter Way To Save</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            RescueWave is a personal safety companion built as a final-year engineering project. It lets you raise
            emergency SOS alerts, manage emergency contacts, find nearby hospitals, police and fire stations, report
            missing persons, and access a quick medical reference guide. Emergency contacts and your saved records
            are kept in an on-device database so you can view them offline, but getting help to actually reach
            you — notifying nearby Helpers on an SOS, or getting a missing-person report to Police and the AI
            camera-matching service — needs your account synced and a live connection to the RescueWave server.
          </Text>
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 6 }}>What's next</Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.muted, lineHeight: 19 }}>
            AI detection on registered CCTV cameras — missing-person face matching, gesture, voice, and fall
            detection — runs via a separate AI service you connect to your own camera streams (see My Cameras).
            Running that same detection live on your phone's own camera, in-app, is still planned for a future phase.
          </Text>
        </Card>

        <Pressable onPress={() => Linking.openURL('mailto:support@rescuewave.app')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="mail" size={16} color={colors.green} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.green }}>support@rescuewave.app</Text>
          </Card>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
