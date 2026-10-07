import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { EMERGENCY_SERVICES_NUMBER } from '@/constants/emergency';

const FAQS = [
  {
    q: 'Does RescueWave work without internet?',
    a: 'Partly. Your emergency contacts, and the alert and missing-person records already saved on this device, are stored locally and can be viewed offline. But the features that involve other people — dispatching an SOS to nearby Helpers, submitting a missing-person report so Police and the AI camera-matching service can see it, logging in, and syncing your profile — all need a live connection to the RescueWave server. If you raise an SOS or add a missing person while offline, it is saved on your device immediately, but it does NOT automatically sync once you\u2019re back online — the app does not currently retry in the background. You\u2019ll need to be online at the moment you submit for the server to receive it and notify anyone; otherwise, open the record again with a connection and try saving/submitting it once more.',
  },
  {
    q: 'What happens when I press SOS?',
    a: `First, RescueWave captures your current GPS location and the time and saves the alert to your on-device Alert History right away — this part works even without a connection. It then tries to send that alert to the RescueWave server so nearby verified Helpers (and, where applicable, Authorities) can see it and respond; this step needs internet access. If it succeeds, you'll see how many Helpers were notified. If it fails — no signal, server unreachable — the alert stays saved on this device as your personal log, but no Helper has been notified, and the app tells you that plainly instead of pretending otherwise.`,
  },
  {
    q: 'No Helper is available or my SOS could not reach the server — what should I do?',
    a: `Treat this as a real emergency and act immediately: call emergency services (${EMERGENCY_SERVICES_NUMBER}, or Ambulance 108 / Police 100 / Fire 101) or a saved emergency contact — both are one tap from the SOS screen. Don't wait on the app to find a Helper. Automatic calling or SMS to emergency services is not implemented in this version; RescueWave only places the call once you tap to confirm it.`,
  },
  {
    q: 'Where does the nearby hospitals/police/fire data come from?',
    a: 'From OpenStreetMap map data around your current location, so results are real and don\u2019t need a paid maps subscription. This lookup needs a network connection.',
  },
  {
    q: 'Is my data private?',
    a: 'Your account (name, email, phone) is stored on the RescueWave server behind a hashed password. Your saved emergency contacts stay on this device only and are never uploaded. Alerts you raise and missing-person reports you submit are saved on this device first, but are also sent to the RescueWave server by design — that server-side copy is what lets Helpers, Authorities, and the AI camera-matching service actually see and act on them.',
  },
];

export default function HelpScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <Screen scroll={false}>
      <TopBar title="Help & Support" showBack />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginBottom: 10 }}>Frequently Asked Questions</Text>
        {FAQS.map((f, i) => (
          <Pressable key={f.q} onPress={() => setOpenIndex(openIndex === i ? null : i)}>
            <Card style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.text, flex: 1, marginRight: 10 }}>{f.q}</Text>
                <Feather name={openIndex === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </View>
              {openIndex === i && <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 18 }}>{f.a}</Text>}
            </Card>
          </Pressable>
        ))}

        <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: colors.text, marginTop: 16, marginBottom: 10 }}>Still need help?</Text>
        <Button label="Email Support" onPress={() => Linking.openURL('mailto:support@rescuewave.app?subject=RescueWave Support')} icon={<Feather name="mail" size={16} color="#fff" />} style={{ marginBottom: 10 }} />
        <Button label={`Call Emergency Services (${EMERGENCY_SERVICES_NUMBER})`} variant="outline" onPress={() => Linking.openURL(`tel:${EMERGENCY_SERVICES_NUMBER}`)} icon={<Feather name="phone" size={16} color={colors.text} />} />
      </ScrollView>
    </Screen>
  );
}
