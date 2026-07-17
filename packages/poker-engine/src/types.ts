export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type HandPhase = "waiting" | "betting" | "settlement" | "complete";
export type PlayerStatus = "ready" | "active" | "folded" | "allIn" | "sittingOut" | "busted";

export interface TablePlayer {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly stack: number;
  readonly status: PlayerStatus;
  readonly holeCards: readonly Card[];
  readonly committedStreet: number;
  readonly committedHand: number;
}

export interface Pot {
  readonly amount: number;
  readonly eligiblePlayerIds: readonly string[];
}

export interface PotAward {
  readonly potIndex: number;
  readonly playerId: string;
  readonly amount: number;
  readonly handDescription?: string;
}

export interface HandResult {
  readonly reason: "fold" | "showdown";
  readonly pots: readonly Pot[];
  readonly awards: readonly PotAward[];
}

export interface GameConfig {
  readonly maxSeats: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly initialStack: number;
}

export interface GameState {
  readonly tableId: string;
  readonly handNumber: number;
  readonly handId: string | null;
  readonly version: number;
  readonly config: GameConfig;
  readonly phase: HandPhase;
  readonly street: Street;
  readonly buttonSeat: number | null;
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number | null;
  readonly actingSeat: number | null;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly players: readonly TablePlayer[];
  readonly deck: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly pendingPlayerIds: readonly string[];
  readonly raiseLockedPlayerIds: readonly string[];
  readonly actionLog: readonly GameEvent[];
  readonly result: HandResult | null;
}

export type PlayerActionType = "fold" | "check" | "call" | "bet" | "raise" | "allIn";

export interface PlayerAction {
  readonly playerId: string;
  readonly type: PlayerActionType;
  readonly amount?: number;
}

export interface LegalAction {
  readonly type: PlayerActionType;
  readonly amountToCall?: number;
  readonly minAmount?: number;
  readonly maxAmount?: number;
}

export type GameEvent =
  | { readonly type: "handStarted"; readonly handId: string; readonly handNumber: number }
  | { readonly type: "blindPosted"; readonly playerId: string; readonly blind: "small" | "big"; readonly amount: number }
  | { readonly type: "cardsDealt" }
  | { readonly type: "playerActed"; readonly playerId: string; readonly action: PlayerActionType; readonly amount: number }
  | { readonly type: "streetChanged"; readonly street: Street; readonly cards: readonly Card[] }
  | { readonly type: "handCompleted"; readonly result: HandResult };

export interface RandomSource {
  next(): number;
}
