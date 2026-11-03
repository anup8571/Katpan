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
  generateBotBet,
  generateRandomWager,
  settleConstantCurrencyRound,
  generateBotDealDelayMs,
} from './game/rules';
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
} from './components/MultiplayerModal';
import { SettingsModal } from './components/SettingsModal';

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
  const [isMuted, setIsMuted] = useState(false);
  const [botFastMode, setBotFastMode] = useState(false);

  // Transparent Modals State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // User Auth & Profile State
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_TOKEN_KEY)
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Multiplayer WebSocket & Room State
  const wsRef = useRef<WebSocket | null>(null);
  const [activeRoom, setActiveRoom] = useState<LiveRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);

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
  const [mainDeck, setMainDeck] = useState<Card[]>([]);
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
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
    setCurrentUser(null);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
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
          setChatMessages((prev) => [...prev.slice(-29), msg.message]);
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
    (roomCode: string, seatId: SeatId = humanSeatRef.current) => {
      const ws = ensureWebSocket();
      const playerName =
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        `VIP-${seatId}`;
      const sendJoin = () => {
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomCode,
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
    },
    [currentUser, ensureWebSocket]
  );

  const handleLeaveRoom = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:leave' }));
    }
    setActiveRoom(null);
    setChatMessages([]);
  }, []);

  const handleSendChat = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:chat',
          text,
        })
      );
    }
  }, []);

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

      soundEngine.playCardFlick(1.08);
      const { firstDeck: firstHalf, secondDeck: secondHalf, pointCard: revealedPoint } = splitDeck(
        mainDeckRef.current,
        chosenCutIndex
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
        `✂️ ${actorLabel} cuts at #${chosenCutIndex} → Hukam is ${revealedPoint.label}!`
      );

      broadcastMultiplayerAction('cut', {
        cutIndex: chosenCutIndex,
        pointCard: revealedPoint.label,
        announcement: `Cut at #${chosenCutIndex} → Hukam ${revealedPoint.label}`,
      });

      await scene.animateSplitAndReveal(chosenCutIndex, revealedPoint);

      // Transition to Betting Phase starting from Cutter in anti-clockwise order!
      const order = getBettingOrder(dealerSeatRef.current, cutterSeatRef.current);
      const firstBetter = order[0]; // Always Cutter!

      setPhase('betting');
      phaseRef.current = 'betting';
      setActiveActorSeat(firstBetter);
      setIsBusy(false);
      isBusyRef.current = false;
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

      const updatedSeats = prepareSeatsForNextRound(
        seatsRef.current,
        nextHuman
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
    async (overrideIdx?: number) => {
      if (
        isBusyRef.current ||
        phaseRef.current !== 'cutting' ||
        cutterSeatRef.current !== humanSeatRef.current
      ) {
        return;
      }
      const chosenCut = overrideIdx ?? cutIndexRef.current;
      setCutIndex(chosenCut);
      cutIndexRef.current = chosenCut;
      await executeCutAndStartBetting(chosenCut, humanSeatRef.current);
    },
    [executeCutAndStartBetting]
  );

  // Sequential Anti-Clockwise Betting Loop (starting from Cutter)
  useEffect(() => {
    if (phase !== 'betting' || isBusy) return;

    const order = getBettingOrder(dealerSeat, cutterSeat);
    const nextUnbetSeatId = order.find((id) => {
      const s = seats.find((seat) => seat.id === id);
      return s && (!s.betSide || s.betAmount <= 0);
    });

    // All 5 non-dealer seats have placed their bets -> Move to Dealing phase!
    if (!nextUnbetSeatId) {
      setPhase('dealing');
      phaseRef.current = 'dealing';
      setActiveActorSeat(dealerSeat);
      const dealerIsHuman = dealerSeat === humanSeat;
      setStatusText(
        dealerIsHuman
          ? `🃏 All bets locked! You are Seat ${dealerSeat} (Under) — click Deal Card or Auto Deal!`
          : `🃏 All bets locked! Bot ${dealerSeat} (Under) is dealing cards...`
      );
      return;
    }

    setActiveActorSeat(nextUnbetSeatId);

    // If it's the Human's seat turn to bet, wait for their click in ControlDock
    if (nextUnbetSeatId === humanSeat) {
      const isCutter = nextUnbetSeatId === cutterSeat;
      setStatusText(
        isCutter
          ? `💰 You are Cutter (Seat ${humanSeat} • Bahar)! Confirm your wager amount.`
          : `💰 Your Turn to Bet (Seat ${humanSeat})! Pick Under (${dealerSeat}) or Bahar (${cutterSeat}).`
      );
      return;
    }

    // Otherwise, it's a Bot seat's turn -> Automatically place random bet after a crisp step delay
    const delay = botFastMode ? 200 : 440;
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== 'betting') return;
      const targetSeat = seatsRef.current.find((s) => s.id === nextUnbetSeatId);
      if (!targetSeat || (targetSeat.betSide && targetSeat.betAmount > 0)) return;

      const isBotCutter = nextUnbetSeatId === cutterSeatRef.current;
      const { betSide, betAmount } = generateBotBet(
        nextUnbetSeatId,
        isBotCutter,
        targetSeat.balance
      );
      soundEngine.playChipClick();

      const nextSeats = seatsRef.current.map((s) =>
        s.id === nextUnbetSeatId
          ? { ...s, betSide, betAmount }
          : s
      );
      setSeats(nextSeats);
      seatsRef.current = nextSeats;

      const sideName =
        betSide === 'dealer'
          ? `UNDER (Seat ${dealerSeatRef.current})`
          : `BAHAR (Seat ${cutterSeatRef.current})`;
      setStatusText(
        `💰 Bot ${nextUnbetSeatId} bets ${betAmount} RC on ${sideName}`
      );
    }, delay);

    return () => window.clearTimeout(timer);
  }, [phase, isBusy, seats, dealerSeat, cutterSeat, humanSeat, botFastMode]);

  // Human Places Bet during their turn in the anti-clockwise betting sequence
  const handlePlaceHumanBet = useCallback(
    (chosenSide: Side) => {
      if (
        phaseRef.current !== 'betting' ||
        isBusyRef.current ||
        activeActorSeat !== humanSeatRef.current
      ) {
        return;
      }

      // Cutter is strictly Bahar ('player' side = main opponent of Under/Shuffler)
      const enforcedSide: Side =
        humanSeatRef.current === cutterSeatRef.current ? 'player' : chosenSide;

      soundEngine.playChipClick();
      const hSeat = humanSeatRef.current;
      const humanObj = seatsRef.current.find((s) => s.id === hSeat);
      const maxAllowed = humanObj ? Math.max(50, humanObj.balance) : 1000;
      const wager = Math.min(currentBetRef.current, maxAllowed);

      const nextSeats = seatsRef.current.map((s) =>
        s.id === hSeat
          ? { ...s, betSide: enforcedSide, betAmount: wager }
          : s
      );
      setSeats(nextSeats);
      seatsRef.current = nextSeats;

      const sideName =
        enforcedSide === 'dealer'
          ? `UNDER (Seat ${dealerSeatRef.current})`
          : `BAHAR (Seat ${cutterSeatRef.current})`;
      setStatusText(`💰 You (Seat ${hSeat}) bet ${wager} RC on ${sideName}!`);

      broadcastMultiplayerAction('bet', {
        wager,
        side: enforcedSide,
        announcement: `Bet ${wager} RC on ${sideName}`,
      });
    },
    [activeActorSeat, broadcastMultiplayerAction]
  );

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

      // Zero-sum constant currency settlement between Dealer (Under) and all Bettors
      const settlement = settleConstantCurrencyRound(
        seatsRef.current,
        dSeat,
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

      // Persist round result to Cloud SQL if user is logged in
      const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (savedToken) {
        fetch('/api/sessions', {
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
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
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
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
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
          onDealOne={handleDealCard}
          onAutoDeal={handleToggleAutoDeal}
          isAutoDealing={isAutoDealing}
          botFastMode={botFastMode}
          onToggleBotFastMode={() => setBotFastMode((v) => !v)}
          isBusy={isBusy}
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
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={handleLeaveRoom}
        onSelectSeat={handleSelectHumanSeat}
        onSendChat={handleSendChat}
      />

      {/* Transparent Professional Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(soundEngine.toggleMute())}
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
