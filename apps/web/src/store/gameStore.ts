import { create } from "zustand";
import type { PlayerActionType } from "@river-noir/poker-engine";
import {
  PROTOCOL_VERSION,
  type AiDifficulty,
  type GameTransport,
  type Locale,
  type PlayerGameView,
  type RoomSettings,
  type TransportStatus,
} from "@river-noir/protocol";
import { LocalGameTransport } from "../transports/LocalGameTransport.js";
import { WebSocketGameTransport } from "../transports/WebSocketGameTransport.js";

export interface LocalSetup {
  readonly nickname: string;
  readonly totalPlayers: number;
  readonly difficulty: AiDifficulty;
  readonly deepSeekEnabled: boolean;
  readonly initialStack: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly soundEnabled: boolean;
  readonly analysisEnabled: boolean;
}

interface GameStore {
  screen: "lobby" | "table";
  locale: Locale;
  view: PlayerGameView | null;
  connection: TransportStatus;
  transport: GameTransport | null;
  soundEnabled: boolean;
  analysisEnabled: boolean;
  busy: boolean;
  error: string | null;
  setLocale: (locale: Locale) => void;
  startLocalGame: (setup: LocalSetup) => Promise<void>;
  startOnlineGame: (setup: LocalSetup, roomCode?: string) => Promise<void>;
  performAction: (action: PlayerActionType, amount?: number) => Promise<void>;
  nextHand: () => Promise<void>;
  startGame: () => Promise<void>;
  leaveTable: () => Promise<void>;
  clearError: () => void;
}

const storedLocale = globalThis.localStorage?.getItem("river-noir-locale");
const initialLocale: Locale = storedLocale === "en-US" ? "en-US" : "zh-CN";

function bindTransport(transport: GameTransport, set: (state: Partial<GameStore>) => void): void {
  transport.subscribe((message) => {
    if (message.type === "game.snapshot") set({ view: message.payload.view, busy: false, error: null });
    if (message.type === "error") set({ error: message.payload.message, busy: false });
  });
  transport.subscribeStatus((connection) => set({ connection }));
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: "lobby",
  locale: initialLocale,
  view: null,
  connection: { status: "offline" },
  transport: null,
  soundEnabled: true,
  analysisEnabled: true,
  busy: false,
  error: null,
  setLocale: (locale) => {
    globalThis.localStorage?.setItem("river-noir-locale", locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
  startLocalGame: async (setup) => {
    const previous = get().transport;
    if (previous) await previous.disconnect();
    const settings: RoomSettings = {
      maxPlayers: setup.totalPlayers,
      initialStack: setup.initialStack,
      smallBlind: setup.smallBlind,
      bigBlind: setup.bigBlind,
      actionSeconds: 30,
      allowAiFill: true,
      aiDifficulty: setup.difficulty,
      analysisMode: setup.analysisEnabled ? "training" : "off",
    };
    const transport = new LocalGameTransport({
      nickname: setup.nickname,
      totalPlayers: setup.totalPlayers,
      settings,
      deepSeekEnabled: setup.deepSeekEnabled && import.meta.env.VITE_DEEPSEEK_ENABLED === "true",
      deepSeekModel: (import.meta.env.VITE_DEEPSEEK_MODEL as string | undefined) ?? "deepseek-v4-flash",
    });
    bindTransport(transport, set);
    set({
      screen: "table",
      transport,
      view: null,
      busy: true,
      soundEnabled: setup.soundEnabled,
      analysisEnabled: setup.analysisEnabled,
      error: null,
    });
    try {
      await transport.connect();
      set({ busy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), busy: false });
    }
  },
  startOnlineGame: async (setup, roomCode) => {
    const websocketUrl = import.meta.env.VITE_WS_URL as string | undefined;
    if (!websocketUrl) {
      set({ error: "VITE_WS_URL is not configured." });
      return;
    }
    const previous = get().transport;
    if (previous) await previous.disconnect();
    const transport = new WebSocketGameTransport(websocketUrl);
    const nickname = setup.nickname.trim() || "Guest";
    let reconnectToken: string | null = null;
    let activeRoomCode = roomCode?.trim().toUpperCase() ?? null;
    transport.setResumeCommandFactory(() => reconnectToken && activeRoomCode
      ? {
          protocolVersion: PROTOCOL_VERSION,
          type: "room.join",
          requestId: crypto.randomUUID(),
          payload: { roomCode: activeRoomCode, nickname, reconnectToken },
        }
      : null);
    transport.subscribe((message) => {
      if (message.type === "session.ready") reconnectToken = message.payload.reconnectToken;
      if (message.type === "game.snapshot" && message.payload.view.roomCode) activeRoomCode = message.payload.view.roomCode;
    });
    bindTransport(transport, set);
    const settings: RoomSettings = {
      maxPlayers: setup.totalPlayers,
      initialStack: setup.initialStack,
      smallBlind: setup.smallBlind,
      bigBlind: setup.bigBlind,
      actionSeconds: 30,
      allowAiFill: true,
      aiDifficulty: setup.difficulty,
      analysisMode: "off",
    };
    set({ screen: "table", transport, view: null, busy: true, soundEnabled: setup.soundEnabled, analysisEnabled: false, error: null });
    try {
      await transport.connect();
      await transport.send(roomCode
        ? {
            protocolVersion: PROTOCOL_VERSION,
            type: "room.join",
            requestId: crypto.randomUUID(),
            payload: { roomCode: roomCode.trim().toUpperCase(), nickname },
          }
        : {
            protocolVersion: PROTOCOL_VERSION,
            type: "room.create",
            requestId: crypto.randomUUID(),
            payload: { nickname, settings },
          });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), busy: false });
    }
  },
  performAction: async (action, amount) => {
    const { transport, view } = get();
    if (!transport || !view?.handId) return;
    set({ busy: true, error: null });
    try {
      const basePayload = {
        roomId: view.tableId,
        handId: view.handId,
        expectedVersion: view.version,
        actionId: crypto.randomUUID(),
        action,
      };
      await transport.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "player.action",
        requestId: crypto.randomUUID(),
        payload: amount === undefined ? basePayload : { ...basePayload, amount },
      });
      set({ busy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), busy: false });
    }
  },
  nextHand: async () => {
    const { transport, view } = get();
    if (!transport || !view) return;
    set({ busy: true });
    try {
      await transport.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "game.nextHand",
        requestId: crypto.randomUUID(),
        payload: { roomId: view.tableId },
      });
      set({ busy: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), busy: false });
    }
  },
  startGame: async () => {
    const { transport, view } = get();
    if (!transport || !view) return;
    set({ busy: true });
    try {
      await transport.send({
        protocolVersion: PROTOCOL_VERSION,
        type: "game.start",
        requestId: crypto.randomUUID(),
        payload: { roomId: view.tableId },
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), busy: false });
    }
  },
  leaveTable: async () => {
    await get().transport?.disconnect();
    set({ screen: "lobby", view: null, transport: null, busy: false, error: null });
  },
  clearError: () => set({ error: null }),
}));
