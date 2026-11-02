export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isRed: boolean;
  label: string;
}

export type SeatId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const SEAT_ORDER: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export type GamePhase =
  | 'title'
  | 'shuffling' // Dealer shuffles the deck (auto if Bot is Dealer, button if You are Dealer)
  | 'cutting'   // First, Cutter cuts the deck and reveals the Hukam Point Card
  | 'betting'   // Bets are placed in anti-clockwise order starting from the Cutter on Andar (Dealer) or Bahar (Cutter)
  | 'dealing'   // Dealer deals cards (Bots auto-deal as they like; Cutter never deals)
  | 'paused'
  | 'round_over';

/**
 * Table Side:
 * - 'dealer' = Under / Dealer's Side (Andar Mat on North side)
 * - 'player' = Bahar / Cutter's Side (Bahar Mat on South side)
 */
export type Side = 'player' | 'dealer';

export type Participant = 'player' | 'bot';

export type PlayerSlotId = 1 | 2 | 3;

export interface SeatInfo {
  id: SeatId;
  name: string;
  shortName: string;
  isHuman: boolean;
  betAmount: number;
  betSide: Side | null;
}

export interface SplitResult {
  firstDeck: Card[];
  secondDeck: Card[];
  pointCard: Card;
}

export interface GameStats {
  totalRounds: number;
  playerWins: number;
  dealerWins: number;
  highestBalance: number;
  totalWagered: number;
  currentStreak: number;
  bestStreak: number;
}

export type CameraView = 'felt' | 'player' | 'pedestal' | 'cinematic';
