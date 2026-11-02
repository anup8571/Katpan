import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CasinoScene } from './3d/CasinoScene';
import { Card, CameraView, GamePhase, GameStats, Side } from './game/types';
import {
  createStandardDeck,
  shuffleDeck,
  splitDeck,
  isWinningCard,
  getReceivingSide,
  computePayout,
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

  // Deck & Card states
  const [mainDeck, setMainDeck] = useState<Card[]>([]);
  const [firstDeck, setFirstDeck] = useState<Card[]>([]);
  const [secondDeck, setSecondDeck] = useState<Card[]>([]);
  const [pointCard, setPointCard] = useState<Card | null>(null);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);

  // Betting & Split controls
  const [balance, setBalance] = useState(1000);
  const [currentBet, setCurrentBet] = useState(100);
  const [cutIndex, setCutIndex] = useState(26);
  const [announcement, setAnnouncement] = useState('Dealer shuffled the royal deck! Place your bet & split the deck.');

  // Auto Deal states
  const [isAutoDealing, setIsAutoDealing] = useState(false);
  const [dealSpeed, setDealSpeed] = useState<'1x' | '2x' | 'instant'>('1x');
  const [isBusy, setIsBusy] = useState(false);

  // Winner outcome
  const [winner, setWinner] = useState<Side | null>(null);
  const [matchingCard, setMatchingCard] = useState<Card | null>(null);

  // Stats
  const [stats, setStats] = useState<GameStats>({
    totalRounds: 0,
    playerWins: 0,
    dealerWins: 0,
    highestBalance: 1000,
    totalWagered: 0,
    currentStreak: 0,
    bestStreak: 0,
  });

  // Mutable refs to prevent stale closures in async loops & key listeners
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  const isAutoDealingRef = useRef(isAutoDealing);
  isAutoDealingRef.current = isAutoDealing;

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

  const dealSpeedRef = useRef(dealSpeed);
  dealSpeedRef.current = dealSpeed;

  // Sync document.body.dataset.state for Ultra Mode verification
  useEffect(() => {
    if (phase === 'title') document.body.dataset.state = 'title';
    else if (phase === 'paused') document.body.dataset.state = 'paused';
    else if (phase === 'round_over') document.body.dataset.state = 'gameover';
    else document.body.dataset.state = 'playing';
  }, [phase]);

  // Mount Three.js Scene once
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new CasinoScene(mountRef.current);
    sceneRef.current = scene;

    // Check for ?autostart=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startNewRound();
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Stop auto-deal helper
  const stopAutoDeal = useCallback(() => {
    setIsAutoDealing(false);
    isAutoDealingRef.current = false;
  }, []);

  // Initialize a new round
  const startNewRound = useCallback(async () => {
    stopAutoDeal();
    setIsBusy(true);
    isBusyRef.current = true;

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
    setFirstDeck([]);
    setSecondDeck([]);
    setCutIndex(26);

    setAnnouncement('🔀 Dealer is riffle-shuffling the deck on the royal felt...');
    setPhase('betting');

    if (sceneRef.current) {
      sceneRef.current.setCameraView('felt');
      setCameraView('felt');
      await sceneRef.current.resetRoundAnimation();
      sceneRef.current.previewCut(26, 52);
    }

    setAnnouncement('Dealer shuffled! Select your bet & cut position, then split the deck.');
    setIsBusy(false);
    isBusyRef.current = false;
  }, [stopAutoDeal]);

  // Handle cut slider change
  const handleCutChange = useCallback((cut: number) => {
    setCutIndex(cut);
    if (sceneRef.current) {
      sceneRef.current.previewCut(cut, 52);
    }
  }, []);

  // Handle random cut
  const handleRandomCut = useCallback(() => {
    if (isBusyRef.current) return;
    const randomK = Math.floor(Math.random() * (42 - 10 + 1)) + 10;
    handleCutChange(randomK);
    soundEngine.playCardFlick(1.2);
  }, [handleCutChange]);

  // Confirm cut and reveal point card
  const handleConfirmCut = useCallback(async () => {
    if (isBusyRef.current || mainDeck.length === 0) return;
    setIsBusy(true);
    isBusyRef.current = true;

    const split = splitDeck(mainDeck, cutIndex);
    setFirstDeck(split.firstDeck);
    firstDeckRef.current = split.firstDeck;
    setSecondDeck(split.secondDeck);
    secondDeckRef.current = split.secondDeck;
    setPointCard(split.pointCard);
    pointCardRef.current = split.pointCard;

    setAnnouncement('✂️ Splitting deck & extracting bottom card onto Point Card pedestal...');

    if (sceneRef.current) {
      await sceneRef.current.animateSplitAndReveal(cutIndex, split.pointCard);
    }

    setAnnouncement(
      `Target Rank: <b class="text-amber-300">${split.pointCard.rank}</b> (${split.pointCard.label}) — Dealing to Andar (Player) first!`
    );
    setPhase('dealing');
    setIsBusy(false);
    isBusyRef.current = false;
  }, [mainDeck, cutIndex]);

  // Deal next card
  const handleDealCard = useCallback(async (): Promise<boolean> => {
    if (isBusyRef.current || !pointCardRef.current) return false;
    setIsBusy(true);
    isBusyRef.current = true;

    let drawnCard: Card | null = null;
    let fromShoe: 1 | 2 = 1;
    let sourceLabel = '1st Deck';

    const currentFirst = [...firstDeckRef.current];
    const currentSecond = [...secondDeckRef.current];

    if (currentFirst.length > 0) {
      drawnCard = currentFirst.shift()!;
      fromShoe = 1;
      setFirstDeck(currentFirst);
      firstDeckRef.current = currentFirst;
      if (sceneRef.current) {
        sceneRef.current.renderDeckStacks(currentFirst.length, currentSecond.length);
      }
    } else if (currentSecond.length > 0) {
      drawnCard = currentSecond.shift()!;
      fromShoe = 2;
      sourceLabel = '2nd Deck';
      setSecondDeck(currentSecond);
      secondDeckRef.current = currentSecond;
      if (sceneRef.current) {
        sceneRef.current.renderDeckStacks(0, currentSecond.length);
      }
    } else {
      setIsBusy(false);
      isBusyRef.current = false;
      return false;
    }

    const currentTurn = turnIndexRef.current;
    const toSide = getReceivingSide(currentTurn);
    const isMatch = isWinningCard(drawnCard, pointCardRef.current);

    setTurnIndex(currentTurn + 1);
    turnIndexRef.current = currentTurn + 1;

    // 3D deal flight
    if (sceneRef.current) {
      const cardCountOnMat = toSide === 'player' ? playerCards.length + 1 : dealerCards.length + 1;
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

      const won = toSide === 'player';
      const newBalance = computePayout(balanceRef.current, currentBetRef.current, won);
      setBalance(newBalance);
      balanceRef.current = newBalance;

      setStats((prev) => {
        const streak = won ? prev.currentStreak + 1 : 0;
        return {
          totalRounds: prev.totalRounds + 1,
          playerWins: prev.playerWins + (won ? 1 : 0),
          dealerWins: prev.dealerWins + (won ? 0 : 1),
          highestBalance: Math.max(prev.highestBalance, newBalance),
          totalWagered: prev.totalWagered + currentBetRef.current,
          currentStreak: streak,
          bestStreak: Math.max(prev.bestStreak, streak),
        };
      });

      setAnnouncement(
        won
          ? `🎉 <b class="text-emerald-400">PLAYER WINS +₹${currentBetRef.current}!</b> Matching <b>${drawnCard.label}</b> landed on Andar!`
          : `🎩 <b class="text-rose-400">DEALER WINS -₹${currentBetRef.current}!</b> Matching <b>${drawnCard.label}</b> landed on Bahar!`
      );

      setTimeout(() => {
        setPhase('round_over');
        setIsBusy(false);
        isBusyRef.current = false;
      }, 700);

      return true; // Match found
    } else {
      const nextTurnSide = getReceivingSide(currentTurn + 1) === 'player' ? 'Andar (Player)' : 'Bahar (Dealer)';
      setAnnouncement(
        `Dealt <b class="text-amber-200">${drawnCard.label}</b> from ${sourceLabel} → Next: <b>${nextTurnSide}</b> (Target: <b class="text-amber-400">${pointCardRef.current.rank}</b>)`
      );
      setIsBusy(false);
      isBusyRef.current = false;
      return false;
    }
  }, [playerCards.length, dealerCards.length, stopAutoDeal]);

  // Auto Deal Loop
  const handleToggleAutoDeal = useCallback(async () => {
    if (isAutoDealingRef.current) {
      stopAutoDeal();
      return;
    }

    setIsAutoDealing(true);
    isAutoDealingRef.current = true;

    const delayMs = dealSpeedRef.current === 'instant' ? 60 : dealSpeedRef.current === '2x' ? 160 : 360;

    const runStep = async () => {
      if (!isAutoDealingRef.current || phaseRef.current !== 'dealing' || !pointCardRef.current) {
        stopAutoDeal();
        return;
      }

      const matchFound = await handleDealCard();
      if (matchFound) {
        stopAutoDeal();
        return;
      }

      if (isAutoDealingRef.current && phaseRef.current === 'dealing') {
        setTimeout(runStep, delayMs);
      }
    };

    runStep();
  }, [handleDealCard, stopAutoDeal]);

  // Camera preset switcher
  const handleCameraChange = useCallback((view: CameraView) => {
    setCameraView(view);
    if (sceneRef.current) {
      sceneRef.current.setCameraView(view);
    }
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (phaseRef.current === 'title') {
          startNewRound();
        } else if (phaseRef.current === 'dealing' && !isBusyRef.current && !isAutoDealingRef.current) {
          handleDealCard();
        } else if (phaseRef.current === 'round_over') {
          startNewRound();
        }
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (phaseRef.current === 'dealing' || phaseRef.current === 'betting') {
          stopAutoDeal();
          setPhase('paused');
        } else if (phaseRef.current === 'paused') {
          setPhase(pointCardRef.current ? 'dealing' : 'betting');
        }
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        const views: CameraView[] = ['felt', 'player', 'pedestal', 'cinematic'];
        const nextIndex = (views.indexOf(cameraView) + 1) % views.length;
        handleCameraChange(views[nextIndex]);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        const muted = soundEngine.toggleMute();
        setIsMuted(muted);
      } else if (e.code === 'Digit1') {
        setCurrentBet(50);
        soundEngine.playChipClick();
      } else if (e.code === 'Digit2') {
        setCurrentBet(100);
        soundEngine.playChipClick();
      } else if (e.code === 'Digit3') {
        setCurrentBet(250);
        soundEngine.playChipClick();
      } else if (e.code === 'Digit4') {
        setCurrentBet(500);
        soundEngine.playChipClick();
      } else if (e.code === 'Digit5') {
        setCurrentBet(1000);
        soundEngine.playChipClick();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cameraView, handleCameraChange, handleDealCard, startNewRound, stopAutoDeal]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      <OfflineIndicator />
      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Title Screen Overlay */}
      {phase === 'title' && <TitleScreen onStart={startNewRound} />}

      {/* In-Game HUD */}
      {phase !== 'title' && (
        <HUD
          balance={balance}
          currentBet={currentBet}
          stats={stats}
          pointCard={pointCard}
          playerCards={playerCards}
          dealerCards={dealerCards}
          turnIndex={turnIndex}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(soundEngine.toggleMute())}
          onPause={() => {
            stopAutoDeal();
            setPhase('paused');
          }}
          announcement={announcement}
        />
      )}

      {/* In-Game Collapsible Control Dock */}
      {phase !== 'title' && phase !== 'paused' && phase !== 'round_over' && (
        <ControlDock
          phase={phase}
          currentBet={currentBet}
          onSelectBet={setCurrentBet}
          cutIndex={cutIndex}
          onChangeCutIndex={handleCutChange}
          onRandomCut={handleRandomCut}
          onConfirmCut={handleConfirmCut}
          onDealOne={handleDealCard}
          onAutoDeal={handleToggleAutoDeal}
          isAutoDealing={isAutoDealing}
          dealSpeed={dealSpeed}
          onChangeDealSpeed={setDealSpeed}
          cameraView={cameraView}
          onChangeCameraView={handleCameraChange}
          isBusy={isBusy}
        />
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <PauseModal
          onResume={() => setPhase(pointCard ? 'dealing' : 'betting')}
          onRestart={startNewRound}
          onTitle={() => setPhase('title')}
        />
      )}

      {/* Round Over Modal */}
      {phase === 'round_over' && winner && matchingCard && pointCard && (
        <RoundOverModal
          winner={winner}
          matchingCard={matchingCard}
          pointCard={pointCard}
          betAmount={currentBet}
          totalCardsDealt={playerCards.length + dealerCards.length}
          stats={stats}
          onNextRound={startNewRound}
        />
      )}
    </div>
  );
}
