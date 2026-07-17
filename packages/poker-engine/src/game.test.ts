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

  it("uses a dead button and dead small blind while advancing the big blind", () => {
    const first = startHand(game([1_000, 1_000, 1_000, 1_000]), fixedRandom);
    const afterBigBlindBust: GameState = {
      ...first,
      phase: "complete",
      players: first.players.map((player) => player.id === "p2"
        ? { ...player, stack: 0, status: "busted", committedStreet: 0, committedHand: 0 }
        : { ...player, status: "ready", committedStreet: 0, committedHand: 0 }),
    };

    const second = startHand(afterBigBlindBust, fixedRandom);
    expect(second.buttonSeat).toBe(1);
    expect(second.smallBlindSeat).toBe(2);
    expect(second.bigBlindSeat).toBe(3);
    expect(second.players.find((player) => player.id === "p2")?.committedStreet).toBe(0);
    expect(second.players.find((player) => player.id === "p3")?.committedStreet).toBe(10);

    const third = startHand({ ...second, phase: "complete" }, fixedRandom);
    expect(third.buttonSeat).toBe(2);
    expect(third.smallBlindSeat).toBe(3);
    expect(third.bigBlindSeat).toBe(0);
  });

  it("adjusts the button when play becomes heads-up so nobody posts the big blind twice", () => {
    const first = startHand(game(), fixedRandom);
    const afterSmallBlindBust: GameState = {
      ...first,
      phase: "complete",
      players: first.players.map((player) => player.id === "p1"
        ? { ...player, stack: 0, status: "busted", committedStreet: 0, committedHand: 0 }
        : { ...player, status: "ready", committedStreet: 0, committedHand: 0 }),
    };

    const headsUp = startHand(afterSmallBlindBust, fixedRandom);
    expect(headsUp.buttonSeat).toBe(2);
    expect(headsUp.smallBlindSeat).toBe(2);
    expect(headsUp.bigBlindSeat).toBe(0);
    expect(headsUp.actingSeat).toBe(2);
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

  it("returns the uncalled part of an oversized raise before awarding the pot", () => {
    let state = startHand(game(), fixedRandom);
    state = act(state, "p0", "raise", 500);
    state = act(state, "p1", "fold");
    state = act(state, "p2", "fold");

    expect(state.phase).toBe("complete");
    expect(state.result?.pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(25);
    expect(state.result?.awards.reduce((sum, award) => sum + award.amount, 0)).toBe(25);
    expect(state.players.find((player) => player.id === "p0")?.stack).toBe(1_015);
    expect(totalChips(state)).toBe(3_000);
  });

  it("keeps a zero-stack player busted and excludes them from the next hand", () => {
    const next = startHand(game([0, 1_000, 1_000]), fixedRandom);
    expect(next.players.find((player) => player.id === "p0")?.status).toBe("busted");
    expect(next.players.find((player) => player.id === "p0")?.holeCards).toHaveLength(0);
    expect(next.players.filter((player) => player.holeCards.length === 2)).toHaveLength(2);
    expect(totalChips(next)).toBe(2_000);
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

  it("reopens raising when cumulative short all-ins equal a full raise", () => {
    const base = createGame({
      tableId: "short-all-ins",
      config: { maxSeats: 10, smallBlind: 50, bigBlind: 100, initialStack: 1_000 },
      players: [1_000, 125, 1_000, 200, 1_000].map((stack, seat) => ({
        id: `p${seat}`,
        name: `Player ${seat}`,
        seat,
        stack,
      })),
    });
    let state: GameState = {
      ...base,
      phase: "betting",
      street: "flop",
      buttonSeat: 4,
      actingSeat: 0,
      minRaise: 100,
      players: base.players.map((player) => ({ ...player, status: "active" })),
      pendingPlayerIds: base.players.map((player) => player.id),
    };

    state = act(state, "p0", "bet", 100);
    state = act(state, "p1", "allIn");
    state = act(state, "p2", "call");
    state = act(state, "p3", "allIn");
    state = act(state, "p4", "call");

    expect(state.players.find((player) => player.seat === state.actingSeat)?.id).toBe("p0");
    expect(getLegalActions(state, "p0").some((action) => action.type === "raise")).toBe(true);
    state = act(state, "p0", "call");
    expect(state.players.find((player) => player.seat === state.actingSeat)?.id).toBe("p2");
    expect(getLegalActions(state, "p2").some((action) => action.type === "raise")).toBe(false);
  });

  it("uses the full opening bet as the next minimum raise increment", () => {
    const base = game();
    let state: GameState = {
      ...base,
      phase: "betting",
      street: "flop",
      buttonSeat: 2,
      actingSeat: 0,
      minRaise: 10,
      players: base.players.map((player) => ({ ...player, status: "active" })),
      pendingPlayerIds: base.players.map((player) => player.id),
    };

    state = act(state, "p0", "bet", 60);
    const raise = getLegalActions(state, "p1").find((action) => action.type === "raise");
    expect(state.minRaise).toBe(60);
    expect(raise?.minAmount).toBe(120);
  });

  it("does not reopen raising after a short all-in opening bet", () => {
    const base = game([1_000, 5, 1_000]);
    let state: GameState = {
      ...base,
      phase: "betting",
      street: "flop",
      buttonSeat: 2,
      actingSeat: 0,
      minRaise: 10,
      players: base.players.map((player) => ({ ...player, status: "active" })),
      pendingPlayerIds: base.players.map((player) => player.id),
    };

    state = act(state, "p0", "check");
    state = act(state, "p1", "allIn");
    state = act(state, "p2", "call");
    expect(state.players.find((player) => player.seat === state.actingSeat)?.id).toBe("p0");
    expect(getLegalActions(state, "p0").some((action) => action.type === "raise")).toBe(false);
  });
});
