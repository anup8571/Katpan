import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStandardDeck,
  shuffleDeck,
  splitDeck,
  isWinningCard,
  getReceivingSide,
  computePayout,
  getNextDealer,
  getCutterForDealer,
  generateBotCutIndex,
  resolveRoundWinner,
  getNextAntiClockwiseSeat,
  resolveNextDealerAndCutter,
  getBettingOrder,
  generateBotBet,
  generateBotDealDelayMs,
  createInitialSeats,
  settleConstantCurrencyRound,
  prepareSeatsForNextRound,
} from './rules';
import { TOTAL_TABLE_COINS } from './types';

test('createStandardDeck produces exactly 52 distinct cards with 4 suits and 13 ranks', () => {
  const deck = createStandardDeck();
  assert.equal(deck.length, 52);
  const uniqueIds = new Set(deck.map((c) => c.id));
  assert.equal(uniqueIds.size, 52);
  const redCards = deck.filter((c) => c.isRed);
  assert.equal(redCards.length, 26);
});

test('shuffleDeck preserves all cards and produces a permuted array', () => {
  const deck = createStandardDeck();
  let seed = 42;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const shuffled = shuffleDeck(deck, rng);
  assert.equal(shuffled.length, 52);
  assert.notDeepEqual(
    shuffled.map((c) => c.id),
    deck.map((c) => c.id)
  );
});

test('splitDeck splits at given cutIndex and extracts the bottom card of 2nd deck as pointCard', () => {
  const deck = createStandardDeck();
  const { firstDeck, secondDeck, pointCard } = splitDeck(deck, 20);
  assert.equal(firstDeck.length, 20);
  assert.equal(secondDeck.length, 31);
  assert.equal(pointCard.id, deck[51].id);
});

test('isWinningCard checks rank equality regardless of suit', () => {
  const cardA = { id: '7_spades', suit: 'spades' as const, rank: '7' as const, isRed: false, label: '7♠' };
  const cardB = { id: '7_hearts', suit: 'hearts' as const, rank: '7' as const, isRed: true, label: '7♥' };
  const cardC = { id: 'K_diamonds', suit: 'diamonds' as const, rank: 'K' as const, isRed: true, label: 'K♦' };

  assert.equal(isWinningCard(cardA, cardB), true);
  assert.equal(isWinningCard(cardA, cardC), false);
});

test('getReceivingSide alternates correctly: even -> player (Bahar/Cutter), odd -> dealer (Andar/Dealer)', () => {
  assert.equal(getReceivingSide(0), 'player');
  assert.equal(getReceivingSide(1), 'dealer');
  assert.equal(getReceivingSide(2), 'player');
  assert.equal(getReceivingSide(3), 'dealer');
});

test('Rule 1: Cutter is ALWAYS locked to Bahar (player side) regardless of RNG', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
    const cutterBet = generateBotBet('B', true, 1000, () => r);
    assert.equal(cutterBet.betSide, 'player');
    assert.equal(cutterBet.betAmount > 0, true);
  }
});

test('Rule 2: Constant-currency settlement strictly conserves TOTAL_TABLE_COINS (6,000 RC) across all outcomes', () => {
  const seats = createInitialSeats('D');
  const initialSum = seats.reduce((sum, s) => sum + s.balance, 0);
  assert.equal(initialSum, TOTAL_TABLE_COINS);

  // Suppose A is Dealer, B (Cutter) bets 250 on Bahar ('player'), C bets 100 on Andar ('dealer'),
  // D bets 500 on Bahar ('player'), E bets 250 on Andar ('dealer'), F bets 100 on Bahar ('player')
  const withBets = seats.map((s) => {
    if (s.id === 'B') return { ...s, betSide: 'player' as const, betAmount: 250 };
    if (s.id === 'C') return { ...s, betSide: 'dealer' as const, betAmount: 100 };
    if (s.id === 'D') return { ...s, betSide: 'player' as const, betAmount: 500 };
    if (s.id === 'E') return { ...s, betSide: 'dealer' as const, betAmount: 250 };
    if (s.id === 'F') return { ...s, betSide: 'player' as const, betAmount: 100 };
    return s;
  });

  // Outcome A: Bahar ('player') wins
  const resBahar = settleConstantCurrencyRound(withBets, 'A', 'player');
  assert.equal(resBahar.totalPool, TOTAL_TABLE_COINS);
  assert.equal(
    resBahar.updatedSeats.reduce((sum, s) => sum + s.balance, 0),
    TOTAL_TABLE_COINS
  );
  // B (+250), D (+500), F (+100) won; C (-100), E (-250) lost; Dealer A net = +350 - 850 = -500
  assert.equal(resBahar.deltas.B, 250);
  assert.equal(resBahar.deltas.D, 500);
  assert.equal(resBahar.deltas.C, -100);
  assert.equal(resBahar.deltas.A, -500);

  // Outcome B: Andar ('dealer') wins
  const resAndar = settleConstantCurrencyRound(withBets, 'A', 'dealer');
  assert.equal(resAndar.totalPool, TOTAL_TABLE_COINS);
  assert.equal(resAndar.deltas.B, -250);
  assert.equal(resAndar.deltas.C, 100);
  assert.equal(resAndar.deltas.A, 500);

  // Next-round preparation preserves constant 6,000 RC pool even if a seat ran low
  const rebalanced = prepareSeatsForNextRound(resBahar.updatedSeats, 'D');
  assert.equal(
    rebalanced.reduce((sum, s) => sum + s.balance, 0),
    TOTAL_TABLE_COINS
  );
});

test('6-seat anti-clockwise rotation follows Rule 2: A deals, B cuts -> if B wins B deals & C cuts; if B loses A stays dealer & C cuts', () => {
  assert.equal(getNextAntiClockwiseSeat('A'), 'B');
  assert.equal(getNextAntiClockwiseSeat('F'), 'A');
  assert.equal(getNextAntiClockwiseSeat('F', 'A'), 'B');

  const bWins = resolveNextDealerAndCutter('A', 'B', 'player');
  assert.equal(bWins.nextDealer, 'B');
  assert.equal(bWins.nextCutter, 'C');

  const bLoses = resolveNextDealerAndCutter('A', 'B', 'dealer');
  assert.equal(bLoses.nextDealer, 'A');
  assert.equal(bLoses.nextCutter, 'C');
});

test('getBettingOrder starts with Cutter and proceeds anti-clockwise excluding Dealer', () => {
  assert.deepEqual(getBettingOrder('A', 'B'), ['B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(getBettingOrder('A', 'C'), ['C', 'D', 'E', 'F', 'B']);
});

test('legacy helpers remain valid', () => {
  assert.equal(computePayout(1000, 250, true), 1250);
  assert.equal(getNextDealer('player'), 'player');
  assert.equal(getCutterForDealer('player'), 'bot');
  assert.equal(generateBotCutIndex(() => 0), 12);
  assert.equal(resolveRoundWinner('player', 'bot'), 'player');
  assert.equal(generateBotDealDelayMs(() => 0.5) >= 250, true);
});
