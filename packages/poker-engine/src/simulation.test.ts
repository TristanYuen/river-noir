import { describe, expect, it } from "vitest";
import { cardCode } from "./cards.js";
import { applyAction, createGame, getLegalActions, startHand, totalChips } from "./game.js";
import type { GameState, PlayerAction, RandomSource } from "./types.js";

class TestRandom implements RandomSource {
  private value = 0x12345678;
  next(): number {
    this.value ^= this.value << 13;
    this.value ^= this.value >>> 17;
    this.value ^= this.value << 5;
    return (this.value >>> 0) / 0x1_0000_0000;
  }
}

function chooseAction(state: GameState, random: RandomSource): PlayerAction {
  const player = state.players.find((candidate) => candidate.seat === state.actingSeat);
  if (!player) throw new Error("Simulation has no acting player.");
  const legal = getLegalActions(state, player.id);
  const check = legal.find((action) => action.type === "check");
  const call = legal.find((action) => action.type === "call");
  const aggressive = legal.find((action) => action.type === "bet" || action.type === "raise");
  const roll = random.next();
  if (check && roll < 0.58) return { playerId: player.id, type: "check" };
  if (call && roll < 0.68) return { playerId: player.id, type: "call" };
  if (aggressive && roll < 0.82) {
    const minimum = aggressive.minAmount ?? 0;
    const maximum = aggressive.maxAmount ?? minimum;
    const amount = Math.min(maximum, minimum);
    return { playerId: player.id, type: aggressive.type, amount };
  }
  if (call) return { playerId: player.id, type: "call" };
  if (check) return { playerId: player.id, type: "check" };
  return { playerId: player.id, type: "fold" };
}

describe("randomized game simulation", () => {
  it("completes repeated six-player hands without losing chips or duplicating cards", () => {
    const random = new TestRandom();
    let state = createGame({
      tableId: "stress",
      config: { maxSeats: 6, smallBlind: 5, bigBlind: 10, initialStack: 10_000 },
      players: Array.from({ length: 6 }, (_, seat) => ({ id: `p${seat}`, name: `P${seat}`, seat })),
    });
    const initialTotal = totalChips(state);
    let completedHands = 0;

    for (let hand = 0; hand < 50; hand += 1) {
      if (state.players.filter((player) => player.stack > 0).length < 2) break;
      state = startHand(state, random);
      let actions = 0;
      while (state.phase === "betting" && actions < 500) {
        state = applyAction(state, chooseAction(state, random));
        actions += 1;
      }
      expect(actions).toBeLessThan(500);
      expect(state.phase).toBe("complete");
      expect(totalChips(state)).toBe(initialTotal);
      const visibleCards = [
        ...state.players.flatMap((player) => player.holeCards),
        ...state.communityCards,
      ];
      expect(new Set(visibleCards.map(cardCode)).size).toBe(visibleCards.length);
      completedHands += 1;
    }

    expect(completedHands).toBeGreaterThan(10);
  });
});
