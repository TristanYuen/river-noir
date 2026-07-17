import { describe, expect, it } from "vitest";
import { buildPots } from "./pots.js";
import type { TablePlayer } from "./types.js";

function player(id: string, committedHand: number, status: TablePlayer["status"] = "allIn"): TablePlayer {
  return { id, seat: Number(id.slice(1)), name: id, stack: 0, status, holeCards: [], committedStreet: committedHand, committedHand };
}

describe("pot builder", () => {
  it("creates a main pot and multiple side pots", () => {
    const pots = buildPots([player("p0", 100), player("p1", 300), player("p2", 500), player("p3", 500)]);
    expect(pots).toEqual([
      { amount: 400, eligiblePlayerIds: ["p0", "p1", "p2", "p3"] },
      { amount: 600, eligiblePlayerIds: ["p1", "p2", "p3"] },
      { amount: 400, eligiblePlayerIds: ["p2", "p3"] },
    ]);
  });

  it("keeps folded chips but removes the folded player from eligibility", () => {
    const pots = buildPots([player("p0", 100, "folded"), player("p1", 100), player("p2", 100)]);
    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ["p1", "p2"] }]);
  });
});
