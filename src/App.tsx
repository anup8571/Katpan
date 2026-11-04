import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CasinoScene } from './3d/CasinoScene';
import {
  Card,
  CameraView,
  GamePhase,
  GameStats,
  INITIAL_SEAT_COINS,
  SeatId,
  SeatInfo,
  Side,
} from './game/types';
import {
  createStandardDeck,
  shuffleDeck,
  splitDeck,
  isWinningCard,
  getReceivingSide,
  generateBotCutIndex,
  createInitialSeats,
  prepareSeatsForNextRound,
  resolveNextDealerAndCutter,
  getBettingOrder,
  getStepByStepBettingOrder,
  generateBotBet,
  generateRandomWager,
  settleConstantCurrencyRound,
  generateBotDealDelayMs,
  calculatePoolTotals,
  isPoolBalanced,
  balancePools,
  settleBalancedRound,
} from './game/rules';
import { decideBotInitialBet, decideNextBotEqualizeAction } from './game/botAI';
import { soundEngine } from './game/audio';
import { TitleScreen } from './components/TitleScreen';
import { HUD } from './components/HUD';
import { ControlDock } from './components/ControlDock';
import { RoundOverModal } from './components/Modals';
import { OfflineIndicator } from './components/PWAInstallButton';
import { AuthProfileModal, UserProfile } from './components/AuthProfileModal';
import {
  MultiplayerModal,
  RoomChatMessage,
  RoomInvitationItem,
} from './components/MultiplayerModal';
import { SettingsModal } from './components/SettingsModal';
import { VoiceChatModal } from './components/VoiceChatModal';
import { voiceChatService } from './services/voiceChat';
import { useVoiceChat } from './hooks/useVoiceChat';
import { apiFetch, getWebSocketUrl } from './utils/apiClient';

interface LiveRoomState {
  roomCode: string;
  roomName: string;
  hostName: string;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  phase: string;
  occupiedSeats: Record<string, string>;
  chat: RoomChatMessage[];
}

