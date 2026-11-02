export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  label: string;
  color: string;
}

export type GamePhase = 'title' | 'betting' | 'dealing' | 'round_over' | 'paused';
export type Side = 'player' | 'dealer';

export interface GameStats {
  totalRounds: number;
  playerWins: number;
  dealerWins: number;
  highestBalance: number;
  totalWagered: number;
  currentStreak: number;
  bestStreak: number;
}

export type CameraView = 'cinematic' | 'felt' | 'player' | 'pedestal';
