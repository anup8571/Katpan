import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceChatService, VoiceChatService } from './voiceChat';

test('VoiceChatService initializes with default STUN and proper state', () => {
  const service = new VoiceChatService();
  const state = service.getState();

  assert.equal(state.isConnected, false);
  assert.equal(state.isMicMuted, false);
  assert.equal(state.isDeafened, false);
  assert.equal(state.isLocalSpeaking, false);
  assert.deepEqual(state.peers, {});
});

test('VoiceChatService toggles mute and deafen states correctly', () => {
  const service = new VoiceChatService();

  service.toggleMic();
  assert.equal(service.getState().isMicMuted, true);
  assert.equal(service.getState().isLocalSpeaking, false);

  service.toggleMic();
  assert.equal(service.getState().isMicMuted, false);

  service.toggleDeafen();
  assert.equal(service.getState().isDeafened, true);

  service.toggleDeafen();
  assert.equal(service.getState().isDeafened, false);
});

test('VoiceChatService notifies subscribers of state changes', () => {
  const service = new VoiceChatService();
  let callCount = 0;
  let lastMuted = false;

  const unsubscribe = service.subscribe((s) => {
    callCount++;
    lastMuted = s.isMicMuted;
  });

  assert.equal(callCount, 1);
  assert.equal(lastMuted, false);

  service.setMicMuted(true);
  assert.equal(callCount, 2);
  assert.equal(lastMuted, true);

  unsubscribe();
  service.setMicMuted(false);
  assert.equal(callCount, 2); // Unsubscribed, so not called again
});

test('VoiceChatService cleans up cleanly on leaveRoom', () => {
  const service = new VoiceChatService();
  service.leaveRoom();

  const state = service.getState();
  assert.equal(state.isConnected, false);
  assert.equal(state.activeRoomCode, null);
  assert.equal(state.mySeatId, null);
  assert.deepEqual(state.peers, {});
});
