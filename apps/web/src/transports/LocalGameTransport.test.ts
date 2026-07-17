import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, type PlayerGameView, type RoomSettings } from "@river-noir/protocol";
import { LocalGameTransport } from "./LocalGameTransport.js";

const settings: RoomSettings = {
  maxPlayers: 3,
  initialStack: 2_000,
  smallBlind: 5,
  bigBlind: 10,
  actionSeconds: 30,
  allowAiFill: true,
  aiDifficulty: "casual",
  analysisMode: "training",
};

describe("LocalGameTransport", () => {
  it("runs a complete local hand and starts the next one", async () => {
    const transport = new LocalGameTransport({ nickname: "Hero", totalPlayers: 3, settings, aiDelayMs: 0, deepSeekEnabled: false });
    const views: PlayerGameView[] = [];
    transport.subscribe((message) => {
      if (message.type === "game.snapshot") views.push(message.payload.view);
    });
    await transport.connect();
    const first = views.at(-1);
    expect(first?.actingPlayerId).toBe("hero");
    expect(first?.players.find((player) => player.id === "hero")?.cards).toHaveLength(2);
    if (!first?.handId) throw new Error("Missing first hand id.");

    await transport.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "player.action",
      requestId: "fold-command",
      payload: {
        roomId: first.tableId,
        handId: first.handId,
        expectedVersion: first.version,
        actionId: "fold-action",
        action: "fold",
      },
    });
    const afterHeroFold = views.find((view) =>
      view.phase === "betting" && view.players.find((player) => player.id === "hero")?.status === "folded",
    );
    expect(afterHeroFold?.result).toBeNull();
    expect(afterHeroFold?.actingPlayerId).toMatch(/^ai-/);
    const completed = views.at(-1);
    expect(completed?.phase).toBe("complete");
    expect(completed?.result).not.toBeNull();
    const heroFoldEventIndex = completed?.recentEvents.findIndex((event) =>
      event.type === "playerActed" && event.playerId === "hero" && event.action === "fold",
    ) ?? -1;
    expect(heroFoldEventIndex).toBeGreaterThanOrEqual(0);
    expect(completed?.recentEvents.slice(heroFoldEventIndex + 1).some((event) =>
      event.type === "playerActed" && event.playerId.startsWith("ai-"),
    )).toBe(true);

    await transport.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "game.nextHand",
      requestId: "next-command",
      payload: { roomId: first.tableId },
    });
    const next = views.at(-1);
    expect(next?.handNumber).toBe(2);
    expect(next?.phase).toBe("betting");
    await transport.disconnect();
  }, 15_000);
});
