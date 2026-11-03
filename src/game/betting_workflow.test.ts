import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSeats,
  DEFAULT_SEAT_NAMES,
  prepareSeatsForNextRound,
  calculatePoolTotals,
  isPoolBalanced,
  balancePools,
  settleBalancedRound,
} from './rules';
import { SeatId, SeatInfo } from './types';

test('createInitialSeats uses authentic names and defaults', () => {
  const seats = createInitialSeats('D', 'Anup');
  assert.equal(seats.length, 6);
  assert.equal(seats.find((s) => s.id === 'D')?.name, 'Anup');
  assert.equal(seats.find((s) => s.id === 'A')?.name, 'Vikram');
  assert.equal(seats.find((s) => s.id === 'B')?.name, 'Kabir');
  assert.equal(seats.find((s) => s.id === 'C')?.name, 'Aryan');
  assert.equal(seats.find((s) => s.id === 'E')?.name, 'Meera');
  assert.equal(seats.find((s) => s.id === 'F')?.name, 'Rohan');
});

test('calculatePoolTotals sums Red and Blue bets correctly and ignores skipped players', () => {
  const seats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 200, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 200, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 100, betSide: 'dealer', betStatus: 'placed' },
    { id: 'D', name: 'Anup', shortName: 'Anup', isHuman: true, balance: 1000, betAmount: 100, betSide: 'player', betStatus: 'placed' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'pending' },
  ];

  const totals = calculatePoolTotals(seats);
  assert.equal(totals.redTotal, 300); // Vikram (200) + Aryan (100)
  assert.equal(totals.blueTotal, 300); // Kabir (200) + Anup (100)
  assert.equal(totals.difference, 0);
  assert.equal(isPoolBalanced(seats), true);
});

test('isPoolBalanced returns false when totals differ or are zero', () => {
  const emptySeats: SeatInfo[] = createInitialSeats('D');
  assert.equal(isPoolBalanced(emptySeats), false);

  const unbalancedSeats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 300, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 200, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'D', name: 'Anup', shortName: 'Anup', isHuman: true, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
  ];
  assert.equal(isPoolBalanced(unbalancedSeats), false);
  const totals = calculatePoolTotals(unbalancedSeats);
  assert.equal(totals.redTotal, 300);
  assert.equal(totals.blueTotal, 200);
  assert.equal(totals.difference, 100);
});

test('balancePools equalizes the difference across bot seats', () => {
  const unbalancedSeats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 300, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 200, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'D', name: 'Anup', shortName: 'Anup', isHuman: true, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
  ];

  const balanced = balancePools(unbalancedSeats);
  assert.equal(isPoolBalanced(balanced), true);
  const totals = calculatePoolTotals(balanced);
  assert.equal(totals.redTotal, totals.blueTotal);
});

test('settleBalancedRound preserves total currency strictly constant', () => {
  const seats: SeatInfo[] = [
    { id: 'A', name: 'Vikram', shortName: 'Vikram', isHuman: false, balance: 1000, betAmount: 200, betSide: 'dealer', betStatus: 'placed' },
    { id: 'B', name: 'Kabir', shortName: 'Kabir', isHuman: false, balance: 1000, betAmount: 200, betSide: 'player', betStatus: 'placed' },
    { id: 'C', name: 'Aryan', shortName: 'Aryan', isHuman: false, balance: 1000, betAmount: 100, betSide: 'dealer', betStatus: 'placed' },
    { id: 'D', name: 'Anup', shortName: 'Anup', isHuman: true, balance: 1000, betAmount: 100, betSide: 'player', betStatus: 'placed' },
    { id: 'E', name: 'Meera', shortName: 'Meera', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
    { id: 'F', name: 'Rohan', shortName: 'Rohan', isHuman: false, balance: 1000, betAmount: 0, betSide: null, betStatus: 'skipped' },
  ];

  const initialTotal = seats.reduce((acc, s) => acc + s.balance, 0);
  assert.equal(initialTotal, 6000);

  // Red wins (dealer side)
  const resultRed = settleBalancedRound(seats, 'dealer');
  const totalAfterRed = resultRed.updatedSeats.reduce((acc, s) => acc + s.balance, 0);
  assert.equal(totalAfterRed, 6000);

  // Blue wins (player side)
  const resultBlue = settleBalancedRound(seats, 'player');
  const totalAfterBlue = resultBlue.updatedSeats.reduce((acc, s) => acc + s.balance, 0);
  assert.equal(totalAfterBlue, 6000);
});
