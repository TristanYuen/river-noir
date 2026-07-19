import type { PlayerActionType, RandomSource } from "@river-noir/poker-engine";

export type DeepSeekMood = "composed" | "confident" | "impatient" | "chasing" | "tilted" | "cautious";

export interface DeepSeekBehaviorState {
  readonly aggressionBias: number;
  readonly riskBias: number;
  readonly volatility: number;
  readonly tilt: number;
  readonly confidence: number;
  readonly lossChasing: number;
  readonly foldStreak: number;
  readonly referenceStack: number;
  readonly lastResult: "none" | "win" | "loss" | "breakEven";
}

export interface DeepSeekDecisionBehavior {
  readonly mood: DeepSeekMood;
  readonly aggression: number;
  readonly riskTolerance: number;
  readonly bluffUrge: number;
  readonly exploration: number;
  readonly tilt: number;
  readonly confidence: number;
  readonly lossChasing: number;
  readonly foldStreak: number;
  readonly lastResult: DeepSeekBehaviorState["lastResult"];
}

export interface BehaviorDecisionContext {
  readonly stack: number;
  readonly bigBlind: number;
  readonly pot: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function centered(random: RandomSource): number {
  return random.next() * 2 - 1;
}

export function createDeepSeekBehavior(initialStack: number, random: RandomSource): DeepSeekBehaviorState {
  return {
    aggressionBias: centered(random) * 0.16,
    riskBias: centered(random) * 0.14,
    volatility: 0.32 + random.next() * 0.36,
    tilt: random.next() * 0.08,
    confidence: 0.38 + random.next() * 0.24,
    lossChasing: 0,
    foldStreak: 0,
    referenceStack: initialStack,
    lastResult: "none",
  };
}

export function behaviorForDecision(
  state: DeepSeekBehaviorState,
  context: BehaviorDecisionContext,
  random: RandomSource,
): { readonly state: DeepSeekBehaviorState; readonly behavior: DeepSeekDecisionBehavior } {
  const drift = centered(random) * state.volatility * 0.08;
  const stackInBigBlinds = context.stack / Math.max(1, context.bigBlind);
  const stackPressure = clamp((22 - stackInBigBlinds) / 22);
  const potPressure = clamp(context.pot / Math.max(context.stack + context.pot, 1));
  const aggression = clamp(
    0.46 + state.aggressionBias + drift + state.tilt * 0.24 + state.confidence * 0.12
      + Math.min(0.16, state.foldStreak * 0.035) + potPressure * 0.08 - stackPressure * 0.1,
  );
  const riskTolerance = clamp(
    0.42 + state.riskBias + drift * 0.8 + state.lossChasing * 0.34 + state.tilt * 0.2
      + state.confidence * 0.08 - stackPressure * 0.06,
  );
  const bluffUrge = clamp(
    0.08 + aggression * 0.28 + state.lossChasing * 0.18 + Math.min(0.15, state.foldStreak * 0.03)
      + centered(random) * state.volatility * 0.07,
  );
  const exploration = clamp(0.24 + state.volatility * 0.46 + state.tilt * 0.12 + centered(random) * 0.08, 0.15, 0.9);
  const mood: DeepSeekMood = state.tilt > 0.72
    ? "tilted"
    : state.lossChasing > 0.56
      ? "chasing"
      : stackPressure > 0.72
        ? "cautious"
        : state.foldStreak >= 3
          ? "impatient"
          : state.confidence > 0.68
            ? "confident"
            : "composed";
  const nextState = {
    ...state,
    aggressionBias: clamp(state.aggressionBias + drift * 0.25, -0.28, 0.28),
    riskBias: clamp(state.riskBias + centered(random) * state.volatility * 0.018, -0.25, 0.25),
    tilt: clamp(state.tilt * 0.985),
    confidence: clamp(0.5 + (state.confidence - 0.5) * 0.992),
    lossChasing: clamp(state.lossChasing * 0.985),
  };
  return {
    state: nextState,
    behavior: {
      mood,
      aggression: Number(aggression.toFixed(3)),
      riskTolerance: Number(riskTolerance.toFixed(3)),
      bluffUrge: Number(bluffUrge.toFixed(3)),
      exploration: Number(exploration.toFixed(3)),
      tilt: Number(state.tilt.toFixed(3)),
      confidence: Number(state.confidence.toFixed(3)),
      lossChasing: Number(state.lossChasing.toFixed(3)),
      foldStreak: state.foldStreak,
      lastResult: state.lastResult,
    },
  };
}

export function recordDeepSeekAction(state: DeepSeekBehaviorState, action: PlayerActionType): DeepSeekBehaviorState {
  if (action === "fold") {
    return { ...state, foldStreak: state.foldStreak + 1, confidence: clamp(state.confidence - 0.015) };
  }
  if (action === "bet" || action === "raise" || action === "allIn") {
    return { ...state, foldStreak: 0, confidence: clamp(state.confidence + 0.012) };
  }
  return { ...state, foldStreak: Math.max(0, state.foldStreak - 1) };
}

export function settleDeepSeekHand(
  state: DeepSeekBehaviorState,
  currentStack: number,
  bigBlind: number,
  random: RandomSource,
): DeepSeekBehaviorState {
  const chipDelta = currentStack - state.referenceStack;
  const resultScale = clamp(Math.abs(chipDelta) / Math.max(bigBlind * 12, state.referenceStack * 0.18));
  const randomDrift = centered(random) * state.volatility * 0.035;
  if (chipDelta < 0) {
    return {
      ...state,
      aggressionBias: clamp(state.aggressionBias + randomDrift + resultScale * 0.08, -0.28, 0.28),
      riskBias: clamp(state.riskBias + randomDrift + resultScale * 0.07, -0.25, 0.25),
      tilt: clamp(state.tilt + 0.08 + resultScale * 0.42),
      confidence: clamp(state.confidence - 0.04 - resultScale * 0.18),
      lossChasing: clamp(state.lossChasing + 0.1 + resultScale * 0.38),
      referenceStack: currentStack,
      lastResult: "loss",
    };
  }
  if (chipDelta > 0) {
    return {
      ...state,
      aggressionBias: clamp(state.aggressionBias + randomDrift + resultScale * 0.04, -0.28, 0.28),
      riskBias: clamp(state.riskBias + randomDrift, -0.25, 0.25),
      tilt: clamp(state.tilt - 0.12 - resultScale * 0.16),
      confidence: clamp(state.confidence + 0.07 + resultScale * 0.2),
      lossChasing: clamp(state.lossChasing - 0.18 - resultScale * 0.22),
      referenceStack: currentStack,
      lastResult: "win",
    };
  }
  return {
    ...state,
    aggressionBias: clamp(state.aggressionBias + randomDrift, -0.28, 0.28),
    tilt: clamp(state.tilt * 0.9),
    confidence: clamp(0.5 + (state.confidence - 0.5) * 0.95),
    lossChasing: clamp(state.lossChasing * 0.9),
    referenceStack: currentStack,
    lastResult: "breakEven",
  };
}
