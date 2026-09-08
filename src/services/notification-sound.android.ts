import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;
let isAudioConfigured = false;

export async function playNotificationSound(): Promise<void> {
  try {
    if (!isAudioConfigured) {
      await setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: true });
      isAudioConfigured = true;
    }
    player ??= createAudioPlayer(require('../../assets/images/notification.wav'));
    await player.seekTo(0);
    player.play();
  } catch {}
}
