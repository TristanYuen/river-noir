import type {
  Card,
  GameEvent,
  HandResult,
  LegalAction,
  PlayerActionType,
  PlayerStatus,
  Pot,
  Street,
} from "@river-noir/poker-engine";

export const PROTOCOL_VERSION = 1;

export type Locale = "zh-CN" | "en-US";
export type AiDifficulty = "casual" | "standard" | "expert";
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface RoomSettings {
  readonly maxPlayers: number;
  readonly initialStack: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly actionSeconds: 15 | 30 | 60;
  readonly allowAiFill: boolean;
  readonly aiDifficulty: AiDifficulty;
  readonly analysisMode: "off" | "training" | "everyone";
}

export interface PublicPlayerView {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly stack: number;
  readonly status: PlayerStatus;
  readonly committedStreet: number;
  readonly committedHand: number;
  readonly cardsVisible: boolean;
  readonly cards: readonly Card[];
  readonly isDealer: boolean;
  readonly isSmallBlind: boolean;
  readonly isBigBlind: boolean;
  readonly isAi: boolean;
  readonly connected: boolean;
}

export interface PlayerGameView {
  readonly protocolVersion: number;
  readonly tableId: string;
  readonly roomCode: string | null;
  readonly handId: string | null;
  readonly handNumber: number;
  readonly version: number;
  readonly street: Street;
  readonly phase: "waiting" | "betting" | "settlement" | "complete";
  readonly communityCards: readonly Card[];
  readonly pots: readonly Pot[];
  readonly totalPot: number;
  readonly players: readonly PublicPlayerView[];
  readonly viewerPlayerId: string;
  readonly actingPlayerId: string | null;
  readonly legalActions: readonly LegalAction[];
  readonly currentBet: number;
  readonly minRaise: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly actionDeadline: number | null;
  readonly recentEvents: readonly GameEvent[];
  readonly result: HandResult | null;
  readonly canStart: boolean;
}

export interface CommandEnvelope<TType extends string, TPayload> {
  readonly protocolVersion: number;
  readonly type: TType;
  readonly requestId: string;
  readonly payload: TPayload;
}

export type ClientCommand =
  | CommandEnvelope<"room.create", { readonly nickname: string; readonly settings: RoomSettings }>
  | CommandEnvelope<"room.join", { readonly roomCode: string; readonly nickname: string; readonly reconnectToken?: string }>
  | CommandEnvelope<"room.leave", { readonly roomId: string }>
  | CommandEnvelope<"seat.take", { readonly roomId: string; readonly seat: number }>
  | CommandEnvelope<"game.start", { readonly roomId: string }>
  | CommandEnvelope<"game.nextHand", { readonly roomId: string }>
  | CommandEnvelope<"player.action", {
      readonly roomId: string;
      readonly handId: string;
      readonly expectedVersion: number;
      readonly actionId: string;
      readonly action: PlayerActionType;
      readonly amount?: number;
    }>;

export type ErrorCode =
  | "BAD_REQUEST"
  | "VERSION_MISMATCH"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NOT_AUTHORIZED"
  | "NOT_YOUR_TURN"
  | "ILLEGAL_ACTION"
  | "HAND_NOT_RUNNING"
  | "INTERNAL_ERROR";

export type ServerMessage =
  | CommandEnvelope<"session.ready", { readonly playerId: string; readonly reconnectToken: string }>
  | CommandEnvelope<"game.snapshot", { readonly view: PlayerGameView }>
  | CommandEnvelope<"game.event", { readonly event: GameEvent; readonly version: number }>
  | CommandEnvelope<"command.accepted", { readonly commandRequestId: string; readonly version: number }>
  | CommandEnvelope<"error", {
      readonly code: ErrorCode;
      readonly message: string;
      readonly commandRequestId?: string;
      readonly currentVersion?: number;
    }>;

export interface TransportStatus {
  readonly status: ConnectionStatus;
  readonly message?: string;
}

export interface GameTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(command: ClientCommand): Promise<void>;
  subscribe(listener: (message: ServerMessage) => void): () => void;
  subscribeStatus(listener: (status: TransportStatus) => void): () => void;
}
