import { buildPots, getLegalActions, type GameState } from "@river-noir/poker-engine";
import type { PlayerGameView, PublicPlayerView } from "./types.js";
import { PROTOCOL_VERSION } from "./types.js";

export interface ProjectionOptions {
  readonly aiPlayerIds?: readonly string[];
  readonly disconnectedPlayerIds?: readonly string[];
  readonly actionDeadline?: number | null;
  readonly revealShowdownCards?: boolean;
  readonly roomCode?: string | null;
  readonly canStart?: boolean;
}

export function projectGameView(
  state: GameState,
  viewerPlayerId: string,
  options: ProjectionOptions = {},
): PlayerGameView {
  const viewer = state.players.find((player) => player.id === viewerPlayerId);
  if (!viewer) throw new Error("The viewer is not seated at this table.");
  const showdown = state.phase === "complete" && state.result?.reason === "showdown";
  const revealShowdownCards = options.revealShowdownCards ?? true;
  const players: PublicPlayerView[] = state.players.map((player) => {
    const cardsVisible = player.id === viewerPlayerId || (showdown && revealShowdownCards && player.status !== "folded");
    return {
      id: player.id,
      seat: player.seat,
      name: player.name,
      stack: player.stack,
      status: player.status,
      committedStreet: player.committedStreet,
      committedHand: player.committedHand,
      cardsVisible,
      cards: cardsVisible ? player.holeCards : [],
      isDealer: player.seat === state.buttonSeat,
      isSmallBlind: player.seat === state.smallBlindSeat && player.status !== "busted" && player.status !== "sittingOut",
      isBigBlind: player.seat === state.bigBlindSeat,
      isAi: options.aiPlayerIds?.includes(player.id) ?? false,
      connected: !(options.disconnectedPlayerIds?.includes(player.id) ?? false),
    };
  });
  const actingPlayerId = state.players.find((player) => player.seat === state.actingSeat)?.id ?? null;
  const pots = state.result?.pots ?? buildPots(state.players);
  return {
    protocolVersion: PROTOCOL_VERSION,
    tableId: state.tableId,
    roomCode: options.roomCode ?? null,
    handId: state.handId,
    handNumber: state.handNumber,
    version: state.version,
    street: state.street,
    phase: state.phase,
    communityCards: state.communityCards,
    pots,
    totalPot: pots.reduce((total, pot) => total + pot.amount, 0),
    players,
    viewerPlayerId,
    actingPlayerId,
    legalActions: actingPlayerId === viewerPlayerId ? getLegalActions(state, viewerPlayerId) : [],
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    smallBlind: state.config.smallBlind,
    bigBlind: state.config.bigBlind,
    actionDeadline: options.actionDeadline ?? null,
    recentEvents: state.actionLog.slice(-30),
    result: state.result,
    canStart: options.canStart ?? false,
  };
}
