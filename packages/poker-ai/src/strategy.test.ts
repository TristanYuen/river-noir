import { describe, expect, it } from "vitest";
import { createGame, parseCards, startHand, type RandomSource } from "@river-noir/poker-engine";
import { decideAiAction } from "./strategy.js";

const random: RandomSource = { next: () => 0.2 };

describe("AI strategy", () => {
  it("returns a legal action", () => {
    let state = startHand(createGame({
      tableId: "ai-test",
      config: { maxSeats: 6, smallBlind: 5, bigBlind: 10, initialStack: 1_000 },
      players: [
        { id: "ai", name: "AI", seat: 0 },
        { id: "villain", name: "Villain", seat: 1 },
      ],
    }), random);
    state = {
      ...state,
      players: state.players.map((player) => player.id === "ai" ? { ...player, holeCards: parseCards("As Ah") } : player),
    };
    const decision = decideAiAction({ state, playerId: "ai", difficulty: "standard", random });
    expect(["call", "raise", "allIn"]).toContain(decision.action.type);
    expect(decision.equity).toBeGreaterThan(0.5);
  });
});
