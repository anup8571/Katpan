import { SeatId } from '../game/types';
import { apiFetch } from '../utils/apiClient';

export type VoicePeerStatus = 'connecting' | 'connected' | 'failed' | 'disconnected';

export interface VoicePeer {
  seatId: SeatId;
  playerName: string;
  status: VoicePeerStatus;
  isSpeaking: boolean;
  volume: number; // 0 to 1
  isMutedByMe: boolean;
  errorMessage?: string;
}

export interface VoiceState {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isMicMuted: boolean;
  isDeafened: boolean;
  isLocalSpeaking: boolean;
  activeRoomCode: string | null;
  mySeatId: SeatId | null;
  myPlayerName: string | null;
  peers: Record<string, VoicePeer>;
  hasTurn: boolean;
  errorNotification: string | null;
}

interface SignalItem {
  id: string;
  roomCode: string;
  fromSeat: SeatId;
  toSeat: SeatId;
  signal: {
    type: 'offer' | 'answer' | 'candidate';
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  fromPlayerName?: string;
  timestamp: number;
}

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export class VoiceChatService {
  private state: VoiceState = {
    isSupported: typeof window !== 'undefined' && Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia),
    isConnected: false,
    isConnecting: false,
    isMicMuted: false,
    isDeafened: false,
    isLocalSpeaking: false,
    activeRoomCode: null,
    mySeatId: null,
    myPlayerName: null,
    peers: {},
    hasTurn: false,
    errorNotification: null,
  };

  private listeners: Set<(state: VoiceState) => void> = new Set();
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;

  // Peer storage
  private peerConnections: Map<SeatId, RTCPeerConnection> = new Map();
  private remoteAudioElements: Map<SeatId, HTMLAudioElement> = new Map();
  private remoteAnalysers: Map<SeatId, AnalyserNode> = new Map();
  private makingOfferMap: Map<SeatId, boolean> = new Map();
  private pendingCandidates: Map<SeatId, RTCIceCandidateInit[]> = new Map();

  // Polling & Channels
  private pollIntervalId: any = null;
  private lastSignalTimestamp: number = 0;
  private broadcastChannel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;

  constructor() {
    this.fetchIceConfig();
  }

  public subscribe(fn: (state: VoiceState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  public getState(): VoiceState {
    return this.state;
  }

  private updateState(partial: Partial<VoiceState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.state));
  }

  public clearErrorNotification() {
    if (this.state.errorNotification) {
      this.updateState({ errorNotification: null });
    }
  }

