import { SeatId, SeatInfo, Side } from './types';
import { calculatePoolTotals, CHIP_VALUES } from './rules';

export interface BotPersonality {
  seatId: SeatId;
  name: string;
  riskTolerance: 'aggressive' | 'balanced' | 'conservative';
  favoriteSideBias: 'dealer' | 'player' | 'neutral';
  preferredWagers: number[];
  canEqualizeByTrim: boolean;
  canJoinFromSkip: boolean;
}

export const BOT_PROFILES: Record<SeatId, BotPersonality> = {
  A: {
    seatId: 'A',
    name: 'Vikram',
    riskTolerance: 'aggressive',
    favoriteSideBias: 'dealer', // Leans Red (Under/Shuffler)
    preferredWagers: [100, 250, 500],
    canEqualizeByTrim: false, // Too proud to trim, prefers raising
    canJoinFromSkip: true,
  },
  B: {
    seatId: 'B',
    name: 'Kabir',
    riskTolerance: 'balanced',
    favoriteSideBias: 'player', // Leans Blue (Bahar/Cutter)
    preferredWagers: [100, 250],
    canEqualizeByTrim: true,
    canJoinFromSkip: true,
  },
  C: {
    seatId: 'C',
    name: 'Aryan',
    riskTolerance: 'aggressive',
    favoriteSideBias: 'neutral',
    preferredWagers: [100, 250, 500],
    canEqualizeByTrim: false,
    canJoinFromSkip: true,
  },
  D: {
    seatId: 'D',
    name: 'You',
    riskTolerance: 'balanced',
    favoriteSideBias: 'neutral',
    preferredWagers: [50, 100, 250],
    canEqualizeByTrim: true,
    canJoinFromSkip: true,
  },
  E: {
    seatId: 'E',
    name: 'Meera',
    riskTolerance: 'conservative',
    favoriteSideBias: 'neutral',
    preferredWagers: [50, 100],
    canEqualizeByTrim: true, // Prudent, willing to trim excess
    canJoinFromSkip: false,
  },
  F: {
    seatId: 'F',
    name: 'Rohan',
    riskTolerance: 'balanced',
    favoriteSideBias: 'neutral',
    preferredWagers: [50, 100, 250],
    canEqualizeByTrim: true,
    canJoinFromSkip: true, // Very active table balancer
  },
};

export interface InitialBetDecision {
  betSide: Side | null;
  betAmount: number;
  betStatus: 'placed' | 'skipped';
  reasoning: string;
}

/**
 * Intelligent, personality-driven initial bet decision for a bot seat.
 */
