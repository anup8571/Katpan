import {
  Card,
  INITIAL_SEAT_COINS,
  Participant,
  Rank,
  SEAT_ORDER,
  SeatId,
  SeatInfo,
  Side,
  SplitResult,
  Suit,
} from './types';

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const RANKS: Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
];

export const CHIP_VALUES = [50, 100, 250, 500] as const;

export const DEFAULT_SEAT_NAMES: Record<SeatId, { name: string; shortName: string }> = {
  A: { name: 'Vikram', shortName: 'Vikram' },
  B: { name: 'Kabir', shortName: 'Kabir' },
  C: { name: 'Aryan', shortName: 'Aryan' },
  D: { name: 'You', shortName: 'You' },
  E: { name: 'Meera', shortName: 'Meera' },
  F: { name: 'Rohan', shortName: 'Rohan' },
};

/**
 * Generates the initial 6 seats (A, B, C, D, E, F) around the table in anti-clockwise order.
 * Uses authentic Indian card game names for bots and the authenticated user name for human.
 * Each seat starts with INITIAL_SEAT_COINS (1,000 RC) -> Total Table Pool = 6,000 RC constant.
 */
export function createInitialSeats(humanSeat: SeatId = 'D', humanName?: string): SeatInfo[] {
  return SEAT_ORDER.map((id) => {
    const isHuman = id === humanSeat;
    const displayName = isHuman ? (humanName?.trim() || 'You') : DEFAULT_SEAT_NAMES[id].name;
    const shortName = isHuman ? (humanName?.trim() || 'You') : DEFAULT_SEAT_NAMES[id].shortName;
    return {
      id,
      name: displayName,
      shortName,
      isHuman,
      balance: INITIAL_SEAT_COINS,
      betAmount: 0,
      betSide: null,
      betStatus: 'pending',
    };
  });
}

/**
 * Resets bet amounts/sides for a new round while preserving every seat's exact balance.
 * If any seat dropped below 50 RC, transfers a 150 RC stake from the richest seat so the
 * total currency across all 6 seats remains strictly constant (6,000 RC).
 */
export function prepareSeatsForNextRound(
  currentSeats: readonly SeatInfo[],
  humanSeat: SeatId,
  humanName?: string
): SeatInfo[] {
  const balances: Record<SeatId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (const s of currentSeats) {
    balances[s.id] = s.balance;
  }

  for (const id of SEAT_ORDER) {
    if (balances[id] < 50) {
      // Find richest seat to transfer 150 RC from so total currency stays 100% constant
      let richest: SeatId = 'A';
      for (const candidate of SEAT_ORDER) {
        if (balances[candidate] > balances[richest]) {
          richest = candidate;
        }
      }
      const transfer = Math.min(150, Math.max(0, balances[richest] - 200));
      balances[richest] -= transfer;
      balances[id] += transfer;
    }
  }

  return SEAT_ORDER.map((id) => {
    const isHuman = id === humanSeat;
    const prevSeat = currentSeats.find((s) => s.id === id);
    const displayName = isHuman ? (humanName?.trim() || prevSeat?.name || 'You') : DEFAULT_SEAT_NAMES[id].name;
    const shortName = isHuman ? (humanName?.trim() || prevSeat?.shortName || 'You') : DEFAULT_SEAT_NAMES[id].shortName;
    return {
      id,
      name: displayName,
      shortName,
      isHuman,
      balance: balances[id],
      betAmount: 0,
      betSide: null,
      betStatus: 'pending',
    };
  });
}

/**
 * Picks a random chip bet amount (50, 100, 250, 500 RC) bounded by the seat's available balance.
 */
export function generateRandomWager(
  availableBalance: number,
  rng: () => number = Math.random
): number {
  if (availableBalance <= 0) return 0;
  const affordable = CHIP_VALUES.filter((v) => v <= availableBalance);
  if (affordable.length === 0) return availableBalance;
  return affordable[Math.floor(rng() * affordable.length)];
}

/**
 * Rule 1 & Rule 2:
 * - If `isCutter === true`, the Cutter is ALWAYS locked to `'player'` (Bahar / Cutter's Side)
 *   because the Cutter is the main opponent of the Under (Shuffler/Dealer).
 * - Other players randomly choose between `'dealer'` (Under/Andar) and `'player'` (Bahar/Cutter).
 * - Every bot bets a random amount from their available balance.
 */
export function generateBotBet(
  seatId: SeatId,
  isCutter: boolean,
  availableBalance: number = INITIAL_SEAT_COINS,
  rng: () => number = Math.random
): { betSide: Side; betAmount: number } {
  void seatId;
  const betAmount = generateRandomWager(availableBalance, rng);

  if (isCutter) {
    // Rule 1: Cutter is ALWAYS Bahar ('player') — never Andar!
    return { betSide: 'player', betAmount };
  }

  const betSide: Side = rng() < 0.5 ? 'player' : 'dealer';
  return { betSide, betAmount };
}

