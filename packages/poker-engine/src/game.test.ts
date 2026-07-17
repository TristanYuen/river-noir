import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions, startHand, totalChips } from "./game.js";
import type { GameState, RandomSource } from "./types.js";

const fixedRandom: RandomSource = { next: () => 0.37 };

function game(stacks: number[] = [1_000, 1_000, 1_000]): GameState {
  return createGame({
    tableId: "test",
    config: { maxSeats: 10, smallBlind: 5, bigBlind: 10, initialStack: 1_000 },
    players: stacks.map((stack, seat) => ({ id: `p${seat}`, name: `Player ${seat}`, seat, stack })),
  });
}

function act(state: GameState, playerId: string, type: "fold" | "check" | "call" | "bet" | "raise" | "allIn", amount?: number): GameState {
  return applyAction(state, amount === undefined ? { playerId, type } : { playerId, type, amount });
}

describe("game engine", () => {
  it("posts blinds and starts left of the big blind", () => {
    const state = startHand(game(), fixedRandom, "hand-1");
    expect(state.buttonSeat).toBe(0);
    expect(state.smallBlindSeat).toBe(1);
    expect(state.bigBlindSeat).toBe(2);
    expect(state.actingSeat).toBe(0);
    expect(state.players.map((player) => player.committedStreet)).toEqual([0, 5, 10]);
    expect(totalChips(state)).toBe(3_000);
  });

  it("uses the heads-up blind and action order", () => {
    const state = startHand(game([1_000, 1_000]), fixedRandom);
    expect(state.buttonSeat).toBe(0);
    expect(state.smallBlindSeat).toBe(0);
    expect(state.bigBlindSeat).toBe(1);
    expect(state.actingSeat).toBe(0);
  });

  it("awards all committed chips when everyone else folds", () => {
    let state = startHand(game(), fixedRandom);
    state = act(state, "p0", "fold");
    state = act(state, "p1", "fold");
    expect(state.phase).toBe("complete");
    expect(state.result?.reason).toBe("fold");
    expect(state.players.find((player) => player.id === "p2")?.stack).toBe(1_005);
    expect(totalChips(state)).toBe(3_000);
  });

  it("plays a checked-down hand through five community cards", () => {
    let state = startHand(game(), fixedRandom);
    state = act(state, "p0", "call");
    state = act(state, "p1", "call");
    state = act(state, "p2", "check");

    for (const street of ["flop", "turn", "river"] as const) {
      expect(state.street).toBe(street);
      while (state.phase === "betting" && state.street === street) {
        const acting = state.players.find((player) => player.seat === state.actingSeat);
        if (!acting) throw new Error("Missing acting player.");
        state = act(state, acting.id, "check");
      }
    }

    expect(state.phase).toBe("complete");
    expect(state.communityCards).toHaveLength(5);
    expect(state.result?.reason).toBe("showdown");
    expect(totalChips(state)).toBe(3_000);
  });

  it("creates and settles side pots after multiple all-ins", () => {
    let state = startHand(game([100, 300, 500]), fixedRandom);
    state = act(state, "p0", "allIn");
    state = act(state, "p1", "allIn");
    state = act(state, "p2", "call");

    expect(state.phase).toBe("complete");
    expect(state.result?.pots.map((pot) => pot.amount)).toEqual([300, 400]);
    expect(state.communityCards).toHaveLength(5);
    expect(totalChips(state)).toBe(900);
  });

  it("does not reopen raising to players after an incomplete raise", () => {
    let state = startHand(game([1_000, 35, 1_000, 1_000]), fixedRandom);
    state = act(state, "p3", "raise", 30);
    state = act(state, "p0", "call");
    state = act(state, "p1", "allIn");

    expect(state.players.find((player) => player.seat === state.actingSeat)?.id).toBe("p2");
    expect(getLegalActions(state, "p2").some((action) => action.type === "raise")).toBe(true);
    state = act(state, "p2", "call");

    expect(state.players.find((player) => player.seat === state.actingSeat)?.id).toBe("p3");
    expect(getLegalActions(state, "p3").some((action) => action.type === "raise")).toBe(false);
  });
});