export function decideBotInitialBet(
  botSeat: SeatId,
  currentSeats: readonly SeatInfo[],
  dealerSeat: SeatId,
  cutterSeat: SeatId,
  rng: () => number = Math.random
): InitialBetDecision {
  const profile = BOT_PROFILES[botSeat] || {
    seatId: botSeat,
    name: `Bot ${botSeat}`,
    riskTolerance: 'balanced',
    favoriteSideBias: 'neutral',
    preferredWagers: [50, 100],
    canEqualizeByTrim: true,
    canJoinFromSkip: true,
  };

  const seatObj = currentSeats.find((s) => s.id === botSeat);
  const balance = seatObj ? seatObj.balance : 1000;

  // 1. Cutter is ALWAYS locked to Blue ('player')
  if (botSeat === cutterSeat) {
    const affordable = [50, 100, 250].filter((w) => w <= balance);
    const chosenWager = affordable.length > 0
      ? affordable[Math.floor(rng() * affordable.length)]
      : Math.min(balance, 100);
    return {
      betSide: 'player',
      betAmount: chosenWager,
      betStatus: 'placed',
      reasoning: `${profile.name} (Cutter) opens on Blue with ${chosenWager} RC`,
    };
  }

  // 2. Shuffler is ALWAYS locked to Red ('dealer')
  if (botSeat === dealerSeat) {
    const cutterObj = currentSeats.find((s) => s.id === cutterSeat);
    const cutterWager = cutterObj?.betAmount || 100;
    // Veritably counters cutter's bet (aims to stay near cutter's wager for parity)
    let counterWager = cutterWager;
    const roll = rng();
    if (roll < 0.35 && counterWager + 50 <= balance) {
      counterWager += 50;
    } else if (roll > 0.70 && counterWager > 50) {
      counterWager -= 50;
    }
    counterWager = Math.min(counterWager, balance);
    return {
      betSide: 'dealer',
      betAmount: counterWager,
      betStatus: 'placed',
      reasoning: `${profile.name} (Shuffler) counters Cutter with ${counterWager} RC on Red`,
    };
  }

  // 3. Other Table Players:
  // Low balance prudence: If balance < 150 and conservative, 40% chance to skip
  if (balance < 150 && profile.riskTolerance === 'conservative' && rng() < 0.4) {
    return {
      betSide: null,
      betAmount: 0,
      betStatus: 'skipped',
      reasoning: `${profile.name} skips to preserve chips (${balance} RC stack)`,
    };
  }

  // Look at the current totals on Red vs Blue to make a veritable tactical decision
  const totals = calculatePoolTotals(currentSeats);
  let side: Side = 'player';

  if (totals.redTotal > totals.blueTotal) {
    // Red has more money: 75% bias to help Blue (underdog / parity)
    side = rng() < 0.75 ? 'player' : 'dealer';
  } else if (totals.blueTotal > totals.redTotal) {
    // Blue has more money: 75% bias to help Red
    side = rng() < 0.75 ? 'dealer' : 'player';
  } else {
    // Exactly equal or neutral: check personality favorite
    if (profile.favoriteSideBias === 'dealer') {
      side = rng() < 0.7 ? 'dealer' : 'player';
    } else if (profile.favoriteSideBias === 'player') {
      side = rng() < 0.7 ? 'player' : 'dealer';
    } else {
      side = rng() < 0.5 ? 'player' : 'dealer';
    }
  }

  // Pick wager from personality preferences bounded by available balance
  const affordableWagers = profile.preferredWagers.filter((w) => w <= balance);
  const amount = affordableWagers.length > 0
    ? affordableWagers[Math.floor(rng() * affordableWagers.length)]
    : Math.min(balance, 50);

  const sideLabel = side === 'dealer' ? 'Red (Shuffler)' : 'Blue (Cutter)';
  return {
    betSide: side,
    betAmount: amount,
    betStatus: 'placed',
    reasoning: `${profile.name} wagers ${amount} RC on ${sideLabel}`,
  };
}

export interface BotEqualizeAction {
  botSeat: SeatId;
  botName: string;
  actionType: 'raise' | 'trim' | 'join';
  side: Side;
  delta: number;
  newBetAmount: number;
  reasoning: string;
}

/**
 * Evaluates the current Red vs Blue disparity and chooses a veritable autonomous
 * action for one eligible bot to help equalize the pool towards redTotal === blueTotal.
 */
