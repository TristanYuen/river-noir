import type { AiDecision } from "@river-noir/poker-ai";
import {
  cardCode,
  getLegalActions,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type PlayerActionType,
} from "@river-noir/poker-engine";

interface DeepSeekChatResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null };
  }[];
}

interface DeepSeekActionResponse {
  readonly action?: unknown;
  readonly amount?: unknown;
}

export interface DeepSeekDecisionOptions {
  readonly state: GameState;
  readonly playerId: string;
  readonly fallback: AiDecision;
  readonly model: string;
  readonly persona?: {
    readonly name: string;
    readonly style: string;
  };
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

function parseValidatedAction(content: string, state: GameState, playerId: string): PlayerAction {
  const parsed = JSON.parse(content) as DeepSeekActionResponse;
  if (typeof parsed.action !== "string" || !ACTION_TYPES.has(parsed.action as PlayerActionType)) {
    throw new Error("DeepSeek returned an unknown poker action.");
  }

  const actionType = parsed.action as PlayerActionType;
  const legalAction = getLegalActions(state, playerId).find((action) => action.type === actionType);
  if (!legalAction) throw new Error("DeepSeek returned an action that is not legal in the current state.");

  if (actionType === "bet" || actionType === "raise") {
    const amount = typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount);
    const minimum = legalAction.minAmount ?? Number.POSITIVE_INFINITY;
    const maximum = legalAction.maxAmount ?? Number.NEGATIVE_INFINITY;
    if (!Number.isInteger(amount) || amount < minimum || amount > maximum) {
      throw new Error("DeepSeek returned an invalid bet amount.");
    }
    return { playerId, type: actionType, amount };
  }

  return { playerId, type: actionType };
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
  };

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
            "You are DeepSeek playing no-limit Texas hold'em with play chips.",
            options.persona
              ? `Your independent table identity is ${options.persona.name}. Role-play this style consistently: ${options.persona.style}`
              : "Play a balanced, observant strategy.",
            "Do not coordinate with other players or act on behalf of another seat.",
            "Choose exactly one action from legalActions using only the supplied information.",
            "Never infer hidden opponent cards. Optimize long-run chip value and vary predictable lines when reasonable.",
            "Return one compact JSON object only. Example JSON: {\"action\":\"raise\",\"amount\":600}.",
            "For fold, check, call, or allIn, omit amount. For bet or raise, amount must be an integer within minAmount and maxAmount.",
          ].join(" "),
        },
        { role: "user", content: `Poker state JSON:\n${JSON.stringify(visibleState)}` },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.65,
      max_tokens: 120,
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}.`);
  const payload = await response.json() as DeepSeekChatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty response.");
  return parseValidatedAction(content, state, playerId);
}
