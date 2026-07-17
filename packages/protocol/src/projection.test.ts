import { describe, expect, it } from "vitest";
import { createGame, startHand, type RandomSource } from "@river-noir/poker-engine";
import { projectGameView } from "./projection.js";

const random: RandomSource = { next: () => 0.41 };

describe("player view projection", () => {
  it("only exposes the viewer's private cards during a hand", () => {
    const state = startHand(createGame({
      tableId: "projection",
      config: { maxSeats: 6, smallBlind: 5, bigBlind: 10, initialStack: 1_000 },
      players: [
        { id: "p0", name: "P0", seat: 0 },
        { id: "p1", name: "P1", seat: 1 },
        { id: "p2", name: "P2", seat: 2 },
      ],
    }), random);
    const view = projectGameView(state, "p0");
    expect(view.players.find((player) => player.id === "p0")?.cards).toHaveLength(2);
    expect(view.players.find((player) => player.id === "p1")?.cards).toEqual([]);
    expect(view.players.find((player) => player.id === "p2")?.cards).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.players.find((player) => player.id === "p1")?.holeCards));
  });
});