export function decideNextBotEqualizeAction(
  seats: readonly SeatInfo[],
  dealerSeat: SeatId,
  cutterSeat: SeatId,
  humanSeat: SeatId,
  rng: () => number = Math.random
): BotEqualizeAction | null {
  const totals = calculatePoolTotals(seats);
  if (totals.isBalanced) return null;

  const diff = totals.redTotal - totals.blueTotal;
  if (diff === 0) return null;

  const deficitSide: Side = diff > 0 ? 'player' : 'dealer';
  const surplusSide: Side = diff > 0 ? 'dealer' : 'player';
  const absDiff = Math.abs(diff);

  // Filter bots (exclude human seat)
  const botSeats = seats.filter((s) => !s.isHuman && s.id !== humanSeat);
  if (botSeats.length === 0) return null;

  // Potential Actions:
  // 1. A bot already on the deficit side raises their bet
  const deficitBots = botSeats.filter(
    (s) => s.betSide === deficitSide && s.betStatus === 'placed' && s.balance >= s.betAmount + 50
  );

  // 2. A bot who skipped steps in to back the deficit side
  const skippedBots = botSeats.filter(
    (s) =>
      (s.betStatus === 'skipped' || s.betAmount === 0 || !s.betSide) &&
      s.balance >= 50 &&
      s.id !== dealerSeat &&
      s.id !== cutterSeat &&
      (BOT_PROFILES[s.id]?.canJoinFromSkip ?? true)
  );

  // 3. A bot on the surplus side with an oversized bet trims back
  const surplusBots = botSeats.filter(
    (s) =>
      s.betSide === surplusSide &&
      s.betStatus === 'placed' &&
      s.betAmount > 50 &&
      (BOT_PROFILES[s.id]?.canEqualizeByTrim ?? true)
  );

  // Decision Strategy Priority:
  // 70% chance: Raise on deficit side (either existing deficit bettor or joining from skip)
  // 30% chance (or if no deficit raisers): Trim surplus side

  const canRaiseDeficit = deficitBots.length > 0 || skippedBots.length > 0;
  const preferRaise = canRaiseDeficit && (surplusBots.length === 0 || rng() < 0.75);

  if (preferRaise) {
    // If we have an existing deficit bot, favor them or a skipped bot
    if (deficitBots.length > 0 && (skippedBots.length === 0 || rng() < 0.65)) {
      // Pick a deficit bot with good balance
      const bot = deficitBots[Math.floor(rng() * deficitBots.length)];
      const profile = BOT_PROFILES[bot.id];
      const maxIncrease = bot.balance - bot.betAmount;

      // Match exact diff if affordable, or take a step of 50 / 100
      let raiseDelta = 50;
      if (absDiff >= 100 && maxIncrease >= 100 && rng() < 0.6) {
        raiseDelta = 100;
      }
      if (absDiff <= maxIncrease && (absDiff === 50 || absDiff === 100 || absDiff === 150)) {
        raiseDelta = absDiff;
      }
      raiseDelta = Math.min(raiseDelta, maxIncrease, absDiff);
      if (raiseDelta <= 0) raiseDelta = Math.min(50, maxIncrease);

      const newBet = bot.betAmount + raiseDelta;
      const sideName = deficitSide === 'dealer' ? 'Red (Shuffler)' : 'Blue (Cutter)';

      return {
        botSeat: bot.id,
        botName: profile?.name || bot.name,
        actionType: 'raise',
        side: deficitSide,
        delta: raiseDelta,
        newBetAmount: newBet,
        reasoning: `${profile?.name || bot.name} raises ${sideName} bet by +${raiseDelta} RC to balance pool`,
      };
    }

    if (skippedBots.length > 0) {
      // A skipped bot steps in
      const bot = skippedBots[Math.floor(rng() * skippedBots.length)];
      const profile = BOT_PROFILES[bot.id];
      let joinAmount = 50;
      if (absDiff >= 100 && bot.balance >= 100 && rng() < 0.5) {
        joinAmount = 100;
      }
      if (absDiff <= bot.balance && [50, 100, 150].includes(absDiff)) {
        joinAmount = absDiff;
      }
      joinAmount = Math.min(joinAmount, bot.balance, absDiff);
      if (joinAmount <= 0) joinAmount = Math.min(50, bot.balance);

      const sideName = deficitSide === 'dealer' ? 'Red (Shuffler)' : 'Blue (Cutter)';
      return {
        botSeat: bot.id,
        botName: profile?.name || bot.name,
        actionType: 'join',
        side: deficitSide,
        delta: joinAmount,
        newBetAmount: joinAmount,
        reasoning: `${profile?.name || bot.name} joins ${sideName} with ${joinAmount} RC to bridge deficit`,
      };
    }
  }

  // Fallback: Trim surplus bot
  if (surplusBots.length > 0) {
    const bot = surplusBots[Math.floor(rng() * surplusBots.length)];
    const profile = BOT_PROFILES[bot.id];
    let trimDelta = 50;
    const maxTrim = bot.betAmount - 50; // keep at least 50
    trimDelta = Math.min(trimDelta, maxTrim, absDiff);
    if (trimDelta > 0) {
      const newBet = bot.betAmount - trimDelta;
      const sideName = surplusSide === 'dealer' ? 'Red (Shuffler)' : 'Blue (Cutter)';
      return {
        botSeat: bot.id,
        botName: profile?.name || bot.name,
        actionType: 'trim',
        side: surplusSide,
        delta: -trimDelta,
        newBetAmount: newBet,
        reasoning: `${profile?.name || bot.name} trims ${sideName} bet by -${trimDelta} RC to equalise table`,
      };
    }
  }

  return null;
}
