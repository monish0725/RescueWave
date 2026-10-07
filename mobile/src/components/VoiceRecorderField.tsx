import React, { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import IconButton from './IconButton';

interface VoiceRecorderFieldProps {
  uri: string | null;
  onChange: (uri: string | null) => void;
}

/** Record-a-voice-note control: tap to record, tap again to stop, preview/play it back, or delete and re-record. */
export default function VoiceRecorderField({ uri, onChange }: VoiceRecorderFieldProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(uri ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const [starting, setStarting] = useState(false);

  async function startRecording() {
    setStarting(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone permission needed', 'Enable microphone access to record a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } finally {
      setStarting(false);
    }
  }

  async function stopRecording() {
    await recorder.stop();
    if (recorder.uri) onChange(recorder.uri);
  }

  function removeRecording() {
    onChange(null);
  }

  if (uri) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.surface }}>
        <Pressable
          onPress={() => (playerStatus.playing ? player.pause() : player.play())}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navyMist, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name={playerStatus.playing ? 'pause' : 'play'} size={15} color={colors.navy} />
        </Pressable>
        <Text style={{ flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, color: colors.text }}>Voice note recorded</Text>
        <IconButton name="trash-2" onPress={removeRecording} color={colors.crimson} backgroundColor={colors.crimsonMist} size={16} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={recorderState.isRecording ? stopRecording : startRecording}
      disabled={starting}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12,
        borderColor: recorderState.isRecording ? colors.crimson : colors.border,
        backgroundColor: recorderState.isRecording ? colors.crimsonMist : colors.surface,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: recorderState.isRecording ? colors.crimson : colors.navyMist, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={recorderState.isRecording ? 'square' : 'mic'} size={15} color={recorderState.isRecording ? '#fff' : colors.navy} />
      </View>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 13, color: recorderState.isRecording ? colors.crimson : colors.text }}>
        {recorderState.isRecording ? `Recording… ${Math.round(recorderState.durationMillis / 1000)}s (tap to stop)` : 'Tap to record a voice note'}
      </Text>
    </Pressable>
  );
}
