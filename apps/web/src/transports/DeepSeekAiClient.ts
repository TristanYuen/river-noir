import type { AiDecision } from "@river-noir/poker-ai";
import {
  cardCode,
  getLegalActions,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type PlayerActionType,
} from "@river-noir/poker-engine";
import type { DeepSeekDecisionBehavior } from "./DeepSeekBehavior.js";

interface DeepSeekChatResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null };
  }[];
}

interface DeepSeekActionResponse {
  readonly action?: unknown;
  readonly amount?: unknown;
  readonly candidates?: readonly {
    readonly action?: unknown;
    readonly amount?: unknown;
    readonly weight?: unknown;
  }[];
}

export interface DeepSeekDecisionOptions {
  readonly state: GameState;
  readonly playerId: string;
  readonly fallback: AiDecision;
  readonly model: string;
  readonly behavior?: DeepSeekDecisionBehavior;
  readonly random?: () => number;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

const ACTION_TYPES = new Set<PlayerActionType>(["fold", "check", "call", "bet", "raise", "allIn"]);

function eventSummary(event: GameEvent, state: GameState): Record<string, unknown> {
  const nameFor = (playerId: string) => state.players.find((player) => player.id === playerId)?.name ?? playerId;
  if (event.type === "playerActed") {
    return { type: event.type, player: nameFor(event.playerId), action: event.action, amount: event.amount };
  }
  if (event.type === "blindPosted") {
    return { type: event.type, player: nameFor(event.playerId), blind: event.blind, amount: event.amount };
  }
  if (event.type === "streetChanged") {
    return { type: event.type, street: event.street, cards: event.cards.map(cardCode) };
  }
  return { type: event.type };
}

function validateAction(candidate: DeepSeekActionResponse, state: GameState, playerId: string): PlayerAction {
  if (typeof candidate.action !== "string" || !ACTION_TYPES.has(candidate.action as PlayerActionType)) {
    throw new Error("DeepSeek returned an unknown poker action.");
  }

  const actionType = candidate.action as PlayerActionType;
  const legalAction = getLegalActions(state, playerId).find((action) => action.type === actionType);
  if (!legalAction) throw new Error("DeepSeek returned an action that is not legal in the current state.");

  if (actionType === "bet" || actionType === "raise") {
    const amount = typeof candidate.amount === "number" ? candidate.amount : Number(candidate.amount);
    const minimum = legalAction.minAmount ?? Number.POSITIVE_INFINITY;
    const maximum = legalAction.maxAmount ?? Number.NEGATIVE_INFINITY;
    if (!Number.isInteger(amount) || amount < minimum || amount > maximum) {
      throw new Error("DeepSeek returned an invalid bet amount.");
    }
    return { playerId, type: actionType, amount };
  }

  return { playerId, type: actionType };
}

function parseValidatedPolicy(
  content: string,
  state: GameState,
  playerId: string,
  random: () => number,
): PlayerAction {
  const parsed = JSON.parse(content) as DeepSeekActionResponse;
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    return validateAction(parsed, state, playerId);
  }

  const candidates = parsed.candidates.flatMap((candidate) => {
    try {
      const action = validateAction(candidate, state, playerId);
      const weight = typeof candidate.weight === "number" ? candidate.weight : Number(candidate.weight);
      if (!Number.isFinite(weight) || weight <= 0) return [];
      return [{ action, weight }];
    } catch {
      return [];
    }
  });
  if (candidates.length === 0) throw new Error("DeepSeek returned no valid weighted poker actions.");
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0);
  let cursor = Math.max(0, Math.min(0.999_999, random())) * totalWeight;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) return candidate.action;
  }
  return candidates[candidates.length - 1]?.action ?? candidates[0]!.action;
}

export async function decideDeepSeekAction(options: DeepSeekDecisionOptions): Promise<PlayerAction> {
  const { state, playerId, fallback, model } = options;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("DeepSeek player is not seated.");

  const legalActions = getLegalActions(state, playerId);
  const pot = state.players.reduce((total, candidate) => total + candidate.committedHand, 0);
  const visibleState = {
    handNumber: state.handNumber,
    street: state.street,
    holeCards: player.holeCards.map(cardCode),
    communityCards: state.communityCards.map(cardCode),
    pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    position: {
      seat: player.seat,
      dealerSeat: state.buttonSeat,
      smallBlindSeat: state.smallBlindSeat,
      bigBlindSeat: state.bigBlindSeat,
    },
    player: {
      name: player.name,
      stack: player.stack,
      committedStreet: player.committedStreet,
      committedHand: player.committedHand,
    },
    opponents: state.players
      .filter((candidate) => candidate.id !== playerId)
      .map((candidate) => ({
        name: candidate.name,
        seat: candidate.seat,
        stack: candidate.stack,
        status: candidate.status,
        committedStreet: candidate.committedStreet,
        committedHand: candidate.committedHand,
      })),
    legalActions,
    recentActions: state.actionLog.slice(-16).map((event) => eventSummary(event, state)),
    numericRead: {
      estimatedEquity: Number(fallback.equity.toFixed(4)),
      potOdds: Number(fallback.potOdds.toFixed(4)),
    },
    dynamicBehavior: options.behavior ?? null,
  };
  const exploration = options.behavior?.exploration ?? 0.35;

  const response = await fetch(options.endpoint ?? "/api/deepseek/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "You are a policy planner for one player in no-limit Texas hold'em with play chips.",
            "Re-evaluate this decision from scratch. Do not follow a permanent personality or repeat a fixed style.",
            "dynamicBehavior is a temporary human-like bias derived from recent wins, losses, folds, stack pressure, confidence, and tilt. Let it change frequencies without deliberately making absurd plays.",
            "Do not coordinate with other players or act on behalf of another seat.",
            "Using only the supplied information, produce a mixed policy with 2 to 4 distinct candidate actions from legalActions whenever more than one reasonable line exists.",
            "Never infer hidden opponent cards. Optimize long-run chip value and vary predictable lines when reasonable.",
            "Return one compact JSON object only. Example: {\"candidates\":[{\"action\":\"call\",\"weight\":0.5},{\"action\":\"raise\",\"amount\":600,\"weight\":0.35},{\"action\":\"fold\",\"weight\":0.15}]}.",
            "Weights must be positive and should sum approximately to 1. For fold, check, call, or allIn, omit amount. For bet or raise, amount must be an integer within minAmount and maxAmount.",
          ].join(" "),
        },
        { role: "user", content: `Poker state JSON:\n${JSON.stringify(visibleState)}` },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: Number(Math.min(1, 0.72 + exploration * 0.3).toFixed(2)),
      max_tokens: 240,
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}.`);
  const payload = await response.json() as DeepSeekChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response.");
  return parseValidatedPolicy(content, state, playerId, options.random ?? Math.random);
}
