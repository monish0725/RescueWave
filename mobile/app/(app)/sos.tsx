import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { AlertsRepo, ContactsRepo } from '@/db/database';
import { getCurrentLocation } from '@/utils/location';
import { notify } from '@/utils/notifications';
import { createServerAlert } from '@/api/alerts';
import { useSosUi } from '@/context/SosUiContext';
import { EMERGENCY_SERVICES_NUMBER } from '@/constants/emergency';

type Stage = 'confirm' | 'sending' | 'sent' | 'error';

export default function SosScreen() {
  const router = useRouter();
  const { setSosTabLocked } = useSosUi();
  const [stage, setStage] = useState<Stage>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [dispatch, setDispatch] = useState<{ ok: boolean; helpersNotified?: number; serverAlertId?: string; cameraCoverage?: { nearbyCameraCount: number; nearbyAiCameraCount: number } } | null>(null);
  // Guards against a duplicate SOS from a fast double-tap: React state
  // updates aren't synchronous, so a second tap could otherwise slip in
  // before `stage` re-renders to 'sending'. This ref flips immediately.
  const inFlightRef = useRef(false);

  // The bottom-nav SOS button should be disabled/hidden for the entire
  // confirm -> sending -> sent lifecycle of this screen, not just while a
  // request is in flight -- so nobody can queue up a second alert while
  // looking at the first one's success screen.
  useEffect(() => {
    setSosTabLocked(stage !== 'error');
    return () => setSosTabLocked(false);
  }, [stage, setSosTabLocked]);

  async function confirmSOS() {
    if (inFlightRef.current) return; // one confirmed SOS per visit to this screen
    inFlightRef.current = true;
    setStage('sending');
    setError(null);
    try {
      // Real GPS + timestamp, saved to the on-device database first -- this
      // is the actual alert record, and it exists even if we're offline.
      const loc = await getCurrentLocation().catch(() => null);
      const localAlert = AlertsRepo.create({
        type: 'sos',
        description: 'Emergency SOS raised from the RescueWave app',
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        address: loc?.address ?? null,
      });
      setSavedAddress(loc?.address ?? null);
      await notify('SOS Alert Raised', loc?.address ? `Your location: ${loc.address}` : 'Alert saved without GPS (location unavailable).', 'sos');

      // Then dispatch to the backend so nearby Helpers can actually see and
      // respond to it. This is the part that needs connectivity -- if it
      // fails, the local record above still stands as your personal log,
      // we just say plainly that Helpers weren't notified this time.
      try {
        const result = await createServerAlert({
          description: 'Emergency SOS raised from the RescueWave app',
          lat: loc?.lat,
          lng: loc?.lng,
          address: loc?.address,
        });
        AlertsRepo.setServerAlertId(localAlert.id, result.alert.id);
        setDispatch({ ok: true, helpersNotified: result.helpersNotified, serverAlertId: result.alert.id, cameraCoverage: result.cameraCoverage });
      } catch {
        setDispatch({ ok: false });
      }

      setStage('sent');

      const contacts = ContactsRepo.all();
      if (contacts.length === 0) {
        setTimeout(() => {
          Alert.alert('No emergency contacts saved', 'Add emergency contacts so you can quickly call them during an SOS.', [
            { text: 'Later' },
            { text: 'Add contact', onPress: () => router.replace('/(app)/contacts') },
          ]);
        }, 400);
      }
    } catch (e: any) {
      inFlightRef.current = false; // allow "Try Again" to actually retry
      setError(e.message ?? 'Could not save the SOS alert.');
      setStage('error');
    }
  }

  const contacts = ContactsRepo.all();

  return (
    <Screen scroll={stage === 'sent'} style={{ backgroundColor: '#fff' }}>
      <View style={{ flex: 1, padding: 24, paddingTop: stage === 'sent' ? 32 : 24, justifyContent: stage === 'sent' ? 'flex-start' : 'center', alignItems: 'center' }}>
        {stage === 'confirm' && (
          <>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.crimsonMist, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Feather name="alert-triangle" size={40} color={colors.crimson} />
            </View>
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: colors.text, textAlign: 'center' }}>Raise Emergency SOS?</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>
              This captures your location, saves the alert, and notifies nearby verified Helpers so someone can respond.
            </Text>
            <Button label="SEND SOS" variant="danger" onPress={confirmSOS} style={{ width: '100%' }} icon={<Feather name="phone-call" size={18} color="#fff" />} />
            <Button label="Cancel" variant="outline" onPress={() => router.back()} style={{ width: '100%', marginTop: 12 }} />
          </>
        )}

        {stage === 'sending' && (
          <>
            <ActivityIndicator size="large" color={colors.crimson} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.muted, marginTop: 16 }}>Capturing your location and notifying Helpers...</Text>
          </>
        )}

        {stage === 'sent' && (
          <>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.tealMist, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Feather name="check-circle" size={38} color={colors.teal} />
            </View>
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: colors.text, textAlign: 'center' }}>
              {dispatch?.ok ? 'SOS Alert Sent' : 'SOS Alert Saved on Device'}
            </Text>
            {!dispatch?.ok && (
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.crimson, textAlign: 'center', marginTop: 6 }}>
                The server couldn't be reached, so nearby Helpers and Authorities were NOT notified. The alert is saved on this device only.
              </Text>
            )}

            <View style={{ width: '100%', backgroundColor: colors.bg, borderRadius: 14, padding: 14, marginTop: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Feather name="map-pin" size={16} color={colors.muted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: colors.textSoft }}>
                  {savedAddress ? savedAddress : 'Location unavailable -- alert saved with a timestamp only.'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Feather name={dispatch?.ok ? 'check-circle' : dispatch && !dispatch.ok ? 'wifi-off' : 'clock'} size={16} color={dispatch?.ok ? colors.teal : dispatch && !dispatch.ok ? colors.amber : colors.muted} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: dispatch?.ok ? colors.tealText : dispatch && !dispatch.ok ? colors.amberText : colors.muted }}>
                  {dispatch?.ok
                    ? dispatch.helpersNotified && dispatch.helpersNotified > 0
                      ? `Alert active -- ${dispatch.helpersNotified} nearby verified Helper${dispatch.helpersNotified === 1 ? '' : 's'} notified.`
                      : 'Alert active -- no verified Helpers are nearby right now.'
                    : dispatch && !dispatch.ok
                    ? "Alert saved on this device, but couldn't reach the server to notify Helpers -- check your connection."
                    : 'Saving alert status...'}
                </Text>
              </View>

              {dispatch?.ok && dispatch.cameraCoverage ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Feather name="camera" size={16} color={dispatch.cameraCoverage.nearbyAiCameraCount > 0 ? colors.teal : colors.amber} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: dispatch.cameraCoverage.nearbyAiCameraCount > 0 ? colors.tealText : colors.amberText }}>
                    {dispatch.cameraCoverage.nearbyCameraCount > 0
                      ? dispatch.cameraCoverage.nearbyAiCameraCount > 0
                        ? `Nearby AI camera coverage is available (${dispatch.cameraCoverage.nearbyAiCameraCount} active of ${dispatch.cameraCoverage.nearbyCameraCount} registered camera${dispatch.cameraCoverage.nearbyCameraCount === 1 ? '' : 's'}).`
                        : `${dispatch.cameraCoverage.nearbyCameraCount} RescueWave CCTV camera${dispatch.cameraCoverage.nearbyCameraCount === 1 ? '' : 's'} nearby, but AI monitoring is currently unavailable.`
                      : 'No RescueWave CCTV cameras are currently registered near this SOS location.'}
                  </Text>
                </View>
              ) : null}
            </View>

            {(!dispatch?.ok || !dispatch.helpersNotified) && (
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: colors.crimson, textAlign: 'center', marginTop: 10 }}>
                Please also call emergency services or your emergency contact below.
              </Text>
            )}

            <View style={{ width: '100%', marginTop: 18, gap: 10 }}>
              <Button
                label={`Call Emergency Services (${EMERGENCY_SERVICES_NUMBER})`}
                variant="danger"
                onPress={() => Linking.openURL(`tel:${EMERGENCY_SERVICES_NUMBER}`)}
                icon={<Feather name="phone-call" size={16} color="#fff" />}
                style={{ width: '100%' }}
              />

              {contacts.length > 0 && (
                <Button
                  label={`Call Emergency Contact (${contacts[0].name})`}
                  onPress={() => Linking.openURL(`tel:${contacts[0].phone}`)}
                  icon={<Feather name="phone" size={16} color="#fff" />}
                  style={{ width: '100%' }}
                />
              )}

              {dispatch?.ok && dispatch.serverAlertId ? (
                <Button
                  label="View Live Status"
                  variant="outline"
                  onPress={() => router.push(`/(app)/alert/${dispatch.serverAlertId}`)}
                  icon={<Feather name="activity" size={16} color={colors.text} />}
                  style={{ width: '100%' }}
                />
              ) : null}

              <Button label="Done" variant="outline" onPress={() => router.replace('/(app)/home')} style={{ width: '100%' }} />
            </View>
          </>
        )}

        {stage === 'error' && (
          <>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.crimsonMist, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Feather name="x-circle" size={44} color={colors.crimson} />
            </View>
            <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center' }}>Couldn't save the alert</Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 28 }}>{error}</Text>
            <Button label="Try Again" variant="danger" onPress={confirmSOS} style={{ width: '100%' }} />
            <Button label="Cancel" variant="outline" onPress={() => router.back()} style={{ width: '100%', marginTop: 12 }} />
          </>
        )}
      </View>
    </Screen>
  );
}