/**
 * Rule 2: Zero-Sum / Constant-Currency Settlement across all 6 players (A..F).
 * - The Dealer (`dealerSeat`) banks the hand against all bettors.
 * - Bettors whose `betSide !== winningSide` lose their wager to the Dealer.
 * - Bettors whose `betSide === winningSide` win their wager from the Dealer (capped proportionally
 *   by the Dealer's available stack so no balance ever goes negative and the sum of all 6 balances
 *   remains strictly constant!).
 */
export function settleConstantCurrencyRound(
  seats: readonly SeatInfo[],
  dealerSeat: SeatId,
  winningSide: Side
): {
  updatedSeats: SeatInfo[];
  deltas: Record<SeatId, number>;
  totalPool: number;
} {
  const balances: Record<SeatId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  const initialBalances: Record<SeatId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

  for (const s of seats) {
    balances[s.id] = s.balance;
    initialBalances[s.id] = s.balance;
  }

  // Step 1: Collect losing bets into the Dealer's balance
  const winners: Array<{ id: SeatId; claim: number }> = [];
  for (const s of seats) {
    if (s.id === dealerSeat || !s.betSide || s.betAmount <= 0) continue;
    const wager = Math.min(s.betAmount, balances[s.id]);
    if (s.betSide !== winningSide) {
      balances[s.id] -= wager;
      balances[dealerSeat] += wager;
    } else {
      winners.push({ id: s.id, claim: wager });
    }
  }

  // Step 2: Dealer pays out winning bets (conserving total coins 100%)
  const totalClaims = winners.reduce((acc, w) => acc + w.claim, 0);
  if (totalClaims > 0 && balances[dealerSeat] > 0) {
    if (balances[dealerSeat] >= totalClaims) {
      for (const w of winners) {
        balances[dealerSeat] -= w.claim;
        balances[w.id] += w.claim;
      }
    } else {
      // Proportional payout of Dealer's entire remaining balance so sum stays exact
      const available = balances[dealerSeat];
      let distributed = 0;
      for (let i = 0; i < winners.length; i++) {
        const w = winners[i];
        const share =
          i === winners.length - 1
            ? available - distributed
            : Math.floor((available * w.claim) / totalClaims);
        balances[w.id] += share;
        distributed += share;
      }
      balances[dealerSeat] = 0;
    }
  }

  const deltas: Record<SeatId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  let totalPool = 0;
  for (const id of SEAT_ORDER) {
    deltas[id] = balances[id] - initialBalances[id];
    totalPool += balances[id];
  }

  const updatedSeats = seats.map((s) => ({
    ...s,
    balance: balances[s.id],
  }));

  return { updatedSeats, deltas, totalPool };
}

/**
 * Returns the next seat in anti-clockwise order (A -> B -> C -> D -> E -> F -> A).
 * If `skipSeat` is provided and the next seat equals `skipSeat`, advances one more step
 * so the Dealer never becomes their own Cutter.
 */
export function getNextAntiClockwiseSeat(current: SeatId, skipSeat?: SeatId): SeatId {
  const idx = SEAT_ORDER.indexOf(current);
  let nextIdx = (idx + 1) % SEAT_ORDER.length;
  if (skipSeat && SEAT_ORDER[nextIdx] === skipSeat) {
    nextIdx = (nextIdx + 1) % SEAT_ORDER.length;
  }
  return SEAT_ORDER[nextIdx];
}

/**
 * Rule 2: Anti-Clockwise Dealer & Cutter Rotation across players A, B, C, D, E, F:
 * - Suppose A is Dealer and B is Cutter:
 *   - If Cutter (B) wins (`winningSide === 'player'` / Bahar Cutter side):
 *     B becomes the new Dealer, and C becomes the new Cutter!
 *   - If Cutter (B) loses (`winningSide === 'dealer'` / Andar Dealer side):
 *     A remains as the Dealer, and C becomes the new Cutter!
 */
export function resolveNextDealerAndCutter(
  currentDealer: SeatId,
  currentCutter: SeatId,
  winningSide: Side
): { nextDealer: SeatId; nextCutter: SeatId } {
  const cutterWon = winningSide === 'player';
  const nextDealer: SeatId = cutterWon ? currentCutter : currentDealer;
  const nextCutter: SeatId = getNextAntiClockwiseSeat(currentCutter, nextDealer);
  return { nextDealer, nextCutter };
}

/**
 * Rule 3: Step-by-Step Betting Order:
 * Step 1: Cutter cuts
 * Step 2: Cutter bets first (locked to Blue / Bahar)
 * Step 3: Shuffler bets second (locked to Red / Andar)
 * Step 4: Other players bet on whichever side (Red or Blue) or choose to Skip
 */
