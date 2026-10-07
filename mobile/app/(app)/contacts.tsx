import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Linking, Modal, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SMS from 'expo-sms';
import { Feather } from '@expo/vector-icons';
import Screen from '@/components/Screen';
import TopBar from '@/components/TopBar';
import Card from '@/components/Card';
import EmptyState from '@/components/EmptyState';
import TextField from '@/components/TextField';
import Button from '@/components/Button';
import IconButton from '@/components/IconButton';
import { colors } from '@/theme/colors';
import { ContactsRepo } from '@/db/database';
import { notify } from '@/utils/notifications';
import { startLiveShare, stopLiveShare, getShareTokenForContact, setShareTokenForContact, shareViewerUrl } from '@/utils/liveShare';
import { API_URL } from '@/api/client';
import type { Contact } from '@/types';

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sharingBusyId, setSharingBusyId] = useState<string | null>(null);

  const load = useCallback(() => setContacts(ContactsRepo.all()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openAdd() {
    setEditing(null);
    setName(''); setPhone(''); setRelation(''); setError(null);
    setModalOpen(true);
  }
  function openEdit(c: Contact) {
    setEditing(c);
    setName(c.name); setPhone(c.phone); setRelation(c.relation ?? ''); setError(null);
    setModalOpen(true);
  }

  async function save() {
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    if (editing) {
      ContactsRepo.update(editing.id, { name: name.trim(), phone: phone.trim(), relation: relation.trim() || null });
    } else {
      ContactsRepo.create({ name: name.trim(), phone: phone.trim(), relation: relation.trim() || null });
    }
    await notify('Emergency contact updated', `${name.trim()} was ${editing ? 'updated' : 'added'} to your emergency contacts.`, 'contact');
    setModalOpen(false);
    load();
  }

  function remove(c: Contact) {
    Alert.alert('Remove contact?', `Remove ${c.name} from your emergency contacts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const token = getShareTokenForContact(c.id);
          if (token) { await stopLiveShare(token); setShareTokenForContact(c.id, null); }
          ContactsRepo.remove(c.id);
          load();
        },
      },
    ]);
  }

  // Single tap -> Send Live Location -> Emergency Message -> Open Call.
  // Location updates stream continuously (foreground + background) once
  // started; the SMS itself needs one tap to actually send — that's an OS
  // restriction (apps can't silently send SMS on iOS, and doing it silently
  // on Android needs the device's default-SMS-app role, which isn't
  // appropriate to request here), not a shortcut we chose to take.
  async function shareLocation(c: Contact) {
    setSharingBusyId(c.id);
    try {
      const share = await startLiveShare('contact_share', { label: c.name });
      setShareTokenForContact(c.id, share.share_token);
      await notify('Live location sharing started', `Sharing your live location with ${c.name}.`, 'contact');

      if (!API_URL) throw new Error("RescueWave isn't configured with a server address.");
      const link = shareViewerUrl(API_URL, share.share_token);
      const message = `I need help — this is my live location, please check on me: ${link}`;

      const available = await SMS.isAvailableAsync();
      if (available) {
        await SMS.sendSMSAsync([c.phone], message);
      } else {
        Alert.alert('SMS not available on this device', `Share this link with ${c.name} another way: ${link}`);
      }
      load();
    } catch (e: any) {
      Alert.alert('Could not start sharing', e.message);
    } finally {
      setSharingBusyId(null);
    }
  }

  async function stopSharing(c: Contact) {
    const token = getShareTokenForContact(c.id);
    if (!token) return;
    setSharingBusyId(c.id);
    try {
      await stopLiveShare(token);
      setShareTokenForContact(c.id, null);
    } finally {
      setSharingBusyId(null);
      load();
    }
  }

  return (
    <Screen scroll={false}>
      <TopBar title="Emergency Contacts" showBack right={
        <IconButton name="user-plus" onPress={openAdd} />
      } />
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {contacts.length === 0 ? (
          <EmptyState icon="users" title="No emergency contacts yet" subtitle="Add people who should be reachable quickly during an emergency." />
        ) : (
          contacts.map((c) => {
            const sharing = !!getShareTokenForContact(c.id);
            const busy = sharingBusyId === c.id;
            return (
              <Card key={c.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: colors.navy }}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text }}>{c.name}</Text>
                    <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted }}>{c.relation ? `${c.relation} · ` : ''}{c.phone}</Text>
                  </View>
                  <IconButton name="phone" onPress={() => Linking.openURL(`tel:${c.phone}`)} color={colors.teal} backgroundColor={colors.tealMist} size={17} />
                  <IconButton name="edit-2" onPress={() => openEdit(c)} color={colors.navy} backgroundColor={colors.navyMist} size={16} />
                  <IconButton name="trash-2" onPress={() => remove(c)} color={colors.crimson} backgroundColor={colors.crimsonMist} size={16} />
                </View>

                <Pressable
                  onPress={() => (sharing ? stopSharing(c) : shareLocation(c))}
                  disabled={busy}
                  style={{
                    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 10, borderRadius: 10,
                    backgroundColor: sharing ? colors.crimson : colors.navy,
                    borderWidth: 1,
                    borderColor: sharing ? colors.crimsonDeep : colors.navyDeep,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name={sharing ? 'x-circle' : 'send'} size={14} color="#fff" />
                  )}
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>
                    {sharing ? 'Stop Sharing Live Location' : 'Send Live Location'}
                  </Text>
                </Pressable>
              </Card>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={16}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
              <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 }}>
                <Text style={{ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17, color: colors.text, marginBottom: 16 }}>
                  {editing ? 'Edit Contact' : 'Add Emergency Contact'}
                </Text>
                <TextField label="Name" placeholder="Full name" value={name} onChangeText={setName} returnKeyType="next" />
                <TextField label="Phone number" placeholder="+91 98765 43210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} returnKeyType="next" />
                <TextField label="Relation (optional)" placeholder="Mother, Friend, Neighbour…" value={relation} onChangeText={setRelation} returnKeyType="done" />
                {error ? <Text style={{ color: colors.crimson, fontSize: 12, marginBottom: 10, fontFamily: 'DMSans_400Regular' }}>{error}</Text> : null}
                <Button label={editing ? 'Save Changes' : 'Add Contact'} onPress={save} />
                <Button label="Cancel" variant="outline" onPress={() => setModalOpen(false)} style={{ marginTop: 10 }} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}
