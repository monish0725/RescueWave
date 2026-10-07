import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, Alert, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import { colors } from '@/theme/colors';
import { SettingsRepo, wipeAllLocalData } from '@/db/database';
import { useAuth } from '@/context/AuthContext';
import { ensureNotificationPermission } from '@/utils/notifications';
import { registerForPushNotifications, unregisterCurrentPushToken } from '@/utils/pushRegistration';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout, changePassword } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    setNotificationsEnabled(SettingsRepo.get('notifications_enabled', '1') === '1');
  }, []);

  async function toggleNotifications(val: boolean) {
    // Update the local preference first so `notify()` (which reads this
    // synchronously) respects it immediately, then best-effort
    // register/unregister this device's push token with the backend —
    // same unregister call already used on logout, just also wired to
    // this toggle now so OFF actually stops server-sent pushes too, not
    // just this device's own local notifications.
    SettingsRepo.set('notifications_enabled', val ? '1' : '0');
    setNotificationsEnabled(val);
    if (val) {
      await ensureNotificationPermission();
      await registerForPushNotifications();
    } else {
      await unregisterCurrentPushToken();
    }
  }

  async function savePassword() {
    setPwError(null);
    if (!currentPw || !newPw) { setPwError('Fill in both fields.'); return; }
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters.'); return; }
    setPwSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setPwModalOpen(false);
      setCurrentPw(''); setNewPw('');
      Alert.alert('Password updated');
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      setPwSaving(false);
    }
  }

  function clearLocalData() {
    Alert.alert(
      'Clear all local data?',
      'This permanently deletes contacts, alert history, missing person records and notifications stored on this device. This cannot be undone. Your account and anything already synced to the RescueWave server (sent alerts, submitted missing-person reports) are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Data', style: 'destructive', onPress: () => { wipeAllLocalData(); Alert.alert('Local data cleared'); } },
      ]
    );
  }

  function confirmLogout() {
    Alert.alert('Log out?', 'You can log back in anytime with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
    ]);
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Settings" showBack />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 48 }}>
        <Card style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
              <Feather name="bell" size={18} color={colors.text} />
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.text }}>Push Notifications</Text>
            </View>
            <Switch value={notificationsEnabled} onValueChange={toggleNotifications} trackColor={{ true: colors.green }} />
          </View>
        </Card>

        <Pressable onPress={() => setPwModalOpen(true)}>
          <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="lock" size={18} color={colors.text} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.text, flex: 1 }}>Change Password</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Card>
        </Pressable>

        <Pressable onPress={clearLocalData}>
          <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="trash-2" size={18} color={colors.red} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.red, flex: 1 }}>Clear Local Data</Text>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/(app)/about')}>
          <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="info" size={18} color={colors.text} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.text, flex: 1 }}>About RescueWave</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/(app)/help')}>
          <Card style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Feather name="help-circle" size={18} color={colors.text} />
            <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: colors.text, flex: 1 }}>Help & Support</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Card>
        </Pressable>

        <Button label="Log Out" variant="danger" onPress={confirmLogout} style={{ marginTop: 12 }} />
      </ScrollView>

      <Modal visible={pwModalOpen} animationType="slide" transparent onRequestClose={() => setPwModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17, color: colors.text, marginBottom: 16 }}>Change Password</Text>
            <TextField label="Current password" secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
            <TextField label="New password" secureTextEntry value={newPw} onChangeText={setNewPw} />
            {pwError ? <Text style={{ color: colors.red, fontSize: 12, marginBottom: 10, fontFamily: 'DMSans_400Regular' }}>{pwError}</Text> : null}
            <Button label="Update Password" onPress={savePassword} loading={pwSaving} />
            <Button label="Cancel" variant="outline" onPress={() => setPwModalOpen(false)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