export function getStepByStepBettingOrder(dealerSeat: SeatId, cutterSeat: SeatId): SeatId[] {
  const order: SeatId[] = [cutterSeat, dealerSeat];
  let cursor = getNextAntiClockwiseSeat(cutterSeat);
  for (let i = 0; i < SEAT_ORDER.length; i++) {
    if (cursor !== cutterSeat && cursor !== dealerSeat) {
      order.push(cursor);
    }
    cursor = getNextAntiClockwiseSeat(cursor);
  }
  return order;
}

export function getBettingOrder(dealerSeat: SeatId, cutterSeat: SeatId): SeatId[] {
  return getStepByStepBettingOrder(dealerSeat, cutterSeat);
}

export interface PoolTotals {
  redTotal: number;
  blueTotal: number;
  difference: number;
  isBalanced: boolean;
}

/**
 * Calculates total wagers on Red (Shuffler/Dealer) vs Blue (Cutter/Player).
 * Players who skipped or have 0 bet are excluded.
 */
export function calculatePoolTotals(seats: readonly SeatInfo[]): PoolTotals {
  let redTotal = 0;
  let blueTotal = 0;
  if (!Array.isArray(seats)) {
    return { redTotal: 0, blueTotal: 0, difference: 0, isBalanced: false };
  }
  for (const s of seats) {
    if (s && typeof s.betAmount === 'number' && s.betAmount > 0 && s.betSide && s.betStatus !== 'skipped') {
      if (s.betSide === 'dealer') {
        redTotal += s.betAmount;
      } else if (s.betSide === 'player') {
        blueTotal += s.betAmount;
      }
    }
  }
  const difference = Math.abs(redTotal - blueTotal);
  const isBalanced = redTotal > 0 && redTotal === blueTotal;
  return { redTotal, blueTotal, difference, isBalanced };
}

export function isPoolBalanced(seats: readonly SeatInfo[]): boolean {
  return calculatePoolTotals(seats).isBalanced;
}

/**
 * Balances the pool across bot seats so redTotal === blueTotal,
 * allowing the card deal to commence.
 */
export function balancePools(seats: readonly SeatInfo[]): SeatInfo[] {
  const totals = calculatePoolTotals(seats);
  if (totals.isBalanced) return [...seats];

  const diff = totals.redTotal - totals.blueTotal;
  if (diff === 0 && totals.redTotal > 0) return [...seats];

  const result = seats.map((s) => ({ ...s }));

  if (diff > 0) {
    // Red > Blue: need Blue to increase by diff
    const blueBot = result.find((s) => !s.isHuman && s.betSide === 'player');
    if (blueBot && blueBot.balance >= blueBot.betAmount + diff) {
      blueBot.betAmount += diff;
      blueBot.betStatus = 'placed';
      return result;
    }
    const skippedBot = result.find(
      (s) => !s.isHuman && (s.betStatus === 'skipped' || s.betAmount === 0 || !s.betSide)
    );
    if (skippedBot && skippedBot.balance >= diff) {
      skippedBot.betSide = 'player';
      skippedBot.betAmount = diff;
      skippedBot.betStatus = 'placed';
      return result;
    }
    const redBot = result.find(
      (s) => !s.isHuman && s.betSide === 'dealer' && s.betAmount > diff
    );
    if (redBot) {
      redBot.betAmount -= diff;
      return result;
    }
  } else if (diff < 0) {
    // Blue > Red: need Red to increase by |diff|
    const absDiff = Math.abs(diff);
    const redBot = result.find((s) => !s.isHuman && s.betSide === 'dealer');
    if (redBot && redBot.balance >= redBot.betAmount + absDiff) {
      redBot.betAmount += absDiff;
      redBot.betStatus = 'placed';
      return result;
    }
    const skippedBot = result.find(
      (s) => !s.isHuman && (s.betStatus === 'skipped' || s.betAmount === 0 || !s.betSide)
    );
    if (skippedBot && skippedBot.balance >= absDiff) {
      skippedBot.betSide = 'dealer';
      skippedBot.betAmount = absDiff;
      skippedBot.betStatus = 'placed';
      return result;
    }
    const blueBot = result.find(
      (s) => !s.isHuman && s.betSide === 'player' && s.betAmount > absDiff
    );
    if (blueBot) {
      blueBot.betAmount -= absDiff;
      return result;
    }
  } else if (totals.redTotal === 0 && totals.blueTotal === 0) {
    // Both zero, give initial default bets
    const dealerSeat = result.find((s) => s.id === 'A') || result[0];
    const cutterSeat = result.find((s) => s.id === 'B') || result[1];
    dealerSeat.betSide = 'dealer';
    dealerSeat.betAmount = 100;
    dealerSeat.betStatus = 'placed';
    cutterSeat.betSide = 'player';
    cutterSeat.betAmount = 100;
    cutterSeat.betStatus = 'placed';
  }

  return result;
}

