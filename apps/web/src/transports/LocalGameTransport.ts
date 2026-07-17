import { decideAiAction } from "@river-noir/poker-ai";
import {
  applyAction,
  createGame,
  startHand,
  type GameState,
  type PlayerAction,
  type RandomSource,
} from "@river-noir/poker-engine";
import { SeededRandom } from "@river-noir/poker-equity";
import {
  PROTOCOL_VERSION,
  projectGameView,
  type ClientCommand,
  type GameTransport,
  type RoomSettings,
  type ServerMessage,
  type TransportStatus,
} from "@river-noir/protocol";

export interface LocalGameOptions {
  readonly nickname: string;
  readonly totalPlayers: number;
  readonly settings: RoomSettings;
  readonly aiDelayMs?: number;
}

const AI_NAMES = ["Mira", "Orson", "Sloane", "Jules", "Theo", "Inez", "Rowan", "Noa", "Vale"];

class BrowserRandom implements RandomSource {
  next(): number {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return (values[0] ?? 0) / 0x1_0000_0000;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

export class LocalGameTransport implements GameTransport {
  private readonly messageListeners = new Set<(message: ServerMessage) => void>();
  private readonly statusListeners = new Set<(status: TransportStatus) => void>();
  private readonly shuffleRandom = new BrowserRandom();
  private readonly aiRandom = new SeededRandom(Date.now());
  private readonly aiPlayerIds: string[];
  private state: GameState | null = null;
  private connected = false;
  private processingAi = false;

  constructor(private readonly options: LocalGameOptions) {
    if (options.totalPlayers < 3 || options.totalPlayers > 10) throw new Error("Local games support 3 to 10 players.");
    this.aiPlayerIds = Array.from({ length: options.totalPlayers - 1 }, (_, index) => `ai-${index + 1}`);
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emitStatus({ status: "connected", message: "local" });
    if (!this.state) {
      const players = [
        { id: "hero", name: this.options.nickname.trim() || "Player", seat: 0 },
        ...this.aiPlayerIds.map((id, index) => ({ id, name: AI_NAMES[index] ?? `AI ${index + 1}`, seat: index + 1 })),
      ];
      this.state = startHand(createGame({
        tableId: "local-table",
        config: {
          maxSeats: 10,
          smallBlind: this.options.settings.smallBlind,
          bigBlind: this.options.settings.bigBlind,
          initialStack: this.options.settings.initialStack,
        },
        players,
      }), this.shuffleRandom);
    }
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "session.ready",
      requestId: crypto.randomUUID(),
      payload: { playerId: "hero", reconnectToken: "local-session" },
    });
    this.emitSnapshot();
    await this.runAiTurns();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitStatus({ status: "offline" });
  }

  async send(command: ClientCommand): Promise<void> {
    if (!this.connected || !this.state) throw new Error("Local table is not connected.");
    if (command.type === "player.action") {
      if (this.state.handId !== command.payload.handId) throw new Error("The hand has changed.");
      if (this.state.version !== command.payload.expectedVersion) throw new Error("The game view is out of date.");
      const action: PlayerAction = command.payload.amount === undefined
        ? { playerId: "hero", type: command.payload.action }
        : { playerId: "hero", type: command.payload.action, amount: command.payload.amount };
      this.state = applyAction(this.state, action);
      this.emit({
        protocolVersion: PROTOCOL_VERSION,
        type: "command.accepted",
        requestId: crypto.randomUUID(),
        payload: { commandRequestId: command.requestId, version: this.state.version },
      });
      this.emitSnapshot();
      await this.runAiTurns();
      return;
    }
    if (command.type === "game.nextHand" || command.type === "game.start") {
      if (this.state.phase !== "complete" && this.state.phase !== "waiting") throw new Error("The hand is still running.");
      this.state = startHand(this.state, this.shuffleRandom);
      this.emitSnapshot();
      await this.runAiTurns();
    }
  }

  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  subscribeStatus(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emit(message: ServerMessage): void {
    for (const listener of this.messageListeners) listener(message);
  }

  private emitStatus(status: TransportStatus): void {
    for (const listener of this.statusListeners) listener(status);
  }

  private emitSnapshot(): void {
    if (!this.state) return;
    this.emit({
      protocolVersion: PROTOCOL_VERSION,
      type: "game.snapshot",
      requestId: crypto.randomUUID(),
      payload: {
        view: projectGameView(this.state, "hero", {
          aiPlayerIds: this.aiPlayerIds,
          actionDeadline: Date.now() + this.options.settings.actionSeconds * 1_000,
        }),
      },
    });
  }

  private async runAiTurns(): Promise<void> {
    if (this.processingAi || !this.state) return;
    this.processingAi = true;
    try {
      let safety = 0;
      while (this.connected && this.state.phase === "betting" && safety < 100) {
        const acting = this.state.players.find((player) => player.seat === this.state?.actingSeat);
        if (!acting || !this.aiPlayerIds.includes(acting.id)) break;
        const configuredDelay = this.options.aiDelayMs;
        await delay(configuredDelay ?? 360 + Math.floor(this.aiRandom.next() * 420));
        const decision = decideAiAction({
          state: this.state,
          playerId: acting.id,
          difficulty: this.options.settings.aiDifficulty,
          random: this.aiRandom,
        });
        this.state = applyAction(this.state, decision.action);
        this.emitSnapshot();
        safety += 1;
      }
      if (safety >= 100) throw new Error("AI action loop exceeded its safety limit.");
    } finally {
      this.processingAi = false;
    }
  }
}
