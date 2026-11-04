import { useEffect, useState } from 'react';
import { voiceChatService, VoiceState } from '../services/voiceChat';

export function useVoiceChat(): VoiceState {
  const [state, setState] = useState<VoiceState>(() => voiceChatService.getState());

  useEffect(() => {
    return voiceChatService.subscribe(setState);
  }, []);

  return state;
}