  /**
   * Fetches ICE servers from /api/ice-servers.
   * If TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL are configured on Vercel,
   * they are loaded dynamically with zero code change.
   */
  public async fetchIceConfig(): Promise<void> {
    try {
      const res = await apiFetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          this.updateState({ hasTurn: Boolean(data.hasTurn) });
        }
      }
    } catch {
      // Fallback to default Google STUN
      this.iceServers = DEFAULT_STUN_SERVERS;
    }
  }

  /**
   * Connect and start voice chat in a room.
   */
  public async joinRoom(
    roomCode: string,
    mySeatId: SeatId,
    myPlayerName: string,
    occupiedSeats: Record<string, string>,
    ws?: WebSocket | null
  ): Promise<boolean> {
    if (!this.state.isSupported) {
      this.updateState({
        errorNotification: 'Voice chat is not supported on this browser or platform.',
      });
      return false;
    }

    if (this.state.isConnected && this.state.activeRoomCode === roomCode && this.state.mySeatId === mySeatId) {
      this.syncOccupiedSeats(occupiedSeats);
      return true;
    }

    this.leaveRoom();
    this.updateState({
      isConnecting: true,
      activeRoomCode: roomCode,
      mySeatId,
      myPlayerName,
      errorNotification: null,
    });
    this.ws = ws || null;

    // 1. Acquire Local Audio
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.localStream = stream;
      this.setupLocalAudioAnalysis(stream);
    } catch (err: any) {
      console.warn('Microphone permission denied or unavailable:', err);
      this.updateState({
        isConnecting: false,
        errorNotification: 'Microphone permission was denied. Please allow microphone access to use voice chat.',
      });
      return false;
    }

    // 2. Setup BroadcastChannel for local/tab communication
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`rk_voice_${roomCode}`);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingSignal(event.data);
        };
      }
    } catch {
      // Ignore broadcast channel errors in restricted environments
    }

    // 3. Mark connected & start polling signaling
    this.lastSignalTimestamp = Date.now() - 2000;
    this.updateState({
      isConnected: true,
      isConnecting: false,
      isMicMuted: false,
    });

    this.startSignalingPoll();

    // 4. Connect to all other occupied seats in this room
    this.syncOccupiedSeats(occupiedSeats);
    return true;
  }

  /**
   * Synchronize active peers with occupied table seats.
   */
  public syncOccupiedSeats(occupiedSeats: Record<string, string>) {
    if (!this.state.isConnected || !this.state.mySeatId) return;
    const mySeat = this.state.mySeatId;

    // Check newly arrived or existing seats
    for (const [seatStr, playerName] of Object.entries(occupiedSeats)) {
      const seat = seatStr as SeatId;
      if (seat === mySeat) continue;

      if (!this.peerConnections.has(seat)) {
        this.createPeerConnection(seat, playerName);
      }
    }

    // Check departed seats
    for (const seat of Array.from(this.peerConnections.keys())) {
      if (!occupiedSeats[seat]) {
        this.removePeer(seat);
      }
    }
  }

  /**
   * Set up WebRTC RTCPeerConnection for a remote seat.
   */
  private createPeerConnection(remoteSeat: SeatId, remotePlayerName: string) {
    if (this.peerConnections.has(remoteSeat)) return;

    const mySeat = this.state.mySeatId;
    if (!mySeat) return;

    // Initiator role (polite peer pattern based on seat ordering)
    const isInitiator = mySeat < remoteSeat;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.peerConnections.set(remoteSeat, pc);
    this.makingOfferMap.set(remoteSeat, false);
    this.pendingCandidates.set(remoteSeat, []);

    // Register initial peer state
    const currentPeers = { ...this.state.peers };
    currentPeers[remoteSeat] = {
      seatId: remoteSeat,
      playerName: remotePlayerName,
      status: 'connecting',
      isSpeaking: false,
      volume: 1,
      isMutedByMe: false,
    };
    this.updateState({ peers: currentPeers });

    // Add local microphone tracks to peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(remoteSeat, {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const status = pc.connectionState;
      if (status === 'connected') {
        this.updatePeerStatus(remoteSeat, 'connected');
      } else if (status === 'failed') {
        const errorMsg = `Could not connect to ${remotePlayerName || 'Seat ' + remoteSeat}. Strict mobile networks may not connect with Google STUN alone.`;
        this.updatePeerStatus(remoteSeat, 'failed', errorMsg);
        this.updateState({ errorNotification: errorMsg });
      } else if (status === 'disconnected') {
        // Give 6 seconds to recover before marking failed
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            const errorMsg = `Could not connect to ${remotePlayerName || 'Seat ' + remoteSeat}. Connection lost.`;
            this.updatePeerStatus(remoteSeat, 'failed', errorMsg);
            this.updateState({ errorNotification: errorMsg });
          }
        }, 6000);
      }
    };

    // Receive Remote Track
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      let audioEl = this.remoteAudioElements.get(remoteSeat);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        this.remoteAudioElements.set(remoteSeat, audioEl);
      }
      audioEl.srcObject = remoteStream;
      audioEl.muted = this.state.isDeafened || (this.state.peers[remoteSeat]?.isMutedByMe ?? false);
      audioEl.volume = this.state.peers[remoteSeat]?.volume ?? 1;
      audioEl.play().catch(() => {});

      this.setupRemoteAudioAnalysis(remoteSeat, remoteStream);
    };

    // Perfect Negotiation / Offer creation if initiator
    pc.onnegotiationneeded = async () => {
      if (!isInitiator) return;
      try {
        this.makingOfferMap.set(remoteSeat, true);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        this.sendSignal(remoteSeat, {
          type: 'offer',
          sdp: pc.localDescription?.toJSON(),
        });
      } catch (err) {
        console.warn('Error creating WebRTC offer:', err);
      } finally {
        this.makingOfferMap.set(remoteSeat, false);
      }
    };
  }

  private updatePeerStatus(seat: SeatId, status: VoicePeerStatus, errorMessage?: string) {
    const peer = this.state.peers[seat];
    if (!peer) return;
    const updated = {
      ...this.state.peers,
      [seat]: {
        ...peer,
        status,
        errorMessage,
      },
    };
    this.updateState({ peers: updated });
  }

  /**
   * Sends signaling message to target peer.
   */
  private async sendSignal(toSeat: SeatId, signalData: any) {
    if (!this.state.activeRoomCode || !this.state.mySeatId) return;

    const payload: SignalItem = {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      roomCode: this.state.activeRoomCode,
      fromSeat: this.state.mySeatId,
      toSeat,
      signal: signalData,
      fromPlayerName: this.state.myPlayerName || 'Player',
      timestamp: Date.now(),
    };

    // 1. Send over BroadcastChannel (local tabs)
    try {
      this.broadcastChannel?.postMessage(payload);
    } catch {
      // ignore
    }

    // 2. Send over WebSocket if available
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'room:voice_signal',
            signalItem: payload,
          })
        );
      }
    } catch {
      // ignore
    }

    // 3. Post to REST signaling endpoint
    try {
      await apiFetch('/api/rooms/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  }

  /**
   * Handles incoming WebRTC signal.
   */
  public async handleIncomingSignal(item: SignalItem) {
    if (!item || !this.state.isConnected) return;
    if (item.roomCode !== this.state.activeRoomCode) return;
    if (item.fromSeat === this.state.mySeatId) return;
    if (item.toSeat !== this.state.mySeatId && item.toSeat !== ('ALL' as any)) return;

    const remoteSeat = item.fromSeat;
    let pc = this.peerConnections.get(remoteSeat);

    if (!pc) {
      this.createPeerConnection(remoteSeat, item.fromPlayerName || `Seat ${remoteSeat}`);
      pc = this.peerConnections.get(remoteSeat);
    }
    if (!pc) return;

    try {
      if (item.signal.type === 'offer' && item.signal.sdp) {
        const isStable = pc.signalingState === 'stable';
        const isOfferMaking = this.makingOfferMap.get(remoteSeat) || false;
        const polite = (this.state.mySeatId || '') > remoteSeat;

        if (!isStable && !polite && isOfferMaking) {
          // Ignore offer collision if impolite
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(item.signal.sdp));

        // Flush any queued ICE candidates
        const pending = this.pendingCandidates.get(remoteSeat) || [];
        for (const cand of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        this.pendingCandidates.set(remoteSeat, []);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.sendSignal(remoteSeat, {
          type: 'answer',
          sdp: pc.localDescription?.toJSON(),
        });
      } else if (item.signal.type === 'answer' && item.signal.sdp) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(item.signal.sdp));

          const pending = this.pendingCandidates.get(remoteSeat) || [];
          for (const cand of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          this.pendingCandidates.set(remoteSeat, []);
        }
      } else if (item.signal.type === 'candidate' && item.signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(item.signal.candidate));
        } else {
          const queue = this.pendingCandidates.get(remoteSeat) || [];
          queue.push(item.signal.candidate);
          this.pendingCandidates.set(remoteSeat, queue);
        }
      }
    } catch (err) {
      console.warn(`Error handling WebRTC signal from ${remoteSeat}:`, err);
    }
  }

  /**
   * Starts periodic polling for REST signaling.
   */
  private startSignalingPoll() {
    this.stopSignalingPoll();
    this.pollIntervalId = setInterval(async () => {
      if (!this.state.isConnected || !this.state.activeRoomCode || !this.state.mySeatId) {
        return;
      }
      try {
        const params = new URLSearchParams({
          roomCode: this.state.activeRoomCode,
          seat: this.state.mySeatId,
          since: String(this.lastSignalTimestamp),
        });
        const res = await apiFetch(`/api/rooms/signal?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.signals)) {
            for (const sig of data.signals) {
              this.handleIncomingSignal(sig);
              if (sig.timestamp > this.lastSignalTimestamp) {
                this.lastSignalTimestamp = sig.timestamp;
              }
            }
          }
          if (data.now) {
            this.lastSignalTimestamp = Math.max(this.lastSignalTimestamp, data.now - 1000);
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 1200);
  }

  private stopSignalingPoll() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  /**
   * Local microphone analysis for active speaking detection.
   */
  private setupLocalAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      source.connect(this.localAnalyser);

      const bufferLength = this.localAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.localAnalyser || !this.state.isConnected) return;
        if (this.state.isMicMuted) {
          if (this.state.isLocalSpeaking) this.updateState({ isLocalSpeaking: false });
          this.animFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const isSpeaking = avg > 14;

        if (isSpeaking !== this.state.isLocalSpeaking) {
          this.updateState({ isLocalSpeaking: isSpeaking });
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch {
      // Audio analysis unavailable
    }
  }

  /**
   * Remote audio analysis for remote player speaking detection.
   */
  private setupRemoteAudioAnalysis(remoteSeat: SeatId, stream: MediaStream) {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (!this.audioContext) return;

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this.remoteAnalysers.set(remoteSeat, analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkRemote = () => {
        const p = this.peerConnections.get(remoteSeat);
        if (!p || p.connectionState !== 'connected') return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const isSpeaking = avg > 14 && !this.state.isDeafened && !(this.state.peers[remoteSeat]?.isMutedByMe);

        const currentPeer = this.state.peers[remoteSeat];
        if (currentPeer && currentPeer.isSpeaking !== isSpeaking) {
          this.state.peers[remoteSeat].isSpeaking = isSpeaking;
          this.updateState({ peers: { ...this.state.peers } });
        }

        requestAnimationFrame(checkRemote);
      };

      checkRemote();
    } catch {
      // Ignore
    }
  }

  /**
   * Mute / Unmute local microphone.
   */
  public setMicMuted(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    this.updateState({
      isMicMuted: muted,
      isLocalSpeaking: muted ? false : this.state.isLocalSpeaking,
    });
  }

  public toggleMic() {
    this.setMicMuted(!this.state.isMicMuted);
  }

  /**
   * Deafen / Undeafen incoming audio.
   */
  public setDeafened(deafened: boolean) {
    this.remoteAudioElements.forEach((audioEl, seat) => {
      audioEl.muted = deafened || (this.state.peers[seat]?.isMutedByMe ?? false);
    });
    this.updateState({ isDeafened: deafened });
  }

  public toggleDeafen() {
    this.setDeafened(!this.state.isDeafened);
  }

  /**
   * Adjust remote peer volume (0 to 1).
   */
  public setPeerVolume(seat: SeatId, volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    const audioEl = this.remoteAudioElements.get(seat);
    if (audioEl) {
      audioEl.volume = clamped;
    }
    const peer = this.state.peers[seat];
    if (peer) {
      this.state.peers[seat] = { ...peer, volume: clamped };
      this.updateState({ peers: { ...this.state.peers } });
    }
  }

  /**
   * Mute individual remote peer locally.
   */
  public toggleMutePeer(seat: SeatId) {
    const peer = this.state.peers[seat];
    if (!peer) return;
    const newMuted = !peer.isMutedByMe;
    const audioEl = this.remoteAudioElements.get(seat);
    if (audioEl) {
      audioEl.muted = this.state.isDeafened || newMuted;
    }
    this.state.peers[seat] = { ...peer, isMutedByMe: newMuted };
    this.updateState({ peers: { ...this.state.peers } });
  }

  private removePeer(seat: SeatId) {
    const pc = this.peerConnections.get(seat);
    if (pc) {
      pc.close();
      this.peerConnections.delete(seat);
    }
    const audioEl = this.remoteAudioElements.get(seat);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      this.remoteAudioElements.delete(seat);
    }
    this.remoteAnalysers.delete(seat);
    this.makingOfferMap.delete(seat);
    this.pendingCandidates.delete(seat);

    const updatedPeers = { ...this.state.peers };
    delete updatedPeers[seat];
    this.updateState({ peers: updatedPeers });
  }

  /**
   * Leave voice chat room and cleanup all connections.
   */
  public leaveRoom() {
    this.stopSignalingPoll();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.remoteAudioElements.forEach((audioEl) => {
      audioEl.pause();
      audioEl.srcObject = null;
    });
    this.remoteAudioElements.clear();
    this.remoteAnalysers.clear();
    this.makingOfferMap.clear();
    this.pendingCandidates.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.localAnalyser = null;

    this.updateState({
      isConnected: false,
      isConnecting: false,
      isLocalSpeaking: false,
      activeRoomCode: null,
      mySeatId: null,
      myPlayerName: null,
      peers: {},
      errorNotification: null,
    });
  }
}

export const voiceChatService = new VoiceChatService();