const AUTH_TOKEN_KEY = 'royalkatti_auth_token';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CasinoScene | null>(null);

  // Game Phase & Shell state
  const [phase, setPhase] = useState<GamePhase>('title');
  const [cameraView, setCameraView] = useState<CameraView>('felt');
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());
  const [volume, setVolume] = useState(() => soundEngine.getVolume());
  const [botFastMode, setBotFastMode] = useState(false);

  // Transparent Modals State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const voiceState = useVoiceChat();

  // User Auth & Profile State
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_TOKEN_KEY)
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Multiplayer WebSocket & Room State
  const wsRef = useRef<WebSocket | null>(null);
  const [activeRoom, setActiveRoom] = useState<LiveRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<RoomInvitationItem[]>([]);

  // 6-Player Anti-Clockwise Ring State (A -> B -> C -> D -> E -> F)
  // First A is Dealer (Under/Shuffler), and B is Cutter (Bahar)!
  const [humanSeat, setHumanSeat] = useState<SeatId>('D');
  const [dealerSeat, setDealerSeat] = useState<SeatId>('A');
  const [cutterSeat, setCutterSeat] = useState<SeatId>('B');
  const [prevDealerSeat, setPrevDealerSeat] = useState<SeatId>('A');
  const [prevCutterSeat, setPrevCutterSeat] = useState<SeatId>('B');
  const [activeActorSeat, setActiveActorSeat] = useState<SeatId | null>('A');
  const [seats, setSeats] = useState<SeatInfo[]>(() => createInitialSeats('D'));

  // Deck & Card states
  const [mainDeck, setMainDeck] = useState<Card[]>(() => shuffleDeck(createStandardDeck()));
  const [firstDeck, setFirstDeck] = useState<Card[]>([]);
  const [secondDeck, setSecondDeck] = useState<Card[]>([]);
  const [pointCard, setPointCard] = useState<Card | null>(null);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);

  // Betting & Cut controls (Fake Currency: RC = Royal Coins)
  const [balance, setBalance] = useState(INITIAL_SEAT_COINS);
  const [currentBet, setCurrentBet] = useState(100);
  const [humanDelta, setHumanDelta] = useState(100);
  const [cutIndex, setCutIndex] = useState(26);
  const [statusText, setStatusText] = useState(
    'Seat A (Under) shuffles → Seat B (Cutter) cuts first!'
  );

  // Auto Deal states
  const [isAutoDealing, setIsAutoDealing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Winner outcome
  const [winner, setWinner] = useState<Side | null>(null);
  const [playerWonRound, setPlayerWonRound] = useState(true);
  const [matchingCard, setMatchingCard] = useState<Card | null>(null);

  // Stats
  const [stats, setStats] = useState<GameStats>({
    totalRounds: 0,
    playerWins: 0,
    dealerWins: 0,
    highestBalance: INITIAL_SEAT_COINS,
    totalWagered: 0,
    currentStreak: 0,
    bestStreak: 0,
  });

  // Mutable refs to prevent stale closures in async bot routines
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  const isAutoDealingRef = useRef(isAutoDealing);
  isAutoDealingRef.current = isAutoDealing;

  const botFastModeRef = useRef(botFastMode);
  botFastModeRef.current = botFastMode;

  const humanSeatRef = useRef(humanSeat);
  humanSeatRef.current = humanSeat;

  const dealerSeatRef = useRef(dealerSeat);
  dealerSeatRef.current = dealerSeat;

  const cutterSeatRef = useRef(cutterSeat);
  cutterSeatRef.current = cutterSeat;

  const seatsRef = useRef(seats);
  seatsRef.current = seats;

  const mainDeckRef = useRef(mainDeck);
  mainDeckRef.current = mainDeck;

  const firstDeckRef = useRef(firstDeck);
  firstDeckRef.current = firstDeck;

  const secondDeckRef = useRef(secondDeck);
  secondDeckRef.current = secondDeck;

  const pointCardRef = useRef(pointCard);
  pointCardRef.current = pointCard;

  const playerCardsRef = useRef(playerCards);
  playerCardsRef.current = playerCards;

  const dealerCardsRef = useRef(dealerCards);
  dealerCardsRef.current = dealerCards;

  const turnIndexRef = useRef(turnIndex);
  turnIndexRef.current = turnIndex;

  const currentBetRef = useRef(currentBet);
  currentBetRef.current = currentBet;

  const cutIndexRef = useRef(cutIndex);
  cutIndexRef.current = cutIndex;

  const autoDealTimerRef = useRef<number | null>(null);
  const botTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (autoDealTimerRef.current) {
      window.clearTimeout(autoDealTimerRef.current);
      autoDealTimerRef.current = null;
    }
    if (botTimerRef.current) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  }, []);

  const stopAutoDeal = useCallback(() => {
    setIsAutoDealing(false);
    isAutoDealingRef.current = false;
    if (autoDealTimerRef.current) {
      window.clearTimeout(autoDealTimerRef.current);
      autoDealTimerRef.current = null;
    }
  }, []);

  // =========================================================================
  // AUTH & PROFILE RESTORE
  // =========================================================================
  const handleAuthSuccess = useCallback((token: string, user: UserProfile) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthToken(token);
    setCurrentUser(user);
    if (user.preferredSeat && ['A', 'B', 'C', 'D', 'E', 'F'].includes(user.preferredSeat)) {
      setHumanSeat(user.preferredSeat as SeatId);
      humanSeatRef.current = user.preferredSeat as SeatId;
    }
    const displayName = user.displayName || user.playerId || 'You';
    setSeats((prev) =>
      prev.map((s) =>
        s.id === (user.preferredSeat || humanSeatRef.current)
          ? { ...s, name: displayName, shortName: displayName }
          : s
      )
    );
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
    setCurrentUser(null);
    setSeats((prev) =>
      prev.map((s) =>
        s.id === humanSeatRef.current ? { ...s, name: 'You', shortName: 'You' } : s
      )
    );
  }, []);

  useEffect(() => {
    if (!authToken) return;
    apiFetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          const displayName = data.user.displayName || data.user.playerId || 'You';
          setSeats((prev) =>
            prev.map((s) =>
              s.id === humanSeatRef.current
                ? { ...s, name: displayName, shortName: displayName }
                : s
            )
          );
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthToken(null);
      });
  }, [authToken]);

  // =========================================================================
  // MULTIPLAYER ROOMS & WEBSOCKET CONNECTION
  // =========================================================================
  const ensureWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }
    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'room:state' && msg.room) {
          setActiveRoom(msg.room);
          setChatMessages(msg.room.chat || []);
        } else if (msg.type === 'room:action' && msg.room) {
          setActiveRoom(msg.room);
          if (msg.action?.payload?.announcement) {
            setStatusText(
              `[${msg.action.actorName} • Seat ${msg.action.actorSeat}] ${msg.action.payload.announcement}`
            );
          }
        } else if (msg.type === 'room:chat' && msg.message) {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === msg.message.id)) return prev;
            return [...prev.slice(-29), msg.message];
          });
        } else if (msg.type === 'room:invite' && msg.invite) {
          const inv: RoomInvitationItem = msg.invite;
          setIncomingInvites((prev) => {
            if (prev.some((i) => i.id === inv.id)) return prev;
            return [inv, ...prev].slice(0, 10);
          });
        } else if (msg.type === 'room:voice_signal' && msg.signalItem) {
          voiceChatService.handleIncomingSignal(msg.signalItem);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    wsRef.current = ws;
    return ws;
  }, []);

  const broadcastMultiplayerAction = useCallback(
    (actionType: string, payload: Record<string, unknown>) => {
      if (!activeRoom || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      wsRef.current.send(
        JSON.stringify({
          type: 'room:action',
          actionType,
          dealerSeat: dealerSeatRef.current,
          cutterSeat: cutterSeatRef.current,
          phase: phaseRef.current,
          payload,
        })
      );
    },
    [activeRoom]
  );

  const handleJoinRoom = useCallback(
    async (roomCode: string, seatId: SeatId = humanSeatRef.current) => {
      const cleanedCode = roomCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
      if (!cleanedCode) return;

      const playerName =
        currentUser?.displayName ||
        currentUser?.playerId ||
        currentUser?.email?.split('@')[0] ||
        `VIP-${seatId}`;

      // 1. Join via REST endpoint immediately so room state works across all environments
      try {
        const res = await apiFetch('/api/rooms/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode: cleanedCode,
            seatId,
            playerName,
            uid: currentUser?.uid || `guest-${Date.now()}`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.room) {
            setActiveRoom(data.room);
            setChatMessages(data.room.chat || []);
            setStatusText(
              `Connected to Room ${data.room.roomCode} (${data.room.roomName}) • Share code ${data.room.roomCode} to invite friends!`
            );
          }
        }
      } catch {
        // Ignore transient REST error
      }

      // 2. Also connect via WebSocket for instant real-time updates
      try {
        const ws = ensureWebSocket();
        const sendJoin = () => {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomCode: cleanedCode,
              seatId,
              playerName,
              uid: currentUser?.uid || `guest-${Date.now()}`,
            })
          );
        };
        if (ws.readyState === WebSocket.OPEN) {
          sendJoin();
        } else {
          ws.addEventListener('open', sendJoin, { once: true });
        }
      } catch {
        // Ignore if WS unavailable
      }
    },
    [currentUser, ensureWebSocket]
  );

  const handleLeaveRoom = useCallback(() => {
    const code = activeRoom?.roomCode;
    const playerName =
      currentUser?.displayName ||
      currentUser?.playerId ||
      currentUser?.email?.split('@')[0] ||
      `VIP-${humanSeatRef.current}`;

    if (code) {
      apiFetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, playerName }),
      }).catch(() => {});
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
    }
    voiceChatService.leaveRoom();
    setActiveRoom(null);
    setChatMessages([]);
  }, [activeRoom, currentUser]);

  const handleSendChat = useCallback(
    async (text: string) => {
      const code = activeRoom?.roomCode;
      const sender =
        currentUser?.displayName ||
        currentUser?.playerId ||
        currentUser?.email?.split('@')[0] ||
        `VIP-${humanSeatRef.current}`;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'room:chat',
            text,
          })
        );
      }
      if (code) {
        try {
          const res = await apiFetch('/api/rooms/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode: code,
              sender,
              seatId: humanSeatRef.current,
              text,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.message) {
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === data.message.id)) return prev;
                return [...prev.slice(-29), data.message];
              });
            }
          }
        } catch {
          // Ignore
        }
      }
    },
    [activeRoom, currentUser]
  );

  const handleDismissInvite = useCallback((inviteId: string) => {
    setIncomingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    apiFetch('/api/rooms/invites/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    }).catch(() => {});
  }, []);

  // Poll incoming room invitations & active room state
  useEffect(() => {
    const pollInvitesAndRoom = async () => {
      try {
        const params = new URLSearchParams();
        if (currentUser?.playerId || currentUser?.uid) {
          params.set('playerId', currentUser.playerId || currentUser.uid);
        }
        if (currentUser?.email) {
          params.set('email', currentUser.email);
        }
        if (currentUser?.displayName) {
          params.set('displayName', currentUser.displayName);
        }
        const res = await apiFetch(`/api/rooms/invites?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.invites)) {
            setIncomingInvites(data.invites);
          }
        }

        if (activeRoom?.roomCode) {
          const roomRes = await apiFetch(
            `/api/rooms?roomCode=${encodeURIComponent(activeRoom.roomCode)}`
          );
          if (roomRes.ok) {
            const roomData = await roomRes.json();
            if (roomData.room) {
              setActiveRoom(roomData.room);
              if (Array.isArray(roomData.room.chat)) {
                setChatMessages(roomData.room.chat);
              }
            }
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };

    pollInvitesAndRoom();
    const timer = window.setInterval(pollInvitesAndRoom, 5000);
    return () => window.clearInterval(timer);
  }, [currentUser, activeRoom?.roomCode]);

  // Synchronize WebRTC Voice Chat peers when room seats change
  useEffect(() => {
    if (activeRoom?.occupiedSeats && voiceState.isConnected) {
      voiceChatService.syncOccupiedSeats(activeRoom.occupiedSeats);
    }
  }, [activeRoom?.occupiedSeats, voiceState.isConnected]);

  // Auto-join room when user opens a shared Invite Link (?room=RK-XXXX)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        const cleaned = roomParam.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (cleaned) {
          void handleJoinRoom(cleaned, humanSeatRef.current);
          setIsMultiplayerOpen(true);
          params.delete('room');
          const nextSearch = params.toString();
          const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
          window.history.replaceState({}, '', nextUrl);
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, [handleJoinRoom]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new CasinoScene(mountRef.current);
    sceneRef.current = scene;

    return () => {
      clearTimers();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [clearTimers]);

  // Sync 3D table badges whenever seats or dealer/cutter changes
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.syncSeats3D(dealerSeat, cutterSeat, seats, false);
  }, [seats, dealerSeat, cutterSeat]);

  // Execute the Cut and Transition into Sequential Anti-Clockwise Betting
  const executeCutAndStartBetting = useCallback(
    async (chosenCutIndex: number, actorSeat: SeatId) => {
      const scene = sceneRef.current;
      if (!scene || isBusyRef.current) return;

      setIsBusy(true);
      isBusyRef.current = true;
      setActiveActorSeat(actorSeat);

      try {
        const safeCutIndex =
          typeof chosenCutIndex === 'number' && !isNaN(chosenCutIndex)
            ? Math.max(8, Math.min(44, Math.floor(chosenCutIndex)))
            : typeof cutIndexRef.current === 'number' && !isNaN(cutIndexRef.current)
            ? cutIndexRef.current
            : 26;

        setCutIndex(safeCutIndex);
        cutIndexRef.current = safeCutIndex;

        // Ensure active main deck has valid cards
        if (!mainDeckRef.current || mainDeckRef.current.length < 3) {
          mainDeckRef.current = shuffleDeck(createStandardDeck());
          setMainDeck(mainDeckRef.current);
        }

        soundEngine.playCardFlick(1.08);
        const { firstDeck: firstHalf, secondDeck: secondHalf, pointCard: revealedPoint } = splitDeck(
          mainDeckRef.current,
          safeCutIndex
        );

        setFirstDeck(firstHalf);
        firstDeckRef.current = firstHalf;
        setSecondDeck(secondHalf);
        secondDeckRef.current = secondHalf;
        setPointCard(revealedPoint);
        pointCardRef.current = revealedPoint;

        const actorLabel =
          actorSeat === humanSeatRef.current ? `You (Seat ${actorSeat})` : `Bot ${actorSeat}`;
        setStatusText(
          `✂️ ${actorLabel} cuts at #${safeCutIndex} → Hukam is ${revealedPoint.label}!`
        );

        broadcastMultiplayerAction('cut', {
          cutIndex: safeCutIndex,
          pointCard: revealedPoint.label,
          announcement: `Cut at #${safeCutIndex} → Hukam ${revealedPoint.label}`,
        });

        try {
          await scene.animateSplitAndReveal(safeCutIndex, revealedPoint);
        } catch (animErr) {
          console.warn('Split animation warning:', animErr);
        }

        // Transition to Betting Phase starting from Cutter in anti-clockwise order!
        const order = getBettingOrder(dealerSeatRef.current, cutterSeatRef.current);
        const firstBetter = order[0]; // Always Cutter!

        setPhase('betting');
        phaseRef.current = 'betting';
        setActiveActorSeat(firstBetter);
      } catch (err) {
        console.error('Error in executeCutAndStartBetting:', err);
        setPhase('betting');
        phaseRef.current = 'betting';
        setActiveActorSeat(cutterSeatRef.current);
      } finally {
        setIsBusy(false);
        isBusyRef.current = false;
      }
    },
    [broadcastMultiplayerAction]
  );

  // Start a new round with given Dealer & Cutter seats
  const startNewRound = useCallback(
    async (
      nextDealer: SeatId = dealerSeatRef.current,
      nextCutter: SeatId = cutterSeatRef.current,
      nextHuman: SeatId = humanSeatRef.current
    ) => {
      const scene = sceneRef.current;
      if (!scene) return;

      clearTimers();
      stopAutoDeal();
      setIsBusy(true);
      isBusyRef.current = true;
      scene.setRoundOverOrbit(false);

      setDealerSeat(nextDealer);
      dealerSeatRef.current = nextDealer;
      setCutterSeat(nextCutter);
      cutterSeatRef.current = nextCutter;
      setHumanSeat(nextHuman);
      humanSeatRef.current = nextHuman;

      const humanName = currentUser?.displayName || currentUser?.playerId || 'You';
      const updatedSeats = prepareSeatsForNextRound(
        seatsRef.current,
        nextHuman,
        humanName
      );
      setSeats(updatedSeats);
      seatsRef.current = updatedSeats;

      const humanSeatObj = updatedSeats.find((s) => s.id === nextHuman);
      const currentHumanBalance = humanSeatObj ? humanSeatObj.balance : INITIAL_SEAT_COINS;
      setBalance(currentHumanBalance);

      // Randomize default human wager each round
      const randomHumanWager = generateRandomWager(currentHumanBalance);
      setCurrentBet(randomHumanWager);
      currentBetRef.current = randomHumanWager;

      const freshDeck = shuffleDeck(createStandardDeck());
      setMainDeck(freshDeck);
      mainDeckRef.current = freshDeck;
      setFirstDeck([]);
      firstDeckRef.current = [];
      setSecondDeck([]);
      secondDeckRef.current = [];
      setPointCard(null);
      pointCardRef.current = null;
      setPlayerCards([]);
      playerCardsRef.current = [];
      setDealerCards([]);
      dealerCardsRef.current = [];
      setTurnIndex(0);
      turnIndexRef.current = 0;
      setWinner(null);
      setMatchingCard(null);

      const defaultCut = 26;
      setCutIndex(defaultCut);
      cutIndexRef.current = defaultCut;

      await scene.resetRoundAnimation(false);
      await scene.syncSeats3D(nextDealer, nextCutter, updatedSeats, true);

      // Step 1: Dealer (Under) shuffles
      setPhase('shuffling');
      phaseRef.current = 'shuffling';
      setActiveActorSeat(nextDealer);

      if (nextDealer === nextHuman) {
        setStatusText(
          `👑 You (Seat ${nextDealer} • Under) are the Shuffler! Click Shuffle Deck to begin.`
        );
        setIsBusy(false);
        isBusyRef.current = false;
      } else {
        setStatusText(
          `👑 Seat ${nextDealer} (Under) is shuffling the 52-card deck...`
        );
        await scene.animateRiffleShuffle();

        // Step 2: Cutter's turn to cut!
        setPhase('cutting');
        phaseRef.current = 'cutting';
        setActiveActorSeat(nextCutter);
        scene.previewCut(defaultCut);

        if (nextCutter === nextHuman) {
          setStatusText(
            `✂️ Your Turn (Seat ${nextCutter} • Cutter)! Slide to cut the deck.`
          );
          setIsBusy(false);
          isBusyRef.current = false;
        } else {
          const botCut = generateBotCutIndex();
          setCutIndex(botCut);
          cutIndexRef.current = botCut;
          scene.previewCut(botCut);
          setStatusText(`✂️ Bot ${nextCutter} (Cutter) is cutting the deck...`);

          const delay = botFastModeRef.current ? 320 : 650;
          botTimerRef.current = window.setTimeout(() => {
            isBusyRef.current = false;
            executeCutAndStartBetting(botCut, nextCutter);
          }, delay);
        }
      }
    },
    [clearTimers, executeCutAndStartBetting, stopAutoDeal]
  );

  // Automatically start game if ?autostart=1 query param is set
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        const timer = setTimeout(() => {
          startNewRound('A', 'B', humanSeatRef.current);
        }, 400);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore
    }
  }, [startNewRound]);

  // Human Dealer Manual Shuffle Action
  const handlePlayerShuffle = useCallback(async () => {
    const scene = sceneRef.current;
    if (
      !scene ||
      isBusyRef.current ||
      phaseRef.current !== 'shuffling' ||
      dealerSeatRef.current !== humanSeatRef.current
    ) {
      return;
    }

    setIsBusy(true);
    isBusyRef.current = true;
    const dSeat = dealerSeatRef.current;
    const cSeat = cutterSeatRef.current;
    const hSeat = humanSeatRef.current;

    setStatusText(`👑 You (Seat ${dSeat} • Under) are shuffling the 52-card deck...`);
    await scene.animateRiffleShuffle();

    // Advance to Cutter
    const defaultCut = 26;
    setPhase('cutting');
    phaseRef.current = 'cutting';
    setActiveActorSeat(cSeat);
    scene.previewCut(defaultCut);

    if (cSeat === hSeat) {
      setStatusText(`✂️ Your Turn (Seat ${cSeat} • Cutter)! Slide to cut the deck.`);
      setIsBusy(false);
      isBusyRef.current = false;
    } else {
      const botCut = generateBotCutIndex();
      setCutIndex(botCut);
      cutIndexRef.current = botCut;
      scene.previewCut(botCut);
      setStatusText(`✂️ Bot ${cSeat} (Cutter) is cutting your shuffled deck...`);

      const delay = botFastModeRef.current ? 320 : 650;
      botTimerRef.current = window.setTimeout(() => {
        isBusyRef.current = false;
        executeCutAndStartBetting(botCut, cSeat);
      }, delay);
    }
  }, [executeCutAndStartBetting]);

  // Human Cutter Cut Slider Preview
  const handleCutChange = useCallback((idx: number) => {
    setCutIndex(idx);
    cutIndexRef.current = idx;
    if (sceneRef.current && phaseRef.current === 'cutting') {
      sceneRef.current.previewCut(idx);
    }
  }, []);

  // Human Cutter Confirm Cut
  const handleConfirmCut = useCallback(
    async (overrideIdx?: number | unknown) => {
      if (
        isBusyRef.current ||
        phaseRef.current !== 'cutting' ||
        cutterSeatRef.current !== humanSeatRef.current
      ) {
        return;
      }
      const rawCut =
        typeof overrideIdx === 'number' && !isNaN(overrideIdx)
          ? overrideIdx
          : typeof cutIndexRef.current === 'number' && !isNaN(cutIndexRef.current)
          ? cutIndexRef.current
          : 26;
      const chosenCut = Math.max(8, Math.min(44, Math.floor(rawCut)));
      setCutIndex(chosenCut);
      cutIndexRef.current = chosenCut;
      await executeCutAndStartBetting(chosenCut, humanSeatRef.current);
    },
    [executeCutAndStartBetting]
  );

  // Step-by-Step Betting Loop:
  // 1. Cutter bets first on Blue ('player')
  // 2. Shuffler bets second on Red ('dealer')
  // 3. Other players bet on Red or Blue, or choose to Skip
  // 4. Once all seats have bet/skipped, enter 'balancing' phase
  // 5. Card deal cannot start unless redTotal === blueTotal!
  useEffect(() => {
    if (phase !== 'betting' || isBusy) return;

    const order = getStepByStepBettingOrder(dealerSeat, cutterSeat);
    const nextUnbetSeatId = order.find((id) => {
      const s = seats.find((seat) => seat.id === id);
      return s && (!s.betSide || s.betAmount <= 0) && s.betStatus !== 'skipped';
    });

    // All seats have placed their bets or skipped -> Check Pool Balance!
    if (!nextUnbetSeatId) {
      const totals = calculatePoolTotals(seatsRef.current);
      if (totals.isBalanced) {
        setPhase('dealing');
        phaseRef.current = 'dealing';
        setActiveActorSeat(dealerSeat);
        const dealerIsHuman = dealerSeat === humanSeat;
        setStatusText(
          dealerIsHuman
            ? `🃏 Bets balanced (${totals.redTotal} RC each)! You are Shuffler (${dealerSeat}) — click Deal Card or Auto Deal!`
            : `🃏 Bets balanced (${totals.redTotal} RC each)! Bot ${dealerSeat} is dealing cards...`
        );
      } else {
        setPhase('balancing');
        phaseRef.current = 'balancing';
        setActiveActorSeat(null);
        setStatusText(
          `⚖️ Bets Unbalanced! Red: ${totals.redTotal} RC vs Blue: ${totals.blueTotal} RC (Diff: ${totals.difference} RC). Equalise bets to start deal!`
        );
      }
      return;
    }

    setActiveActorSeat(nextUnbetSeatId);

    const isCutterTurn = nextUnbetSeatId === cutterSeat;
    const isShufflerTurn = nextUnbetSeatId === dealerSeat;
    const targetSeatObj = seats.find((s) => s.id === nextUnbetSeatId);
    const targetName = targetSeatObj?.name || `Seat ${nextUnbetSeatId}`;

    // If it's Human's turn to bet:
    if (nextUnbetSeatId === humanSeat) {
      if (isCutterTurn) {
        setStatusText(
          `💰 Step 3: You are Cutter (${targetName})! Place initial bet on Blue side.`
        );
      } else if (isShufflerTurn) {
        setStatusText(
          `💰 Step 4: You are Shuffler (${targetName})! Place initial bet on Red side.`
        );
      } else {
        setStatusText(
          `💰 Step 5: Your Turn to Bet (${targetName})! Bet Red, Bet Blue, or Skip Bet.`
        );
      }
      return;
    }

    // Otherwise, Bot seat's turn with veritable decision algorithm:
    const delay = botFastMode ? 220 : 460;
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'betting') return;
      const targetSeat = seatsRef.current.find((s) => s.id === nextUnbetSeatId);
      if (
        !targetSeat ||
        (targetSeat.betSide && targetSeat.betAmount > 0) ||
        targetSeat.betStatus === 'skipped'
      ) {
        return;
      }

      const decision = decideBotInitialBet(
        nextUnbetSeatId,
        seatsRef.current,
        dealerSeat,
        cutterSeat
      );

      if (decision.betStatus === 'skipped' || !decision.betSide || decision.betAmount <= 0) {
        const nextSeats = seatsRef.current.map((s) =>
          s.id === nextUnbetSeatId
            ? { ...s, betSide: null, betAmount: 0, betStatus: 'skipped' as const }
            : s
        );
        setSeats(nextSeats);
        seatsRef.current = nextSeats;
        setStatusText(`🟡 ${decision.reasoning} (indicator stays yellow)`);
        return;
      }

      soundEngine.playChipClick();
      const nextSeats = seatsRef.current.map((s) =>
        s.id === nextUnbetSeatId
          ? {
              ...s,
              betSide: decision.betSide,
              betAmount: decision.betAmount,
              betStatus: 'placed' as const,
            }
          : s
      );
      setSeats(nextSeats);
      seatsRef.current = nextSeats;

      setStatusText(`💰 ${decision.reasoning}`);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [phase, isBusy, seats, dealerSeat, cutterSeat, humanSeat, botFastMode]);

  // Autonomous Bot Equalisation Loop:
  // When phase is 'balancing', bots take veritable turns to equalize the pool towards redTotal === blueTotal!
  useEffect(() => {
    if (phase !== 'balancing' || isBusy) return;

    const totals = calculatePoolTotals(seats);
    if (totals.isBalanced) {
      soundEngine.playHukamChime();
      setPhase('dealing');
      phaseRef.current = 'dealing';
      setActiveActorSeat(dealerSeat);
      const isHumanD = dealerSeat === humanSeat;
      setStatusText(
        isHumanD
          ? `✨ Pool perfectly balanced (${totals.redTotal} RC each)! You are Shuffler (${dealerSeat}) — click Deal Card or Auto Deal.`
          : `✨ Pool perfectly balanced (${totals.redTotal} RC each)! Bot ${dealerSeat} is ready to deal cards...`
      );
      return;
    }

    const delay = botFastMode ? 320 : 680;
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'balancing') return;

      const currentTotals = calculatePoolTotals(seatsRef.current);
      if (currentTotals.isBalanced) {
        soundEngine.playHukamChime();
        setPhase('dealing');
        phaseRef.current = 'dealing';
        setActiveActorSeat(dealerSeat);
        return;
      }

      const action = decideNextBotEqualizeAction(
        seatsRef.current,
        dealerSeat,
        cutterSeat,
        humanSeat
      );

      if (!action) {
        // Fallback: If no single bot can adjust further, finalize balance via balancePools
        const equalized = balancePools(seatsRef.current);
        setSeats(equalized);
        seatsRef.current = equalized;
        const finalTotals = calculatePoolTotals(equalized);
        if (finalTotals.isBalanced) {
          soundEngine.playHukamChime();
          setPhase('dealing');
          phaseRef.current = 'dealing';
          setActiveActorSeat(dealerSeat);
          setStatusText(`✨ Table balanced (${finalTotals.redTotal} RC each)! Ready to deal cards.`);
        }
        return;
      }

      soundEngine.playChipClick();
      const updatedSeats = seatsRef.current.map((s) => {
        if (s.id === action.botSeat) {
          return {
            ...s,
            betSide: action.side,
            betAmount: action.newBetAmount,
            betStatus: action.newBetAmount > 0 ? ('placed' as const) : ('skipped' as const),
          };
        }
        return s;
      });

      setSeats(updatedSeats);
      seatsRef.current = updatedSeats;

      const newTotals = calculatePoolTotals(updatedSeats);
      if (newTotals.isBalanced) {
        soundEngine.playHukamChime();
        setPhase('dealing');
        phaseRef.current = 'dealing';
        setActiveActorSeat(dealerSeat);
        const isHumanD = dealerSeat === humanSeat;
        setStatusText(
          isHumanD
            ? `✨ ${action.reasoning} → BALANCED (${newTotals.redTotal} RC)! Click Deal Card or Auto Deal.`
            : `✨ ${action.reasoning} → BALANCED (${newTotals.redTotal} RC)! Starting card deal...`
        );
      } else {
        setStatusText(
          `⚖️ ${action.reasoning} (Red: ${newTotals.redTotal} RC vs Blue: ${newTotals.blueTotal} RC • Diff: ${newTotals.difference} RC)`
        );
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [phase, isBusy, seats, dealerSeat, cutterSeat, humanSeat, botFastMode]);

  // Human Places Bet during their turn
  const handlePlaceHumanBet = useCallback(
    (chosenSide: Side) => {
      if (
        phaseRef.current !== 'betting' ||
        isBusyRef.current ||
        activeActorSeat !== humanSeatRef.current
      ) {
        return;
      }

      const hSeat = humanSeatRef.current;
      const isCutter = hSeat === cutterSeatRef.current;
      const isShuffler = hSeat === dealerSeatRef.current;
      const enforcedSide: Side = isCutter ? 'player' : isShuffler ? 'dealer' : chosenSide;

      soundEngine.playChipClick();
      const humanObj = seatsRef.current.find((s) => s.id === hSeat);
      const maxAllowed = humanObj ? Math.max(50, humanObj.balance) : 1000;
      const wager = Math.min(currentBetRef.current, maxAllowed);

      const nextSeats = seatsRef.current.map((s) =>
        s.id === hSeat
          ? { ...s, betSide: enforcedSide, betAmount: wager, betStatus: 'placed' as const }
          : s
      );
      setSeats(nextSeats);
      seatsRef.current = nextSeats;

      const sideLabel = enforcedSide === 'dealer' ? 'RED (Shuffler)' : 'BLUE (Cutter)';
      setStatusText(`💰 You (Seat ${hSeat}) bet ${wager} RC on ${sideLabel}!`);

      broadcastMultiplayerAction('bet', {
        wager,
        side: enforcedSide,
        announcement: `Bet ${wager} RC on ${sideLabel}`,
      });
    },
    [activeActorSeat, broadcastMultiplayerAction]
  );

  // Human Skips Bet
  const handleSkipHumanBet = useCallback(() => {
    if (
      phaseRef.current !== 'betting' ||
      isBusyRef.current ||
      activeActorSeat !== humanSeatRef.current
    ) {
      return;
    }

    soundEngine.playChipClick();
    const hSeat = humanSeatRef.current;
    const nextSeats = seatsRef.current.map((s) =>
      s.id === hSeat
        ? { ...s, betSide: null, betAmount: 0, betStatus: 'skipped' as const }
        : s
    );
    setSeats(nextSeats);
    seatsRef.current = nextSeats;
    setStatusText(`🟡 You (Seat ${hSeat}) skipped betting (indicator stays yellow)`);
  }, [activeActorSeat]);

  // Quick Balance Pools Helper (Equalizes difference so game dealing can start)
  const handleQuickBalance = useCallback(() => {
    soundEngine.playChipClick();
    const balancedSeats = balancePools(seatsRef.current);
    setSeats(balancedSeats);
    seatsRef.current = balancedSeats;
    const totals = calculatePoolTotals(balancedSeats);
    if (totals.isBalanced) {
      setPhase('dealing');
      phaseRef.current = 'dealing';
      setActiveActorSeat(dealerSeatRef.current);
      const isHumanD = dealerSeatRef.current === humanSeatRef.current;
      setStatusText(
        isHumanD
          ? `✨ Bets balanced (${totals.redTotal} RC each)! Click Deal Card or Auto Deal.`
          : `✨ Bets balanced (${totals.redTotal} RC each)! Bot ${dealerSeatRef.current} is dealing...`
      );
    }
  }, []);

  // Adjust Bet (+/- 50 RC) during Balancing phase
  const handleAdjustBet = useCallback((side: 'dealer' | 'player', delta: number) => {
    soundEngine.playChipClick();
    const currentSeats = seatsRef.current;
    let target = currentSeats.find((s) => s.id === humanSeatRef.current && s.betSide === side);
    if (!target) {
      target = currentSeats.find((s) => !s.isHuman && s.betSide === side);
    }
    if (!target) {
      target = currentSeats.find(
        (s) => !s.isHuman && (s.betStatus === 'skipped' || s.betAmount === 0 || !s.betSide)
      );
    }
    if (!target) return;

    const newAmount = Math.max(0, target.betAmount + delta);
    const nextSeats = currentSeats.map((s) =>
      s.id === target!.id
        ? {
            ...s,
            betSide: newAmount > 0 ? side : null,
            betAmount: newAmount,
            betStatus: newAmount > 0 ? ('placed' as const) : ('skipped' as const),
          }
        : s
    );
    setSeats(nextSeats);
    seatsRef.current = nextSeats;

    const totals = calculatePoolTotals(nextSeats);
    if (totals.isBalanced) {
      setPhase('dealing');
      phaseRef.current = 'dealing';
      setActiveActorSeat(dealerSeatRef.current);
      setStatusText(`✨ Bets balanced (${totals.redTotal} RC each)! Ready to deal cards.`);
    } else {
      setStatusText(
        `⚖️ Adjusted: Red ${totals.redTotal} RC vs Blue ${totals.blueTotal} RC (Diff: ${totals.difference} RC)`
      );
    }
  }, []);

  // Human Randomizes Bet Button
  const handleRandomizeBet = useCallback(() => {
    soundEngine.playChipClick();
    const hSeat = humanSeatRef.current;
    const humanObj = seatsRef.current.find((s) => s.id === hSeat);
    const bal = humanObj ? humanObj.balance : balance;
    const randWager = generateRandomWager(bal);
    setCurrentBet(randWager);
    currentBetRef.current = randWager;
  }, [balance]);

  // Deal a single card from 2nd Half Shoe -> alternating Bahar ('player') then Andar ('dealer')
  const handleDealCard = useCallback(async () => {
    const scene = sceneRef.current;
    const targetPoint = pointCardRef.current;
    if (
      !scene ||
      isBusyRef.current ||
      phaseRef.current !== 'dealing' ||
      !targetPoint
    ) {
      return;
    }

    let currentSecond = [...secondDeckRef.current];
    let currentFirst = [...firstDeckRef.current];
    let fromShoe: 1 | 2 = 2;

    if (currentSecond.length === 0 && currentFirst.length > 0) {
      currentSecond = currentFirst;
      currentFirst = [];
      fromShoe = 1;
      setFirstDeck([]);
      firstDeckRef.current = [];
      setStatusText('Moved remaining 1st-half stack to dealing shoe');
    }

    if (currentSecond.length === 0) {
      stopAutoDeal();
      return;
    }

    setIsBusy(true);
    isBusyRef.current = true;

    const card = currentSecond[0];
    const remainingSecond = currentSecond.slice(1);
    setSecondDeck(remainingSecond);
    secondDeckRef.current = remainingSecond;

    const currentTurn = turnIndexRef.current;
    const side: Side = getReceivingSide(currentTurn);
    const cardCountOnMat =
      side === 'player'
        ? playerCardsRef.current.length + 1
        : dealerCardsRef.current.length + 1;
    const matched = isWinningCard(card, targetPoint);

    scene.renderDeckStacks(currentFirst.length, remainingSecond.length);
    await scene.animateDealCard(card, fromShoe, side, cardCountOnMat, matched);

    if (side === 'player') {
      const updated = [...playerCardsRef.current, card];
      setPlayerCards(updated);
      playerCardsRef.current = updated;
    } else {
      const updated = [...dealerCardsRef.current, card];
      setDealerCards(updated);
      dealerCardsRef.current = updated;
    }

    const nextTurn = currentTurn + 1;
    setTurnIndex(nextTurn);
    turnIndexRef.current = nextTurn;

    if (matched) {
      stopAutoDeal();
      setWinner(side);
      setMatchingCard(card);
      setPhase('round_over');
      phaseRef.current = 'round_over';
      scene.setRoundOverOrbit(true);

      const dSeat = dealerSeatRef.current;
      const cSeat = cutterSeatRef.current;
      const hSeat = humanSeatRef.current;

      setPrevDealerSeat(dSeat);
      setPrevCutterSeat(cSeat);

      // Balanced pool settlement between Red and Blue sides (preserving 100% constant currency)
      const settlement = settleBalancedRound(
        seatsRef.current,
        side
      );
      const settledSeats = settlement.updatedSeats;
      setSeats(settledSeats);
      seatsRef.current = settledSeats;

      const humanObj = settledSeats.find((s) => s.id === hSeat);
      const humanDeltaVal = settlement.deltas[hSeat] ?? 0;
      const humanWon = humanDeltaVal >= 0;
      setPlayerWonRound(humanWon);
      setHumanDelta(humanDeltaVal);

      const newHumanBalance = humanObj ? humanObj.balance : INITIAL_SEAT_COINS;
      setBalance(newHumanBalance);

      // Apply Anti-Clockwise Rotation Rule
      const { nextDealer, nextCutter } = resolveNextDealerAndCutter(
        dSeat,
        cSeat,
        side
      );
      setDealerSeat(nextDealer);
      dealerSeatRef.current = nextDealer;
      setCutterSeat(nextCutter);
      cutterSeatRef.current = nextCutter;
      scene.syncSeats3D(nextDealer, nextCutter, settledSeats, false);

      setStats((prev) => {
        const nextStreak = humanWon ? prev.currentStreak + 1 : 0;
        return {
          totalRounds: prev.totalRounds + 1,
          playerWins: prev.playerWins + (humanWon ? 1 : 0),
          dealerWins: prev.dealerWins + (humanWon ? 0 : 1),
          highestBalance: Math.max(prev.highestBalance, newHumanBalance),
          totalWagered: prev.totalWagered + currentBetRef.current,
          currentStreak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
        };
      });

      // Persist round result to Cloud SQL / Local Vault if user is logged in
      const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (savedToken) {
        apiFetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify({
            roomCode: activeRoom?.roomCode || null,
            dealerSeat: dSeat,
            cutterSeat: cSeat,
            winningSide: side,
            pointCard: targetPoint.label,
            wager: currentBetRef.current,
            coinDelta: humanDeltaVal,
            finalBalance: newHumanBalance,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.user) setCurrentUser(data.user);
          })
          .catch(() => {});
      }

      const sideWinnerTitle =
        side === 'player'
          ? `BAHAR (Cutter Seat ${cSeat}) Wins!`
          : `UNDER (Dealer Seat ${dSeat}) Wins!`;

      setStatusText(
        `🏆 ${card.label} matches Hukam ${targetPoint.label}! ${sideWinnerTitle} → Next: ${nextDealer} Deals, ${nextCutter} Cuts`
      );
    } else {
      const nextSide = getReceivingSide(nextTurn);
      const nextTargetLabel =
        nextSide === 'player'
          ? `Bahar (Seat ${cutterSeatRef.current})`
          : `Under (Seat ${dealerSeatRef.current})`;
      setStatusText(`Dealt ${card.label} → Next: ${nextTargetLabel}`);
    }

    setIsBusy(false);
    isBusyRef.current = false;
  }, [stopAutoDeal, activeRoom]);

  // Bot Dealer Auto-Deals Cards ("as they like" with dynamic cadence)
  // Cutter never deals; only Dealer (Under) deals!
  useEffect(() => {
    const isBotDealer = dealerSeat !== humanSeat;
    const shouldAutoStep =
      phase === 'dealing' && !isBusy && (isBotDealer || isAutoDealing);

    if (!shouldAutoStep) return;

    const baseDelay = isBotDealer ? generateBotDealDelayMs() : 300;
    const delay = botFastMode ? Math.max(140, Math.floor(baseDelay * 0.55)) : baseDelay;

    autoDealTimerRef.current = window.setTimeout(() => {
      if (
        phaseRef.current === 'dealing' &&
        !isBusyRef.current &&
        (dealerSeatRef.current !== humanSeatRef.current ||
          isAutoDealingRef.current)
      ) {
        handleDealCard();
      }
    }, delay);

    return () => {
      if (autoDealTimerRef.current) {
        window.clearTimeout(autoDealTimerRef.current);
      }
    };
  }, [phase, isBusy, dealerSeat, humanSeat, isAutoDealing, botFastMode, turnIndex, handleDealCard]);

  // Toggle Auto-Deal when Human is Dealer
  const handleToggleAutoDeal = useCallback(() => {
    if (isAutoDealingRef.current) {
      stopAutoDeal();
    } else {
      setIsAutoDealing(true);
      isAutoDealingRef.current = true;
      if (!isBusyRef.current && phaseRef.current === 'dealing') {
        handleDealCard();
      }
    }
  }, [handleDealCard, stopAutoDeal]);

  // Switch which seat the user occupies (A-F)
  const handleSelectHumanSeat = useCallback(
    (newSeat: SeatId) => {
      if (newSeat === humanSeatRef.current) return;
      soundEngine.playChipClick();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeRoom) {
        wsRef.current.send(
          JSON.stringify({
            type: 'room:select_seat',
            seatId: newSeat,
          })
        );
      }
      startNewRound(dealerSeatRef.current, cutterSeatRef.current, newSeat);
    },
    [startNewRound, activeRoom]
  );

  // Camera Change Handler
  const handleSelectCamera = useCallback((view: CameraView) => {
    setCameraView(view);
    sceneRef.current?.setCameraView(view);
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setIsMuted(nextMuted);
  }, []);

  const handleVolumeChange = useCallback((newVol: number) => {
    const clamped = soundEngine.setVolume(newVol);
    setVolume(clamped);
    setIsMuted(soundEngine.isMuted());
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (e.code === 'Escape') {
        setIsProfileOpen(false);
        setIsMultiplayerOpen(false);
        setIsSettingsOpen((prev) => !prev);
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (isProfileOpen || isMultiplayerOpen || isSettingsOpen) return;
        e.preventDefault();
        if (phaseRef.current === 'title') {
          startNewRound('A', 'B', humanSeatRef.current);
        } else if (
          phaseRef.current === 'shuffling' &&
          dealerSeatRef.current === humanSeatRef.current
        ) {
          handlePlayerShuffle();
        } else if (
          phaseRef.current === 'cutting' &&
          cutterSeatRef.current === humanSeatRef.current
        ) {
          handleConfirmCut();
        } else if (
          phaseRef.current === 'dealing' &&
          dealerSeatRef.current === humanSeatRef.current
        ) {
          handleDealCard();
        } else if (phaseRef.current === 'round_over') {
          startNewRound(
            dealerSeatRef.current,
            cutterSeatRef.current,
            humanSeatRef.current
          );
        }
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        const order: CameraView[] = ['felt', 'player', 'pedestal', 'cinematic'];
        const next = order[(order.indexOf(cameraView) + 1) % order.length];
        handleSelectCamera(next);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        const muted = soundEngine.toggleMute();
        setIsMuted(muted);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cameraView,
    handleConfirmCut,
    handleDealCard,
    handlePlayerShuffle,
    handleSelectCamera,
    isMultiplayerOpen,
    isProfileOpen,
    isSettingsOpen,
    startNewRound,
  ]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      <OfflineIndicator />
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Title Screen Overlay */}
      {phase === 'title' && (
        <TitleScreen
          onStart={() => startNewRound('A', 'B', humanSeat)}
          onJoinByRoomCode={(code) => {
            void handleJoinRoom(code, humanSeat);
            startNewRound('A', 'B', humanSeat);
          }}
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          userDisplayName={currentUser?.displayName}
        />
      )}

      {/* Sleek Transparent Floating HUD */}
      {phase !== 'title' && (
        <HUD
          balance={balance}
          pointCard={pointCard}
          dealerSeat={dealerSeat}
          cutterSeat={cutterSeat}
          humanSeat={humanSeat}
          activeActorSeat={activeActorSeat}
          seats={seats}
          onSelectHumanSeat={handleSelectHumanSeat}
          announcement={statusText}
          userDisplayName={currentUser?.displayName}
          isAuthenticated={Boolean(currentUser)}
          activeRoomCode={activeRoom?.roomCode || null}
          roomPlayerCount={
            activeRoom ? Object.keys(activeRoom.occupiedSeats).length : 1
          }
          occupiedSeats={activeRoom?.occupiedSeats}
          incomingInvite={incomingInvites[0] || null}
          onAcceptInvite={(inv) => {
            handleDismissInvite(inv.id);
            void handleJoinRoom(inv.roomCode, humanSeat);
          }}
          onDismissInvite={handleDismissInvite}
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenVoiceChat={() => setIsVoiceOpen(true)}
          isVoiceConnected={voiceState.isConnected}
          isVoiceMuted={voiceState.isMicMuted}
          isSomeoneSpeaking={
            voiceState.isLocalSpeaking ||
            Object.values(voiceState.peers).some((p) => p.isSpeaking)
          }
          connectedVoiceCount={
            Object.values(voiceState.peers).filter((p) => p.status === 'connected').length
          }
        />
      )}

      {/* Sleek Translucent Bottom Control Dock */}
      {phase !== 'title' && phase !== 'paused' && phase !== 'round_over' && (
        <ControlDock
          phase={phase}
          dealerSeat={dealerSeat}
          cutterSeat={cutterSeat}
          humanSeat={humanSeat}
          activeActorSeat={activeActorSeat}
          statusText={statusText}
          onPlayerShuffle={handlePlayerShuffle}
          currentBet={currentBet}
          onSelectBet={(b) => {
            setCurrentBet(b);
            currentBetRef.current = b;
          }}
          onRandomizeBet={handleRandomizeBet}
          cutIndex={cutIndex}
          onChangeCutIndex={handleCutChange}
          onConfirmCut={handleConfirmCut}
          onPlaceHumanBet={handlePlaceHumanBet}
          onSkipHumanBet={handleSkipHumanBet}
          onDealOne={handleDealCard}
          onAutoDeal={handleToggleAutoDeal}
          isAutoDealing={isAutoDealing}
          botFastMode={botFastMode}
          onToggleBotFastMode={() => setBotFastMode((v) => !v)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isBusy={isBusy}
          redTotal={calculatePoolTotals(seats).redTotal}
          blueTotal={calculatePoolTotals(seats).blueTotal}
          isBalanced={calculatePoolTotals(seats).isBalanced}
          onQuickBalance={handleQuickBalance}
          onAdjustBet={handleAdjustBet}
          onToggleVoiceMic={() => voiceChatService.toggleMic()}
          isVoiceConnected={voiceState.isConnected}
          isVoiceMuted={voiceState.isMicMuted}
          isLocalSpeaking={voiceState.isLocalSpeaking}
        />
      )}

      {/* Transparent Floating Round-Over Victory Card */}
      {phase === 'round_over' && winner && matchingCard && pointCard && (
        <RoundOverModal
          winner={winner}
          playerWon={playerWonRound}
          prevDealer={prevDealerSeat}
          prevCutter={prevCutterSeat}
          nextDealer={dealerSeat}
          nextCutter={cutterSeat}
          humanSeat={humanSeat}
          matchingCard={matchingCard}
          pointCard={pointCard}
          betAmount={currentBet}
          humanDelta={humanDelta}
          totalCardsDealt={playerCards.length + dealerCards.length}
          stats={stats}
          onNextRound={() => startNewRound()}
        />
      )}

      {/* Transparent Professional Email Auth / Password Reset / Profile Modal */}
      <AuthProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={currentUser}
        token={authToken}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
        onSelectSeat={handleSelectHumanSeat}
      />

      {/* Transparent Professional Multiplayer Room & Live Table Lobby Modal */}
      <MultiplayerModal
        isOpen={isMultiplayerOpen}
        onClose={() => setIsMultiplayerOpen(false)}
        activeRoomCode={activeRoom?.roomCode || null}
        activeRoomName={activeRoom?.roomName || null}
        occupiedSeats={activeRoom?.occupiedSeats || {}}
        chatMessages={chatMessages}
        humanSeat={humanSeat}
        playerName={
          currentUser?.displayName ||
          currentUser?.email?.split('@')[0] ||
          `VIP-${humanSeat}`
        }
        playerId={currentUser?.playerId || currentUser?.uid}
        incomingInvites={incomingInvites}
        onAcceptInvite={(inv) => {
          handleDismissInvite(inv.id);
          void handleJoinRoom(inv.roomCode, humanSeat);
          if (phase === 'title') {
            startNewRound('A', 'B', humanSeat);
          }
        }}
        onDismissInvite={handleDismissInvite}
        onJoinRoom={(code, seat) => {
          void handleJoinRoom(code, seat);
        }}
        onLeaveRoom={handleLeaveRoom}
        onSelectSeat={handleSelectHumanSeat}
        onSendChat={handleSendChat}
        onOpenVoiceChat={() => setIsVoiceOpen(true)}
        isVoiceConnected={voiceState.isConnected}
      />

      {/* Table WebRTC Voice Chat Modal */}
      <VoiceChatModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        activeRoomCode={activeRoom?.roomCode || null}
        occupiedSeats={activeRoom?.occupiedSeats || {}}
        humanSeat={humanSeat}
        playerName={
          currentUser?.displayName ||
          currentUser?.email?.split('@')[0] ||
          `VIP-${humanSeat}`
        }
      />

      {/* Royal Casino Themed Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        botFastMode={botFastMode}
        onToggleBotFastMode={() => setBotFastMode((v) => !v)}
        cameraView={cameraView}
        onSelectCameraView={handleSelectCamera}
        humanSeat={humanSeat}
        dealerSeat={dealerSeat}
        cutterSeat={cutterSeat}
        seats={seats}
        onSelectHumanSeat={handleSelectHumanSeat}
        onRestartRound={() => startNewRound()}
        onReturnTitle={() => {
          stopAutoDeal();
          setPhase('title');
        }}
      />
    </div>
  );
}
