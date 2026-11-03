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
import { PauseModal, RoundOverModal } from './components/Modals';
import { OfflineIndicator } from './components/PWAInstallButton';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CasinoScene | null>(null);

  // Game Phase & Shell state
  const [phase, setPhase] = useState<GamePhase>('title');
  const [cameraView, setCameraView] = useState<CameraView>('felt');
  const [isMuted, setIsMuted] = useState(false);
  const [botFastMode, setBotFastMode] = useState(false);

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

  const turnIndexRef = useRef(turnIndex);
  turnIndexRef.current = turnIndex;

  const currentBetRef = useRef(currentBet);
  currentBetRef.current = currentBet;

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const roundTokenRef = useRef(0);

  // Sync document.body.dataset.state & post-match 360° circular camera spin
  useEffect(() => {
    if (phase === 'title') document.body.dataset.state = 'title';
    else if (phase === 'paused') document.body.dataset.state = 'paused';
    else if (phase === 'round_over') document.body.dataset.state = 'gameover';
    else document.body.dataset.state = 'playing';

    if (sceneRef.current) {
      sceneRef.current.setRoundOverOrbit(phase === 'round_over');
    }
  }, [phase]);

  const stopAutoDeal = useCallback(() => {
    setIsAutoDealing(false);
    isAutoDealingRef.current = false;
  }, []);

  // Deal a single card (called automatically by Bot Dealer or manually/auto by Human Dealer)
  const handleDealCard = useCallback(async (): Promise<boolean> => {
    if (isBusyRef.current || !pointCardRef.current) return false;
    setIsBusy(true);
    isBusyRef.current = true;

    let drawnCard: Card | null = null;
    let fromShoe: 1 | 2 = 1;

    const currentFirst = [...firstDeckRef.current];
    const currentSecond = [...secondDeckRef.current];

    if (currentFirst.length > 0) {
      drawnCard = currentFirst.shift()!;
      fromShoe = 1;
      setFirstDeck(currentFirst);
      firstDeckRef.current = currentFirst;
      sceneRef.current?.renderDeckStacks(currentFirst.length, currentSecond.length);
    } else if (currentSecond.length > 0) {
      drawnCard = currentSecond.shift()!;
      fromShoe = 2;
      setSecondDeck(currentSecond);
      secondDeckRef.current = currentSecond;
      sceneRef.current?.renderDeckStacks(0, currentSecond.length);
    } else {
      setIsBusy(false);
      isBusyRef.current = false;
      return false;
    }

    const currentTurn = turnIndexRef.current;
    const toSide = getReceivingSide(currentTurn); // 0, 2, 4 -> 'player' (Bahar/Cutter); 1, 3, 5 -> 'dealer' (Andar/Under)
    const isMatch = isWinningCard(drawnCard, pointCardRef.current);

    setTurnIndex(currentTurn + 1);
    turnIndexRef.current = currentTurn + 1;

    if (sceneRef.current) {
      const cardCountOnMat =
        toSide === 'player' ? playerCards.length + 1 : dealerCards.length + 1;
      await sceneRef.current.animateDealCard(drawnCard, fromShoe, toSide, cardCountOnMat, isMatch);
    }

    if (toSide === 'player') {
      setPlayerCards((prev) => [drawnCard!, ...prev]);
    } else {
      setDealerCards((prev) => [drawnCard!, ...prev]);
    }

    if (isMatch) {
      stopAutoDeal();
      setWinner(toSide);
      setMatchingCard(drawnCard);

      const dSeat = dealerSeatRef.current;
      const cSeat = cutterSeatRef.current;
      setPrevDealerSeat(dSeat);
      setPrevCutterSeat(cSeat);

      // Rule 2: Settle constant-sum currency across all 6 players (Total Pool remains 6,000 RC!)
      const prevHumanSeatObj = seatsRef.current.find((s) => s.id === humanSeatRef.current);
      const prevHumanBal = prevHumanSeatObj ? prevHumanSeatObj.balance : balanceRef.current;

      const { updatedSeats: settledSeats, deltas } = settleConstantCurrencyRound(
        seatsRef.current,
        dSeat,
        toSide
      );
      setSeats(settledSeats);
      seatsRef.current = settledSeats;

      const nextHumanSeatObj = settledSeats.find((s) => s.id === humanSeatRef.current);
      const newBalance = nextHumanSeatObj ? nextHumanSeatObj.balance : prevHumanBal;
      const delta = deltas[humanSeatRef.current] ?? newBalance - prevHumanBal;
      setHumanDelta(delta);
      setBalance(newBalance);
      balanceRef.current = newBalance;

      // Determine if the human player won their bet (or won as Under/Dealer)
      let humanWon = delta > 0;
      if (delta === 0) {
        if (dSeat === humanSeatRef.current) {
          humanWon = toSide === 'dealer';
        } else if (prevHumanSeatObj?.betSide) {
          humanWon = prevHumanSeatObj.betSide === toSide;
        } else {
          humanWon = toSide === 'player';
        }
      }
      setPlayerWonRound(humanWon);

      // Anti-clockwise rotation based on whether Cutter ('player' / Bahar) won or lost!
      const { nextDealer, nextCutter } = resolveNextDealerAndCutter(dSeat, cSeat, toSide);
      setDealerSeat(nextDealer);
      dealerSeatRef.current = nextDealer;
      setCutterSeat(nextCutter);
      cutterSeatRef.current = nextCutter;

      await sceneRef.current?.syncSeats3D(nextDealer, nextCutter, settledSeats, false);

      setStats((prev) => {
        const streak = humanWon ? prev.currentStreak + 1 : 0;
        return {
          totalRounds: prev.totalRounds + 1,
          playerWins: prev.playerWins + (humanWon ? 1 : 0),
          dealerWins: prev.dealerWins + (humanWon ? 0 : 1),
          highestBalance: Math.max(prev.highestBalance, newBalance),
          totalWagered: prev.totalWagered + currentBetRef.current,
          currentStreak: streak,
          bestStreak: Math.max(prev.bestStreak, streak),
        };
      });

      const winningSideName =
        toSide === 'player'
          ? `Bahar (Cutter ${cSeat}'s Side)`
          : `Andar (Under ${dSeat}'s Side)`;
      setStatusText(
        `🎉 ${drawnCard.label} matched on ${winningSideName}! Next: ${nextDealer} Shuffles, ${nextCutter} Cuts ↺`
      );

      sceneRef.current?.setRoundOverOrbit(true);

      setTimeout(() => {
        setPhase('round_over');
        setIsBusy(false);
        isBusyRef.current = false;
      }, 450);

      return true;
    } else {
      const nextSideName =
        getReceivingSide(currentTurn + 1) === 'player'
          ? `Bahar (Cutter ${cutterSeatRef.current})`
          : `Andar (Under ${dealerSeatRef.current})`;
      setStatusText(
        `Under ${dealerSeatRef.current} dealt ${drawnCard.label} → Next: ${nextSideName}`
      );
      setIsBusy(false);
      isBusyRef.current = false;
      return false;
    }
  }, [playerCards.length, dealerCards.length, stopAutoDeal]);

  // Rule 4: Whenever phase enters 'dealing' and a Bot is the Dealer, the Bot Dealer automatically deals!
  useEffect(() => {
    if (phase !== 'dealing') return;
    const isBotDealer = dealerSeatRef.current !== humanSeatRef.current;
    if (!isBotDealer && !isAutoDealing) return;

    let cancelled = false;
    setActiveActorSeat(dealerSeatRef.current);

    const stepDeal = async () => {
      if (cancelled || phaseRef.current !== 'dealing' || !pointCardRef.current) return;
      if (isBusyRef.current) {
        setTimeout(stepDeal, 100);
        return;
      }

      const matched = await handleDealCard();
      if (matched || cancelled || phaseRef.current !== 'dealing') return;

      const rawDelay = generateBotDealDelayMs();
      const delay = botFastModeRef.current ? Math.floor(rawDelay * 0.45) : rawDelay;
      setTimeout(stepDeal, delay);
    };

    const startTimer = setTimeout(stepDeal, 260);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
    };
  }, [phase, isAutoDealing, handleDealCard]);

  // Continue anti-clockwise betting queue starting from Cutter
  const runBettingQueueFrom = useCallback(
    async (order: SeatId[], startIndex: number, token: number) => {
      for (let i = startIndex; i < order.length; i++) {
        if (roundTokenRef.current !== token) return;
        const seatId = order[i];
        setActiveActorSeat(seatId);

        if (seatId === humanSeatRef.current) {
          // Rule 1: If Human is the Cutter, they are locked to Bahar (Cutter's side) and only pick wager!
          const isYouCutter = seatId === cutterSeatRef.current;
          const mySeatObj = seatsRef.current.find((s) => s.id === seatId);
          const randomBet = generateRandomWager(mySeatObj?.balance ?? balanceRef.current);
          setCurrentBet(randomBet);
          currentBetRef.current = randomBet;

          setStatusText(
            isYouCutter
              ? `✂️ You are the Cutter (${cutterSeatRef.current}) — Main opponent of Under (${dealerSeatRef.current})! Place your Bahar bet:`
              : `🪙 Your turn (Seat ${seatId})! Bet RC on Andar (Under ${dealerSeatRef.current}) or Bahar (Cutter ${cutterSeatRef.current}):`
          );
          setIsBusy(false);
          isBusyRef.current = false;
          return;
        }

        // Bot places random bet automatically (Rule 1: Cutter Bot is ALWAYS locked to 'player' / Bahar!)
        const isCutter = seatId === cutterSeatRef.current;
        const seatObj = seatsRef.current.find((s) => s.id === seatId);
        const { betSide, betAmount } = generateBotBet(
          seatId,
          isCutter,
          seatObj?.balance ?? INITIAL_SEAT_COINS
        );
        const sideLabel =
          betSide === 'dealer'
            ? `Andar (Under ${dealerSeatRef.current})`
            : `Bahar (Cutter ${cutterSeatRef.current})`;

        setStatusText(
          isCutter
            ? `✂️ Cutter ${seatId} bets ${betAmount} RC on Bahar (Locked vs Under ${dealerSeatRef.current})...`
            : `🤖 Seat ${seatId} bets ${betAmount} RC on ${sideLabel}...`
        );
        soundEngine.playChipClick();

        const updated = seatsRef.current.map((s) =>
          s.id === seatId ? { ...s, betSide, betAmount } : s
        );
        setSeats(updated);
        seatsRef.current = updated;
        await sceneRef.current?.syncSeats3D(
          dealerSeatRef.current,
          cutterSeatRef.current,
          updated,
          false
        );

        await new Promise((r) =>
          setTimeout(r, botFastModeRef.current ? 140 : 280)
        );
      }

      if (roundTokenRef.current !== token) return;

      // All bets placed in anti-clockwise order -> Transition to Dealing!
      const dSeat = dealerSeatRef.current;
      const isBotDealer = dSeat !== humanSeatRef.current;
      setActiveActorSeat(dSeat);
      setStatusText(
        isBotDealer
          ? `🎲 All bets placed! Under (${dSeat}) is auto-dealing cards...`
          : `👑 All bets placed! Your turn as Under (${dSeat}) to deal cards.`
      );
      setIsBusy(false);
      isBusyRef.current = false;
      setPhase('dealing');
    },
    []
  );

  // Human places their bet during the anti-clockwise betting phase
  const handlePlaceHumanBet = useCallback(
    async (chosenSide: Side) => {
      if (phaseRef.current !== 'betting') return;
      const token = roundTokenRef.current;
      const mySeat = humanSeatRef.current;
      // Rule 1 enforcement: if Human is the Cutter, side is strictly 'player' (Bahar)
      const effectiveSide: Side = mySeat === cutterSeatRef.current ? 'player' : chosenSide;
      const wager = currentBetRef.current;

      soundEngine.playChipClick();
      const updated = seatsRef.current.map((s) =>
        s.id === mySeat ? { ...s, betSide: effectiveSide, betAmount: wager } : s
      );
      setSeats(updated);
      seatsRef.current = updated;
      await sceneRef.current?.syncSeats3D(
        dealerSeatRef.current,
        cutterSeatRef.current,
        updated,
        false
      );

      const order = getBettingOrder(dealerSeatRef.current, cutterSeatRef.current);
      const myIdx = order.indexOf(mySeat);
      await runBettingQueueFrom(order, myIdx + 1, token);
    },
    [runBettingQueueFrom]
  );

  // Execute the Deck Cut (either automatically by Bot Cutter or when Human Cutter clicks CUT DECK)
  const executeCutAndStartBetting = useCallback(
    async (chosenCutIndex: number, token: number) => {
      if (roundTokenRef.current !== token) return;
      setIsBusy(true);
      isBusyRef.current = true;

      const cSeat = cutterSeatRef.current;
      setCutIndex(chosenCutIndex);

      if (sceneRef.current) {
        sceneRef.current.previewCut(chosenCutIndex, 52);
        soundEngine.playCardFlick(1.15);
      }

      await new Promise((r) =>
        setTimeout(r, botFastModeRef.current ? 160 : 320)
      );
      if (roundTokenRef.current !== token) return;

      const split = splitDeck(mainDeckRef.current, chosenCutIndex);
      setFirstDeck(split.firstDeck);
      firstDeckRef.current = split.firstDeck;
      setSecondDeck(split.secondDeck);
      secondDeckRef.current = split.secondDeck;
      setPointCard(split.pointCard);
      pointCardRef.current = split.pointCard;

      setStatusText(
        `✂️ Cutter (${cSeat}) split deck at #${chosenCutIndex} → Hukam is ${split.pointCard.label}!`
      );

      if (sceneRef.current) {
        await sceneRef.current.animateSplitAndReveal(chosenCutIndex, split.pointCard);
      }
      if (roundTokenRef.current !== token) return;

      // After Cutter cuts, bets are placed starting from Cutter in anti-clockwise order!
      setPhase('betting');
      const order = getBettingOrder(dealerSeatRef.current, cutterSeatRef.current);
      await runBettingQueueFrom(order, 0, token);
    },
    [runBettingQueueFrom]
  );

  // Start a new round with active Dealer & Cutter while preserving constant 6,000 RC currency pool
  const startNewRound = useCallback(
    async (overrideDealer?: SeatId, overrideCutter?: SeatId, overrideHuman?: SeatId) => {
      const token = ++roundTokenRef.current;
      stopAutoDeal();
      sceneRef.current?.setRoundOverOrbit(false);

      setIsBusy(true);
      isBusyRef.current = true;

      const activeHuman = overrideHuman ?? humanSeatRef.current;
      const activeDealer = overrideDealer ?? dealerSeatRef.current;
      const activeCutter = overrideCutter ?? cutterSeatRef.current;

      setHumanSeat(activeHuman);
      humanSeatRef.current = activeHuman;
      setDealerSeat(activeDealer);
      dealerSeatRef.current = activeDealer;
      setCutterSeat(activeCutter);
      cutterSeatRef.current = activeCutter;
      setActiveActorSeat(activeDealer);

      // Preserve constant-sum balances across rounds!
      const nextSeats = prepareSeatsForNextRound(seatsRef.current, activeHuman);
      setSeats(nextSeats);
      seatsRef.current = nextSeats;

      const humanSeatObj = nextSeats.find((s) => s.id === activeHuman);
      const humanBal = humanSeatObj ? humanSeatObj.balance : INITIAL_SEAT_COINS;
      setBalance(humanBal);
      balanceRef.current = humanBal;

      const randomInitialWager = generateRandomWager(humanBal);
      setCurrentBet(randomInitialWager);
      currentBetRef.current = randomInitialWager;

      setWinner(null);
      setMatchingCard(null);
      setPlayerCards([]);
      setDealerCards([]);
      setTurnIndex(0);
      turnIndexRef.current = 0;
      setPointCard(null);
      pointCardRef.current = null;

      const deck = shuffleDeck(createStandardDeck());
      setMainDeck(deck);
      mainDeckRef.current = deck;
      setFirstDeck([]);
      setSecondDeck([]);
      setCutIndex(26);

      setPhase('shuffling');
      setStatusText(
        `👑 Under (${activeDealer}) is shuffling the deck → Cutter (${activeCutter}) cuts next...`
      );

      if (sceneRef.current) {
        await sceneRef.current.syncSeats3D(activeDealer, activeCutter, nextSeats, true);
        await sceneRef.current.resetRoundAnimation(true);
      }

      if (roundTokenRef.current !== token) return;

      // If Human is Dealer, wait for Human to click "SHUFFLE & PASS TO CUTTER"
      if (activeDealer === activeHuman) {
        setStatusText(
          `👑 You are Under / Shuffler (Seat ${activeDealer})! Tap Shuffle to pass deck to Cutter (${activeCutter}).`
        );
        setIsBusy(false);
        isBusyRef.current = false;
        return;
      }

      // Bot is Dealer -> Automatically transition to Cutter (`activeCutter`)
      setPhase('cutting');
      setActiveActorSeat(activeCutter);

      if (activeCutter === activeHuman) {
        // Human is Cutter -> Preview cut and let Human adjust slider & click "CUT DECK"
        sceneRef.current?.previewCut(26, 52);
        setStatusText(
          `✂️ Your turn to Cut (Seat ${activeCutter})! Slide to cut deck, then place your Bahar bet.`
        );
        setIsBusy(false);
        isBusyRef.current = false;
      } else {
        // Bot is Cutter -> Bot Cutter automatically cuts the deck first!
        setStatusText(
          `✂️ Bot Cutter (Seat ${activeCutter}) is cutting Under ${activeDealer}'s deck...`
        );
        const botCut = generateBotCutIndex();
        await executeCutAndStartBetting(botCut, token);
      }
    },
    [executeCutAndStartBetting, stopAutoDeal]
  );

  // Mount Three.js Scene once
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new CasinoScene(mountRef.current);
    sceneRef.current = scene;

    // Check for ?autostart=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startNewRound('A', 'B', 'D');
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [startNewRound]);

  // Allow user to switch which Seat (A-F) they occupy
  const handleSelectHumanSeat = useCallback(
    (newSeat: SeatId) => {
      if (newSeat === humanSeatRef.current) return;
      soundEngine.playChipClick();
      startNewRound(dealerSeatRef.current, cutterSeatRef.current, newSeat);
    },
    [startNewRound]
  );

  // When Human is Dealer and clicks "Shuffle & Pass to Cutter"
  const handlePlayerShuffle = useCallback(async () => {
    if (isBusyRef.current) return;
    const token = roundTokenRef.current;
    setIsBusy(true);
    isBusyRef.current = true;

    const reshuffled = shuffleDeck(mainDeckRef.current);
    setMainDeck(reshuffled);
    mainDeckRef.current = reshuffled;

    setStatusText(`👑 You shuffled the deck! Passing to Cutter (${cutterSeatRef.current})...`);
    if (sceneRef.current) {
      await sceneRef.current.animateRiffleShuffle();
    }
    if (roundTokenRef.current !== token) return;

    setPhase('cutting');
    setActiveActorSeat(cutterSeatRef.current);
    const botCut = generateBotCutIndex();
    await executeCutAndStartBetting(botCut, token);
  }, [executeCutAndStartBetting]);

  // Handle cut slider change when Human is Cutter
  const handleCutChange = useCallback((cut: number) => {
    setCutIndex(cut);
    sceneRef.current?.previewCut(cut, 52);
  }, []);

  // Confirm cut when Human is Cutter
  const handleConfirmCut = useCallback(async () => {
    if (isBusyRef.current || mainDeckRef.current.length === 0) return;
    const token = roundTokenRef.current;
    await executeCutAndStartBetting(cutIndex, token);
  }, [cutIndex, executeCutAndStartBetting]);

  // Toggle Auto Deal when Human is Dealer
  const handleToggleAutoDeal = useCallback(() => {
    setIsAutoDealing((prev) => {
      const next = !prev;
      isAutoDealingRef.current = next;
      return next;
    });
  }, []);

  // Randomize human wager button handler
  const handleRandomizeBet = useCallback(() => {
    const rnd = generateRandomWager(balanceRef.current);
    setCurrentBet(rnd);
    currentBetRef.current = rnd;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (phaseRef.current === 'title') {
          startNewRound('A', 'B', 'D');
        } else if (phaseRef.current === 'round_over') {
          startNewRound();
        }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (
          phaseRef.current === 'dealing' ||
          phaseRef.current === 'betting' ||
          phaseRef.current === 'cutting' ||
          phaseRef.current === 'shuffling'
        ) {
          stopAutoDeal();
          setPhase('paused');
        } else if (phaseRef.current === 'paused') {
          setPhase(pointCardRef.current ? 'dealing' : 'betting');
        }
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        const views: CameraView[] = ['felt', 'player', 'pedestal', 'cinematic'];
        const nextIndex = (views.indexOf(cameraView) + 1) % views.length;
        setCameraView(views[nextIndex]);
        sceneRef.current?.setCameraView(views[nextIndex]);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        const muted = soundEngine.toggleMute();
        setIsMuted(muted);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cameraView, startNewRound, stopAutoDeal]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      <OfflineIndicator />
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Title Screen Overlay */}
      {phase === 'title' && <TitleScreen onStart={() => startNewRound('A', 'B', 'D')} />}

      {/* In-Game HUD with Anti-Clockwise 6-Player Ring (A -> B -> C -> D -> E -> F) */}
      {phase !== 'title' && (
        <HUD
          balance={balance}
          currentBet={currentBet}
          stats={stats}
          pointCard={pointCard}
          dealerSeat={dealerSeat}
          cutterSeat={cutterSeat}
          humanSeat={humanSeat}
          activeActorSeat={activeActorSeat}
          seats={seats}
          onSelectHumanSeat={handleSelectHumanSeat}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(soundEngine.toggleMute())}
          onPause={() => {
            stopAutoDeal();
            setPhase('paused');
          }}
          announcement={statusText}
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

      {/* Pause Modal */}
      {phase === 'paused' && (
        <PauseModal
          onResume={() => setPhase(pointCard ? 'dealing' : 'betting')}
          onRestart={() => startNewRound()}
          onTitle={() => setPhase('title')}
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
    </div>
  );
}