/**
 * Balanced Round Settlement:
 * Because Red Total === Blue Total, winners win 1:1 against the opposite side.
 * Skipped players lose nothing and gain nothing (delta = 0).
 * Table pool sum remains 100% constant (6,000 RC).
 */
export function settleBalancedRound(
  seats: readonly SeatInfo[],
  winningSide: Side
): {
  updatedSeats: SeatInfo[];
  deltas: Record<SeatId, number>;
  totalPool: number;
} {
  const deltas: Record<SeatId, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  const updatedSeats = seats.map((s) => {
    if (!s.betSide || s.betAmount <= 0 || s.betStatus === 'skipped') {
      deltas[s.id] = 0;
      return { ...s };
    }
    const won = s.betSide === winningSide;
    const delta = won ? s.betAmount : -s.betAmount;
    deltas[s.id] = delta;
    return {
      ...s,
      balance: Math.max(0, s.balance + delta),
    };
  });

  const totalPool = updatedSeats.reduce((acc, s) => acc + s.balance, 0);
  return { updatedSeats, deltas, totalPool };
}

/**
 * Rule 4: Bots auto-deal at their own natural pace ("as they like"), between 250ms and 430ms.
 */
export function generateBotDealDelayMs(rng: () => number = Math.random): number {
  return Math.floor(250 + rng() * 180);
}

/**
 * Generates a fresh 52-card standard deck.
 */
export function createStandardDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    const sym = SUIT_SYMBOLS[suit];
    for (const rank of RANKS) {
      const isRed = suit === 'hearts' || suit === 'diamonds';
      cards.push({
        id: `${rank}_${suit}`,
        suit,
        rank,
        isRed,
        label: `${rank}${sym}`,
      });
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle returning a new array.
 * Accepts an optional random generator function for deterministic testing.
 */
export function shuffleDeck(
  deck: readonly Card[],
  rng: () => number = Math.random
): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * Splits a 52-card deck at `cutIndex` (clamped between 8 and deck.length - 8).
 * Extracts the bottom card of the 2nd deck (`secondHalf.pop()`) as the target Point Card (Hukam).
 */
export function splitDeck(deck: readonly Card[], cutIndex: number): SplitResult {
  const activeDeck =
    Array.isArray(deck) && deck.length >= 3 ? [...deck] : shuffleDeck(createStandardDeck());
  const numCut = typeof cutIndex === 'number' && !isNaN(cutIndex) ? cutIndex : Number(cutIndex) || 26;
  const safeCut = Math.max(1, Math.min(activeDeck.length - 2, Math.floor(numCut)));
  const firstDeck = activeDeck.slice(0, safeCut);
  const secondDeck = activeDeck.slice(safeCut);
  const pointCard =
    secondDeck.pop() ||
    activeDeck[0] || {
      id: 'A_spades',
      suit: 'spades',
      rank: 'A',
      isRed: false,
      label: 'A♠',
    };

  return {
    firstDeck,
    secondDeck,
    pointCard,
  };
}

/**
 * Checks whether a dealt card matches the target Point Card rank.
 */
export function isWinningCard(dealtCard: Card, pointCard: Card): boolean {
  return dealtCard.rank === pointCard.rank;
}

/**
 * Determines which table zone receives the card for a 0-indexed turn count.
 * Turn 0 (1st card), 2 (3rd card), 4... -> 'player' (Bahar / Cutter's Side mat)
 * Turn 1 (2nd card), 3 (4th card), 5... -> 'dealer' (Andar / Under Shuffler's Side mat)
 */
export function getReceivingSide(turnIndex: number): Side {
  return turnIndex % 2 === 0 ? 'player' : 'dealer';
}

export function getNextDealer(winningParticipant: Participant): Participant {
  return winningParticipant;
}

export function getCutterForDealer(currentDealer: Participant): Participant {
  return currentDealer === 'player' ? 'bot' : 'player';
}

/**
 * Generates a realistic bot cut index between 12 and 40 for a 52-card deck.
 */
export function generateBotCutIndex(rng: () => number = Math.random): number {
  return Math.floor(rng() * (40 - 12 + 1)) + 12;
}

export function resolveRoundWinner(
  winningMat: Side,
  currentDealer: Participant
): Participant {
  if (currentDealer === 'bot') {
    return winningMat === 'player' ? 'player' : 'bot';
  } else {
    return winningMat === 'dealer' ? 'player' : 'bot';
  }
}

/**
 * Calculates updated balance after a round finishes.
 */
export function computePayout(
  currentBalance: number,
  betAmount: number,
  playerWon: boolean
): number {
  if (playerWon) {
    return currentBalance + betAmount;
  }
  return Math.max(0, currentBalance - betAmount);
}
