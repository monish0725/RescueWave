import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import { colors } from '@/theme/colors';

const GUIDES = [
  {
    title: 'CPR (Cardiopulmonary Resuscitation)',
    icon: 'heart' as const,
    steps: [
      'Check the person is unresponsive and not breathing normally. Call 108 immediately.',
      'Place the heel of one hand on the center of the chest, other hand on top, fingers interlaced.',
      'Push hard and fast — at least 5 cm deep, at a rate of 100–120 compressions per minute.',
      'Allow full chest recoil between compressions. Continue until help arrives or the person responds.',
      'If trained, give 2 rescue breaths after every 30 compressions.',
    ],
  },
  {
    title: 'Severe Bleeding',
    icon: 'droplet' as const,
    steps: [
      'Apply firm, direct pressure to the wound with a clean cloth or bandage.',
      'Do not remove the cloth if it soaks through — add more layers on top.',
      'Raise the injured area above heart level if possible.',
      'If bleeding doesn\u2019t stop, apply pressure to the nearest pressure point.',
      'Keep the person warm and still. Call 108 for anything beyond a minor cut.',
    ],
  },
  {
    title: 'Recovery Position',
    icon: 'rotate-cw' as const,
    steps: [
      'Use this for someone unconscious but breathing normally.',
      'Kneel beside them, place the arm nearest you at a right angle to the body.',
      'Bring the far arm across the chest, hold the back of their hand against the near cheek.',
      'Pull the far knee up and roll them toward you onto their side.',
      'Tilt the head back slightly to keep the airway open. Monitor breathing until help arrives.',
    ],
  },
  {
    title: 'Burns',
    icon: 'zap' as const,
    steps: [
      'Cool the burn under cool (not ice-cold) running water for 20 minutes.',
      'Remove jewelry/tight clothing near the area before it swells.',
      'Cover loosely with a clean, non-fluffy cloth or cling film — don\u2019t use ice, butter or ointments.',
      'Do not burst any blisters.',
      'Seek medical help for burns larger than a palm, or on the face, hands or joints.',
    ],
  },
  {
    title: 'Snake Bite',
    icon: 'alert-triangle' as const,
    steps: [
      'Keep the person calm and still — movement spreads venom faster.',
      'Remove rings/watches near the bite before swelling starts.',
      'Immobilize the limb, keeping it at or below heart level.',
      'Do NOT cut the wound, suck out venom, or apply a tight tourniquet.',
      'Get to a hospital immediately — note the snake\u2019s appearance if it can be done safely.',
    ],
  },
  {
    title: 'Stroke (Think F.A.S.T.)',
    icon: 'activity' as const,
    steps: [
      'Face: ask them to smile — does one side droop?',
      'Arms: ask them to raise both arms — does one drift down?',
      'Speech: ask them to repeat a phrase — is it slurred or strange?',
      'Time: if any of these signs are present, call 108 immediately — note the time symptoms started.',
      'Do not give food, drink or medication while waiting for help.',
    ],
  },
  {
    title: 'Heart Attack',
    icon: 'heart' as const,
    steps: [
      'Call 108 immediately — every minute matters.',
      'Have the person sit down, rest, and stay calm. Loosen tight clothing.',
      'If prescribed, help them take their own nitroglycerin/aspirin — don\u2019t give aspirin otherwise unless advised.',
      'If they become unresponsive and stop breathing normally, begin CPR.',
      'Stay with them until emergency services arrive.',
    ],
  },
];

export default function MedicalScreen() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen scroll={false}>
      <TopBar title="Medical Guide" showBack />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, marginBottom: 14 }}>
          Quick first-aid reference for common emergencies. This is not a substitute for professional medical care —
          always call 108 for serious situations.
        </Text>
        {GUIDES.map((g, i) => (
          <Card key={g.title} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => setOpen(open === i ? null : i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={g.icon} size={16} color={colors.greenDark} />
              </View>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text, flex: 1 }}>{g.title}</Text>
              <Feather name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </Pressable>
            {open === i && (
              <View style={{ marginTop: 12, gap: 8 }}>
                {g.steps.map((s, si) => (
                  <View key={si} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: colors.green }}>{si + 1}.</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.text, flex: 1, lineHeight: 18 }}>{s}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
