import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStandardDeck,
  shuffleDeck,
  splitDeck,
  isWinningCard,
  getReceivingSide,
  computePayout,
} from './rules';

test('createStandardDeck produces exactly 52 distinct cards with 4 suits and 13 ranks', () => {
  const deck = createStandardDeck();
  assert.equal(deck.length, 52);

  const ids = new Set(deck.map((c) => c.id));
  assert.equal(ids.size, 52);

  const spades = deck.filter((c) => c.suit === 'spades');
  const hearts = deck.filter((c) => c.suit === 'hearts');
  const diamonds = deck.filter((c) => c.suit === 'diamonds');
  const clubs = deck.filter((c) => c.suit === 'clubs');

  assert.equal(spades.length, 13);
  assert.equal(hearts.length, 13);
  assert.equal(diamonds.length, 13);
  assert.equal(clubs.length, 13);
});

test('shuffleDeck preserves all cards and produces a permuted array', () => {
  const original = createStandardDeck();
  const shuffled = shuffleDeck(original);

  assert.equal(shuffled.length, 52);
  const originalIds = new Set(original.map((c) => c.id));
  const shuffledIds = new Set(shuffled.map((c) => c.id));
  assert.equal(shuffledIds.size, 52);
  for (const id of originalIds) {
    assert.ok(shuffledIds.has(id));
  }
});

test('splitDeck splits at given cutIndex and extracts the bottom card of 2nd deck as pointCard', () => {
  const deck = createStandardDeck();
  const cutIndex = 26;
  const result = splitDeck(deck, cutIndex);

  assert.equal(result.firstDeck.length, 26);
  // Total was 52, cut at 26 means second deck had 26 cards, 1 became pointCard, so 25 remain
  assert.equal(result.secondDeck.length, 25);
  assert.ok(result.pointCard);
  // The pointCard must be the original last card of secondDeck (index 51 of deck)
  assert.equal(result.pointCard.id, deck[51].id);
  // Total cards accounted for: 26 + 25 + 1 = 52
  assert.equal(result.firstDeck.length + result.secondDeck.length + 1, 52);
});

test('isWinningCard checks rank equality regardless of suit', () => {
  const pointCard = { id: 'spades-K', suit: 'spades' as const, rank: 'K' as const, label: 'K♠', color: '#000' };
  const matchingCard = { id: 'hearts-K', suit: 'hearts' as const, rank: 'K' as const, label: 'K♥', color: '#f00' };
  const nonMatchingCard = { id: 'spades-Q', suit: 'spades' as const, rank: 'Q' as const, label: 'Q♠', color: '#000' };

  assert.equal(isWinningCard(matchingCard, pointCard), true);
  assert.equal(isWinningCard(nonMatchingCard, pointCard), false);
});

test('getReceivingSide alternates correctly: even -> player, odd -> dealer', () => {
  assert.equal(getReceivingSide(0), 'player');
  assert.equal(getReceivingSide(1), 'dealer');
  assert.equal(getReceivingSide(2), 'player');
  assert.equal(getReceivingSide(3), 'dealer');
  assert.equal(getReceivingSide(4), 'player');
});

test('computePayout calculates additions and deductions properly without negative balance', () => {
  assert.equal(computePayout(1000, 100, true), 1100);
  assert.equal(computePayout(1000, 100, false), 900);
  assert.equal(computePayout(50, 100, false), 0);
});
