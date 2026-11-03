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
  A: { name: 'Bot Nawab', shortName: 'Nawab' },
  B: { name: 'Bot Kabir', shortName: 'Kabir' },
  C: { name: 'Bot Aryan', shortName: 'Aryan' },
  D: { name: 'You', shortName: 'You' },
  E: { name: 'Bot Zoya', shortName: 'Zoya' },
  F: { name: 'Bot Rehan', shortName: 'Rehan' },
};

/**
 * Generates the initial 6 seats (A, B, C, D, E, F) around the table in anti-clockwise order.
 * Each seat starts with INITIAL_SEAT_COINS (1,000 RC) -> Total Table Pool = 6,000 RC constant.
 */
export function createInitialSeats(humanSeat: SeatId = 'D'): SeatInfo[] {
  return SEAT_ORDER.map((id) => {
    const isHuman = id === humanSeat;
    return {
      id,
      name: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].name,
      shortName: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].shortName,
      isHuman,
      balance: INITIAL_SEAT_COINS,
      betAmount: 0,
      betSide: null,
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
  humanSeat: SeatId
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
    return {
      id,
      name: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].name,
      shortName: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].shortName,
      isHuman,
      balance: balances[id],
      betAmount: 0,
      betSide: null,
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
 * Rule 3: After the Cutter cuts the deck, bets are placed in anti-clockwise order
 * starting from the Cutter, across all non-dealer players.
 */
export function getBettingOrder(dealerSeat: SeatId, cutterSeat: SeatId): SeatId[] {
  const order: SeatId[] = [];
  let cursor: SeatId = cutterSeat;
  for (let i = 0; i < SEAT_ORDER.length; i++) {
    if (cursor !== dealerSeat) {
      order.push(cursor);
    }
    cursor = getNextAntiClockwiseSeat(cursor);
  }
  return order;
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
  if (deck.length < 3) {
    throw new Error('Deck must have at least 3 cards to split and reveal a point card.');
  }
  const safeCut = Math.max(1, Math.min(deck.length - 2, Math.floor(cutIndex)));
  const firstDeck = deck.slice(0, safeCut);
  const secondDeck = deck.slice(safeCut);
  const pointCard = secondDeck.pop()!;

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
