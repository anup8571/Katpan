import React from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Wifi,
  AlertCircle,
  X,
  PhoneOff,
  Sliders,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SeatId } from '../game/types';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { voiceChatService } from '../services/voiceChat';

interface VoiceChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoomCode: string | null;
  occupiedSeats: Record<string, string>;
  humanSeat: SeatId;
  playerName: string;
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({
  isOpen,
  onClose,
  activeRoomCode,
  occupiedSeats,
  humanSeat,
  playerName,
}) => {
  const voice = useVoiceChat();

  if (!isOpen) return null;

  const handleToggleConnect = () => {
    if (voice.isConnected) {
      voiceChatService.leaveRoom();
    } else if (activeRoomCode) {
      voiceChatService.joinRoom(activeRoomCode, humanSeat, playerName, occupiedSeats);
    }
  };

  const ALL_SEATS: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const otherOccupiedSeats = ALL_SEATS.filter(
    (s) => s !== humanSeat && Boolean(occupiedSeats[s])
  );

  return (
    <div
      role="dialog"
      aria-label="Table Voice Chat"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-950/95 backdrop-blur-2xl border border-amber-400/30 p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                voice.isConnected
                  ? voice.isLocalSpeaking
                    ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                    : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border border-slate-700 text-slate-400'
              }`}
            >
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                  TABLE VOICE CHAT
                </h2>
                {activeRoomCode && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {activeRoomCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Radio className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>
                  {voice.hasTurn
                    ? 'Connected via Secure TURN Relay'
                    : 'P2P Audio via Public Google STUN'}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Voice Chat"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Error Banner */}
        {voice.errorNotification && (
          <div className="rounded-2xl bg-rose-950/80 border border-rose-500/60 p-3 flex items-start justify-between gap-2.5 animate-fadeIn">
            <div className="flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-100">{voice.errorNotification}</p>
                <p className="text-[11px] text-rose-300/80 mt-1">
                  On strict mobile networks, add <code className="text-amber-200">TURN_URLS</code>, <code className="text-amber-200">TURN_USERNAME</code>, and <code className="text-amber-200">TURN_CREDENTIAL</code> in Vercel's environment variables to enable automatic TURN relay with no code change.
                </p>
              </div>
            </div>
            <button
              onClick={() => voiceChatService.clearErrorNotification()}
              className="text-rose-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Local Player Controls Card */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-white/10 p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 font-black text-xs">
                  {humanSeat}
                </div>
                {voice.isConnected && voice.isLocalSpeaking && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                )}
              </div>
              <div>
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>{playerName} (You)</span>
                  <span className="text-[10px] text-amber-300 font-mono">Seat {humanSeat}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  {voice.isConnected ? (
                    voice.isMicMuted ? (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <MicOff className="w-3 h-3" /> Muted
                      </span>
                    ) : voice.isLocalSpeaking ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Speaking...
                      </span>
                    ) : (
                      <span className="text-emerald-300/80">Microphone Active</span>
                    )
                  ) : (
                    <span className="text-slate-500">Not Connected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5">
              {voice.isConnected && (
                <>
                  {/* Mute Mic Button */}
                  <button
                    onClick={() => voiceChatService.toggleMic()}
                    title={voice.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      voice.isMicMuted
                        ? 'bg-rose-500/20 border-rose-400/50 text-rose-300 hover:bg-rose-500/30'
                        : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
                    }`}
                  >
                    {voice.isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span className="hidden sm:inline">{voice.isMicMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  {/* Deafen Button */}
                  <button
                    onClick={() => voiceChatService.toggleDeafen()}
                    title={voice.isDeafened ? 'Undeafen Audio' : 'Deafen (Mute Others)'}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      voice.isDeafened
                        ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 hover:bg-amber-500/30'
                        : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {voice.isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    <span className="hidden sm:inline">{voice.isDeafened ? 'Deafened' : 'Deafen'}</span>
                  </button>
                </>
              )}

              {/* Connect / Disconnect Voice */}
              <button
                onClick={handleToggleConnect}
                disabled={!activeRoomCode || voice.isConnecting}
                className={`p-2.5 rounded-xl border font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  voice.isConnected
                    ? 'bg-rose-950/60 border-rose-500/40 text-rose-300 hover:bg-rose-900/60'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400/50 text-white hover:brightness-110 shadow-[0_4px_16px_rgba(16,185,129,0.3)]'
                }`}
              >
                {voice.isConnected ? (
                  <>
                    <PhoneOff className="w-4 h-4" />
                    <span>Disconnect</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>{voice.isConnecting ? 'Connecting...' : 'Join Voice'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Remote Players Voice List */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Table Players ({otherOccupiedSeats.length})
            </span>
            <span className="text-[11px] text-slate-500">
              {voice.isConnected
                ? `${Object.values(voice.peers).filter((p) => p.status === 'connected').length} connected`
                : 'Connect to talk with players'}
            </span>
          </div>

          {otherOccupiedSeats.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
              No other players are currently seated at this table. Share room code{' '}
              <b className="font-mono text-amber-300">{activeRoomCode}</b> to invite friends!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {otherOccupiedSeats.map((seat) => {
                const pName = occupiedSeats[seat];
                const peer = voice.peers[seat];
                const status = peer?.status ?? (voice.isConnected ? 'connecting' : 'disconnected');
                const isSpeaking = peer?.isSpeaking ?? false;
                const volume = peer?.volume ?? 1;
                const isMuted = peer?.isMutedByMe ?? false;

                return (
                  <div
                    key={seat}
                    className={`rounded-2xl border p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition-all ${
                      isSpeaking
                        ? 'bg-slate-900/90 border-emerald-400/70 shadow-[0_0_20px_rgba(52,211,153,0.15)]'
                        : 'bg-slate-900/50 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center font-black text-xs ${
                            isSpeaking
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-slate-800 border-white/10 text-slate-300'
                          }`}
                        >
                          {seat}
                        </div>
                        {isSpeaking && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{pName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Seat {seat}</span>
                        </div>
                        <div className="text-[11px] flex items-center gap-1 mt-0.5">
                          {status === 'connected' ? (
                            isSpeaking ? (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Speaking...
                              </span>
                            ) : (
                              <span className="text-emerald-300/80 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                              </span>
                            )
                          ) : status === 'failed' ? (
                            <span className="text-rose-400 font-semibold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Could not connect to {pName}
                            </span>
                          ) : status === 'connecting' ? (
                            <span className="text-amber-400/80 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Connecting...
                            </span>
                          ) : (
                            <span className="text-slate-500">Disconnected</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Volume Slider & Remote Mute Controls */}
                    {status === 'connected' && (
                      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => voiceChatService.toggleMutePeer(seat)}
                          className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                            isMuted
                              ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                          }`}
                          title={isMuted ? `Unmute ${pName}` : `Mute ${pName}`}
                        >
                          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted ? 0 : volume}
                            disabled={isMuted}
                            onChange={(e) => voiceChatService.setPeerVolume(seat, parseFloat(e.target.value))}
                            className="w-20 sm:w-24 accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                          />
                          <span className="text-[10px] text-slate-400 font-mono w-7 text-right">
                            {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Network & STUN/TURN Architecture Notice */}
        <div className="rounded-2xl bg-slate-900/40 border border-white/5 p-3 text-[11px] text-slate-400 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-300 text-xs">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Connection Architecture</span>
          </div>
          <p className="leading-relaxed">
            The game's connection setup is public Google STUN. Some strict mobile networks may not connect with that alone. If that happens, the app tells the player <span className="text-amber-200">"Could not connect to …"</span>. It can be fixed later with a TURN relay: add <code className="text-amber-300">TURN_URLS</code>, <code className="text-amber-300">TURN_USERNAME</code>, and <code className="text-amber-300">TURN_CREDENTIAL</code> in Vercel's environment variables, with no code change.
          </p>
        </div>
      </div>
    </div>
  );
};
