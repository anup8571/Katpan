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
} from './rules';

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

test('computePayout calculates additions and deductions properly without negative balance', () => {
  assert.equal(computePayout(1000, 250, true), 1250);
  assert.equal(computePayout(1000, 250, false), 750);
  assert.equal(computePayout(100, 250, false), 0);
});

test('6-seat anti-clockwise rotation follows Rule 2: A deals, B cuts -> if B wins B deals & C cuts; if B loses A stays dealer & C cuts', () => {
  assert.equal(getNextAntiClockwiseSeat('A'), 'B');
  assert.equal(getNextAntiClockwiseSeat('F'), 'A');
  assert.equal(getNextAntiClockwiseSeat('F', 'A'), 'B');

  // Case 1: A is Dealer, B is Cutter, and B wins (Bahar / 'player' side wins)
  const bWins = resolveNextDealerAndCutter('A', 'B', 'player');
  assert.equal(bWins.nextDealer, 'B');
  assert.equal(bWins.nextCutter, 'C');

  // Case 2: A is Dealer, B is Cutter, and B loses (Andar / 'dealer' side wins)
  const bLoses = resolveNextDealerAndCutter('A', 'B', 'dealer');
  assert.equal(bLoses.nextDealer, 'A');
  assert.equal(bLoses.nextCutter, 'C');

  // Case 3: A is still Dealer, F is Cutter, and F loses -> A stays Dealer, B becomes Cutter (skipping A)
  const fLoses = resolveNextDealerAndCutter('A', 'F', 'dealer');
  assert.equal(fLoses.nextDealer, 'A');
  assert.equal(fLoses.nextCutter, 'B');
});

test('getBettingOrder starts with Cutter and proceeds anti-clockwise excluding Dealer (Rule 3)', () => {
  assert.deepEqual(getBettingOrder('A', 'B'), ['B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(getBettingOrder('A', 'C'), ['C', 'D', 'E', 'F', 'B']);
  assert.deepEqual(getBettingOrder('D', 'E'), ['E', 'F', 'A', 'B', 'C']);
});

test('bot auto-betting and auto-deal delay helpers produce valid bets and delays (Rules 3 & 4)', () => {
  const botBet1 = generateBotBet('B', true, () => 0.1);
  assert.equal(botBet1.betSide, 'player');
  assert.equal(botBet1.betAmount, 50);

  const botBet2 = generateBotBet('C', false, () => 0.75);
  assert.equal(botBet2.betSide, 'dealer');
  assert.equal(botBet2.betAmount, 500);

  const delay = generateBotDealDelayMs(() => 0.5);
  assert.equal(delay >= 250 && delay <= 430, true);
});

test('legacy dealer rotation and cutter helpers remain valid', () => {
  assert.equal(getNextDealer('player'), 'player');
  assert.equal(getCutterForDealer('player'), 'bot');
  assert.equal(generateBotCutIndex(() => 0), 12);
  assert.equal(resolveRoundWinner('player', 'bot'), 'player');
});
