import { describe, expect, it } from "vitest";
import { parseCards } from "@river-noir/poker-engine";
import { analyzeHand } from "./analysis.js";
import { calculateEquity } from "./equity.js";
import { SeededRandom } from "./random.js";

describe("equity calculator", () => {
  it("reports certain victory for an unbeatable river hand", () => {
    const result = calculateEquity({
      heroCards: parseCards("As Ks"),
      communityCards: parseCards("Qs Js Ts 2d 3c"),
      opponentCount: 3,
      iterations: 200,
      random: new SeededRandom(42),
    });
    expect(result.equity).toBe(1);
    expect(result.wins).toBe(200);
  });

  it("is deterministic with a seeded random source", () => {
    const request = {
      heroCards: parseCards("Ah Kh"),
      communityCards: parseCards("Qh 7c 2s"),
      opponentCount: 2,
      iterations: 100,
    };
    expect(calculateEquity({ ...request, random: new SeededRandom(7) }))
      .toEqual(calculateEquity({ ...request, random: new SeededRandom(7) }));
  });
});

describe("hand analysis", () => {
  it("identifies a flush draw", () => {
    const result = analyzeHand(parseCards("Ah Kh"), parseCards("Qh 7h 2s"));
    expect(result.draws).toContain("flushDraw");
    expect(result.estimatedOuts).toBeGreaterThanOrEqual(9);
  });
});
