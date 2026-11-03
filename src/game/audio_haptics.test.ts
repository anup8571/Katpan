import test from 'node:test';
import assert from 'node:assert/strict';
import { soundEngine } from './audio';
import { haptics } from './haptics';

test('SoundEngine controls volume between 0 and 100%', () => {
  // Test default volume
  assert.ok(soundEngine.getVolume() >= 0 && soundEngine.getVolume() <= 100);

  // Set to 50%
  soundEngine.setVolume(50);
  assert.equal(soundEngine.getVolume(), 50);

  // Clamping at lower bound
  soundEngine.setVolume(-15);
  assert.equal(soundEngine.getVolume(), 0);
  assert.equal(soundEngine.isMuted(), true);

  // Clamping at upper bound
  soundEngine.setVolume(140);
  assert.equal(soundEngine.getVolume(), 100);
  assert.equal(soundEngine.isMuted(), false);

  // Toggle mute
  soundEngine.setMute(true);
  assert.equal(soundEngine.isMuted(), true);
  soundEngine.toggleMute();
  assert.equal(soundEngine.isMuted(), false);

  // Reset to default comfortable 80
  soundEngine.setVolume(80);
  assert.equal(soundEngine.getVolume(), 80);
});

test('HapticsEngine toggles enabled state and scales intensity', () => {
  assert.equal(typeof haptics.isEnabled(), 'boolean');

  haptics.setEnabled(true);
  assert.equal(haptics.isEnabled(), true);

  haptics.toggle();
  assert.equal(haptics.isEnabled(), false);

  haptics.setEnabled(true);
  assert.equal(haptics.isEnabled(), true);

  // Intensity selection
  haptics.setIntensity('light');
  assert.equal(haptics.getIntensity(), 'light');

  haptics.setIntensity('strong');
  assert.equal(haptics.getIntensity(), 'strong');

  haptics.setIntensity('medium');
  assert.equal(haptics.getIntensity(), 'medium');

  // Trigger methods run without throwing in any environment
  assert.doesNotThrow(() => {
    haptics.hapticTap();
    haptics.hapticCardFlick();
    haptics.hapticChip();
    haptics.hapticCut();
    haptics.hapticWin();
    haptics.hapticDefeat();
    haptics.testVibration();
  });
});
