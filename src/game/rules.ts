import { Card, Participant, Rank, SEAT_ORDER, SeatId, SeatInfo, Side, SplitResult, Suit } from './types';

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
 * By default, Seat D (South Center VIP) is the human user and the other 5 seats are Bots.
 */
export function createInitialSeats(humanSeat: SeatId = 'D'): SeatInfo[] {
  return SEAT_ORDER.map((id) => {
    const isHuman = id === humanSeat;
    return {
      id,
      name: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].name,
      shortName: isHuman ? 'You' : DEFAULT_SEAT_NAMES[id].shortName,
      isHuman,
      betAmount: 0,
      betSide: null,
    };
  });
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
 * Generates an automatic bot wager and side choice ('dealer' = Andar/Dealer side, 'player' = Bahar/Cutter side).
 * The Cutter tends to favor Cutter's side (Bahar), while other bots freely bet on either
 * Under/Dealer's side or Bahar/Cutter's side.
 */
export function generateBotBet(
  seatId: SeatId,
  isCutter: boolean,
  rng: () => number = Math.random
): { betSide: Side; betAmount: number } {
  const denoms = [50, 100, 250, 500];
  const betAmount = denoms[Math.floor(rng() * denoms.length)];
  void seatId;

  if (isCutter) {
    // Cutter backs Cutter's side (Bahar) 80% of the time, or Under/Dealer's side 20%
    const betSide: Side = rng() < 0.8 ? 'player' : 'dealer';
    return { betSide, betAmount };
  }

  const betSide: Side = rng() < 0.5 ? 'player' : 'dealer';
  return { betSide, betAmount };
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
  const deck: Card[] = [];
  for (const suit of SUITS) {
    const sym = SUIT_SYMBOLS[suit];
    for (const rank of RANKS) {
      const isRed = suit === 'hearts' || suit === 'diamonds';
      deck.push({
        id: `${rank}_${suit}`,
        suit,
        rank,
        isRed,
        label: `${rank}${sym}`,
      });
    }
  }
  return deck;
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
 * Turn 1 (2nd card), 3 (4th card), 5... -> 'dealer' (Andar / Dealer's Side mat)
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
