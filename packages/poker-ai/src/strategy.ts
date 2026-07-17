import {
  getLegalActions,
  type GameState,
  type PlayerAction,
  type RandomSource,
} from "@river-noir/poker-engine";
import { calculateEquity } from "@river-noir/poker-equity";

export type AiDifficulty = "casual" | "standard" | "expert";

export interface AiDecisionContext {
  readonly state: GameState;
  readonly playerId: string;
  readonly difficulty: AiDifficulty;
  readonly random: RandomSource;
}

export interface AiDecision {
  readonly action: PlayerAction;
  readonly equity: number;
  readonly potOdds: number;
  readonly confidence: number;
  readonly reason: "value" | "draw" | "potOdds" | "pressure" | "bluff" | "giveUp";
}

const ITERATIONS: Record<AiDifficulty, number> = {
  casual: 220,
  standard: 500,
  expert: 900,
};

const AGGRESSION: Record<AiDifficulty, number> = {
  casual: 0.16,
  standard: 0.28,
  expert: 0.38,
};

function clampWhole(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function decideAiAction(context: AiDecisionContext): AiDecision {
  const { state, playerId, difficulty, random } = context;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("AI player is not seated.");
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) throw new Error("AI player has no legal action.");
  const opponents = state.players.filter((candidate) =>
    candidate.id !== playerId && (candidate.status === "active" || candidate.status === "allIn"),
  ).length;
  const equityResult = calculateEquity({
    heroCards: player.holeCards,
    communityCards: state.communityCards,
    opponentCount: Math.max(1, opponents),
    iterations: ITERATIONS[difficulty],
    random,
  });
  const equity = equityResult.equity;
  const pot = state.players.reduce((total, candidate) => total + candidate.committedHand, 0);
  const toCall = Math.max(0, state.currentBet - player.committedStreet);
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const randomValue = random.next();
  const confidence = Math.abs(equity - potOdds);
  const allIn = legal.find((action) => action.type === "allIn");
  const aggressive = legal.find((action) => action.type === "raise" || action.type === "bet");
  const check = legal.find((action) => action.type === "check");
  const call = legal.find((action) => action.type === "call");
  const fold = legal.find((action) => action.type === "fold");
  const effectiveStack = Math.min(
    player.stack,
    ...state.players
      .filter((candidate) => candidate.id !== playerId && (candidate.status === "active" || candidate.status === "allIn"))
      .map((candidate) => candidate.stack + candidate.committedStreet),
  );
  const spr = pot > 0 ? effectiveStack / pot : 99;

  if (allIn && equity > 0.82 && spr < 1.3 && randomValue < 0.64) {
    return { action: { playerId, type: "allIn" }, equity, potOdds, confidence, reason: "value" };
  }

  const bluffChance = AGGRESSION[difficulty] * (state.street === "river" ? 0.35 : 0.55);
  const valueThreshold = opponents >= 3 ? 0.62 : 0.56;
  if (aggressive && (equity >= valueThreshold || (check && equity < 0.34 && randomValue < bluffChance))) {
    const fraction = equity > 0.75 ? 0.8 : equity > 0.6 ? 0.66 : 0.45;
    const desired = state.currentBet === 0 ? pot * fraction : state.currentBet + pot * fraction;
    const amount = clampWhole(desired, aggressive.minAmount ?? 0, aggressive.maxAmount ?? 0);
    return {
      action: { playerId, type: aggressive.type, amount },
      equity,
      potOdds,
      confidence,
      reason: equity >= valueThreshold ? "value" : "bluff",
    };
  }

  const mistakeMargin = difficulty === "casual" ? 0.12 : difficulty === "standard" ? 0.06 : 0.025;
  if (call && equity + mistakeMargin >= potOdds) {
    return { action: { playerId, type: "call" }, equity, potOdds, confidence, reason: "potOdds" };
  }
  if (check) {
    return { action: { playerId, type: "check" }, equity, potOdds, confidence, reason: equity > 0.4 ? "draw" : "giveUp" };
  }
  if (fold) {
    return { action: { playerId, type: "fold" }, equity, potOdds, confidence, reason: "giveUp" };
  }
  return { action: { playerId, type: "allIn" }, equity, potOdds, confidence, reason: "pressure" };
}
