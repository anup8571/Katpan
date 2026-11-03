import test from 'node:test';
import assert from 'node:assert/strict';
import { decideBotInitialBet, decideNextBotEqualizeAction } from './botAI';
import { createInitialSeats, calculatePoolTotals } from './rules';
import { SeatInfo } from './types';

test('decideBotInitialBet locks Cutter to Blue (player)', () => {
  const seats = createInitialSeats('D');
  const decision = decideBotInitialBet('B', seats, 'A', 'B');
  assert.equal(decision.betSide, 'player');
  assert.equal(decision.betStatus, 'placed');
  assert.ok(decision.betAmount >= 50);
});

test('decideBotInitialBet locks Shuffler to Red (dealer) and counters Cutter', () => {
  const seats = createInitialSeats('D');
  // Simulate cutter having placed 150 RC
  const cutterSeat = seats.find((s) => s.id === 'B')!;
  cutterSeat.betAmount = 150;
  cutterSeat.betSide = 'player';
  cutterSeat.betStatus = 'placed';

  const decision = decideBotInitialBet('A', seats, 'A', 'B');
  assert.equal(decision.betSide, 'dealer');
  assert.equal(decision.betStatus, 'placed');
  assert.ok(decision.betAmount >= 50);
});

test('decideNextBotEqualizeAction identifies deficit side and chooses appropriate bot action', () => {
  const seats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 300, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 100, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'D', name: 'You', shortName: 'You', isHuman: true, balance: 1000, betAmount: 50, betSide: 'dealer', betStatus: 'placed' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 50, betSide: 'player', betStatus: 'placed' },
  ];

  const totals = calculatePoolTotals(seats);
  // Red = 350, Blue = 150. Difference = 200 (Blue needs 200 RC).
  assert.equal(totals.redTotal, 350);
  assert.equal(totals.blueTotal, 150);
  assert.equal(totals.isBalanced, false);

  const action = decideNextBotEqualizeAction(seats, 'A', 'B', 'D');
  assert.ok(action !== null);
  // The action must help close the gap: either raise on Blue, join on Blue, or trim Red!
  assert.ok(['raise', 'join', 'trim'].includes(action.actionType));
  if (action.actionType === 'raise' || action.actionType === 'join') {
    assert.equal(action.side, 'player');
    assert.ok(action.delta > 0);
  } else if (action.actionType === 'trim') {
    assert.equal(action.side, 'dealer');
    assert.ok(action.delta < 0);
  }
});

test('Iterative bot equalization converges to redTotal === blueTotal', () => {
  let currentSeats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 400, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 100, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'D', name: 'You', shortName: 'You', isHuman: true, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
  ];

  let iterations = 0;
  while (!calculatePoolTotals(currentSeats).isBalanced && iterations < 15) {
    const action = decideNextBotEqualizeAction(currentSeats, 'A', 'B', 'D');
    if (!action) break;
    currentSeats = currentSeats.map((s) => {
      if (s.id === action.botSeat) {
        return {
          ...s,
          betSide: action.side,
          betAmount: action.newBetAmount,
          betStatus: action.newBetAmount > 0 ? ('placed' as const) : ('skipped' as const),
        };
      }
      return s;
    });
    iterations++;
  }

  const finalTotals = calculatePoolTotals(currentSeats);
  assert.equal(finalTotals.isBalanced, true);
  assert.equal(finalTotals.redTotal, finalTotals.blueTotal);
  assert.ok(finalTotals.redTotal > 0);
});
