import { Card, Rank, Suit } from './types';

export const SUITS: Record<Suit, { symbol: string; color: string; name: string }> = {
  spades: { symbol: '♠', color: '#0f172a', name: 'Spades' },
  hearts: { symbol: '♥', color: '#dc2626', name: 'Hearts' },
  diamonds: { symbol: '♦', color: '#dc2626', name: 'Diamonds' },
  clubs: { symbol: '♣', color: '#0f172a', name: 'Clubs' },
};

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Creates an ordered deck of 52 playing cards.
 */
export function createStandardDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        label: `${rank}${SUITS[suit].symbol}`,
        color: SUITS[suit].color,
      });
    }
  }

  return deck;
}

/**
 * Shuffles a deck in-place using Fisher-Yates with an optional RNG function for deterministic testing.
 */
export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

export interface SplitResult {
  firstDeck: Card[];
  secondDeck: Card[];
  pointCard: Card;
}

/**
 * Cuts the deck at index `cutIndex`.
 * 1st deck has cards [0, cutIndex)
 * 2nd deck has cards [cutIndex, length)
 * In Maang Patta / Royal Katti, the bottom-most card of the 2nd Deck is drawn as the Point Card!
 */
export function splitDeck(deck: Card[], cutIndex: number): SplitResult {
  const safeIndex = Math.max(1, Math.min(cutIndex, deck.length - 1));
  const firstDeck = deck.slice(0, safeIndex);
  const secondDeckWithBottom = deck.slice(safeIndex);

  // Bottom card of 2nd deck is the Point Card
  const secondDeck = [...secondDeckWithBottom];
  const pointCard = secondDeck.pop();

  if (!pointCard) {
    throw new Error('Invalid cut index resulting in empty 2nd deck');
  }

  return {
    firstDeck,
    secondDeck,
    pointCard,
  };
}

/**
 * Checks whether a dealt card matches the target rank.
 */
export function isWinningCard(dealtCard: Card, pointCard: Card): boolean {
  return dealtCard.rank === pointCard.rank;
}

/**
 * Determines which side receives the card at turnIndex (0-indexed).
 * In Maang Patta, dealt cards alternate:
 * turn 0 -> Player (1st)
 * turn 1 -> Dealer (2nd)
 * turn 2 -> Player (3rd)
 * turn 3 -> Dealer (4th)
 */
export function getReceivingSide(turnIndex: number): 'player' | 'dealer' {
  return turnIndex % 2 === 0 ? 'player' : 'dealer';
}

/**
 * Calculates new balance given outcome.
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
